import { describe, expect, it } from "vitest";
import { checkProject } from "./check.js";

const MANIFEST = { file: "himawari.json", text: JSON.stringify({ name: "T", id: "dev.example.t", sourceLanguage: "en", languages: ["en"], entry: "start", variables: {} }) };
const HANA = { file: "characters/hana.md", text: "---\nid: hana\nname: Hana\n---\n" };
const TINT = {
  file: "extensions/screen_tint.schema.json",
  text: JSON.stringify({
    name: "screen_tint",
    description: "Tints the screen.",
    blocking: false,
    params: [
      { name: "color", type: "word", enum: ["sepia", "night", "none"] },
      { name: "ms", type: "int", default: 500 },
    ],
  }),
};
const PHONE = {
  file: "extensions/phone.schema.json",
  text: JSON.stringify({ name: "phone", blocking: true, params: [{ name: "from", type: "character" }, { name: "message", type: "text" }] }),
};

const check = (script: string, extra: Partial<Parameters<typeof checkProject>[0]> = {}) =>
  checkProject({ manifest: MANIFEST, characters: [HANA], scripts: [{ file: "script/start.hws", text: script }], extensions: [TINT, PHONE], ...extra });
const codes = (c: ReturnType<typeof check>) => c.files.flatMap((f) => f.diagnostics.filter((d) => d.severity !== "info").map((d) => d.code));

const MACRO = `define statement enter(who: character, side: position = left, ms: int = 400):
    show who at side with dissolve(ms)

`;

describe("macros (rfcs/0008)", () => {
  it("expands with arguments substituted, positional and named, with defaults", () => {
    const c = check(`${MACRO}scene start:\n    enter(hana)\n    enter(hana, side=right, ms=200)\n    "Hi."   #line:aaaaaa\n    end\n`);
    expect(codes(c)).toEqual([]);
    const body = c.expanded.get("script/start.hws")!.scenes[0]!.body;
    expect(body.map((s) => s.kind)).toEqual(["Show", "Show", "Narration", "End"]);
    expect(body[0]).toMatchObject({ char: "hana", at: "left", transition: { type: "dissolve", args: [400] } });
    expect(body[1]).toMatchObject({ char: "hana", at: "right", transition: { type: "dissolve", args: [200] } });
    // The raw AST keeps the call (editors and the AST JSON show what was written).
    expect(c.parsed.get("script/start.hws")!.ast.scenes[0]!.body[0]!.kind).toBe("Invoke");
  });

  it("checks arguments like written names, at the argument", () => {
    const c = check(`${MACRO}scene start:\n    enter(hanna)\n    enter(hana, side=moon)\n    enter(hana, nope=1)\n    enter(hana, ms=fast)\n    end\n`);
    expect(codes(c)).toEqual(["HW0202", "HW0205", "HW0221", "HW0223"]);
    const hanna = c.files.find((f) => f.file === "script/start.hws")!.diagnostics.find((d) => d.code === "HW0202")!;
    expect(hanna.fixes?.[0]?.edits[0]?.text).toBe("hana");
  });

  it("refuses dialogue in a macro body, duplicates, unknown types, and recursion", () => {
    const c = check(
      `define statement a(x: thing):\n    "No."\n\ndefine statement b():\n    b()\n\ndefine statement b():\n    end\n\nscene start:\n    b()\n    end\n`,
    );
    expect(codes(c).sort()).toEqual(["HW0225", "HW0227", "HW0228", "HW0230"].sort());
  });

  it("reports problems of calls inside a macro body at the call (none are dropped)", () => {
    const c = check(
      `define statement inner(who: character):\n    show who\n\ndefine statement outer(who: character):\n    inner(who)\n    inner(hanna)\n    screen_tint(blue)\n    nothing()\n\nscene start:\n    outer(hana)\n    end\n`,
    );
    const all = c.files.find((f) => f.file === "script/start.hws")!.diagnostics.filter((d) => d.severity === "error");
    expect(all.map((d) => d.code).sort()).toEqual(["HW0202", "HW0220", "HW0223"]);
    for (const d of all) expect(d.note).toMatch(/macro/); // pointed at the call, with a note
    expect(all.every((d) => !d.fixes?.length)).toBe(true);
  });

  it("checks macro parameter defaults where they're written", () => {
    const c = check("define statement m(ms: int = fast, side: position = left):\n    wait(ms)\n\nscene start:\n    m()\n    end\n");
    expect(codes(c)).toEqual(["HW0223"]);
  });

  it("a jump in a macro counts for flow and reachability", () => {
    const c = check(`define statement go_on():\n    jump next\n\nscene start:\n    go_on()\n\nscene next:\n    end\n`);
    expect(codes(c)).toEqual([]);
  });
});

describe("extension statements (rfcs/0007)", () => {
  it("validates calls against the schema, with enum words and defaults", () => {
    const c = check(`scene start:\n    screen_tint(sepia)\n    screen_tint(color=blue)\n    phone(hana, "On my way!")   #line:bbbbbb\n    phone(ren, "Hi")   #line:cccccc\n    nothing()\n    end\n`);
    expect(codes(c)).toEqual(["HW0223", "HW0202", "HW0220"]);
    expect(c.expanded.get("script/start.hws")!.scenes[0]!.body[0]).toMatchObject({ kind: "Invoke", name: "screen_tint" });
  });

  it("refuses an invalid schema", () => {
    const bad = { file: "extensions/x.schema.json", text: JSON.stringify({ name: "y" }) };
    const c = check("scene start:\n    end\n", { extensions: [bad] });
    expect(codes(c)).toEqual(["HW0120"]);
  });

  it("checks each default against its parameter's type", () => {
    const ext = (param: object) => ({ file: "extensions/x.schema.json", text: JSON.stringify({ name: "x", params: [param] }) });
    const cases: [object, boolean][] = [
      [{ name: "ms", type: "int", default: 300 }, true],
      [{ name: "ms", type: "int", default: "fast" }, false],
      [{ name: "ms", type: "int", default: 1.5 }, false],
      [{ name: "on", type: "bool", default: "yes" }, false],
      [{ name: "c", type: "word", enum: ["a", "b"], default: "c" }, false],
      [{ name: "t", type: "text", default: "hi" }, false],
    ];
    for (const [param, ok] of cases) {
      expect(codes(check("scene start:\n    end\n", { extensions: [ext(param)] })), JSON.stringify(param)).toEqual(ok ? [] : ["HW0120"]);
    }
  });
});

describe("textbox and themes (rfcs/0007)", () => {
  it("parses textbox modes", () => {
    const c = check("scene start:\n    textbox nvl\n    textbox clear\n    textbox adv\n    textbox sideways\n    end\n");
    expect(codes(c)).toEqual(["HW0011"]);
  });

  it("compiles a theme into typed entries and flags unknown settings", () => {
    const theme = {
      file: "theme/theme.json",
      text: JSON.stringify({ colors: { accent: "#ffaa33", textbox: "#123456" }, textbox: { opacity: 80, slice: [8, 8, 8, 8], image: "ui/box" }, strings: { ja: { start: "はじめる" } }, colours: {} }),
    };
    const c = check("scene start:\n    end\n", { theme });
    expect(c.theme?.get("color.accent")).toEqual({ type: "color", value: 0xffaa33 });
    expect(c.theme?.get("textbox.slice.top")).toEqual({ type: "int", value: 8 });
    expect(c.theme?.get("string.ja.start")).toEqual({ type: "str", value: "はじめる" });
    expect(codes(c)).toEqual(["HW0131"]);
  });

  it("keeps the placeholders of UI strings that are formats", () => {
    const theme = (strings: object) => ({ file: "theme/theme.json", text: JSON.stringify({ strings: { en: strings } }) });
    const empty = "scene start:\n    end\n";
    expect(codes(check(empty, { theme: theme({ slot: "File %d", quit: "100%% done" }) }))).toEqual([]);
    expect(codes(check(empty, { theme: theme({ slot: "File" }) }))).toEqual(["HW0130"]);
    expect(codes(check(empty, { theme: theme({ quit: "Quit %s" }) }))).toEqual(["HW0130"]);
  });
});

describe("invoke lines in tools (formatter, line IDs, translation)", () => {
  it("formats arguments, gives a text call a line ID, and collects it for translation", async () => {
    const { format } = await import("../format.js");
    const { collectLines } = await import("../l10n/table.js");
    const { parseAst } = await import("../syntax/ast.js");
    const src = "scene start:\n    screen_tint( night ,ms = -1 )\n    phone(hana,\"On my way!\")\n    end\n";
    const out = format(src);
    expect(out.refused).toBeNull();
    const lines = out.text.split("\n");
    expect(lines[1]).toBe("    screen_tint(night, ms=-1)");
    expect(lines[2]).toMatch(/^ {4}phone\(hana, "On my way!"\) {3}#line:[a-z0-9]{6}$/);
    expect(out.added).toHaveLength(1);
    const found = collectLines(new Map([["script/a.hws", parseAst(out.text, "script/a.hws")]]));
    expect(found).toMatchObject([{ kind: "call", text: "On my way!" }]);
  });
});
