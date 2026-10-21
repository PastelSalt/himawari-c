/**
 * Property tests for the Screenplay's text surgery (BREAK_IT.md E-10): every
 * form edit rewrites only its own line, keeps the line ID and any comment, and
 * whatever a writer types into a line's text box comes back exactly, without
 * breaking the file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LINE_ID_ALPHABET, parse } from "@himawari/core";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { copyWithoutIds, lineAt, lineBodyWithoutTag, moveLines, quotedOn, rawToDisplay, setLineBody, setQuoted } from "../renderer/src/screenplay-edit.js";

const RUNS = Number(process.env["HW_PROPERTY_RUNS"] ?? 300);
const EXAMPLES = fileURLToPath(new URL("../../../../examples/", import.meta.url));
const SCRIPTS = ["sunflower-demo", "festival-eve", "tutorial", "layered"].flatMap((p) =>
  readdirSync(join(EXAMPLES, p, "script"))
    .filter((f) => f.endsWith(".hws"))
    .map((f) => readFileSync(join(EXAMPLES, p, "script", f), "utf8")),
);

/** Offsets of the start of every statement line (indented, not blank, not a comment). */
const statementLines = (text: string) => {
  const out: number[] = [];
  let at = 0;
  for (const line of text.split("\n")) {
    if (/^ +[^ #\r]/.test(line)) out.push(at);
    at += line.length + 1;
  }
  return out;
};
const lines = (t: string) => t.split("\n");
const errors = (t: string) => parse(t).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
const TAG = /#line:[0-9a-z]{6}/;

/** What a writer might type into a line's text box (one line: Enter adds the next line instead). */
const typed = fc.oneof(
  fc.string({ unit: "grapheme", maxLength: 60 }),
  fc.array(fc.constantFrom("a", " ", '"', "\\", "{", "}", "{b}", "{/b}", "|", "かな", "😀", "{w=0.5}", "\\n", "#", "#line:abcdef"), { maxLength: 20 }).map((xs) => xs.join("")),
).map((s) => s.replace(/[\r\n]/g, " "));

describe("Screenplay edits under generated input (BREAK_IT.md E-10)", () => {
  test("whatever is typed into a line comes back exactly, and the file still parses", () => {
    const base = 'scene start:\n    hana "Hello."   #line:abcdef\n    "Next."   #line:ghjkmn\n';
    const at = base.indexOf("hana");
    fc.assert(
      fc.property(typed, (display) => {
        const next = setQuoted(base, at, display);
        expect(errors(next)).toEqual([]);
        const l = lineAt(next, at);
        const q = quotedOn(next.slice(l.start, l.end));
        expect(q).not.toBeNull();
        const shown = rawToDisplay(q!.raw);
        // Without backslashes, what was typed comes back exactly (the text box re-reads the file on every
        // keystroke). Escapes typed by hand can settle once (`\"` shows as `"`, a final `\\` as `\`),
        // then stay put.
        if (!display.includes("\\")) expect(shown).toBe(display);
        expect(rawToDisplay(quotedOn(setQuoted(base, at, shown).split("\n")[1]!)!.raw)).toBe(shown);
        expect(next.slice(l.start, l.end)).toMatch(/#line:abcdef$/);
        expect(lines(next).slice(2)).toEqual(lines(base).slice(2));
      }),
      { numRuns: RUNS * 3 },
    );
  });

  test("B-1: an unclosed { or a final \\ no longer breaks the file, even typed one key at a time", () => {
    const base = 'scene start:\n    hana "Hello."   #line:abcdef\n';
    const at = base.indexOf("hana");
    for (const final of ["{", "x\\", "I said {b}hi{/b} {", "{b}bold{/b}", 'He said "{" and left.']) {
      let text = base;
      for (let k = 1; k <= final.length; k++) {
        const typedSoFar = final.slice(0, k);
        text = setQuoted(text, at, typedSoFar);
        expect(errors(text), JSON.stringify(typedSoFar)).toEqual([]);
        expect(rawToDisplay(quotedOn(text.split("\n")[1]!)!.raw), JSON.stringify(typedSoFar)).toBe(typedSoFar);
      }
    }
  });

  test("a form edit changes only its own line and keeps the line ID and comment", () => {
    const body = fc.constantFrom("bg park with fade", "show hana at left", "wait(500)", "jump start", "music theme fade(1000)", "$ x = 1", "shake", "end");
    fc.assert(
      fc.property(fc.constantFrom(...SCRIPTS), fc.nat(), body, (text, pick, newBody) => {
        const starts = statementLines(text);
        const at = starts[pick % starts.length]!;
        const before = lineAt(text, at);
        const trailer = before.body.slice(lineBodyWithoutTag(text, at).length);
        const next = setLineBody(text, at, newBody);
        const a = lines(text);
        const b = lines(next);
        expect(b.length).toBe(a.length);
        const row = text.slice(0, at).split("\n").length - 1;
        for (let i = 0; i < a.length; i++) if (i !== row) expect(b[i]).toBe(a[i]);
        expect(b[row]).toBe(`${before.indent}${newBody}${trailer}${a[row]!.endsWith("\r") ? "\r" : ""}`);
      }),
      { numRuns: RUNS },
    );
  });

  test("moving lines keeps every line and every line ID", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SCRIPTS), fc.nat(), fc.nat(), (text, i, j) => {
        const starts = statementLines(text);
        const from = starts[i % starts.length]!;
        const to = lineAt(text, from).end;
        const after = lineAt(text, starts[j % starts.length]!).end;
        const next = moveLines(text, from, to, after);
        const sorted = (t: string) => lines(t.endsWith("\n") ? t : `${t}\n`).sort();
        expect(sorted(next)).toEqual(sorted(text));
      }),
      { numRuns: RUNS },
    );
  });

  test("a copy has no line IDs left, for every character an ID can use", () => {
    expect(copyWithoutIds(`    hana "x"   #line:${LINE_ID_ALPHABET.slice(0, 6)}\n`, 0, 1)).not.toMatch(TAG);
    for (let i = 0; i + 6 <= LINE_ID_ALPHABET.length; i++) {
      const id = LINE_ID_ALPHABET.slice(i, i + 6);
      expect(copyWithoutIds(`    hana "x"   #line:${id}\n`, 0, 1), id).not.toMatch(TAG);
    }
  });
});
