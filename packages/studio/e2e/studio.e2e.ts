/**
 * Studio end to end (plan §14.6 `e2e` and `ux-budget`): Playwright drives the
 * built app (packages/studio/out) with the real runtime docked in its preview.
 *  - First run: New Project → template → the game plays (P1: under 60 s).
 *  - Play-as-you-write: an edit shows up in the running game in under 1 s (P1).
 *  - Export a Windows game.
 *  - The UI switches to Japanese.
 * Needs `electron-vite build` and runtime/build/win64-release (or -debug).
 * Run: corepack pnpm --filter @himawari/studio e2e
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
    await page.getByText(/^Done:/).waitFor({ timeout: 60000 });
    const dir = join(projects, "Hallway Test", "build", "windows", "Hallway Test");
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(["Hallway Test.exe", "game.hwb"]));
  }, 90000);

  test("the UI switches to Japanese", async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox").first().selectOption("ja");
    await page.getByRole("heading", { name: "設定" }).waitFor();
    expect(await page.getByText("自動保存").count()).toBeGreaterThan(0);
    await page.getByRole("combobox").first().selectOption("en");
  }, 30000);
});
