import { describe, expect, test } from "vitest";
import type { Diagnostic } from "../syntax/diagnostics.js";
import { type ProjectInput, checkProject } from "./check.js";
import { readCharacter } from "./character.js";
import { readManifest } from "./manifest.js";

const MANIFEST = JSON.stringify({
  name: "Test",
  id: "dev.moesoft.test",
  version: "0.1.0",
  engine: "^1.0.0",
  entry: "start",
  sourceLanguage: "en",
  languages: ["en", "ja"],
  variables: {
    score: { type: "int", default: 0, scope: "save" },
    met: { type: "bool", default: false, scope: "save" },
    gender_p: { type: "str", enum: ["m", "f", "other"], default: "other", scope: "save" },
    name: { type: "str", default: "Aoi", scope: "save" },
  },
});

const HANA = `---
id: hana
name: { en: "Hana", ja: "花" }
sprite:
  root: sprites/hana
  groups:
    eyes: { default: neutral }
    accessories: { multiple: true, default: [glasses] }
  presets:
    smile: { eyes: happy }
    surprised: { eyes: wide }
---
## Personality
Cheerful.
`;

const ASSETS = [
  "bg/classroom.png",
  "music/theme.ogg",
  "rules/wipe_left.png",
  "sprites/hana/mouth/smile.png",
  "sprites/hana/mouth/smile_open.png",
];

const GOOD = `scene start:
    bg classroom with fade(300)
    music theme fade(1000)
    show hana smile -glasses at left with rule(wipe_left, 500)
    hana surprised "Hi [name], {select gender_p: m="he" f="she" other="they"} waved."
    me "Hello."
    $ score += 1
    if score > 2 and not met:
        call talk
    menu:
        "A":
            jump ending
        once "B" if met:
            jump ending
    jump ending

scene talk:
    "Talking."
    $ met = true
    return

scene ending:
    end
`;

function project(scripts: Record<string, string>, extra: Partial<ProjectInput> = {}): ProjectInput {
  return {
    manifest: { file: "himawari.json", text: MANIFEST },
    characters: [{ file: "characters/hana.md", text: HANA }],
    scripts: Object.entries(scripts).map(([file, text]) => ({ file, text })),
    assets: ASSETS,
    ...extra,
  };
}

const all = (input: ProjectInput): Diagnostic[] => checkProject(input).files.flatMap((f) => f.diagnostics);
const codes = (input: ProjectInput) => all(input).map((d) => d.code);
/** Codes other than HW0321: the extra scene in `scene()` is deliberately unreachable. */
const problems = (input: ProjectInput) => codes(input).filter((c) => c !== "HW0321");

/** A scene body wrapped so that only the line under test can produce diagnostics. */
const scene = (body: string) => ({ "script/a.hws": GOOD, "script/b.hws": `scene extra:\n${body}\n    jump ending\n` });

describe("a correct project", () => {
  test("has no diagnostics at all", () => {
    expect(all(project({ "script/a.hws": GOOD }))).toEqual([]);
  });

  test("characters: presets, frontmatter attributes, and asset attributes (not blink/lip frames)", () => {
    const { character } = readCharacter("characters/hana.md", HANA, ASSETS);
    expect([...(character?.presets ?? [])].sort()).toEqual(["smile", "surprised"]);
    expect([...(character?.groups.get("mouth") ?? [])]).toEqual(["smile"]);
    expect(character?.displayName).toBe("Hana");
  });
});

describe("names", () => {
  test("HW0201 unknown speaker, with a suggestion and a quick fix", () => {
    const src = '    hanna "Hi."';
    const d = all(project(scene(src))).find((x) => x.code === "HW0201");
    expect(d?.help).toBe('did you mean "hana"?');
    const fix = d?.fixes?.[0];
    expect(fix?.title).toBe('Change to "hana"');
    const text = `scene extra:\n${src}\n    jump ending\n`;
    const edit = fix?.edits[0];
    expect(edit && text.slice(edit.span.start, edit.span.end)).toBe("hanna");
  });

  test("HW0201 for a name with no close match suggests creating the character", () => {
    const d = all(project(scene('    zelda "Hi."'))).find((x) => x.code === "HW0201");
    expect(d?.help).toBe("create characters/zelda.md to add this character");
    expect(d?.fixes).toBeUndefined();
  });

  test("HW0204 unknown expression, plan §2.2 style", () => {
    const d = all(project(scene("    show hana smil at left"))).find((x) => x.code === "HW0204");
    expect(d?.message).toBe('Hana has no expression or attribute called "smil".');
    expect(d?.help).toBe('did you mean "smile"?');
    expect(d?.note).toBe("Hana's expressions: smile, surprised");
  });

  test("characters without sprites accept any attribute (placeholders, P5)", () => {
    const plain = { file: "characters/kai.md", text: "---\nid: kai\nname: Kai\n---\n" };
    const input = project(scene('    kai sleepy "Zzz."'));
    input.characters = [...(input.characters ?? []), plain];
    expect(problems(input)).toEqual([]);
  });

  test.each([
    ["HW0202", "    show hanaa at left"],
    ["HW0205", "    show hana at lefft"],
    ["HW0206", "    bg classroom with fadee(300)"],
    ["HW0207", "    bg classroom with fade(1, 2)"],
    ["HW0208", "    jump endng"],
    ["HW0210", "    $ scor += 1"],
    ["HW0210", '    "Hi [nmae]."'],
    ["HW0214", "    $ score = dice(6)"],
    ["HW0217", '    "{select score: a="x" other="y"}"'],
    ["HW0212", '    "{select gender_p: x="?" other="o"}"'],
    ["HW0212", '    $ gender_p = "x"'],
  ])("%s: %s", (code, body) => {
    expect(codes(project(scene(body)))).toContain(code);
  });

  test("HW0213 missing asset is only info (placeholders, P5), with a suggestion", () => {
    const d = all(project(scene("    bg classrom"))).find((x) => x.code === "HW0213");
    expect(d?.severity).toBe("info");
    expect(d?.message).toBe('The bg "classrom" isn\'t in assets/bg/ yet; a placeholder will be shown.');
    expect(d?.help).toBe('did you mean "classroom"?');
  });

  test("asset checks are skipped when the asset list is unknown", () => {
    const input = project(scene("    bg anything"));
    delete input.assets;
    expect(problems(input)).toEqual([]);
  });

  test("variable checks are skipped without a manifest", () => {
    const c = codes({ scripts: [{ file: "s.hws", text: "scene s:\n    $ whatever = 1\n    end\n" }] });
    expect(c).toEqual([]);
  });
});

describe("types", () => {
  test.each([
    ["    $ met = 3", "met is bool, but the value is int"],
    ["    $ met += 1", '"+=" needs a number variable, but met is bool'],
    ["    if score:\n        end", "a condition must be true/false, not int"],
    ["    if met > 1:\n        end", '">" compares numbers, not bool'],
    ['    if score == "a":\n        end', "can't compare int with str"],
    ["    if score and met:\n        end", '"and" needs true/false values on both sides'],
  ])("%s", (body, problem) => {
    const d = all(project(scene(body))).filter((x) => x.code === "HW0211");
    expect(d.map((x) => x.params["problem"])).toContain(problem);
  });
});

describe("project-wide", () => {
  test("HW0209 duplicate scene across files", () => {
    const d = all(project({ "script/a.hws": GOOD, "script/b.hws": "scene ending:\n    end\n" }));
    expect(d.find((x) => x.code === "HW0209")?.params).toEqual({ name: "ending", other: "script/a.hws" });
  });

  test("HW0216 duplicate line ID across files", () => {
    const d = all(project({
      "script/a.hws": GOOD.replace('"Hello."', '"Hello."   #line:k3f9a1'),
      "script/b.hws": 'scene extra:\n    "Again."   #line:k3f9a1\n    jump ending\n',
    }));
    expect(d.find((x) => x.code === "HW0216")?.params).toEqual({ id: "k3f9a1", other: "script/a.hws" });
  });

  test("HW0215 entry scene missing", () => {
    const input = project({ "script/a.hws": "scene other:\n    end\n" });
    input.manifest = { file: "himawari.json", text: MANIFEST.replace('"entry":"start"', '"entry":"strat"') };
    const d = checkProject(input).files.find((f) => f.file === "himawari.json")?.diagnostics[0];
    expect(d?.code).toBe("HW0215");
  });
});

describe("flow", () => {
  test("HW0320 a scene that can run off its end", () => {
    const d = all(project({ "script/a.hws": GOOD, "script/b.hws": 'scene extra:\n    "and then nothing"\n' }));
    expect(d.find((x) => x.code === "HW0320")?.params).toEqual({ name: "extra" });
  });

  test("HW0321 a scene never reached from the entry", () => {
    expect(all(project(scene("    end"))).find((x) => x.code === "HW0321")?.params).toEqual({ name: "extra" });
  });

  test("HW0310 return in a scene nobody calls", () => {
    expect(codes(project(scene("    return")))).toContain("HW0310");
  });

  test("HW0331 a menu of only once-options", () => {
    expect(codes(project(scene('    menu:\n        once "a":\n            end\n        once "b":\n            end')))).toContain("HW0331");
  });
});

describe("project files", () => {
  test("HW0101 invalid JSON", () => {
    expect(readManifest("{ nope").diagnostics[0]?.code).toBe("HW0101");
  });

  test.each([
    ['{"name":"x","id":"a.b","entry":"s","sourceLanguage":"en","languages":["ja"]}', '"languages"'],
    ['{"name":"x","id":"a.b","entry":"s","sourceLanguage":"en","languages":["en"],"variables":{"v":{"type":"int","default":true,"scope":"save"}}}', '"variables.v.default"'],
    ['{"id":"a.b","entry":"s","sourceLanguage":"en","languages":["en"]}', '"name"'],
  ])("HW0102 %#", (json, field) => {
    const d = readManifest(json).diagnostics;
    expect(d.map((x) => x.params["field"])).toContain(field);
  });

  test("HW0110 and HW0111 character files", () => {
    expect(readCharacter("characters/a.md", "no frontmatter").diagnostics[0]?.code).toBe("HW0110");
    expect(readCharacter("characters/a.md", "---\nid: b\n---\n").diagnostics[0]?.code).toBe("HW0111");
  });
});
