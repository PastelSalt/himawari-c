/**
 * Golden images (plan §16.1, Phase 5 exit): the runtime draws chosen moments
 * of examples/sunflower-demo and each frame must match its reference image
 * (perceptually: see compare_golden in runtime/src/app/hw_screens.c). Runs
 * when a built runtime is found (HIMAWARI_RUNTIME, or runtime/build/...);
 * skipped otherwise. The theme presets (rfcs/0010) are drawn on a copy of the demo. Japanese cases need Yu Gothic, Chinese ones Microsoft YaHei (both
 * ship with Windows, but not every CI image has them).
 *
 * Regenerate (then look at every image!) with:
 *   HW_UPDATE_GOLDEN=1 corepack pnpm vitest run tests/golden
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compileProject } from "../../packages/tools/src/package.js";
import { ProjectFs } from "../../packages/tools/src/fs.js";
import { findRuntime } from "../../packages/tools/src/runtime.js";

const DEMO = fileURLToPath(new URL("../../examples/sunflower-demo/", import.meta.url));
const HERE = fileURLToPath(new URL("./", import.meta.url));
const runtime = findRuntime();
const fonts = join(process.env["WINDIR"] ?? "C:/Windows", "Fonts");
const hasFont = { ja: existsSync(join(fonts, "YuGothM.ttc")), zh: existsSync(join(fonts, "msyh.ttc")) };

/** name → the runtime's arguments for that moment (after the common ones). */
const CASES: [string, string[], { needs?: "ja" | "zh" }][] = [
  ["en-hana-happy", ["--warp", "#07cgn7"], {}], // a layered sprite with a preset, the themed textbox and nameplate
  ["en-menu", ["--warp", "#7qff7k"], {}], // a menu with themed choices
  ["en-two-characters", ["--warp", "#6q5we0"], {}], // two characters; Ren's glasses (a "multiple" group)
  ["en-field-sepia-cg", ["--warp", "#7vaqn5"], {}], // a CG under the sepia tint, a select
  ["zh-river-night", ["--warp", "#hfrrzr", "--lang", "zh-Hans"], { needs: "zh" }], // the extension's tint after a warp, the yukata rule, Chinese UI from the theme
  ["zh-two-characters", ["--warp", "#6q5we0", "--lang", "zh-Hans"], { needs: "zh" }], // simplified characters with YaHei first, Chinese names
  ["ja-ruby", ["--warp", "#c1a2ng", "--lang", "ja"], { needs: "ja" }], // ruby
  ["ja-nvl-page", ["--warp", "#hn7ndk", "--lang", "ja"], { needs: "ja" }], // novel mode, color and size tags
  ["en-title", [], {}], // the title screen with the theme's string
  ["en-config", ["--screen", "config"], {}],
  ["en-gallery", ["--screen", "gallery", "--unlock-all"], {}],
  ["zh-accessibility-prompt", ["--screen", "accessibility", "--lang", "zh-Hans"], { needs: "zh" }],
];

/** Theme presets (rfcs/0010): the demo under each one, at a line with a speaker and on its title screen. */
const PRESETS = ["pastel", "minimal", "paper", "night", "retro", "high-contrast"];

function run(project: string, name: string, args: string[]) {
  const golden = join(HERE, `${name}.png`);
  const r = spawnSync(
    runtime as string,
    ["--project", project, ...args, "--text-speed", "1000", "--no-gpu", "--frames", "45", "--compare", golden],
    { encoding: "utf8", env: { ...process.env, SDL_AUDIO_DRIVER: "dummy", SDL_WINDOW_ACTIVATE_WHEN_SHOWN: "0" }, timeout: 60000 },
  );
  const log = `${r.stdout}${r.stderr}`;
  expect(r.status, log).toBe(0);
  if (!process.env["HW_UPDATE_GOLDEN"]) expect(log).toMatch(/golden: .*: match/);
}

describe.skipIf(!runtime)("golden images (sunflower-demo)", () => {
  test("the demo builds", () => {
    const fs = new ProjectFs(DEMO);
    const c = compileProject(fs);
    expect(c.errors).toBe("");
    fs.write("build/game.hwb", c.bytes as Uint8Array);
  });

  for (const [name, args, opts] of CASES) {
    test.skipIf(opts.needs !== undefined && !hasFont[opts.needs])(name, () => run(DEMO, name, args), 60000);
  }
});

describe.skipIf(!runtime)("golden images (theme presets)", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  for (const preset of PRESETS) {
    test(`preset ${preset}`, () => {
      const dir = mkdtempSync(join(tmpdir(), "hw-golden-"));
      dirs.push(dir);
      cpSync(DEMO, dir, { recursive: true, filter: (s) => !s.endsWith("build") && !s.includes("\build\\") });
      const theme = JSON.parse(readFileSync(join(dir, "theme/theme.json"), "utf8")) as Record<string, unknown>;
      writeFileSync(join(dir, "theme/theme.json"), JSON.stringify({ preset, title: theme["title"], strings: theme["strings"] }));
      const fs = new ProjectFs(dir);
      const c = compileProject(fs);
      expect(c.errors).toBe("");
      fs.write("build/game.hwb", c.bytes as Uint8Array);
      run(dir, `preset-${preset}-textbox`, ["--warp", "#07cgn7"]);
      run(dir, `preset-${preset}-menu`, ["--warp", "#7qff7k"]);
    }, 120000);
  }
});

/* Finalization (FINALIZATION.md): software rendering (RA-3), the autosave (P-2), and the title-screen credit (OC-10). */
describe.skipIf(!runtime)("golden images (finalization)", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const temp = () => {
    const d = mkdtempSync(join(tmpdir(), "hw-golden-"));
    dirs.push(d);
    return d;
  };

  test("SDL's software renderer draws the same frame (no graphics driver needed)", () => {
    run(DEMO, "en-hana-happy-software", ["--warp", "#07cgn7", "--renderer", "software"]); // its own image: edges filter a little differently
  }, 60000);

  test("the autosave at a menu loads back to that menu", () => {
    const save = join(temp(), "auto.hwsav");
    run(DEMO, "en-menu", ["--warp", "#7qff7k", "--autosave-to", save]);
    expect(existsSync(save)).toBe(true);
    run(DEMO, "en-menu", ["--load", save]);
  }, 60000);

  test("credit: title draws a small line on the title screen", () => {
    const dir = temp();
    cpSync(DEMO, dir, { recursive: true, filter: (s) => !s.endsWith("build") && !s.includes("\build\\") });
    const manifest = JSON.parse(readFileSync(join(dir, "himawari.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(dir, "himawari.json"), JSON.stringify({ ...manifest, credit: "title" }));
    const fs = new ProjectFs(dir);
    const c = compileProject(fs);
    expect(c.errors).toBe("");
    fs.write("build/game.hwb", c.bytes as Uint8Array);
    run(dir, "en-title-credit", []);
  }, 60000);
});
