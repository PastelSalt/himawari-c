import { parseAst } from "@himawari/core";
import { describe, expect, test } from "vitest";
import { addScene, linkScenes } from "./graph-edit";

const ok = (text: string) => expect(parseAst(text, "t.hws").diagnostics.filter((d) => d.severity === "error")).toEqual([]);
const FILE = `scene a:
    "Hello."   #line:aaaaaa
    jump b

scene b:
    "B."   #line:bbbbbb
    end

scene c:
    "C."   #line:cccccc
    menu "Where?":   #line:dddddd
        "Left":   #line:eeeeee
            jump a

scene d:
    "No way on."   #line:ffffff
`;

describe("editing on the story graph", () => {
  test("jump: the final jump or end now goes there", () => {
    const t = linkScenes(FILE, "a", "c", { kind: "jump" })!;
    expect(t).toContain('    "Hello."   #line:aaaaaa\n    jump c\n');
    ok(t);
    expect(linkScenes(FILE, "b", "a", { kind: "jump" })).toContain('    "B."   #line:bbbbbb\n    jump a\n');
  });

  test("jump: a scene that just stops gets one", () => {
    const t = linkScenes(FILE, "d", "a", { kind: "jump" })!;
    expect(t.endsWith('    "No way on."   #line:ffffff\n    jump a\n')).toBe(true);
    ok(t);
  });

  test("choice: joins the menu that ends the scene", () => {
    const t = linkScenes(FILE, "c", "b", { kind: "choice", label: 'Say "right"', otherLabel: "x" })!;
    expect(t).toContain('            jump a\n        "Say \\"right\\"":\n            jump b\n');
    ok(t);
  });

  test("choice: a final jump becomes a menu that keeps the old way on", () => {
    const t = linkScenes(FILE, "a", "c", { kind: "choice", label: "Go to C", otherLabel: "Carry on" })!;
    expect(t).toContain('    "Hello."   #line:aaaaaa\n    menu:\n        "Go to C":\n            jump c\n        "Carry on":\n            jump b\n');
    ok(t);
  });

  test("choice: a scene that just stops gets a one-option menu", () => {
    const t = linkScenes(FILE, "d", "b", { kind: "choice", label: "Back", otherLabel: "x" })!;
    expect(t.endsWith('    menu:\n        "Back":\n            jump b\n')).toBe(true);
    ok(t);
  });

  test("a scene from another file: nothing to do", () => {
    expect(linkScenes(FILE, "zzz", "a", { kind: "jump" })).toBeNull();
  });

  test("a new scene goes at the end and parses", () => {
    const t = addScene(FILE, "e", "…");
    expect(t.endsWith('\nscene e:\n    "…"\n    end\n')).toBe(true);
    ok(t);
  });
});
