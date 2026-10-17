import { describe, expect, test } from "vitest";
import { type EditOp, applyEdits } from "./edit.js";
import { type CstNode, childTokens, walk } from "./syntax/cst.js";
import { parse } from "./syntax/parser.js";

/** Deterministic IDs for tests: 000001, 000002, … */
const counter = () => {
  let n = 0;
  return () => ++n;
};

const BASE = `# Chapter 1
scene s:
    bg room   # keep this comment
    hana "One."   #line:aaaaaa
    "Two."   #line:bbbbbb
    menu "Pick":
        "Left":   #line:cccccc
            hana "L."   #line:dddddd
            jump s
        "Right":   #line:eeeeee
            jump s
    hana   smile "Three."   #line:ffffff  # odd spacing kept
    end
`;

const edit = (...ops: EditOp[]) => applyEdits(BASE, ops, { random: counter() });

/** BASE with one line replaced by several lines (or removed when `by` is empty). */
const replaceLine = (find: string, by: string[]) => {
  const lines = BASE.split("\n");
  const i = lines.indexOf(find);
  if (i < 0) throw new Error(`no line ${find}`);
  lines.splice(i, 1, ...by);
  return lines.join("\n");
};

describe("edit operations", () => {
  test("insert_after: re-indented, new IDs, nothing else touched", () => {
    const r = edit({ op: "insert_after", lineId: "aaaaaa", hws: 'hana "New."\nme "Me too."' });
    expect(r.ok).toBe(true);
    expect(r.addedIds).toEqual(["000001", "000002"]);
    expect(r.text).toBe(
      replaceLine('    hana "One."   #line:aaaaaa', [
        '    hana "One."   #line:aaaaaa',
        '    hana "New."   #line:000001',
        '    me "Me too."   #line:000002',
      ]),
    );
  });

  test("insert_before", () => {
    const r = edit({ op: "insert_before", lineId: "bbbbbb", hws: "    wait(300)" });
    expect(r.text).toBe(replaceLine('    "Two."   #line:bbbbbb', ["    wait(300)", '    "Two."   #line:bbbbbb']));
  });

  test("insert_after a menu option goes after its whole block, at option level", () => {
    const r = edit({ op: "insert_after", lineId: "cccccc", hws: '"Middle":\n    jump s' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(
      replaceLine("            jump s", ["            jump s", '        "Middle":   #line:000001', "            jump s"]),
    );
  });

  test("append_to_scene", () => {
    const r = applyEdits('scene a:\n    "x"   #line:aaaaaa\n    jump a\n\nscene b:\n    end\n', [
      { op: "append_to_scene", scene: "a", hws: '"after the jump"' },
    ], { random: counter() });
    expect(r.text).toBe('scene a:\n    "x"   #line:aaaaaa\n    jump a\n    "after the jump"   #line:000001\n\nscene b:\n    end\n');
  });

  test("replace_text keeps speaker, tag, and comment", () => {
    const r = edit({ op: "replace_text", lineId: "ffffff", text: "Changed {b}text{/b}." });
    expect(r.text).toBe(
      replaceLine('    hana   smile "Three."   #line:ffffff  # odd spacing kept', [
        '    hana   smile "Changed {b}text{/b}."   #line:ffffff  # odd spacing kept',
      ]),
    );
  });

  test("set_attrs adds and removes, keeping other attributes", () => {
    const r = edit({ op: "set_attrs", lineId: "ffffff", add: ["surprised"], remove: ["glasses"] });
    expect(r.text).toBe(
      replaceLine('    hana   smile "Three."   #line:ffffff  # odd spacing kept', [
        '    hana smile surprised -glasses "Three."   #line:ffffff  # odd spacing kept',
      ]),
    );
    const cleared = edit({ op: "set_attrs", lineId: "ffffff", remove: [] , add: [] });
    expect(cleared.text).toContain('    hana smile "Three."');
  });

  test("delete a line, and an option with its block (nested IDs are fine)", () => {
    expect(edit({ op: "delete", lineIds: ["bbbbbb"] }).text).toBe(replaceLine('    "Two."   #line:bbbbbb', []));
    const r = edit({ op: "delete", lineIds: ["cccccc", "dddddd"] });
    expect(r.ok).toBe(true);
    expect(r.text).not.toContain("Left");
    expect(r.text).not.toContain('"L."');
    expect(r.text).toContain('"Right"');
  });

  test("move keeps IDs and re-indents", () => {
    const r = edit({ op: "move", lineIds: ["dddddd"], afterLineId: "ffffff" });
    expect(r.ok).toBe(true);
    expect(r.addedIds).toEqual([]);
    expect(r.text).toContain('    hana   smile "Three."   #line:ffffff  # odd spacing kept\n    hana "L."   #line:dddddd\n    end\n');
    expect(r.text).not.toContain('            hana "L."');
  });

  test("several ops apply in order as one batch", () => {
    const r = edit(
      { op: "replace_text", lineId: "aaaaaa", text: "Hello." },
      { op: "insert_after", lineId: "aaaaaa", hws: '"Narration."' },
      { op: "delete", lineIds: ["bbbbbb"] },
    );
    expect(r.ok).toBe(true);
    expect(r.text).toContain('    hana "Hello."   #line:aaaaaa\n    "Narration."   #line:000001\n    menu "Pick":');
  });
});

describe("rejections leave the text unchanged", () => {
  test.each<[string, EditOp, string]>([
    ["unknown ID", { op: "replace_text", lineId: "zzzzzz", text: "x" }, "no line with ID zzzzzz"],
    ["attrs on narration", { op: "set_attrs", lineId: "bbbbbb", add: ["smile"] }, "isn't a dialogue line"],
    ["invalid attr name", { op: "set_attrs", lineId: "aaaaaa", add: ["Bad Name"] }, "isn't a valid attribute name"],
    ["move into own block", { op: "move", lineIds: ["cccccc"], afterLineId: "dddddd" }, "into its own block"],
    ["broken snippet", { op: "insert_after", lineId: "aaaaaa", hws: "hana" }, "syntax errors"],
    ["emptying a menu", { op: "delete", lineIds: ["cccccc", "eeeeee"] }, "syntax errors"],
    ["unescaped quote in text", { op: "replace_text", lineId: "aaaaaa", text: 'say "hi"' }, "syntax errors"],
    ["unknown scene", { op: "append_to_scene", scene: "nope", hws: "end" }, 'no scene called "nope"'],
  ])("%s", (_name, op, error) => {
    const r = edit(op);
    expect(r.ok).toBe(false);
    expect(r.text).toBe(BASE);
    expect(r.error).toContain(error);
  });

  test("a failing op rejects the whole batch", () => {
    const r = edit({ op: "replace_text", lineId: "aaaaaa", text: "fine" }, { op: "delete", lineIds: ["nope00"] });
    expect(r.ok).toBe(false);
    expect(r.text).toBe(BASE);
  });
});

describe("random edit batches (property test)", () => {
  const SNIPPETS = ['hana "Added."', '"A narration."', "wait(100)", 'me "Hmm."\n"And more."', "hana", '"unterminated'];
  const OPTION_SNIPPETS = ['"New option":\n    jump s', 'once "Another" if x:\n    end'];

  test("invariants hold over 400 random batches", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const ids = ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee", "ffffff", "nope00"];
    const pick = <T>(xs: readonly T[]) => xs[rand(xs.length)] as T;

    let accepted = 0;
    for (let run = 0; run < 400; run++) {
      const ops: EditOp[] = [];
      for (let k = 0, n = 1 + rand(3); k < n; k++) {
        const id = pick(ids);
        const isOption = id === "cccccc" || id === "eeeeee";
        switch (rand(6)) {
          case 0: ops.push({ op: "insert_after", lineId: id, hws: isOption ? pick(OPTION_SNIPPETS) : pick(SNIPPETS) }); break;
          case 1: ops.push({ op: "insert_before", lineId: id, hws: isOption ? pick(OPTION_SNIPPETS) : pick(SNIPPETS) }); break;
          case 2: ops.push({ op: "replace_text", lineId: id, text: pick(["New text.", "With {i}tags{/i}.", "Bad \"quote"]) }); break;
          case 3: ops.push({ op: "set_attrs", lineId: id, add: ["happy"], remove: ["sad"] }); break;
          case 4: ops.push({ op: "delete", lineIds: [id] }); break;
          default: ops.push({ op: "move", lineIds: [id], afterLineId: pick(ids) }); break;
        }
      }
      const r = applyEdits(BASE, ops, { random: counter() });
      const parsed = parse(r.text);
      if (!r.ok) {
        expect(r.text).toBe(BASE);
        continue;
      }
      accepted++;
      // Accepted: no syntax errors, unique IDs, every taggable line tagged.
      expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const tags = [...r.text.matchAll(/#line:([0-9a-z]{6})/g)].map((m) => m[1]);
      expect(new Set(tags).size).toBe(tags.length);
      for (const n of walk(parsed.root)) {
        if (["SayStmt", "NarrationStmt", "OptionHeader"].includes(n.kind)) {
          expect(childTokens(n as CstNode, "LineTag")).toHaveLength(1);
        }
      }
    }
    // Both paths must be well exercised.
    expect(accepted).toBeGreaterThan(80);
    expect(accepted).toBeLessThan(380);
  });
});
