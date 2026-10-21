/**
 * Hostile and odd projects (BREAK_IT.md S-8 to S-13): legal but extreme text and
 * sizes, broken JSON, odd folder names, and a project folder that disappears
 * while Studio has it open. Each must open, check, and build, or say why; none
 * may crash Studio, hang, or pollute anything outside the project.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, checkProject } from "@himawari/core";
import { afterAll, describe, expect, test } from "vitest";
import { buildModel } from "../renderer/src/model.js";
import { Project } from "./project.js";

const DEMO = fileURLToPath(new URL("../../../../examples/sunflower-demo/", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "hw-hostile-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const MANIFEST = JSON.stringify({ name: "Odd", id: "a.b", version: "1.0.0", engine: "^1.0.0", entry: "start", sourceLanguage: "en", languages: ["en"] });
const characters = [{ file: "characters/hana.md", text: "---\nid: hana\nname: Hana\n---\n" }];

/** Checks and compiles one script; returns the time taken and the error codes. */
function run(script: string, manifest = MANIFEST) {
  const t0 = performance.now();
  const check = checkProject({ manifest: { file: "himawari.json", text: manifest }, characters, scripts: [{ file: "script/a.hws", text: script }] });
  compile(check);
  const codes = check.files.flatMap((f) => f.diagnostics.filter((d) => d.severity === "error").map((d) => d.code));
  return { ms: performance.now() - t0, codes };
}

describe("S-8: extreme text", () => {
  const lines: [string, string][] = [
    ["right to left", "مرحبا بالعالم שלום"],
    ["zalgo", `Z${"́̂̃̄̅".repeat(40)}algo`],
    ["emoji with joiners", "👩‍👩‍👧‍👦🏳️‍🌈👍🏽"],
    ["a lone surrogate", "half \uD800 a pair"],
    ["a NUL byte", "before\u0000after"],
    ["direction overrides", "‮evil‬ and ⁦isolate⁩"],
    ["zero-width", "a​b‌c‍d﻿e"],
  ];
  for (const [what, text] of lines) {
    test(what, () => {
      const r = run(`scene start:\n    hana "${text}"\n    end\n`);
      expect(r.codes.filter((c) => c !== "HW0003")).toEqual([]);
      expect(r.ms).toBeLessThan(2000);
    });
  }

  test("CRLF, a BOM, tabs, and mixed line endings", () => {
    const r = run('﻿scene start:\r\n    hana "a"\n\thana "b"\r\n    end\r\n');
    expect(r.ms).toBeLessThan(2000);
  });

  test("a 1 MB line", () => {
    const r = run(`scene start:\n    hana "${"word ".repeat(200_000)}"\n    end\n`);
    expect(r.codes).toEqual([]);
    expect(r.ms).toBeLessThan(5000);
  });
});

describe("S-9: scale beyond the stress project", () => {
  test("5 000 scenes in one file", () => {
    const scenes = Array.from({ length: 5000 }, (_, i) => `scene s${i}:\n    "Line ${i}."\n    ${i < 4999 ? `jump s${i + 1}` : "end"}\n`);
    const r = run(`scene start:\n    jump s0\n${scenes.join("")}`);
    expect(r.codes).toEqual([]);
    // B-10: the compiler rebuilt a line index per scene (2.5 s here); checking and compiling now take well under a second.
    expect(r.ms).toBeLessThan(1500);
  }, 30000);

  test("conditions nested 300 deep don't overflow the stack", () => {
    let s = "scene start:\n";
    for (let d = 1; d <= 300; d++) s += `${"    ".repeat(d)}if true:\n`;
    s += `${"    ".repeat(301)}"deep"\n    end\n`;
    const r = run(s);
    expect(r.ms).toBeLessThan(5000);
  });

  test("2 000 characters and 10 000 assets", () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ file: `characters/c${i}.md`, text: `---\nid: c${i}\nname: C${i}\n---\n` }));
    const assets = Array.from({ length: 10000 }, (_, i) => `bg/b${i}.png`);
    const t0 = performance.now();
    const check = checkProject({ manifest: { file: "himawari.json", text: MANIFEST }, characters: many, assets, scripts: [{ file: "script/a.hws", text: 'scene start:\n    c1999 "Hi."\n    bg b9999\n    end\n' }] });
    expect(compile(check).module).toBeTruthy();
    expect(performance.now() - t0).toBeLessThan(15000);
  }, 30000);
});

describe("S-10: broken project files", () => {
  const manifests = ["", "{", "[]", "null", "42", '"text"', '{"name": 1e309, "id": "a.b"}', '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted2": true}}, "name": "x"}', `{"name": "${"x".repeat(100000)}"}`];
  for (const m of manifests) {
    test(`himawari.json: ${m.slice(0, 40) || "(empty)"}`, () => {
      expect(() => run('scene start:\n    "Hi."\n    end\n', m)).not.toThrow();
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
      expect(({} as Record<string, unknown>)["polluted2"]).toBeUndefined();
    });
  }

  test("a theme with absurd numbers still checks, and Studio's model builds", () => {
    const theme = JSON.stringify({ text: { size: 1e9 }, layout: { textbox: { x: -500, y: 1e309, w: 0, h: -1 } }, color: { accent: "#zzzzzz" } });
    const files = { "himawari.json": MANIFEST, "theme/theme.json": theme, "script/a.hws": 'scene start:\n    hana "Hi."\n    end\n', "characters/hana.md": characters[0]!.text };
    expect(() => buildModel(files, [])).not.toThrow();
  });
});

describe("S-11 and S-13: odd folders, and a folder that disappears", () => {
  test("a project in a folder with []#%& and emoji opens, saves, and builds", () => {
    const root = join(work, "odd [x] #1 %20 & 😀 名前");
    cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
    const p = new Project(root, { changed: () => {}, built: () => {} });
    p.snapshot();
    expect(p.write("script/start.hws", `${p.fs.read("script/start.hws")}# odd folder\n`)).toEqual({ ok: true });
    expect(p.build().ok).toBe(true);
    p.close();
  });

  test("S-13: deleting or renaming the open project's folder doesn't crash Studio", async () => {
    for (const how of ["delete", "rename"] as const) {
      const root = join(work, `vanishing-${how}`);
      cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
      const p = new Project(root, { changed: () => {}, built: () => {} });
      p.snapshot();
      p.watch();
      if (how === "delete") rmSync(root, { recursive: true, force: true });
      else renameSync(root, `${root}-moved`);
      await new Promise((r) => setTimeout(r, 500)); // let the watcher notice
      // Saving now fails with a message; it must not throw out of Studio's process or write elsewhere.
      let result: unknown;
      try {
        result = p.write("script/start.hws", "scene start:\n    end\n");
      } catch (e) {
        result = e;
      }
      expect(result).toBeTruthy();
      // B-9: the write is refused; the old folder is not quietly recreated with one file in it.
      expect(result).toBeInstanceOf(Error);
      expect(existsSync(root)).toBe(false);
      p.close();
    }
  });
});

// The sandbox itself is in packages/tools/src/fs.test.ts (S-12: links, "..", and absolute paths).
mkdirSync(work, { recursive: true });
writeFileSync(join(work, ".keep"), "");
