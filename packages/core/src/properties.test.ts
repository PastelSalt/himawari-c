/**
 * Property tests (BREAK_IT.md E-7 to E-9, E-11): generated input instead of
 * examples. Core is the one authority on the language, so it must survive any
 * text a writer can paste, keep that text byte for byte, and build the same
 * bytes every time. fast-check shrinks a failure to a minimal input; the seed
 * it prints replays it (`fc.assert(..., { seed, path })`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { compile } from "./bytecode/compiler.js";
import { writeHwb } from "./bytecode/writer.js";
import { format } from "./format.js";
import type { RandomSource } from "./ids.js";
import { type ProjectInput, type SourceFile, checkProject } from "./project/check.js";
import { textOf } from "./syntax/cst.js";
import { parse } from "./syntax/parser.js";

const EXAMPLES = fileURLToPath(new URL("../../../examples/", import.meta.url));
const RUNS = Number(process.env["HW_PROPERTY_RUNS"] ?? 300);

function files(dir: string, base: string, ext: string): string[] {
  try {
    return readdirSync(dir)
      .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n), `${base}${n}/`, ext) : n.endsWith(ext) ? [`${base}${n}`] : []))
      .sort();
  } catch {
    return [];
  }
}

function loadProject(name: string): ProjectInput {
  const dir = join(EXAMPLES, name);
  const read = (f: string): SourceFile => ({ file: f, text: readFileSync(join(dir, f), "utf8") });
  return {
    manifest: read("himawari.json"),
    characters: files(join(dir, "characters"), "characters/", ".md").map(read),
    scripts: files(join(dir, "script"), "script/", ".hws").map(read),
    locales: files(join(dir, "locales"), "locales/", ".json").map(read),
    extensions: files(join(dir, "extensions"), "extensions/", ".schema.json").map(read),
    assets: files(join(dir, "assets"), "", "").map((a) => a),
  };
}

const PROJECTS = ["sunflower-demo", "festival-eve", "tutorial", "layered"].map((n) => ({ name: n, input: loadProject(n) }));
const SCRIPTS = PROJECTS.flatMap((p) => p.input.scripts.map((s) => s.text));

/** Pieces of the language, so generated text looks like real scripts often enough to reach deep code. */
const PIECES = [
  "scene ", "start", "menu", "menu \"Pick\"", ":", "if ", "elif ", "else", "show ", "hide ", "move ", "bg ", "cg ", "music ", "sfx ",
  "ambient ", "stop music", "wait(500)", "shake", "flash", "textbox nvl", "textbox adv", "jump ", "call ", "return", "end", "define ",
  "hana ", "kai ", "me ", "\"Hi.\"", "\"open", "\"{b}bold{/b}\"", "\"{漢字|かんじ}\"", "\"{$x}\"", "\"{w=0.5}\"", "\"{shake}x{/shake}\"",
  "$ x ", "= ", "+= ", "-= ", "1", "true", "\"s\"", "once ", "with ", "fade(3)", "dissolve", "at left", "(", ")", ",", "-", "and ", "or ",
  "not ", ">= ", "== ", "#c", "#line:k3f9a1", "   #line:aaaaaa", "    ", "        ", "\t", "\n", "\r\n", "@", "漢", "😀", "​", "́",
  "‮", "﻿", "\\", "{", "}", "|", "\"\"", "[", "]",
];
const soup = fc.array(fc.constantFrom(...PIECES), { maxLength: 80 }).map((xs) => xs.join(""));

/** A real script with a few random cuts, pastes, and duplicated ranges (what an editing accident looks like). */
const mutated = fc
  .tuple(
    fc.constantFrom(...SCRIPTS),
    fc.array(fc.tuple(fc.nat(), fc.nat({ max: 40 }), fc.oneof(fc.constant(""), fc.string({ maxLength: 8 }), fc.constantFrom(...PIECES))), { maxLength: 6 }),
  )
  .map(([src, cuts]) => {
    let s = src;
    for (const [at, len, ins] of cuts) {
      const i = s.length ? at % s.length : 0;
      s = s.slice(0, i) + ins + s.slice(i + len);
    }
    return s;
  });

const anyText = fc.oneof(soup, mutated, fc.string({ unit: "binary", maxLength: 200 }), fc.string({ unit: "grapheme", maxLength: 200 }));

/** A deterministic line-ID source, so format() results can be compared. */
function seeded(seed: number): RandomSource {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  };
}

describe("Core under generated input (BREAK_IT.md §2.2)", () => {
  test("E-7: any text parses, checks, and compiles without throwing, quickly", () => {
    const project = PROJECTS[0]!.input;
    fc.assert(
      fc.property(anyText, (text) => {
        const t0 = performance.now();
        parse(text);
        const check = checkProject({ ...project, scripts: [{ file: "script/fuzz.hws", text }, ...project.scripts] });
        compile(check);
        // A catastrophic regular expression shows up as seconds on a short input.
        expect(performance.now() - t0).toBeLessThan(2000);
      }),
      { numRuns: RUNS },
    );
  });

  test("E-8: parsing is lossless for any text, valid or not", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(textOf(parse(text).root)).toBe(text);
      }),
      { numRuns: RUNS * 3 },
    );
  });

  test("E-9: format is idempotent", () => {
    fc.assert(
      fc.property(anyText, fc.integer({ min: 1 }), (text, seed) => {
        const once = format(text, { random: seeded(seed) });
        if (once.refused) return;
        const twice = format(once.text, { random: seeded(seed + 1) });
        expect(twice.refused).toBeNull();
        expect(twice.text).toBe(once.text);
        expect(twice.added).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  test("E-9: formatting a finished project never changes its compiled bytes", () => {
    for (const { name, input } of PROJECTS) {
      const before = compile(checkProject(input));
      expect(before.module, name).toBeTruthy();
      const formatted = { ...input, scripts: input.scripts.map((s) => ({ ...s, text: format(s.text).text })) };
      const after = compile(checkProject(formatted));
      expect(Buffer.from(writeHwb(after.module!)).equals(Buffer.from(writeHwb(before.module!))), name).toBe(true);
    }
  });

  test("E-11: builds are deterministic, whatever order the files come in", () => {
    for (const { name, input } of PROJECTS) {
      const bytes = (i: ProjectInput) => Buffer.from(writeHwb(compile(checkProject(i)).module!));
      const a = bytes(input);
      expect(bytes(input).equals(a), `${name}: twice`).toBe(true);
      const reversed = { ...input, scripts: [...input.scripts].reverse(), characters: [...(input.characters ?? [])].reverse(), locales: [...(input.locales ?? [])].reverse() };
      expect(bytes(reversed).equals(a), `${name}: files in another order`).toBe(true);
    }
  });
});
