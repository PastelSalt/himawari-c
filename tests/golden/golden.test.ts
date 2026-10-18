/**
 * Golden images (plan §16.1, Phase 5 exit): the runtime draws chosen moments
 * of examples/sunflower-demo and each frame must match its reference image
 * (perceptually: see compare_golden in runtime/src/app/hw_screens.c). Runs
 * when a built runtime is found (HIMAWARI_RUNTIME, or runtime/build/...);
 * skipped otherwise. Japanese cases need Yu Gothic (not on every CI runner).
 *
 * Regenerate (then look at every image!) with:
 *   HW_UPDATE_GOLDEN=1 corepack pnpm vitest run tests/golden
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compileProject } from "../../packages/tools/src/package.js";
import { ProjectFs } from "../../packages/tools/src/fs.js";
import { findRuntime } from "../../packages/tools/src/runtime.js";

const DEMO = fileURLToPath(new URL("../../examples/sunflower-demo/", import.meta.url));
const HERE = fileURLToPath(new URL("./", import.meta.url));
const runtime = findRuntime();
const hasYuGothic = existsSync(join(process.env["WINDIR"] ?? "C:/Windows", "Fonts", "YuGothM.ttc"));

/** name → the runtime's arguments for that moment (after the common ones). */
const CASES: [string, string[], { ja?: boolean }][] = [
  ["en-hana-happy", ["--warp", "#07cgn7"], {}], // a layered sprite with a preset, the themed textbox and nameplate
  ["en-menu", ["--warp", "#7qff7k"], {}], // a menu with themed choices
  ["en-two-characters", ["--warp", "#6q5we0"], {}], // two characters; Ren's glasses (a "multiple" group)
  ["en-field-sepia-cg", ["--warp", "#7vaqn5"], {}], // a CG under the sepia tint, a select
  ["es-river-night", ["--warp", "#hfrrzr", "--lang", "es"], {}], // the extension's tint after a warp, the yukata rule, Spanish UI from the theme
  ["ja-ruby", ["--warp", "#c1a2ng", "--lang", "ja"], { ja: true }], // ruby
  ["ja-nvl-page", ["--warp", "#hn7ndk", "--lang", "ja"], { ja: true }], // novel mode, color and size tags
  ["en-title", [], {}], // the title screen with the theme's string
  ["en-config", ["--screen", "config"], {}],
  ["en-gallery", ["--screen", "gallery", "--unlock-all"], {}],
  ["es-accessibility-prompt", ["--screen", "accessibility", "--lang", "es"], {}],
];

describe.skipIf(!runtime)("golden images (sunflower-demo)", () => {
  test("the demo builds", () => {
    const fs = new ProjectFs(DEMO);
    const c = compileProject(fs);
    expect(c.errors).toBe("");
    fs.write("build/game.hwb", c.bytes as Uint8Array);
  });

  for (const [name, args, opts] of CASES) {
    test.skipIf(opts.ja && !hasYuGothic)(name, () => {
      const golden = join(HERE, `${name}.png`);
      const r = spawnSync(
        runtime as string,
        ["--project", DEMO, ...args, "--text-speed", "1000", "--no-gpu", "--frames", "45", "--compare", golden],
        { encoding: "utf8", env: { ...process.env, SDL_AUDIO_DRIVER: "dummy", SDL_WINDOW_ACTIVATE_WHEN_SHOWN: "0" }, timeout: 60000 },
      );
      const log = `${r.stdout}${r.stderr}`;
      expect(r.status, log).toBe(0);
      if (!process.env["HW_UPDATE_GOLDEN"]) expect(log).toMatch(/golden: .*: match/);
    }, 60000);
  }
});
