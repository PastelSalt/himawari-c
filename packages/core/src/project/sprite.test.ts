import { describe, expect, it } from "vitest";
import { readCharacter } from "./character.js";
import { applySpriteWords, spriteLayers } from "./sprite.js";

const HANA = `---
id: hana
sprite:
  root: sprites/hana
  groups:
    body:        { always: true }
    outfit:      { default: uniform }
    brows:       { default: neutral }
    eyes:        { default: neutral, blink: true }
    mouth:       { default: neutral, lipflap: true }
    accessories: { multiple: true, default: [glasses] }
  rules:
    - { hide: glasses, when: "surprised" }
  presets:
    neutral:   { brows: neutral, eyes: neutral, mouth: neutral }
    smile:     { brows: neutral, eyes: smile,   mouth: smile }
    surprised: { brows: up,      eyes: wide,    mouth: o }
---
`;

const ASSETS = ["sprites/hana/body/base.png", "sprites/hana/outfit/casual.png", "sprites/hana/accessories/ribbon.png"];
const sprite = readCharacter("characters/hana.md", HANA, ASSETS).character!.sprite!;
const show = (...steps: string[][]) => {
  let s = applySpriteWords(sprite, [], []);
  for (const words of steps) s = applySpriteWords(sprite, s, words);
  return spriteLayers(sprite, s).map((l) => `${l.group}/${l.attr}`);
};

describe("layered sprites resolve like the runtime (rfcs/0005)", () => {
  it("shows always groups and defaults", () => {
    expect(show()).toEqual(["body/base", "outfit/uniform", "brows/neutral", "eyes/neutral", "mouth/neutral", "accessories/glasses"]);
  });

  it("a preset replaces the previous expression; an attribute keeps the rest", () => {
    expect(show(["smile"], ["casual"])).toEqual(["body/base", "outfit/casual", "brows/neutral", "eyes/smile", "mouth/smile", "accessories/glasses"]);
    expect(show(["smile"], ["surprised"])).toEqual(["body/base", "outfit/uniform", "brows/up", "eyes/wide", "mouth/o"]);
  });

  it("-attr turns a default off until it is set again; multiple groups add", () => {
    expect(show(["-glasses"])).not.toContain("accessories/glasses");
    expect(show(["-glasses"], ["glasses"])).toContain("accessories/glasses");
    // Defaults apply only while nothing else in the group is set (also in a multiple group, as in Ren'Py).
    expect(show(["ribbon"])).toEqual(expect.arrayContaining(["accessories/ribbon"]));
    expect(show(["ribbon"])).not.toContain("accessories/glasses");
    expect(show(["glasses", "ribbon"])).toEqual(expect.arrayContaining(["accessories/glasses", "accessories/ribbon"]));
  });

  it("a rule's when-word can be a preset whose layers are all in effect", () => {
    expect(show(["surprised"])).not.toContain("accessories/glasses");
    expect(show(["surprised"], ["smile"])).toContain("accessories/glasses");
  });
});
