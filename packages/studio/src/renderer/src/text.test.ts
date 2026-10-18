import { parseAst } from "@himawari/core";
import { describe, expect, it } from "vitest";
import { applyPatch, diffLines } from "../../shared/patch";
import {
  copyWithoutIds,
  deleteLines,
  displayToRaw,
  insertAfter,
  moveLines,
  moveLinesBefore,
  rawToDisplay,
  setLineBody,
  setQuoted,
  setSayHead,
} from "./screenplay-edit";

const SRC = [
  "# a comment that must survive",
  "scene start:",
  "    bg park with fade",
  '    hana smile "Hi!"   #line:aaaaaa',
  '    "It was warm."   #line:bbbbbb',
  "",
  '    hana "Bye."   #line:cccccc',
  "    end",
  "",
].join("\n");

const at = (needle: string) => SRC.indexOf(needle);

describe("diffLines / applyPatch (selective undo)", () => {
  it("diffs line by line", () => {
    const ops = diffLines("a\nb\nc", "a\nB\nc");
    expect(ops).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
    ]);
  });

  it("reverses an old change on top of a later one", () => {
    const base = "one\ntwo\nthree\nfour\nfive\nsix";
    const changed = "one\nTWO\nthree\nfour\nfive\nsix"; // the change to undo
    const later = "one\nTWO\nthree\nfour\nfive\nSIX"; // an unrelated edit made afterwards
    expect(applyPatch(changed, base, later)).toBe("one\ntwo\nthree\nfour\nfive\nSIX");
  });

  it("refuses when the same lines changed again", () => {
    expect(applyPatch("a\nb\nc", "a\nB\nc", "a\nX\nc")).toBeNull();
  });
});

describe("Screenplay text edits keep everything else byte-for-byte", () => {
  it("converts quotes between what writers see and .hws", () => {
    expect(displayToRaw('She said "hi" {select g: m="he" other="they"}')).toBe('She said \\"hi\\" {select g: m="he" other="they"}');
    expect(rawToDisplay('She said \\"hi\\" \\[x]')).toBe('She said "hi" \\[x]');
  });

  it("replaces a line's text and keeps its ID", () => {
    const out = setQuoted(SRC, at("hana smile"), 'Hello, "you".');
    expect(out).toContain('    hana smile "Hello, \\"you\\"."   #line:aaaaaa');
    expect(out.replace('"Hello, \\"you\\"."', '"Hi!"')).toBe(SRC);
  });

  it("changes the speaker and attributes", () => {
    expect(setSayHead(SRC, at("hana smile"), "ren", ["angry"])).toContain('    ren angry "Hi!"   #line:aaaaaa');
    expect(setSayHead(SRC, at("hana smile"), null, [])).toContain('    "Hi!"   #line:aaaaaa');
  });

  it("edits a stage line and keeps its indentation", () => {
    expect(setLineBody(SRC, at("bg park"), "bg beach with dissolve")).toContain("\n    bg beach with dissolve\n");
  });

  it("inserts, duplicates without IDs, deletes, and moves lines", () => {
    const ins = insertAfter(SRC, at('"It was warm."'), "    ", ['hana ""']);
    expect(ins.text).toContain('#line:bbbbbb\n    hana ""\n');
    expect(ins.text.slice(ins.at, ins.at + 12)).toBe('    hana ""\n');
    expect(copyWithoutIds(SRC, at("hana smile"), at("hana smile") + 5)).toBe('    hana smile "Hi!"\n');
    expect(deleteLines(SRC, at('"It was warm."'), at('"It was warm."') + 3)).not.toContain("bbbbbb");
    const moved = moveLines(SRC, at("hana smile"), at("hana smile") + 4, at('"It was warm."'));
    expect(moved.indexOf("bbbbbb")).toBeLessThan(moved.indexOf("aaaaaa"));
    const back = moveLinesBefore(moved, moved.indexOf("hana smile"), moved.indexOf("hana smile") + 4, moved.indexOf('"It was warm."'));
    expect(back).toBe(SRC);
  });

  it("every edit leaves a file Core parses without errors", () => {
    const edits = [
      setQuoted(SRC, at("hana smile"), "New text"),
      setSayHead(SRC, at('hana "Bye."'), "hana", ["smile", "-glasses"]),
      insertAfter(SRC, at("bg park"), "    ", ['"Narration."']).text,
      moveLines(SRC, at('hana "Bye."'), at('hana "Bye."') + 4, at("bg park")),
    ];
    for (const e of edits) expect(parseAst(e).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(SRC.startsWith("# a comment that must survive")).toBe(true);
  });
});
