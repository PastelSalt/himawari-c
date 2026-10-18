// Opens a big project (from make-project.mjs) in Studio and times what a writer does: opening it,
// typing in a long file, each panel, search, and the story graph. Studio runs against a throwaway
// HIMAWARI_STUDIO_TEST_HOME and a copy of the project. Screenshots go to <out>.
//
//   node scripts/stress/studio.mjs <project folder> <out folder>   (after: corepack pnpm --filter @himawari/studio build)
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const STUDIO = fileURLToPath(new URL("../../packages/studio/", import.meta.url));
const { _electron } = createRequire(join(STUDIO, "package.json"))("playwright");
const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node scripts/stress/studio.mjs <project folder> <out folder>");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const home = mkdtempSync(join(tmpdir(), "hw-studio-stress-"));
const proj = join(home, "Projects", "stress");
cpSync(src, proj, { recursive: true, filter: (s) => !s.endsWith("build") });

const app = await _electron.launch({
  executablePath: join(STUDIO, "node_modules", "electron", "dist", "electron.exe"),
  args: ["."],
  cwd: STUDIO,
  env: { ...process.env, HIMAWARI_STUDIO_TEST_HOME: home, HIMAWARI_STUDIO_TEST_PICK: proj },
});
const results = [];
const note = (what, ms, extra = "") => {
  results.push([what, Math.round(ms), extra]);
  console.log(`${String(Math.round(ms)).padStart(7)} ms  ${what}${extra ? `  (${extra})` : ""}`);
};
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector(".welcome");
  // How long the page can't respond: the longest gap between animation frames during an action.
  await page.evaluate(() => {
    const w = globalThis;
    w.__gaps = [];
    let last = performance.now();
    const tick = (t) => {
      w.__gaps.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const stall = async (action) => {
    await page.evaluate(() => (globalThis.__gaps = []));
    const t0 = Date.now();
    await action();
    const ms = Date.now() - t0;
    await page.waitForTimeout(300);
    const worst = await page.evaluate(() => Math.max(0, ...globalThis.__gaps));
    return { ms, worst: Math.round(worst) };
  };
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });

  let r = await stall(async () => {
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.waitForSelector(".workspace", { timeout: 120000 });
  });
  note("open the project", r.ms, `longest freeze ${r.worst} ms`);
  await page.waitForTimeout(1500);
  await shot("01-workspace");

  // Open the 6 000-line file and type in it.
  r = await stall(async () => {
    await page.getByText("epilogue_long.hws", { exact: true }).first().click();
    await page.waitForSelector(".screenplay, .script-editor", { timeout: 60000 });
  });
  note("open a 6 000-line file (Screenplay)", r.ms, `longest freeze ${r.worst} ms`);
  await shot("02-big-file-screenplay");
  r = await stall(async () => {
    await page.getByRole("tab", { name: "Script", exact: true }).click();
    await page.waitForSelector(".cm-editor", { timeout: 60000 });
  });
  note("switch to the Script view", r.ms, `longest freeze ${r.worst} ms`);
  r = await stall(async () => {
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    for (const ch of "    \"Typed in the stress test.\"") await page.keyboard.type(ch);
    await page.waitForTimeout(1500);
  });
  note("type 30 characters at the end of it", r.ms, `longest freeze ${r.worst} ms`);
  await shot("03-big-file-script");
  r = await stall(async () => {
    await page.getByRole("tab", { name: "Screenplay", exact: true }).click();
    await page.locator(".sp-text").first().click();
    for (const ch of " and more") await page.keyboard.type(ch);
    await page.waitForTimeout(1500);
  });
  note("type 9 characters in the Screenplay of it", r.ms, `longest freeze ${r.worst} ms`);
  r = await stall(async () => {
    await page.getByRole("combobox", { name: /Go to a scene/ }).selectOption("big_120");
    await page.waitForTimeout(500);
  });
  note("go to scene big_120", r.ms, `longest freeze ${r.worst} ms`);
  await shot("03b-screenplay-goto");
  r = await stall(async () => {
    await page.getByPlaceholder("Find a file or scene").fill("r7_f3");
    await page.waitForTimeout(400);
  });
  note("filter the Explorer", r.ms, `longest freeze ${r.worst} ms`);
  await shot("03c-explorer-filter");

  for (const [label, name] of [
    ["Characters", "characters"],
    ["Assets", "assets"],
    ["Variables", "variables"],
    ["Localization", "localization"],
    ["Story graph", "graph"],
    ["UI Designer", "designer"],
  ]) {
    r = await stall(async () => {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(800);
    });
    note(`open ${label}`, r.ms, `longest freeze ${r.worst} ms`);
    await shot(`04-${name}`);
  }
  r = await stall(async () => {
    await page.keyboard.press("Control+P");
    await page.keyboard.type("promise lantern");
    await page.waitForTimeout(500);
  });
  note("search (Ctrl+P) for a line", r.ms, `longest freeze ${r.worst} ms`);
  await shot("05-search");
  await page.keyboard.press("Escape");
  const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1));
  note("renderer memory (MB)", heap);
} finally {
  await app.close();
  rmSync(home, { recursive: true, force: true });
}
