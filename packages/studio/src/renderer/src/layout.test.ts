import { describe, expect, test } from "vitest";
import { MIN_CENTER, fitPanes } from "./layout";

const center = (w: number, f: { side: number; right: number }, showSide = true) => w - 49 - (showSide ? f.side : 0) - f.right;

describe("fitPanes", () => {
  test("a wide window keeps the saved sizes", () => {
    expect(fitPanes(1920, 250, 560, true)).toEqual({ side: 250, right: 560 });
  });

  test("a narrow window shrinks the preview first, then the Explorer, so the screenplay keeps its room", () => {
    // 1100 px used to leave the screenplay 230 px (one word per line).
    const f = fitPanes(1100, 250, 560, true);
    expect(f).toEqual({ side: 250, right: 321 });
    expect(center(1100, f)).toBe(MIN_CENTER);
    // Narrower still: the preview is at its minimum, so the Explorer gives the rest.
    const g = fitPanes(1024, 250, 560, true);
    expect(g).toEqual({ side: 175, right: 320 });
    expect(center(1024, g)).toBe(MIN_CENTER);
  });

  test("never below the panes' minimums, even on a tiny window", () => {
    expect(fitPanes(600, 250, 560, true)).toEqual({ side: 170, right: 320 });
  });

  test("without the Explorer (the UI Designer), only the preview gives way", () => {
    const f = fitPanes(1000, 250, 560, false);
    expect(f.side).toBe(250);
    expect(center(1000, f, false)).toBeGreaterThanOrEqual(MIN_CENTER);
  });
});
