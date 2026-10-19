import { describe, expect, test } from "vitest";
import { TOOLS } from "./index.js";
import { RECIPES, expandCommand } from "./recipes.js";

describe("recipes", () => {
  test("names and commands are unique, and every tool a recipe names exists", () => {
    expect(new Set(RECIPES.map((r) => r.name)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.command)).size).toBe(RECIPES.length);
    const tools = new Set(TOOLS.map((t) => t.name));
    const known = new Set([...tools, "dry_run", "set_attrs", "replace_text"]);
    for (const r of RECIPES) {
      const text = r.prompt(Object.fromEntries(r.args.map((a) => [a.name, "x"])));
      for (const word of text.match(/\b[a-z]+_[a-z_]+\b/g) ?? []) expect(known, `${r.name} mentions ${word}`).toContain(word);
    }
  });

  test("slash commands: arguments in order, the last one takes the rest", () => {
    const t = expandCommand("/translate ch1_intro ja");
    expect(t && "prompt" in t && t.prompt).toContain("Translate scene ch1_intro into ja.");
    const w = expandCommand("/write Hana finds a letter under the desk.");
    expect(w && "prompt" in w && w.prompt).toContain("Premise: Hana finds a letter under the desk.");
    const b = expandCommand("  /balance  ");
    expect(b && "prompt" in b && b.recipe.name).toBe("route_balance");
  });

  test("a missing argument is named; plain text and unknown commands aren't commands", () => {
    expect(expandCommand("/translate ch1_intro")).toMatchObject({ missing: ["lang"] });
    expect(expandCommand("/continuity")).toMatchObject({ missing: ["scene"] });
    expect(expandCommand("translate ch1")).toBeNull();
    expect(expandCommand("/nope")).toBeNull();
  });
});
