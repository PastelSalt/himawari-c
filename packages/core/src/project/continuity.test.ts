import { describe, expect, test } from "vitest";
import { type ProjectInput, checkProject } from "./check.js";
import { routeBalance, storyGraph } from "./graph.js";
import { newNoteId, noteAnchor, readNotes, stringifyNotes } from "./notes.js";

const manifest = (variables: Record<string, unknown> = {}) =>
  JSON.stringify({ name: "T", id: "a.b", entry: "start", sourceLanguage: "en", languages: ["en"], variables });
const HANA = "---\nid: hana\nname: Hana\nsprite:\n  root: sprites/hana\n  groups:\n    eyes: { default: neutral }\n  presets:\n    happy: { eyes: smile }\n---\n";
const KAI = "---\nid: kai\nname: Kai\n---\n";

const input = (script: string, variables: Record<string, unknown> = {}): ProjectInput => ({
  manifest: { file: "himawari.json", text: manifest(variables) },
  characters: [
    { file: "characters/hana.md", text: HANA },
    { file: "characters/kai.md", text: KAI },
  ],
  scripts: [{ file: "script/a.hws", text: script }],
});
const hints = (i: ProjectInput) =>
  checkProject(i)
    .files.flatMap((f) => f.diagnostics)
    .filter((d) => /^HW034/.test(d.code))
    .map((d) => `${d.code} ${d.message}`);

describe("continuity hints", () => {
  test("HW0340: speaking after hide in the same scene (characters without sprites are never 'hidden')", () => {
    const s = 'scene start:\n    show hana at left\n    hide hana\n    hide kai\n    hana "Still here?"\n    kai "Me too."\n    end\n';
    expect(hints(input(s))).toEqual(["HW0340 Hana speaks here, but was hidden earlier in this scene."]);
  });

  test("HW0340: show, a speaker's attributes, or a branch that shows her again clear it", () => {
    const shown = 'scene start:\n    hide hana\n    show hana at left\n    hana "Back."\n    end\n';
    const attrs = 'scene start:\n    hide hana\n    hana happy "Back."\n    end\n';
    const branch = 'scene start:\n    hide hana\n    menu:\n        "A":\n            show hana\n        "B":\n            "Nothing."\n    hana "Hm?"\n    end\n';
    const everyBranch = 'scene start:\n    menu:\n        "A":\n            hide hana\n        "B":\n            hide hana\n    hana "Hm?"\n    end\n';
    expect(hints(input(shown))).toEqual([]);
    expect(hints(input(attrs))).toEqual([]);
    expect(hints(input(branch))).toEqual([]);
    expect(hints(input(everyBranch))).toHaveLength(1);
    // A branch that jumps away doesn't carry on; an if without else can be skipped.
    const jumpsAway = 'scene start:\n    menu:\n        "A":\n            show hana\n            jump other\n        "B":\n            hide hana\n    hana "Hm?"\n    end\n\nscene other:\n    end\n';
    const noElse = 'scene start:\n    if 1 > 0:\n        hide hana\n    hana "Hm?"\n    end\n';
    expect(hints(input(jumpsAway))).toHaveLength(1);
    expect(hints(input(noElse))).toEqual([]);
  });

  test("HW0341/HW0342: flags nothing checks, conditions that can never change", () => {
    const v = (scope = "save") => ({ type: "bool", default: false, scope });
    const s = 'scene start:\n    $ told = true\n    $ counted = true\n    if trusted:\n        "Yes."\n    "Hi, [name]."\n    if both:\n        $ both = false\n    end\n';
    const out = hints(input(s, { told: v(), counted: v("global"), trusted: v(), name: { type: "str", default: "Aoi", scope: "save" }, both: v() }));
    expect(out).toEqual(["HW0341 The variable told is set (1 time(s)) but nothing reads it.", "HW0342 The variable trusted is used in a condition but never set, so it's always false."]);
  });
});

describe("route balance", () => {
  const graph = (script: string) => storyGraph(checkProject(input(script)));
  const say = (n: number) => Array.from({ length: n }, (_, i) => `    "Line ${i}."`).join("\n");

  test("each ending's own lines, shared lines, and the choices into it; a short route is flagged", () => {
    const s = `scene start:\n${say(2)}\n    menu:\n        "A":\n            jump a\n        "B":\n            jump b\n        "C":\n            jump c\n\nscene a:\n${say(10)}\n    end\n\nscene b:\n${say(12)}\n    end\n\nscene c:\n${say(2)}\n    end\n`;
    const r = routeBalance(graph(s));
    expect(r.routes.map((x) => [x.ending, x.lines, x.shared])).toEqual([
      ["a", 10, 2],
      ["b", 12, 2],
      ["c", 2, 2],
    ]);
    expect(r.routes[0]!.choices).toEqual(["start: A"]);
    expect(r.median).toBe(10);
    expect(r.short).toEqual(["c"]);
  });

  test("a hub the menus come back to counts for every route it leads to", () => {
    const s = `scene start:\n    jump hub\n\nscene hub:\n${say(3)}\n    menu:\n        "Walk":\n            jump walk\n        "Leave":\n            jump goodbye\n\nscene walk:\n${say(4)}\n    jump hub\n\nscene goodbye:\n${say(1)}\n    end\n`;
    const r = routeBalance(graph(s));
    expect(r.routes).toHaveLength(1);
    // walk leads only to goodbye (through the hub): it belongs to that route.
    expect(r.routes[0]!.members.sort()).toEqual(["goodbye", "hub", "start", "walk"]);
    expect(r.routes[0]!.lines).toBe(8);
  });
});

describe("review notes", () => {
  test("a hand-edited file never breaks: malformed notes are skipped, unknown kinds become to-dos", () => {
    const notes = readNotes(
      JSON.stringify({ notes: [{ id: "n1", text: "ok", kind: "continuity", line: "k3f9a1", author: "ai", created: "t" }, { id: 2 }, { id: "n2", text: "x", kind: "weird", resolved: true }] }),
    );
    expect(notes).toEqual([
      { id: "n1", line: "k3f9a1", kind: "continuity", text: "ok", author: "ai", created: "t" },
      { id: "n2", kind: "todo", text: "x", author: "human", created: "", resolved: true },
    ]);
    expect(readNotes("{ nope")).toEqual([]);
    expect(readNotes(stringifyNotes(notes))).toEqual(notes);
  });

  test("ids are new; anchors read naturally", () => {
    let i = 0;
    const seq = [0, 0, 0.5];
    const id = newNoteId([`n${"0".repeat(7)}`], () => seq[i++]!);
    expect(id).toMatch(/^n[0-9a-z]{7}$/);
    expect(id).not.toBe("n0000000");
    expect(noteAnchor({ id, kind: "todo", text: "", author: "human", created: "", line: "k3f9a1" })).toBe("#k3f9a1");
    expect(noteAnchor({ id, kind: "todo", text: "", author: "human", created: "", scene: "ch1" })).toBe("scene ch1");
  });
});
