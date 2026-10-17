/**
 * Exec tools against the real runtime. Skipped when himawari.exe isn't built
 * (the TS-only CI job); the runtime CI job covers the runtime itself.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ProjectFs } from "./fs.js";
import { type ToolContext, type ToolOk, isConfirm } from "./registry.js";
import { findRuntime } from "./runtime.js";
import { build, playtest, renderLine } from "./tools/exec.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const runtime = findRuntime();
let dir = "";
let ctx: ToolContext;

const ok = (o: Awaited<ReturnType<typeof playtest.run>>): ToolOk => {
  if (isConfirm(o)) throw new Error("unexpected confirmation");
  return o;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "himawari-exec-"));
  cpSync(join(ROOT, "examples/layered"), dir, { recursive: true, filter: (p) => !p.replaceAll("\\", "/").endsWith("/build") });
  ctx = { fs: new ProjectFs(dir), runtime, allowBuild: true };
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!runtime)("exec tools (with himawari.exe)", () => {
  test("playtest explores every path", async () => {
    const r = ok(await playtest.run(ctx, { seed: 1, max_steps: 50000 }));
    expect(r.data["ok"]).toBe(true);
    expect(r.text).toContain("Endings: 1 of 1 reached");
    expect(r.data["coverage"]).toMatchObject({ lines: { seen: 5, total: 5 } });
  });

  test("playtest with choices returns a transcript", async () => {
    const r = ok(await playtest.run(ctx, { choices: [], seed: 1, max_steps: 50000 }));
    expect(r.text).toContain("Mio: I'm drawn from layers");
    expect(r.text).toContain("show mio (eyes=smile mouth=smile)");
  });

  test("render_line returns a PNG of the line", async () => {
    const r = ok(await renderLine.run(ctx, { scene: "start" }));
    expect(r.image?.mimeType).toBe("image/png");
    expect(Buffer.from(r.image?.data ?? "", "base64").subarray(1, 4).toString()).toBe("PNG");
  }, 60000);

  test("build packages a playable folder", async () => {
    const r = ok(await build.run(ctx, {}));
    expect(r.data["exe"]).toBe("build/windows/Layered Sprites/Layered Sprites.exe");
    expect(existsSync(join(dir, "build/windows/Layered Sprites/game.hwb"))).toBe(true);
    expect(existsSync(join(dir, "build/windows/Layered Sprites/assets/sprites/mio/body/base.png"))).toBe(true);
  });
});
