import { type ProjectInput, checkProject } from "@himawari/core";
import { describe, expect, test } from "vitest";
import { invokeFormOf, invokeSource } from "./invoke-form";

const MANIFEST = JSON.stringify({ name: "T", id: "a.b", entry: "s", sourceLanguage: "en", languages: ["en"] });
const EXT = JSON.stringify({
  name: "screen_tint",
  description: "Tints the picture.",
  blocking: false,
  params: [
    { name: "color", type: "word", enum: ["sepia", "night", "none"] },
    { name: "ms", type: "int", default: 500 },
  ],
});
const SCRIPT = `define statement enter(who: character, side: position = center, ms: int = 400):
    show who at side with dissolve(ms)

scene s:
    enter(hana)
    enter(hana, left, ms=200)
    screen_tint(night, 800)
    screen_tint(color=sepia)
    end
`;

const project = (): ProjectInput => ({
  manifest: { file: "himawari.json", text: MANIFEST },
  characters: [{ file: "characters/hana.md", text: "---\nid: hana\nname: Hana\n---\n" }],
  scripts: [{ file: "script/s.hws", text: SCRIPT }],
  extensions: [{ file: "extensions/screen_tint.schema.json", text: EXT }],
});

describe("calls as forms", () => {
  const check = checkProject(project());
  const body = check.parsed.get("script/s.hws")!.ast.scenes[0]!.body;

  test("fields come from the signature; lines round-trip", () => {
    const lines = ["enter(hana)", "enter(hana, left, ms=200)", "screen_tint(night, 800)", "screen_tint(color=sepia)"];
    const expected = ["enter(hana)", "enter(hana, left, 200)", "screen_tint(night, 800)", "screen_tint(sepia)"];
    body.slice(0, 4).forEach((s, i) => {
      const f = invokeFormOf(s, check);
      expect(f, lines[i]).not.toBeNull();
      expect(invokeSource(f!)).toBe(expected[i]);
    });
    const ext = invokeFormOf(body[2]!, check)!;
    expect(ext.of).toBe("extension");
    expect(ext.params.map((p) => [p.name, p.type, p.required])).toEqual([
      ["color", "word", true],
      ["ms", "int", false],
    ]);
    expect(ext.params[0]!.enum).toEqual(["sepia", "night", "none"]);
  });

  test("a skipped optional parameter makes the rest named", () => {
    const f = invokeFormOf(body[1]!, check)!;
    expect(invokeSource({ ...f, values: { ...f.values, side: null } })).toBe("enter(hana, ms=200)");
  });

  test("an unknown statement stays as script", () => {
    expect(invokeFormOf(body[4]!, check)).toBeNull(); // `end` isn't a call
  });
});
