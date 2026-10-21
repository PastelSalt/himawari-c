/**
 * The AI tools under hostile arguments (BREAK_IT.md S-23): every tool gets file
 * names that climb out of the project, absolute paths, reserved device names,
 * wrong types, and huge strings. None may throw out of the tool runner, write
 * outside the project, or create a file Windows can't use.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { ProjectFs } from "../fs.js";
import { TOOLS } from "../index.js";

const DEMO = fileURLToPath(new URL("../../../../examples/sunflower-demo/", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "hw-tools-hostile-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const HOSTILE: unknown[] = ["../evil.hws", "..\\..\\evil.md", "C:/Windows/evil.hws", "/etc/evil", "assets/../himawari.json", "script/con.hws", "characters/aux", "nul", "", ".", "x".repeat(100000), 0, -1, null, {}, [], true];

/** Every file under `dir`, as "path size". */
function listing(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(`${full} ${statSync(full).size}`);
    }
  };
  visit(dir);
  return out.sort();
}

describe("AI tools under hostile arguments (BREAK_IT.md S-23)", () => {
  test("no tool throws, writes outside the project, or makes a reserved name", async () => {
    const root = join(work, "game");
    cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
    const outsideBefore = listing(work).filter((l) => !l.startsWith(root));
    const fs = new ProjectFs(root);
    let calls = 0;
    for (const tool of TOOLS) {
      if (tool.name === "playtest" || tool.name === "render_line" || tool.name === "build") continue; // run the game: covered elsewhere
      const shape = Object.keys((tool.input as unknown as { shape: Record<string, unknown> }).shape ?? {});
      for (const bad of HOSTILE) {
        // Each argument in turn gets the hostile value; the others get plausible text.
        for (const key of shape.length ? shape : ["_"]) {
          const args: Record<string, unknown> = Object.fromEntries(shape.map((k) => [k, "start"]));
          args[key] = bad;
          const parsed = tool.input.safeParse(args);
          if (!parsed.success) continue; // refused by the schema: good
          calls++;
          await expect(Promise.resolve().then(() => tool.run({ fs, runtime: null, allowBuild: false } as never, parsed.data as never)).catch((e: unknown) => {
            // A refusal with a message is how tools say no (the server turns it into an error result).
            // A programming error (reading a property of undefined, a bad range) means a tool fell over.
            if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) throw new Error(`${tool.name}(${key}=${JSON.stringify(bad)?.slice(0, 40)}): ${String(e)}`);
          })).resolves.not.toThrow();
        }
      }
    }
    expect(calls).toBeGreaterThan(20);
    expect(listing(work).filter((l) => !l.startsWith(root))).toEqual(outsideBefore);
    expect(existsSync(join(work, "evil.hws"))).toBe(false);
    const reserved = listing(root).filter((l) => /[\\/](con|aux|nul|prn|com\d|lpt\d)(\.[^\\/]*)? \d+$/i.test(l));
    expect(reserved).toEqual([]);
  }, 120000);
});
