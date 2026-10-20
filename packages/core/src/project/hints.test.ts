import { describe, expect, test } from "vitest";
import { type ProjectInput, checkProject } from "./check.js";
import { caseClashes, textboxFit } from "./hints.js";

const manifest = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: "T", id: "a.b", entry: "start", sourceLanguage: "en", languages: ["en"], ...extra });

const input = (script: string, extra: Record<string, unknown> = {}, more: Partial<ProjectInput> = {}): ProjectInput => ({
  manifest: { file: "himawari.json", text: manifest(extra) },
  characters: [
    { file: "characters/hana.md", text: "---\nid: hana\nname: Hana\n---\n" },
    { file: "characters/kai.md", text: "---\nid: kai\nname: Kai\n---\n" },
  ],
  scripts: [{ file: "script/a.hws", text: script }],
  ...more,
});
const hints = (i: ProjectInput) =>
  checkProject(i)
    .files.flatMap((f) => f.diagnostics)
    .filter((d) => /^HW035/.test(d.code))
    .map((d) => d.code);

describe("writer-aware hints", () => {
  test("a choice with one option, and two options that say the same", () => {
    const s = 'scene start:\n    hana "Hi."\n    kai "Yo."\n    menu:\n        "Go":\n            end\n    menu:\n        "Left":\n            end\n        "Left":\n            end\n';
    expect(hints(input(s))).toEqual(["HW0350", "HW0351"]);
  });

  test("a pasted line twice, doubled spaces, an unclosed bracket", () => {
    const s = 'scene start:\n    hana "Hi there."\n    hana "Hi there."\n    kai "Too  many spaces."\n    kai "「Unclosed quote."\n    end\n';
    expect(hints(input(s))).toEqual(["HW0352", "HW0353", "HW0354"]);
  });

  test("a character who never speaks; files that differ only in case", () => {
    const s = 'scene start:\n    hana "Hi."\n    end\n';
    expect(hints(input(s, {}, { assets: ["bg/Park.png", "bg/park.png"] }))).toEqual(expect.arrayContaining(["HW0355", "HW0356"]));
  });

  test("a line too long for the textbox, but not in novel mode", () => {
    const long = "word ".repeat(120).trim();
    expect(hints(input(`scene start:\n    hana "${long}"\n    kai "x"\n    end\n`))).toContain("HW0357");
    expect(hints(input(`scene start:\n    textbox nvl\n    hana "${long}"\n    kai "x"\n    end\n`))).not.toContain("HW0357");
    const fit = textboxFit([1920, 1080], 36);
    expect(fit.charsPerLine).toBeGreaterThan(60);
  });

  test("a project can mute a kind of hint; real problems are never muted", () => {
    const s = 'scene start:\n    hana "Hi."\n    hana "Hi."\n    kai "x"\n    jump nowhere\n';
    const muted = checkProject(input(s, { quietHints: ["HW0352", "HW0208"] })).files.flatMap((f) => f.diagnostics).map((d) => d.code);
    expect(muted).not.toContain("HW0352");
    expect(muted).toContain("HW0208");
  });

  test("a background far bigger than the game, or the wrong shape; once per image", () => {
    const s = 'scene start:\n    bg huge\n    bg square\n    bg huge\n    bg fine\n    hana "Hi."\n    kai "x"\n    end\n';
    const sizes = new Map([
      ["bg/huge.png", { width: 7680, height: 4320 }],
      ["bg/square.png", { width: 1000, height: 1000 }],
      ["bg/fine.png", { width: 1920, height: 1080 }],
    ]);
    const more = { assets: [...sizes.keys()], assetSizes: sizes };
    expect(hints(input(s, {}, more))).toEqual(["HW0358", "HW0359"]);
    expect(hints(input(s, { resolution: [3840, 2160] }, more))).toEqual(["HW0359"]);
  });

    test("case clashes", () => {
    expect(caseClashes(["a/B.png", "a/b.png", "c.hws"])).toEqual([["a/B.png", "a/b.png"]]);
  });
});
