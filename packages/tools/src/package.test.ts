import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPack } from "@himawari/core";
import { afterAll, describe, expect, test } from "vitest";
import { embeddedPack } from "./embed.js";
import { ProjectFs } from "./fs.js";
import { compileProject, packageGame } from "./package.js";
import { findRuntime } from "./runtime.js";

const DEMO = fileURLToPath(new URL("../../../examples/sunflower-demo/", import.meta.url));
const runtime = findRuntime();
const work = mkdtempSync(join(tmpdir(), "hw-package-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe.skipIf(!runtime)("single-file export (FINALIZATION.md OC-6)", () => {
  const root = join(work, "game");
  cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
  const fs = new ProjectFs(root);
  const release = (options: Parameters<typeof packageGame>[5]) => {
    const c = compileProject(fs, { debug: false });
    expect(c.errors).toBe("");
    return packageGame(fs, c.bytes!, c.title, c.gameId, runtime!, { version: c.version, ...options });
  };

  test("a folder export, then a single file: the pack moves inside the exe and data.hwp goes", () => {
    const folder = release({});
    expect(fs.exists(`${folder.dir}/data.hwp`)).toBe(true);
    const one = release({ singleFile: true });
    expect(one.pack).toBe(one.exe);
    expect(fs.exists(`${one.dir}/data.hwp`)).toBe(false); // it would win over the pack inside
    const inside = embeddedPack(new Uint8Array(fs.readBytes(one.exe)));
    expect(inside).not.toBeNull();
    expect(readPack(inside!).entries.length).toBe(one.entries);
  });

  test("the single-file game plays", () => {
    const one = release({ singleFile: true });
    const shot = join(work, "shot.png");
    const r = spawnSync(fs.path(one.exe), ["--start", "--frames", "20", "--screenshot", shot], { cwd: work, timeout: 60000 });
    expect(r.status, r.stderr?.toString()).toBe(0);
    expect(existsSync(shot)).toBe(true);
  });

  test("a patch against a single-file game", () => {
    release({ singleFile: true });
    const file = "script/start.hws";
    fs.write(file, fs.read(file).replace(/"([^"]+)"/, '"Changed for the patch."'));
    const p = release({ patch: true });
    expect(p.pack).toMatch(/patch1\.hwp$/);
    expect(p.entries).toBeGreaterThan(0);
  });
});

// BREAK_IT.md finding B-8: game titles that made exe and folder names Windows can't use.
describe("export names from any title", () => {
  test("reserved device names, long titles, and nothing usable", async () => {
    const { safeName } = await import("./package.js");
    expect(safeName("CON")).toBe("CON game");
    expect(safeName("nul")).toBe("nul game");
    expect(safeName("Com1")).toBe("Com1 game");
    expect(safeName("Console")).toBe("Console");
    expect(Array.from(safeName("あ".repeat(300))).length).toBe(64);
    expect(safeName("a".repeat(63) + " b")).toBe("a".repeat(63));
    expect(safeName("😀!!!")).toBe("game");
    expect(safeName("  Sunflower   Days  ")).toBe("Sunflower Days");
  });
});

// BREAK_IT.md finding B-13: exporting again while the last exported game still runs.
describe.skipIf(!runtime)("re-export while the game is running", () => {
  test("says the game is open, quickly, and leaves the folder as it was", async () => {
    const { spawn } = await import("node:child_process");
    const root = join(work, "running");
    cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\/]build$/.test(s) });
    const fs = new ProjectFs(root);
    const exportOnce = () => {
      const c = compileProject(fs, { debug: false });
      return packageGame(fs, c.bytes!, c.title, c.gameId, runtime!, { version: c.version });
    };
    const first = exportOnce();
    const game = spawn(fs.path(first.exe), ["--start", "--frames", "100000"], { cwd: fs.path(first.dir), stdio: "ignore" });
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const t0 = Date.now();
      expect(() => exportOnce()).toThrow(/still running/);
      expect(Date.now() - t0).toBeLessThan(1000);
    } finally {
      game.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(exportOnce().exe).toBe(first.exe); // closed: it works again
  }, 60000);
});
