import { parseText } from "@himawari/core";
import { describe, expect, test } from "vitest";
import { displayToRaw } from "./screenplay-edit";
import { hasMarkup, insertAt, wrapSelection } from "./text-style";

const valid = (display: string) => expect(parseText(`"${displayToRaw(display)}"`, 0).diagnostics).toEqual([]);

describe("styling text without typing tags", () => {
  test("wraps the selection and keeps it selected", () => {
    const s = "You're late again.";
    const r = wrapSelection(s, s.indexOf("again"), s.indexOf("again") + 5, "b");
    expect(r.text).toBe("You're late {b}again{/b}.");
    expect(r.text.slice(r.selStart, r.selEnd)).toBe("again");
    valid(r.text);
  });

  test("tags with a value: color, size, furigana", () => {
    expect(wrapSelection("花火", 0, 2, "rb", "はなび").text).toBe("{rb=はなび}花火{/rb}");
    expect(wrapSelection("red", 0, 3, "color", "#e86a5a").text).toBe("{color=#e86a5a}red{/color}");
    valid(wrapSelection("big", 0, 3, "size", "48").text);
  });

  test("nothing selected: an empty pair with the cursor inside; pauses and values at the cursor", () => {
    const r = wrapSelection("Hi", 2, 2, "i");
    expect(r.text).toBe("Hi{i}{/i}");
    expect(r.selStart).toBe(5);
    expect(insertAt("Wait. Go.", 5, 5, "{w=500}").text).toBe("Wait.{w=500} Go.");
    expect(insertAt("Hi, !", 4, 4, "[name]").text).toBe("Hi, [name]!");
    valid(insertAt("Hi, !", 4, 4, "[name]").text);
  });

  test("a preview only when there's markup", () => {
    expect(hasMarkup("Plain words.")).toBe(false);
    expect(hasMarkup("{b}Bold{/b}")).toBe(true);
    expect(hasMarkup("Hi [name]")).toBe(true);
  });
});
