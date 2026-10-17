import { describe, expect, test } from "vitest";
import { type CstNode, childNodes, isNode, textOf, tokensOf, walk } from "./cst.js";
import { parse } from "./parser.js";

/** The example from plan §5.1 (with line tags on dialogue). */
const SAMPLE = `# script/ch1.hws
scene ch1_intro:
    bg classroom_day with dissolve(800)
    music morning_theme fade(1000)
    show hana smile uniform at left with fade(300)

    hana "Good morning, [player_name]! You're late {b}again{/b}."   #line:k3f9a1
    me "Sorry, sorry..."
    "The bell rang before I could finish."
    $ hana_affection += 1

    menu "What do you say?":
        "I overslept.":
            hana annoyed "Classic."
        "I was helping someone." if courage >= 2:
            $ hana_affection += 2
            hana surprised -glasses "Really? That's... actually kind of sweet."
            jump ch1_helped
    # options without a jump fall through to here (Ink-style gather)

    hana "Anyway, let's go."
    jump ch1_class

scene ch1_hub:
    menu "Ask Hana about...":
        once "The festival.":
            call talk_festival
            jump ch1_hub
        once "Her transfer rumor." if heard_rumor:
            call talk_rumor
            jump ch1_hub
        "Nothing, let's go.":
            jump ch1_class
`;

const kinds = (block: CstNode) =>
  block.children.filter(isNode).map((n) => n.kind).filter((k) => k !== "BlankLine" && k !== "CommentLine");

const blockOf = (n: CstNode) => childNodes(n, "Block")[0] as CstNode;

const codes = (src: string) => parse(src).diagnostics.map((d) => d.code);

describe("lossless round-trip", () => {
  test("sample", () => {
    expect(textOf(parse(SAMPLE).root)).toBe(SAMPLE);
  });

  test("CRLF, BOM, tabs, no final newline, garbage", () => {
    for (const src of [
      SAMPLE.replace(/\n/g, "\r\n"),
      "\uFEFF" + SAMPLE,
      "scene a:\n\thana \"tab\"\n",
      "scene a:\n    jump b",
      "@@@ ¿ 漢字 \"unterminated\n  \t \n$$$ = = =\n",
      "",
      "\n\n\n",
    ]) {
      expect(textOf(parse(src).root)).toBe(src);
    }
  });

  test("random input always round-trips and never throws", () => {
    const pieces = [
      "scene ", "menu ", "if ", "elif ", "else", "show ", "hana ", "\"hi\"", "\"open", ":", "$ x ", "+= ", "1", "(",
      ")", "-", "#c", "#line:k3f9a1", "    ", "\t", "\n", "\r\n", "@", "漢", "jump ", "once ", "with ", "fade(3)", ",",
    ];
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let run = 0; run < 500; run++) {
      let src = "";
      const len = rand(60);
      for (let i = 0; i < len; i++) src += pieces[rand(pieces.length)];
      const { root } = parse(src);
      expect(textOf(root)).toBe(src);
    }
  });

  test("every token appears exactly once, in order", () => {
    const { root } = parse(SAMPLE);
    let offset = 0;
    for (const t of tokensOf(root)) {
      expect(t.start).toBe(offset);
      offset += t.text.length;
    }
    expect(offset).toBe(SAMPLE.length);
  });
});

describe("structure", () => {
  const { root, diagnostics } = parse(SAMPLE);

  test("the sample has no diagnostics", () => {
    expect(diagnostics).toEqual([]);
  });

  test("scenes and statements", () => {
    expect(kinds(root)).toEqual(["SceneDecl", "SceneDecl"]);
    const intro = childNodes(root, "SceneDecl")[0] as CstNode;
    expect(kinds(blockOf(intro))).toEqual([
      "BgStmt", "AudioStmt", "ShowStmt", "SayStmt", "SayStmt", "NarrationStmt",
      "AssignStmt", "MenuStmt", "SayStmt", "JumpStmt",
    ]);
  });

  test("menu options, conditions, and once", () => {
    const hub = childNodes(root, "SceneDecl")[1] as CstNode;
    const menu = childNodes(blockOf(hub), "MenuStmt")[0] as CstNode;
    const options = childNodes(blockOf(menu), "MenuOption");
    expect(options).toHaveLength(3);
    const header = (o: CstNode) => textOf(o.children[0] as CstNode).trim();
    expect(header(options[0] as CstNode)).toBe('once "The festival.":');
    expect(header(options[1] as CstNode)).toBe('once "Her transfer rumor." if heard_rumor:');
    expect(kinds(blockOf(options[0] as CstNode))).toEqual(["CallStmt", "JumpStmt"]);
  });

  test("the gather comment attaches to the scene block, not the menu", () => {
    const intro = childNodes(root, "SceneDecl")[0] as CstNode;
    const comments = childNodes(blockOf(intro), "CommentLine").map((n) => textOf(n).trim());
    expect(comments).toContain("# options without a jump fall through to here (Ink-style gather)");
  });

  test("line tags are kept as LineTag tokens", () => {
    const tags = [...tokensOf(root)].filter((t) => t.kind === "LineTag").map((t) => t.text);
    expect(tags).toEqual(["#line:k3f9a1"]);
  });

  test("a line tag may be followed by a comment", () => {
    const { root: r, diagnostics: d } = parse('scene s:\n    "hi"   #line:k3f9a1  # note\n');
    expect(d).toEqual([]);
    const toks = [...tokensOf(r)].filter((t) => t.kind === "LineTag" || t.kind === "Comment").map((t) => [t.kind, t.text]);
    expect(toks).toEqual([["LineTag", "#line:k3f9a1"], ["Comment", "# note"]]);
  });

  test("operator precedence", () => {
    const { root: r, diagnostics: d } = parse("scene s:\n    $ x = 1 + 2 * 3 == 7 and not done\n");
    expect(d).toEqual([]);
    const exprs = [...walk(r)].filter((n) => n.kind === "BinaryExpr").map((n) => textOf(n).trim());
    expect(exprs[0]).toBe("1 + 2 * 3 == 7 and not done"); // and: loosest
    expect(exprs).toContain("1 + 2 * 3 == 7");
    expect(exprs).toContain("1 + 2 * 3");
    expect(exprs).toContain("2 * 3");
  });

  test("if / elif / else form one statement", () => {
    const src = "scene s:\n    if a:\n        jump x\n    elif b:\n        jump y\n\n    else:\n        jump z\n    end\n";
    const { root: r, diagnostics: d } = parse(src);
    expect(d).toEqual([]);
    const block = blockOf(childNodes(r, "SceneDecl")[0] as CstNode);
    expect(kinds(block)).toEqual(["IfStmt", "EndStmt"]);
    expect(childNodes(childNodes(block, "IfStmt")[0] as CstNode, "IfClause")).toHaveLength(3);
    expect(textOf(r)).toBe(src);
  });

  test("show with attributes, removal, position, and transition", () => {
    const { root: r, diagnostics: d } = parse("scene s:\n    show hana surprised -glasses casual at right with rule(wipe_l, 500)\n");
    expect(d).toEqual([]);
    const show = [...walk(r)].find((n) => n.kind === "ShowStmt") as CstNode;
    expect(childNodes(show, "Attr").map((a) => textOf(a).trim())).toEqual(["surprised", "-glasses", "casual"]);
    expect(childNodes(show, "AtClause")).toHaveLength(1);
    expect(textOf(childNodes(show, "WithClause")[0] as CstNode).trim()).toBe("with rule(wipe_l, 500)");
  });
});

describe("diagnostics and recovery", () => {
  test.each([
    ["HW0001", "scene s:\n\tjump x\n"],
    ["HW0002", 'scene s:\n    "no end\n'],
    ["HW0003", "scene s:\n    jump x @\n"],
    ["HW0004", "scene s:\n    jump x\n        jump y\n"],
    ["HW0005", "scene s:\nscene t:\n    end\n"],
    ["HW0006", "scene s:\n  jump x\n"],
    ["HW0010", "scene s:\n    = = =\n"],
    ["HW0011", "scene s\n    end\n"],
    ["HW0012", 'hana "outside a scene"\n'],
    ["HW0013", "scene s:\n    jump a b\n"],
    ["HW0014", "scene s:\n    else:\n        end\n"],
    ["HW0015", 'scene s:\n    menu:\n        jump x\n'],
  ])("%s", (code, src) => {
    expect(codes(src)).toContain(code);
    expect(textOf(parse(src).root)).toBe(src);
  });

  test("one diagnostic per broken line; later lines still parse", () => {
    const src = [
      "scene s:",
      "    hana surprised", // missing dialogue
      "    show", // missing character
      "    $ x 5", // missing operator
      '    hana "This line is fine."',
      "    jump next",
      "",
    ].join("\n");
    const { root, diagnostics } = parse(src);
    expect(diagnostics.map((d) => d.code)).toEqual(["HW0011", "HW0011", "HW0011"]);
    const block = blockOf(childNodes(root, "SceneDecl")[0] as CstNode);
    expect(kinds(block)).toEqual(["SayStmt", "ShowStmt", "AssignStmt", "SayStmt", "JumpStmt"]);
  });

  test("diagnostics carry a code, params, and an English message", () => {
    const [d] = parse("scene s:\n    menu \"Pick\"\n").diagnostics;
    expect(d?.code).toBe("HW0011");
    expect(d?.params).toEqual({ expected: '":" at the end of the line' });
    expect(d?.message).toBe('Expected ":" at the end of the line here.');
  });
});
