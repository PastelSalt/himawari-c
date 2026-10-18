import { describe, expect, test } from "vitest";
import { checkProject } from "../project/check.js";
import { parseAst } from "../syntax/ast.js";
import { parseCsv, toCsv, toXliff, translationsFromCsv, translationsFromXliff } from "./exchange.js";
import { applyTranslations, collectLines, parityProblems, parseTable, stringifyTable, syncTable } from "./table.js";

const SCRIPT = `scene start:
    hana "Good morning, [name]! {b}Again{/b}?"   #line:aaaaa1
    "{select g: m="He" other="They"} waved, \\"politely\\"."   #line:aaaaa2
    menu "Pick":
        "Tea":   #line:aaaaa3
            end
        "Water, please":   #line:aaaaa4
            end
    "Untagged lines are skipped."
`;

const linesOf = (src: string) => collectLines(new Map([["script/a.hws", parseAst(src, "script/a.hws")]]));

describe("collecting lines", () => {
  test("tagged dialogue, narration, and options with context, text as written", () => {
    expect(linesOf(SCRIPT)).toEqual([
      { id: "aaaaa1", file: "script/a.hws", scene: "start", speaker: "hana", kind: "say", text: "Good morning, [name]! {b}Again{/b}?" },
      { id: "aaaaa2", file: "script/a.hws", scene: "start", speaker: "", kind: "narration", text: '{select g: m="He" other="They"} waved, \\"politely\\".' },
      { id: "aaaaa3", file: "script/a.hws", scene: "start", speaker: "", kind: "option", text: "Tea" },
      { id: "aaaaa4", file: "script/a.hws", scene: "start", speaker: "", kind: "option", text: "Water, please" },
    ]);
  });
});

describe("sync", () => {
  const lines = linesOf(SCRIPT);
  const first = syncTable(null, lines, "ja", "en");

  test("a new table: everything missing", () => {
    expect(first.added).toBe(4);
    expect(first.table.lines.every((e) => e.status === "missing" && e.text === "")).toBe(true);
  });

  test("changed source → needs-review (translation kept); deleted lines removed; new lines added", () => {
    const translated = applyTranslations(first.table, new Map([["aaaaa1", "おはよう、[name]！{b}また{/b}？"], ["aaaaa3", "お茶"]])).table;
    const edited = SCRIPT.replace('"Tea":', '"Green tea":').replace(/\n {8}"Water, please".*\n {12}end/, "").replace("Untagged", "New");
    const next = syncTable(translated, linesOf(`${edited}    "Brand new."   #line:aaaaa5\n`), "ja", "en");
    expect([next.added, next.changed, next.removed]).toEqual([1, 1, 1]);
    const tea = next.table.lines.find((e) => e.id === "aaaaa3");
    expect(tea).toMatchObject({ source: "Green tea", text: "お茶", status: "needs-review" });
    expect(next.table.lines.find((e) => e.id === "aaaaa1")?.status).toBe("ok");
    expect(next.table.lines.map((e) => e.id)).toEqual(["aaaaa1", "aaaaa2", "aaaaa3", "aaaaa5"]);
  });

  test("tables round-trip through JSON", () => {
    expect(parseTable(stringifyTable(first.table))).toEqual(first.table);
    // A hand-edited status the format doesn't know keeps its text and needs review, never "missing".
    const odd = parseTable(JSON.stringify({ language: "ja", lines: [{ id: "aaaaaa", source: "Hi", text: "やあ", status: "done" }, { id: "bbbbbb", source: "Yo", text: "", status: "?" }] }));
    expect(odd.lines.map((l) => l.status)).toEqual(["needs-review", "missing"]);
  });
});

describe("placeholder parity", () => {
  const src = "Good morning, [name]! {b}Again{/b}?";

  test.each([
    ["おはよう、[name]！{b}また{/b}？", []],
    ["{b}また{/b}、[name]！", []], // order may change
    ["おはよう！{b}また{/b}？", ["is missing [name]"]],
    ["おはよう、[nmae]！{b}また{/b}？", ["is missing [name]", "has [nmae], which the source doesn't have"]],
    ["おはよう、[name]！また？", ["is missing {b}"]],
    ["おはよう、[name]！{b}また？", ['The tag "b" is never closed.', "is missing {b}"]],
    ["", []], // missing is not a parity problem
  ])("%s", (translation, problems) => {
    expect(parityProblems(src, translation)).toEqual(problems);
  });

  test("ruby may be added or dropped per language", () => {
    expect(parityProblems("Sunflower", "{rb=ひまわり}向日葵{/rb}")).toEqual([]);
  });

  test("select variables must be kept; cases may change per language", () => {
    expect(parityProblems('{select g: m="He" other="They"} waved.', '{select g: other="彼ら"}が手を振った。')).toEqual([]);
    expect(parityProblems('{select g: m="He" other="They"} waved.', "手を振った。")).toEqual(["is missing {select g: …}"]);
  });
});

describe("importing translations", () => {
  const table = syncTable(null, linesOf(SCRIPT), "ja", "en").table;

  test("human imports are ok; AI imports need review; broken ones are refused; unknown IDs reported", () => {
    const human = applyTranslations(table, new Map([["aaaaa3", "お茶"], ["aaaaa1", "おはよう！"], ["zzzzzz", "?"]]));
    expect(human.updated).toBe(1);
    expect(human.refused).toEqual([{ id: "aaaaa1", problems: ["is missing [name]", "is missing {b}"] }]);
    expect(human.unknown).toEqual(["zzzzzz"]);
    expect(human.table.lines.find((e) => e.id === "aaaaa3")).toMatchObject({ text: "お茶", status: "ok", provenance: "human" });
    const ai = applyTranslations(table, new Map([["aaaaa3", "お茶"]]), "ai");
    expect(ai.table.lines.find((e) => e.id === "aaaaa3")).toMatchObject({ status: "needs-review", provenance: "ai" });
  });
});

describe("exchange formats", () => {
  const lines = linesOf(SCRIPT);
  const table = applyTranslations(syncTable(null, lines, "ja", "en").table, new Map([["aaaaa3", 'お茶 "緑"']])).table;

  test("CSV: BOM, quoting, round-trip", () => {
    const csv = toCsv(table, lines);
    expect(csv.startsWith("﻿id,scene,speaker,source,translation,status\r\n")).toBe(true);
    expect(csv).toContain('aaaaa2,start,,"{select g: m=""He"" other=""They""} waved, \\""politely\\"".",,missing');
    const rows = parseCsv(csv);
    expect(rows[3]).toEqual(["aaaaa3", "start", "", "Tea", 'お茶 "緑"', "ok"]);
    // A translator fills in a cell; importing brings it back.
    const edited = csv.replace("aaaaa4,start,,\"Water, please\",,missing", 'aaaaa4,start,,"Water, please","お水、\nください",missing');
    const tr = translationsFromCsv(edited);
    expect(tr.get("aaaaa4")).toBe("お水、\nください");
    expect(tr.get("aaaaa3")).toBe('お茶 "緑"');
  });

  test("XLIFF 2.0: escaping, notes, state, round-trip", () => {
    const x = toXliff(table, lines);
    expect(x).toContain('<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="ja">');
    expect(x).toContain('<note category="speaker">hana</note>');
    expect(x).toContain("<source>Good morning, [name]! {b}Again{/b}?</source>");
    expect(x).toContain('<segment state="reviewed">');
    const back = translationsFromXliff(x.replace("<target></target>", "<target>おはよう、[name]！{b}また{/b}？</target>"));
    expect(back.get("aaaaa1")).toBe("おはよう、[name]！{b}また{/b}？");
    expect(back.get("aaaaa3")).toBe('お茶 "緑"');
    expect(() => translationsFromXliff("<xml/>")).toThrow(/XLIFF 2/);
  });
});

describe("hwc check integration", () => {
  const MANIFEST = JSON.stringify({
    name: "T", id: "a.b", entry: "start", sourceLanguage: "en", languages: ["en", "ja"],
    variables: { name: { type: "str", default: "A", scope: "save" }, g: { type: "str", enum: ["m", "other"], default: "other", scope: "save" } },
  });
  const HANA = "---\nid: hana\nname: Hana\n---\n";
  const check = (localeText: string) =>
    checkProject({
      manifest: { file: "himawari.json", text: MANIFEST },
      characters: [{ file: "characters/hana.md", text: HANA }],
      scripts: [{ file: "script/a.hws", text: SCRIPT }],
      locales: [{ file: "locales/ja.json", text: localeText }],
    }).files.find((f) => f.file === "locales/ja.json")?.diagnostics.map((d) => d.code) ?? [];

  const base = syncTable(null, linesOf(SCRIPT), "ja", "en").table;

  test("untranslated lines are an info note", () => {
    expect(check(stringifyTable(base))).toEqual(["HW0402"]);
  });

  test("broken placeholders, stale sources, orphans, review counts, unreadable files", () => {
    const t = structuredClone(base);
    (t.lines[0] as { text: string }).text = "おはよう";
    (t.lines[1] as { source: string }).source = "old source";
    t.lines.push({ id: "gone00", source: "x", text: "y", status: "ok", provenance: "human" });
    (t.lines[2] as { text: string; status: string }).text = "お茶";
    (t.lines[2] as { status: string }).status = "needs-review";
    const codes = check(stringifyTable(t));
    expect(codes).toEqual(expect.arrayContaining(["HW0401", "HW0403", "HW0405", "HW0404", "HW0402"]));
    expect(check("{ nope")).toEqual(["HW0406"]);
  });

  test("a translated line whose source changed needs review; its old markup is never an error (the edit isn't refused)", () => {
    const t = structuredClone(base);
    const e = t.lines[0] as { source: string; text: string; status: string };
    e.text = `${e.source.replace(/\{[^}]*\}/g, "")} {b}old{/b}`;
    e.source = `${e.source} (before the edit)`;
    e.status = "ok";
    expect(check(stringifyTable(t))).not.toContain("HW0401");
    expect(check(stringifyTable(t))).toContain("HW0403");
  });
});
