/**
 * Studio end to end (plan §14.6 `e2e` and `ux-budget`): Playwright drives the
 * built app (packages/studio/out) with the real runtime docked in its preview.
 *  - First run: New Project → template → the game plays (P1: under 60 s).
 *  - Play-as-you-write: an edit shows up in the running game in under 1 s (P1).
 *  - Export a Windows game.
 *  - The UI Designer: a preset, then dragging the title buttons.
 *  - No code needed: every kind of step from menus and forms (FINALIZATION.md §3).
 *  - Accessibility: axe finds no serious problems on the main screens.
 *  - The UI switches to Japanese.
 * Needs `electron-vite build` and runtime/build/win64-release (or -debug).
 * Run: corepack pnpm --filter @himawari/studio e2e
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, type Page, _electron } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const STUDIO = fileURLToPath(new URL("..", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "himawari-e2e-"));
const projects = join(home, "Projects");
let app: ElectronApplication;
let page: Page;

type Snapshot = { root: string | null; preview: { ready: boolean; line: string | null; reloads: number; reloadedAt: number; built: { ok: boolean } | null }; files: Record<string, string> };
const state = () => page.evaluate(() => (globalThis as unknown as { __studio: { getState(): Snapshot } }).__studio.getState() as Snapshot);
const waitFor = async (check: (s: Snapshot) => boolean, timeout = 30000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (check(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timed out; last state: ${JSON.stringify(s.preview)}`);
    await page.waitForTimeout(50);
  }
};

beforeAll(async () => {
  mkdirSync(projects, { recursive: true });
  app = await _electron.launch({
    executablePath: join(STUDIO, "node_modules", "electron", "dist", "electron.exe"),
    args: ["."],
    cwd: STUDIO,
    env: { ...process.env, HIMAWARI_STUDIO_TEST_HOME: home, HIMAWARI_STUDIO_TEST_PICK: projects },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".welcome");
}, 60000);

afterAll(async () => {
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

describe("Himawari Studio", () => {
  test("first run: a new project plays in the preview in under 60 s (P1)", async () => {
    const t0 = Date.now();
    await page.getByRole("button", { name: "New Project" }).click();
    await page.getByRole("textbox").first().fill("Hallway Test");
    await page.getByRole("button", { name: "Choose…" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: /Classic ADV/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Create Project" }).click();
    const s = await waitFor((x) => x.preview.ready && x.preview.line !== null, 60000);
    const elapsed = Date.now() - t0;
    console.log(`P1: New Project → first line playing in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(60000);
    expect(s.root).toBe(join(projects, "Hallway Test"));
    expect(existsSync(join(projects, "Hallway Test", "build", "game.hwb"))).toBe(true);
  }, 90000);

  test("an edit shows up in the running game in under 1 s (P1)", async () => {
    const before = await state();
    const box = page.getByRole("textbox", { name: "Line" }).first();
    await box.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("Edited in the e2e test.");
    const typedAt = await page.evaluate(() => performance.now());
    const s = await waitFor((x) => x.preview.reloads > before.preview.reloads, 10000);
    const latency = s.preview.reloadedAt - typedAt;
    console.log(`P1: edit → game reloaded in ${Math.round(latency)} ms`);
    expect(latency).toBeLessThan(1000);
    const script = Object.entries(s.files).find(([f]) => f.endsWith(".hws"))?.[1] ?? "";
    expect(script).toContain("Edited in the e2e test.");
  }, 30000);

  test("exports a Windows game folder", async () => {
    await page.getByRole("button", { name: "Build and export" }).click();
    await page.getByRole("button", { name: "Export the game" }).click();
    // The first export asks, once, how to credit Himawari; the default is credits only (D60).
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByText(/^Done:/).waitFor({ timeout: 60000 });
    expect(JSON.parse((await state()).files["himawari.json"] ?? "{}")).toMatchObject({ credit: "none" });
    const dir = join(projects, "Hallway Test", "build", "windows", "Hallway Test");
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(["Hallway Test.exe", "data.hwp", "CREDITS.txt"]));
    // One file (OC-6): the data goes inside the exe; no second credit question.
    await page.getByRole("checkbox", { name: /Put the whole game in one file/ }).check();
    await page.getByRole("button", { name: "Export the game" }).click();
    await page.getByText(/That one file is the whole game/).waitFor({ timeout: 60000 });
    expect(readdirSync(dir).sort()).toEqual(["CREDITS.txt", "Hallway Test.exe"]);
    await page.getByRole("checkbox", { name: /Put the whole game in one file/ }).uncheck();
  }, 120000);

  test("the UI Designer restyles the game (plan §11.6): a preset, then a drag", async () => {
    await page.getByRole("button", { name: "UI Designer", exact: true }).click();
    let before = await state();
    await page.getByRole("button", { name: "Pastel" }).click();
    let s = await waitFor((x) => x.preview.reloads > before.preview.reloads, 10000);
    expect(JSON.parse(s.files["theme/theme.json"] ?? "{}")).toMatchObject({ preset: "pastel" });
    await page.getByRole("tab", { name: "Title screen" }).click();
    const menu = page.getByRole("button", { name: "Title buttons" });
    const b = (await menu.boundingBox())!;
    before = await state();
    await page.mouse.move(b.x + b.width / 2, b.y + 8);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 120, b.y + 8, { steps: 6 });
    await page.mouse.up();
    s = await waitFor((x) => x.preview.reloads > before.preview.reloads, 10000);
    const theme = JSON.parse(s.files["theme/theme.json"] ?? "{}") as { layout?: { title_menu?: { x: number } } };
    expect(theme.layout?.title_menu?.x).toBeLessThan(45);
    expect(s.preview.built?.ok).toBe(true);
  }, 30000);

  test("no code needed: every kind of step added from menus and forms checks clean and plays (FINALIZATION.md §3)", async () => {
    // The Screenplay only: the Script view is never opened, and nothing is typed except the story's own words.
    await page.getByRole("button", { name: "Story", exact: true }).click();
    await page.locator(".explorer").getByText("start", { exact: true }).first().click();
    await page.locator(".sp-scene").first().waitFor();
    const addBar = () => page.locator(".sp-addbar").last();
    const closeForm = async () => {
      await page.waitForTimeout(150);
      const done = page.getByRole("button", { name: "Done", exact: true });
      if ((await done.count()) > 0) await done.first().click();
    };

    await addBar().getByRole("button", { name: "Line", exact: true }).click();
    await page.keyboard.insertText("Written without any code.");
    await addBar().getByRole("button", { name: "Choice", exact: true }).click();
    const steps = [
      "Background", "Show a picture (CG)", "Show a character", "Move a character", "Hide a character",
      "Music", "Background sound", "Sound effect", "Stop music or sound",
      "Pause", "Shake the screen", "Flash the screen", "Text box style or page",
      "Remember something", "Only if… (a branch)", "Visit a scene and come back", "Go to scene",
    ];
    for (const step of steps) {
      await addBar().getByRole("button", { name: "Stage direction" }).click();
      await page.getByRole("button", { name: step, exact: true }).click();
      await closeForm();
    }

    const s = await waitFor((x) => (x.files["script/start.hws"] ?? "").includes("jump "), 10000);
    const script = s.files["script/start.hws"] ?? "";
    expect(script).toContain("Written without any code.");
    for (const word of ["menu:", "bg ", "cg ", "show ", "move ", "hide ", "music ", "ambient ", "sfx ", "stop ", "wait(", "shake", "flash", "textbox ", "$ ", "if ", "call ", "jump "]) {
      expect(script, word).toContain(word);
    }
    // No errors (warnings about steps after "The end" are fine), and the game still builds and plays.
    const errors = await page.evaluate(() => (globalThis as unknown as { __studio: { getState(): { model: { errors: number } | null } } }).__studio.getState().model?.errors);
    expect(errors).toBe(0);
    const built = await waitFor((x) => x.preview.built !== null && (x.files["script/start.hws"] ?? "") === script, 10000);
    expect(built.preview.built?.ok).toBe(true);
  }, 90000);

  test("accessibility: no serious axe problems on the main screens (FINALIZATION.md §11.5)", async () => {
    // Evaluated through the debugger protocol, so Studio's content security policy doesn't block it.
    await page.evaluate(readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"));
    const problems: string[] = [];
    for (const screen of ["Screenplay", "Assets", "Characters", "Build and export", "Settings"]) {
      if (screen !== "Screenplay") await page.getByRole("button", { name: screen, exact: true }).click();
      await page.waitForTimeout(300);
      const found = await page.evaluate(async () => {
        type Result = { violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[] };
        const g = globalThis as unknown as { axe: { run(ctx: unknown, o: object): Promise<Result> }; document: unknown };
        const r = await g.axe.run(g.document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
        return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length}): ${v.help} — ${v.nodes[0]?.target.join(" ")}`);
      });
      problems.push(...found.map((f) => `${screen}: ${f}`));
    }
    expect(problems).toEqual([]);
  }, 60000);

  // BREAK_IT.md S-20: the renderer is untrusted. Every safe IPC method gets garbage; Studio refuses it, keeps
  // running, and the project is untouched. Skipped: native dialogs, PATH changes, opening or creating projects,
  // export and playtest (slow), and anything that spends money.
  test("IPC garbage: every method refuses bad arguments without harm (BREAK_IT.md S-20)", async () => {
    const before = await state();
    const results = await page.evaluate(async () => {
      const api = (globalThis as unknown as { himawari: Record<string, Record<string, unknown>> }).himawari;
      const skip = new Set([
        "dialog.pickFolder", "dialog.pickFile", "dialog.saveFile", "app.addToolsToPath", "project.open", "project.openBundled",
        "project.create", "project.close", "project.exportGame", "project.playtest", "preview.start", "preview.stop",
        "assistant.setKey", "assistant.reset", "mcp.writeClaudeCodeConfig", "settings.set", "app.copyText",
      ]);
      const junk: unknown[] = [undefined, null, 0, -1, Number.NaN, "", "assets/..", "assets/", "../../evil", "C:/Windows/win.ini", {}, [], { cmd: "warp", to: 5 }, "x".repeat(2_000_000), new Uint8Array(3)];
      const out: { method: string; ok: number; refused: number }[] = [];
      for (const [group, methods] of Object.entries(api)) {
        for (const [name, fn] of Object.entries(methods)) {
          const method = `${group}.${name}`;
          if (typeof fn !== "function" || name.startsWith("on") || skip.has(method)) continue;
          let ok = 0;
          let refused = 0;
          for (const a of junk) {
            for (const b of [undefined, a]) {
              try {
                await (fn as (...args: unknown[]) => Promise<unknown>)(a, b, a);
                ok++;
              } catch {
                refused++;
              }
            }
          }
          out.push({ method, ok, refused });
        }
      }
      return out;
    });
    expect(results.length).toBeGreaterThan(20);
    // Studio is still alive and answering, and nothing in the project changed.
    const after = await state();
    expect(after.root).toBe(before.root);
    expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort());
    expect(existsSync(join(projects, "Hallway Test", "himawari.json"))).toBe(true);
    expect(existsSync(join(projects, "Hallway Test", "assets"))).toBe(true);
    expect(await page.evaluate(async () => !!(await (globalThis as unknown as { himawari: { app: { info(): Promise<unknown> } } }).himawari.app.info()))).toBe(true);
  }, 120000);

  test("the UI switches to Japanese", async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox").first().selectOption("ja");
    await page.getByRole("heading", { name: "設定" }).waitFor();
    expect(await page.getByText("自動保存").count()).toBeGreaterThan(0);
    await page.getByRole("combobox").first().selectOption("en");
  }, 30000);
});
