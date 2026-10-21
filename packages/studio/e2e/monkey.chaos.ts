/**
 * The Studio monkey (BREAK_IT.md S-1 to S-4): random but legal use, fast, on a
 * throwaway copy of Sunflower Days. Clicks, typing (braces, quotes, backslashes,
 * Japanese), keys (undo, Enter, Escape, F5), tool switches, and edits made to
 * the same files from outside while it works. Every few dozen actions it checks:
 *  - no uncaught error in the window;
 *  - Studio still answers;
 *  - once autosave settles, every file on disk equals what Studio shows (or a
 *    conflict dialog is asking which to keep): no lost or silently merged edit.
 * A failure prints the seed and the last actions, and saves a screenshot.
 *
 *   corepack pnpm --filter @himawari/studio chaos            (3 seeds × 250 actions)
 *   HW_CHAOS_SEEDS=10 HW_CHAOS_ACTIONS=1000 … chaos           (longer)
 */
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, type Page, _electron } from "playwright";
import { afterAll, describe, expect, test } from "vitest";

const STUDIO = fileURLToPath(new URL("..", import.meta.url));
const DEMO = fileURLToPath(new URL("../../../examples/sunflower-demo/", import.meta.url));
const SEEDS = Number(process.env["HW_CHAOS_SEEDS"] ?? 3);
const ACTIONS = Number(process.env["HW_CHAOS_ACTIONS"] ?? 250);
const home = mkdtempSync(join(tmpdir(), "himawari-chaos-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

/** Buttons the monkey never presses: native file dialogs, deleting or closing the project, exports, and anything that spends money. */
const NEVER = /Delete|Remove|Close project|Export|Play it|Translate|AI|Assistant|Choose|Add files|Import|Browse|Open|…|Stop translating|Clear|Reset|key|Recycle|Restore/i;
const TYPED = ["Hello", " ", "{", "}", "{b}", "{/b}", '"', "\\", "かな", "漢字", "😀", "#", "[", "]", "$", "\t", "a".repeat(30)];
const KEYS = ["Enter", "Escape", "Backspace", "Delete", "Tab", "ArrowUp", "ArrowDown", "Control+z", "Control+Shift+z", "Control+s", "F5", "Control+d"];
const TOOLS = ["Story", "Characters", "Assets", "Variables", "Story graph", "UI Designer", "Settings"];

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]! };
}

type State = { root: string | null; files: Record<string, string>; conflict: unknown };
const state = (page: Page) => page.evaluate(() => {
  const s = (globalThis as unknown as { __studio: { getState(): State } }).__studio.getState();
  return { root: s.root, files: s.files, conflict: s.conflict } as State;
});

/** Project text files on disk, as Studio names them. */
function diskFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (dir: string) => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, n.name);
      const rel = relative(root, full).replaceAll("\\", "/");
      if (n.isDirectory()) {
        if (!/^(build|assets|\.git|node_modules)$/.test(rel)) visit(full);
      } else if (/\.(hws|md|json)$/.test(n.name) && !n.name.includes(".tmp-")) out[rel] = readFileSync(full, "utf8");
    }
  };
  visit(root);
  return out;
}

describe("the Studio monkey (BREAK_IT.md S-1 to S-4)", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    test(`seed ${seed}: ${ACTIONS} random actions`, async () => {
      const r = rng(seed * 7919);
      const root = join(home, `seed${seed}`, "Sunflower Days");
      mkdirSync(join(home, `seed${seed}`), { recursive: true });
      cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
      const app: ElectronApplication = await _electron.launch({
        executablePath: join(STUDIO, "node_modules", "electron", "dist", "electron.exe"),
        args: ["."],
        cwd: STUDIO,
        env: { ...process.env, HIMAWARI_STUDIO_TEST_HOME: join(home, `seed${seed}`, "home") },
      });
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      const log: string[] = [];
      const fail = async (why: string) => {
        const shot = join(home, `seed${seed}-failure.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        throw new Error(`seed ${seed}: ${why}\nlast actions:\n${log.slice(-25).join("\n")}\nscreenshot: ${shot}`);
      };
      try {
        await page.waitForSelector(".welcome");
        await page.evaluate(async (dir) => {
          const g = globalThis as unknown as { himawari: { project: { open(r: string): Promise<unknown> } }; __studio: { getState(): { openSnapshot(s: unknown): void } } };
          g.__studio.getState().openSnapshot(await g.himawari.project.open(dir));
        }, root);
        await page.waitForSelector(".workspace");

        for (let i = 1; i <= ACTIONS; i++) {
          const kind = r.int(10);
          try {
            if (kind <= 2) {
              // Click something clickable in the workspace.
              const buttons = page.locator(".workspace button:visible, .modal button:visible");
              const n = await buttons.count();
              if (n > 0) {
                const b = buttons.nth(r.int(n));
                const label = ((await b.getAttribute("aria-label")) ?? (await b.innerText().catch(() => "")) ?? "").trim().slice(0, 40);
                if (!NEVER.test(label) && (await b.isEnabled())) {
                  log.push(`${i}: click "${label}"`);
                  await b.click({ timeout: 1000 });
                }
              }
            } else if (kind <= 4) {
              // Type into a line, a field, or the script editor.
              const boxes = page.locator(".workspace textarea:visible, .workspace input[type=text]:visible, .workspace .cm-content:visible");
              const n = await boxes.count();
              if (n > 0) {
                const box = boxes.nth(r.int(n));
                await box.click({ timeout: 1000 });
                const text = Array.from({ length: 1 + r.int(4) }, () => r.pick(TYPED)).join("");
                log.push(`${i}: type ${JSON.stringify(text)}`);
                await page.keyboard.insertText(text);
              }
            } else if (kind <= 6) {
              const key = r.pick(KEYS);
              log.push(`${i}: key ${key}`);
              await page.keyboard.press(key);
            } else if (kind === 7) {
              const tool = r.pick(TOOLS);
              log.push(`${i}: open ${tool}`);
              await page.getByRole("button", { name: tool, exact: true }).first().click({ timeout: 1000 });
            } else if (kind === 8) {
              // S-4: the same files edited from outside (another editor, git, OneDrive).
              const s = await state(page);
              const scripts = Object.keys(s.files).filter((f) => f.endsWith(".hws"));
              if (scripts.length) {
                const f = r.pick(scripts);
                log.push(`${i}: outside edit of ${f}`);
                appendFileSync(join(root, f), `# changed outside (${i})\n`);
              }
            } else {
              // Answer a conflict if one is asking, either way.
              const keep = page.getByRole("button", { name: r.int(2) ? "Keep mine" : "Use the file on disk" });
              if (await keep.count()) {
                log.push(`${i}: answer the conflict`);
                await keep.first().click({ timeout: 1000 });
              } else {
                await page.keyboard.press("Escape");
              }
            }
          } catch (e) {
            // An action that couldn't happen (an element went away) is fine; Studio dying is not.
            if (/Target closed|has been closed|crashed/i.test(String(e))) await fail(`Studio went away: ${String(e)}`);
          }

          if (i % 25 === 0 || i === ACTIONS) {
            if (errors.length) await fail(`errors in the window:\n${errors.slice(0, 5).join("\n")}`);
            const alive = await page.evaluate(() => 1).catch(() => 0);
            if (!alive) await fail("Studio stopped answering");
            // Let autosave settle, then every file on disk must equal Studio's copy, unless a conflict is open.
            await page.waitForTimeout(800);
            const s = await state(page);
            if (!s.conflict && s.root) {
              const disk = diskFiles(root);
              const differing = Object.keys(s.files).filter((f) => f in disk && disk[f] !== s.files[f]);
              if (differing.length) {
                await page.waitForTimeout(1500); // a save or an outside change still on its way
                const again = await state(page);
                const disk2 = diskFiles(root);
                const still = Object.keys(again.files).filter((f) => f in disk2 && disk2[f] !== again.files[f] && !again.conflict);
                if (still.length) {
                  const f = still[0]!;
                  const tail = (t: string) => JSON.stringify(t.split("\n").slice(-4).join("\n"));
                  await fail(`Studio and the disk disagree on ${still.join(", ")} with no conflict shown\nStudio's end: ${tail(again.files[f]!)}\ndisk's end:   ${tail(disk2[f]!)}`);
                }
              }
            }
          }
        }
        expect(errors).toEqual([]);
      } finally {
        await app.close().catch(() => {});
      }
    }, 600000);
  }
});
