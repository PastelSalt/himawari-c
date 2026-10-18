import { describe, expect, test } from "vitest";
import { type Stmt, endsFlow, parseAst } from "./ast.js";
import { parseText, plainText } from "./text.js";

const SAMPLE = `scene ch1_intro:
    bg classroom_day with dissolve(800)
    music morning_theme fade(1000)
    show hana smile uniform at left with fade(300)
    hana "Good morning, [player_name]! You're late {b}again{/b}."   #line:k3f9a1
    "The bell rang."
    $ hana_affection += 1
    menu "What do you say?":
        "I overslept.":
            hana annoyed "Classic."
        once "I was helping someone." if courage >= 2:
            hana surprised -glasses "Really?"
            jump ch1_helped
    stop music fade(500)
    wait(800)
    shake
    if hana_affection > 2 and not met:
        call bonus
    else:
        end
`;

describe("AST from the CST", () => {
  const { ast, diagnostics } = parseAst(SAMPLE, "script/ch1.hws");
  const body = ast.scenes[0]?.body ?? [];
  const byKind = <K extends Stmt["kind"]>(k: K) => body.filter((s): s is Extract<Stmt, { kind: K }> => s.kind === k);

  test("no diagnostics, versioned, one scene", () => {
    expect(diagnostics).toEqual([]);
    expect(ast.version).toBe("1.1");
    expect(ast.file).toBe("script/ch1.hws");
    expect(ast.scenes.map((s) => s.id)).toEqual(["ch1_intro"]);
  });

  test("statement kinds in order", () => {
    expect(body.map((s) => s.kind)).toEqual([
      "Bg", "Audio", "Show", "Say", "Narration", "Assign", "Menu", "Stop", "Wait", "Effect", "If",
    ]);
  });

  test("stage statements", () => {
    expect(byKind("Bg")[0]).toMatchObject({ asset: "classroom_day", transition: { type: "dissolve", args: [800] } });
    expect(byKind("Audio")[0]).toMatchObject({ channel: "music", asset: "morning_theme", fadeMs: 1000 });
    expect(byKind("Show")[0]).toMatchObject({
      char: "hana", add: ["smile", "uniform"], remove: [], at: "left", transition: { type: "fade", args: [300] },
    });
    expect(byKind("Stop")[0]).toMatchObject({ channel: "music", fadeMs: 500 });
    expect(byKind("Wait")[0]).toMatchObject({ ms: 800 });
    expect(byKind("Effect")[0]).toMatchObject({ effect: "shake", ms: null });
  });

  test("dialogue matches the plan §5.3 shape", () => {
    expect(byKind("Say")[0]).toMatchObject({
      lineId: "k3f9a1",
      speaker: "hana",
      attrs: { add: [], remove: [] },
      text: [
        { t: "Good morning, " }, { var: "player_name" }, { t: "! You're late " },
        { tag: "b", children: [{ t: "again" }] }, { t: "." },
      ],
    });
    expect(byKind("Narration")[0]).toMatchObject({ lineId: null, text: [{ t: "The bell rang." }] });
  });

  test("assignment and expressions", () => {
    expect(byKind("Assign")[0]).toMatchObject({ name: "hana_affection", op: "+=", value: { kind: "Int", value: 1 } });
    const cond = byKind("If")[0]?.clauses[0]?.cond;
    expect(cond).toEqual({
      kind: "Binary", op: "and",
      left: { kind: "Binary", op: ">", left: { kind: "Var", name: "hana_affection" }, right: { kind: "Int", value: 2 } },
      right: { kind: "Unary", op: "not", operand: { kind: "Var", name: "met" } },
    });
    expect(byKind("If")[0]?.clauses[1]?.cond).toBeNull();
  });

  test("menu options: once, conditions, fall-through", () => {
    const menu = byKind("Menu")[0];
    expect(menu?.prompt).toEqual([{ t: "What do you say?" }]);
    const [a, b] = menu?.options ?? [];
    expect(a).toMatchObject({ once: false, cond: null, fallsThrough: true, text: [{ t: "I overslept." }] });
    expect(b).toMatchObject({
      once: true, fallsThrough: false,
      cond: { kind: "Binary", op: ">=", left: { kind: "Var", name: "courage" }, right: { kind: "Int", value: 2 } },
    });
    expect(b?.body[0]).toMatchObject({ kind: "Say", speaker: "hana", attrs: { add: ["surprised"], remove: ["glasses"] } });
  });

  test("spans point back into the source", () => {
    const say = byKind("Say")[0];
    expect(SAMPLE.slice(say?.span.start, say?.span.end)).toContain('hana "Good morning');
  });

  test("endsFlow: jump/return/end, or an if whose every branch (with else) ends", () => {
    const flow = (src: string) => endsFlow(parseAst(`scene s:\n${src}`).ast.scenes[0]?.body ?? []);
    expect(flow("    jump x\n")).toBe(true);
    expect(flow("    \"hi\"\n")).toBe(false);
    expect(flow("    if a:\n        jump x\n    else:\n        end\n")).toBe(true);
    expect(flow("    if a:\n        jump x\n")).toBe(false);
  });

  test("text diagnostics surface through parseAst", () => {
    const { diagnostics: d } = parseAst('scene s:\n    hana "{bold}hi{/b} [ ]"\n');
    expect(d.map((x) => x.code)).toEqual(["HW0016", "HW0018", "HW0019"]);
  });
});

describe("text parser", () => {
  const parts = (s: string) => parseText(`"${s}"`, 0);

  test("escapes", () => {
    expect(parts('say \\"hi\\" \\[x\\] \\{b\\}\\nnext').parts).toEqual([{ t: 'say "hi" [x] {b}\nnext' }]);
  });

  test("standalone and valued tags", () => {
    expect(parts("wait{w=500}now{nw}").parts).toEqual([
      { t: "wait" }, { tag: "w", value: "500" }, { t: "now" }, { tag: "nw" },
    ]);
    expect(parts("{color=#ff0000}red{/color}").parts).toEqual([{ tag: "color", value: "#ff0000", children: [{ t: "red" }] }]);
  });

  test("ruby", () => {
    expect(parts("{rb=かんじ}漢字{/rb}です").parts).toEqual([
      { tag: "rb", value: "かんじ", children: [{ t: "漢字" }] }, { t: "です" },
    ]);
  });

  test("nested tags", () => {
    expect(parts("{b}bold {i}both{/i}{/b}").parts).toEqual([
      { tag: "b", children: [{ t: "bold " }, { tag: "i", children: [{ t: "both" }] }] },
    ]);
  });

  test("select variants", () => {
    const r = parts('{select gender_p: m="he" f="she" other="they"} waved.');
    expect(r.diagnostics).toEqual([]);
    expect(r.parts).toEqual([
      { select: "gender_p", cases: { m: [{ t: "he" }], f: [{ t: "she" }], other: [{ t: "they" }] } },
      { t: " waved." },
    ]);
    expect(plainText(r.parts)).toBe("they waved.");
  });

  test.each([
    ["HW0016", "{blink}x{/blink}"],
    ["HW0017", "{b}never closed"],
    ["HW0018", "x{/i}"],
    ["HW0019", "[Not Valid]"],
    ["HW0020", '{select g: m="he"}'],
    ["HW0021", "{color}x{/color}"],
  ])("%s", (code, s) => {
    expect(parts(s).diagnostics.map((d) => d.code)).toContain(code);
  });

  test("an unclosed tag keeps its text", () => {
    expect(plainText(parts("{b}still here").parts)).toBe("still here");
  });

  test("diagnostic spans are file offsets", () => {
    const r = parseText('"ab{nope}"', 100);
    expect(r.diagnostics[0]?.span).toEqual({ start: 103, end: 109 });
  });
});
