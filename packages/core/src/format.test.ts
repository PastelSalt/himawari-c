import { describe, expect, test } from "vitest";
import { format } from "./format.js";
import { isLineId } from "./ids.js";
import { parseAst } from "./syntax/ast.js";

/** Deterministic IDs for tests: 000001, 000002, … */
const counter = () => {
  let n = 0;
  return () => ++n;
};

const MESSY = `# script/ch1.hws
scene   ch1_intro :
  bg classroom_day   with dissolve( 800 )
  show  hana smile -glasses at left with fade(300)



  hana "Spacing   inside   strings stays."
  $ x = - 1 + ( 2 * 3 )
  menu "Pick" :
      "One" :
          jump a
      once  "Two" if x >= 2 and not ( y ) :
          wait( 500 )
          shake(200)
  # trailing comment block
scene ch1_hub:
	"Tabs become spaces."   # a comment
`;

const EXPECTED = `# script/ch1.hws
scene ch1_intro:
    bg classroom_day with dissolve(800)
    show hana smile -glasses at left with fade(300)

    hana "Spacing   inside   strings stays."   #line:000001
    $ x = -1 + (2 * 3)
    menu "Pick":
        "One":   #line:000002
            jump a
        once "Two" if x >= 2 and not (y):   #line:000003
            wait(500)
            shake(200)
# trailing comment block
scene ch1_hub:
    "Tabs become spaces."   #line:000004  # a comment
`;

/** AST with spans and line IDs removed, for semantic comparison. */
const shape = (src: string) =>
  JSON.stringify(parseAst(src).ast.scenes, (k, v: unknown) => (k === "span" || k === "lineId" ? undefined : v));

describe("format", () => {
  const r = format(MESSY, { random: counter() });

  test("canonical output", () => {
    expect(r.refused).toBeNull();
    expect(r.text).toBe(EXPECTED);
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(["000001", "000002", "000003", "000004"]);
  });

  test("idempotent", () => {
    const again = format(r.text, { random: counter() });
    expect(again.text).toBe(r.text);
    expect(again.changed).toBe(false);
    expect(again.added).toEqual([]);
  });

  test("preserves meaning", () => {
    expect(shape(r.text)).toBe(shape(MESSY.replace("\t", "    ")));
    expect(parseAst(r.text).diagnostics).toEqual([]);
  });

  test("keeps existing IDs and reassigns duplicates on the later copy", () => {
    const src = 'scene s:\n    "a"   #line:k3f9a1\n    "b"   #line:k3f9a1\n    "c"\n';
    const out = format(src, { random: counter() });
    expect(out.text).toBe('scene s:\n    "a"   #line:k3f9a1\n    "b"   #line:000001\n    "c"   #line:000002\n');
    expect(out.reassigned).toEqual([["k3f9a1", "000001"]]);
  });

  test("new IDs avoid IDs used elsewhere in the project", () => {
    const out = format('scene s:\n    "a"\n', { random: counter(), takenIds: new Set(["000001", "000002"]) });
    expect(out.added).toEqual(["000003"]);
  });

  test("real IDs are valid line IDs", () => {
    const out = format('scene s:\n    "a"\n    hana "b"\n');
    expect(out.added).toHaveLength(2);
    for (const id of out.added) expect(isLineId(id)).toBe(true);
  });

  test("lineIds: false only formats", () => {
    expect(format('scene  s:\n    "a"\n', { lineIds: false }).text).toBe('scene s:\n    "a"\n');
  });

  test("CRLF and BOM become LF without BOM; final newline added", () => {
    expect(format('\uFEFFscene s:\r\n    end', { lineIds: false }).text).toBe("scene s:\n    end\n");
  });

  test("refuses files with syntax errors and leaves them untouched", () => {
    const broken = 'scene s:\n    hana surprised\n    "ok"\n';
    const out = format(broken);
    expect(out.text).toBe(broken);
    expect(out.changed).toBe(false);
    expect(out.refused?.map((d) => d.code)).toEqual(["HW0011"]);
  });

  test("empty file stays empty", () => {
    expect(format("").text).toBe("");
  });
});
