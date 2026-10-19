import { describe, expect, test } from "vitest";
import { checkProject } from "../project/check.js";
import { parseAst } from "../syntax/ast.js";
import { glossaryForPrompt, glossaryMisses, readGlossary, stringifyGlossary, translationInstructions } from "./glossary.js";
import { applyTranslations, collectLines, stringifyTable, syncTable } from "./table.js";

const GLOSSARY = stringifyGlossary([
  { source: "Sunflower Field", translations: { ja: "ひまわり畑" }, note: "a place" },
  { source: "Tanabata", translations: { ja: "七夕", "zh-Hans": "七夕" } },
]);

describe("the glossary", () => {
  test("reads terms and skips what it can't use", () => {
    expect(readGlossary(GLOSSARY)).toHaveLength(2);
    expect(readGlossary('{ "terms": [{ "source": "" }, { "translations": {} }, 3, { "source": "Kai", "translations": { "ja": "", "en": 1 } }] }')).toEqual([
      { source: "Kai", translations: {} },
    ]);
    expect(readGlossary("{ nope")).toEqual([]);
    expect(readGlossary(undefined)).toEqual([]);
  });

  test("a translation that doesn't use the agreed word is a miss; whole words only, any case", () => {
    const terms = readGlossary(GLOSSARY);
    expect(glossaryMisses(terms, "ja", "Meet me at the sunflower field.", "花畑で会おう。").map((t) => t.source)).toEqual(["Sunflower Field"]);
    expect(glossaryMisses(terms, "ja", "Meet me at the sunflower field.", "ひまわり畑で会おう。")).toEqual([]);
    expect(glossaryMisses(terms, "ja", "Tanabatas are fun.", "楽しい")).toEqual([]);
    // Untranslated lines and languages the glossary doesn't cover aren't misses.
    expect(glossaryMisses(terms, "ja", "Tanabata!", "")).toEqual([]);
    expect(glossaryMisses(terms, "ko", "Tanabata!", "칠석!")).toEqual([]);
  });

  test("prompt lines and the translator's instructions", () => {
    const terms = readGlossary(GLOSSARY);
    expect(glossaryForPrompt(terms, "ja")).toBe("- Sunflower Field → ひまわり畑 (a place)\n- Tanabata → 七夕");
    const text = translationInstructions({ sourceLanguage: "English", language: "Japanese (ja)", tag: "ja", glossary: terms, names: [{ source: "Hana", target: "花" }, { source: "Kai" }], projectGuide: "Cozy, all ages." });
    expect(text).toContain("into Japanese (ja)");
    expect(text).toContain("- Hana → 花");
    expect(text).not.toContain("Kai");
    expect(text).toContain("ひまわり畑");
    expect(text).toContain("Cozy, all ages.");
    // Deterministic, so every batch hits the same cached prefix.
    const again = () => translationInstructions({ sourceLanguage: "English", language: "Japanese (ja)", tag: "ja", glossary: terms, names: [], projectGuide: "" });
    expect(again()).toBe(
      again(),
    );
  });

  test("the checker notes a translation that ignores the glossary (HW0407, info)", () => {
    const script = 'scene start:\n    "The Sunflower Field at dusk."   #line:aaaaa1\n    end\n';
    const lines = collectLines(new Map([["script/a.hws", parseAst(script, "script/a.hws")]]));
    const table = (text: string) => stringifyTable(applyTranslations(syncTable(null, lines, "ja", "en").table, new Map([["aaaaa1", text]])).table);
    const check = (text: string, glossary = true) =>
      checkProject({
        manifest: { file: "himawari.json", text: JSON.stringify({ name: "T", id: "a.b", entry: "start", sourceLanguage: "en", languages: ["en", "ja"] }) },
        scripts: [{ file: "script/a.hws", text: script }],
        locales: [{ file: "locales/ja.json", text: table(text) }],
        ...(glossary ? { glossary: { file: "glossary.json", text: GLOSSARY } } : {}),
      }).files.find((f) => f.file === "locales/ja.json")?.diagnostics ?? [];
    const miss = check("夕暮れの花畑。");
    expect(miss.map((d) => [d.code, d.severity])).toEqual([["HW0407", "info"]]);
    expect(miss[0]!.message).toBe('The ja translation of line aaaaa1 doesn\'t use the glossary\'s "ひまわり畑" for "Sunflower Field".');
    expect(check("夕暮れのひまわり畑。")).toEqual([]);
    expect(check("夕暮れの花畑。", false)).toEqual([]);
  });
});
