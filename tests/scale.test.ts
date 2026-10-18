/**
 * Big projects (session 16 stress test): a generated story of ≈ 36 000 lines in
 * 134 files, with ≈ 370 images and a translation, must compile, check quickly the
 * second time, be fully covered by a playtest, and give the AI tools short
 * summaries instead of walls of text. scripts/stress/ has the generator and the
 * timing scripts for Studio and the tools.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { checkProject } from "../packages/core/src/index.js";
import { ProjectFs, TOOLS, loadInput } from "../packages/tools/src/index.js";
import { compileProject } from "../packages/tools/src/package.js";
import { findRuntime } from "../packages/tools/src/runtime.js";

const MAKE = fileURLToPath(new URL("../scripts/stress/make-project.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "hw-scale-"));
const runtime = findRuntime();

beforeAll(() => {
  const r = spawnSync(process.execPath, [MAKE, dir], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
}, 60000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("a big project (≈ 36 000 lines)", () => {
  test("compiles (no call-stack overflow on big tables) and checks clean", () => {
    const fs = new ProjectFs(dir);
    const c = compileProject(fs);
    expect(c.errors).toBe("");
    expect((c.bytes as Uint8Array).length).toBeGreaterThan(3_000_000);
    fs.write("build/game.hwb", c.bytes as Uint8Array);
  }, 60000);

  test("a second check reuses unchanged files (Studio checks after every pause in typing)", () => {
    const input = loadInput(new ProjectFs(dir));
    const t0 = performance.now();
    checkProject(input);
    const first = performance.now() - t0;
    const t1 = performance.now();
    const c = checkProject({ ...input, scripts: input.scripts.map((s, i) => (i === 3 ? { ...s, text: s.text.replace("Right.", "Right!") } : s)) });
    const second = performance.now() - t1;
    expect(c.files.flatMap((f) => f.diagnostics).filter((d) => d.severity === "error")).toEqual([]);
    expect(second).toBeLessThan(first);
  }, 60000);

  test.skipIf(!runtime)("a playtest reaches every ending, line, and choice", () => {
    const r = spawnSync(runtime as string, ["--headless", join(dir, "build/game.hwb"), "--playtest"], { encoding: "utf8", timeout: 120000 });
    expect(r.stdout).toMatch(/endings: 12 of 12 reached/);
    expect(r.stdout).toMatch(/every menu and option was tried/);
    expect(r.stdout).toMatch(/OK: every ending reached, no errors\./);
  }, 120000);

  test("the AI tools summarize instead of listing everything", async () => {
    const ctx = { fs: new ProjectFs(dir), runtime: null, allowBuild: false };
    const tool = (name: string) => TOOLS.find((t) => t.name === name)!;
    const scenes = await tool("list_scenes").run(ctx, tool("list_scenes").input.parse({}));
    expect("text" in scenes && scenes.text).toMatch(/^1123 scenes in 134 files/);
    expect("text" in scenes && scenes.text.length).toBeLessThan(12000);
    const graph = await tool("get_story_graph").run(ctx, tool("get_story_graph").input.parse({ format: "mermaid" }));
    expect("text" in graph && graph.text.length).toBeLessThan(4000);
    const near = await tool("get_story_graph").run(ctx, tool("get_story_graph").input.parse({ scene: "r5_f2_s3" }));
    expect("text" in near && near.text.split("\n").length).toBeLessThan(15);
  }, 60000);
});
