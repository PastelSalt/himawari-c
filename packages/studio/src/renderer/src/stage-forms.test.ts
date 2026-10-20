import { type Stmt, parseAst } from "@himawari/core";
import { describe, expect, test } from "vitest";
import { conditionOf, conditionSource, formOf, formSource } from "./stage-forms";

const stmts = (lines: string[]): Stmt[] => {
  const r = parseAst(`scene s:\n${lines.map((l) => `    ${l}`).join("\n")}\n`, "t.hws");
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return r.ast.scenes[0]!.body;
};

describe("stage directions as forms", () => {
  // Every form writes back the same line it was read from (so editing one field changes only that).
  const ROUND_TRIP = [
    "bg classroom_day",
    "bg classroom_day with dissolve(800)",
    "cg first_meeting with fade",
    "show hana smile casual -glasses at left with fade(300)",
    "show hana",
    "hide hana with dissolve(300)",
    "move hana at right with slide_left(400)",
    "bg night with rule(wipe_left, 500)",
    "bg night with rule(wipe_left)",
    "music morning_theme fade(1000)",
    "music morning_theme",
    "ambient rain fade(500)",
    "sfx chime",
    "voice hana_hello",
    "stop music fade(800)",
    "stop ambient",
    "wait(500)",
    "shake",
    "flash(200)",
    "jump ending",
    "call side_story",
    "end",
    "textbox nvl",
    "textbox clear",
    "$ hana_affection += 1",
    "$ met = true",
    "$ route = \"hana\"",
    "$ score = -2",
  ];
  test.each(ROUND_TRIP)("%s", (line) => {
    const [s] = stmts([line, "end"]);
    const f = formOf(s!);
    expect(f).not.toBeNull();
    expect(formSource(f!)).toBe(line);
  });

  test("return round-trips inside a called scene", () => {
    const [s] = stmts(["return"]);
    expect(formSource(formOf(s!)!)).toBe("return");
  });

  test("anything a form can't show stays as script", () => {
    const [s] = stmts(["$ score = score + rand(3)", "end"]);
    expect(formOf(s!)).toBeNull();
  });

  test("a changed field writes a valid line", () => {
    const [s] = stmts(["show hana smile at left", "end"]);
    const f = formOf(s!)!;
    if (f.kind !== "show") throw new Error();
    const out = formSource({ ...f, at: "right", transition: { type: "dissolve", ms: 300 } });
    expect(out).toBe("show hana smile at right with dissolve(300)");
    stmts([out, "end"]);
  });
});

describe("conditions as forms", () => {
  const cond = (src: string) => {
    const s = stmts([`if ${src}:`, "    end", "end"])[0]!;
    if (s.kind !== "If") throw new Error();
    return s.clauses[0]!.cond!;
  };
  test.each(["courage >= 2", "met", "not met", "route == \"hana\"", "met and courage >= 2 and not lost", "a or b or c > 1"])("%s", (src) => {
    const c = conditionOf(cond(src));
    expect(c).not.toBeNull();
    expect(conditionSource(c!)).toBe(src);
  });
  test.each(["a and b or c", "score + 1 > 3", "rand(3) == 0", "(a or b) and c"])("too complex for a form: %s", (src) => {
    expect(conditionOf(cond(src))).toBeNull();
  });
});

describe("line edits keep what coders wrote", () => {
  test("a form edit keeps the line ID and a trailing comment", async () => {
    const { setLineBody, setOptionHead } = await import("./screenplay-edit");
    const text = 'scene s:\n    bg park with fade  # sunny afternoon\n    "Hi."   #line:k3f9a1  # check tone\n';
    const out = setLineBody(text, text.indexOf("bg"), "bg night with dissolve(500)");
    expect(out).toContain("    bg night with dissolve(500)  # sunny afternoon\n");
    const menu = 'scene s:\n    menu:\n        "Go left":   #line:aaaaa1  # the safe way\n            end\n';
    const at = menu.indexOf('"Go left"');
    expect(setOptionHead(menu, at, true, "courage >= 2")).toContain('        once "Go left" if courage >= 2:   #line:aaaaa1  # the safe way\n');
    expect(setOptionHead(setOptionHead(menu, at, true, "met"), at, false, null)).toBe(menu);
  });
});
