import { describe, expect, test } from "vitest";
import { LINE_ID_ALPHABET, extractLineId, generateLineId, isLineId } from "./ids.js";

describe("line IDs", () => {
  test("alphabet is 32 unique Crockford characters", () => {
    expect(new Set(LINE_ID_ALPHABET).size).toBe(32);
    for (const c of "ilou") expect(LINE_ID_ALPHABET).not.toContain(c);
  });

  test("plan examples are valid IDs", () => {
    expect(isLineId("k3f9a1")).toBe(true);
    expect(isLineId("q7c1d0")).toBe(true);
  });

  test("rejects wrong length, case, and excluded letters", () => {
    for (const bad of ["k3f9a", "k3f9a12", "K3F9A1", "k3f9al", "k3f9ao", "", "k3f-a1"]) {
      expect(isLineId(bad)).toBe(false);
    }
  });

  test("extracts trailing #line tag", () => {
    expect(extractLineId(`    hana "Good morning!"   #line:k3f9a1`)).toBe("k3f9a1");
    expect(extractLineId(`    hana "Good morning!"`)).toBeUndefined();
    expect(extractLineId(`    "#line:k3f9a1 is inside the text" x`)).toBeUndefined();
  });

  test("encodes deterministically from the random source", () => {
    expect(generateLineId(new Set(), () => 0)).toBe("000000");
    expect(generateLineId(new Set(), () => 2 ** 30 - 1)).toBe("zzzzzz");
  });

  test("skips IDs that are already taken", () => {
    const values = [0, 0, 1];
    const id = generateLineId(new Set(["000000"]), () => values.shift() ?? 2);
    expect(id).toBe("000001");
  });

  test("generated IDs are valid", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateLineId(taken);
      expect(isLineId(id)).toBe(true);
      taken.add(id);
    }
  });
});
