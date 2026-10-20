import { describe, expect, test } from "vitest";
import { aiHelpAllowed, setAiHelp } from "./ai-help.js";

describe("the project's AI switch", () => {
  test("allowed unless himawari.json says aiHelp: false", () => {
    expect(aiHelpAllowed(undefined)).toBe(true);
    expect(aiHelpAllowed("{ not json")).toBe(true);
    expect(aiHelpAllowed('{"name":"T"}')).toBe(true);
    expect(aiHelpAllowed('{"aiHelp":true}')).toBe(true);
    expect(aiHelpAllowed('{"aiHelp":false}')).toBe(false);
  });

  test("setting it keeps the other fields and their order; allowing removes the field", () => {
    const off = setAiHelp('{"name":"T","id":"a.b"}', false);
    expect(JSON.parse(off)).toEqual({ name: "T", id: "a.b", aiHelp: false });
    expect(Object.keys(JSON.parse(off))).toEqual(["name", "id", "aiHelp"]);
    expect(JSON.parse(setAiHelp(off, true))).toEqual({ name: "T", id: "a.b" });
  });
});
