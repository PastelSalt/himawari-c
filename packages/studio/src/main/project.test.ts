/** The project as Studio's window sees it (a snapshot), checked with the same model the editor builds. */
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildModel } from "../renderer/src/model.js";
import { Project, isProjectText } from "./project.js";

const DEMO = fileURLToPath(new URL("../../../../examples/sunflower-demo/", import.meta.url));

describe("project snapshot", () => {
  test("carries everything the checker reads: extensions and the theme too", () => {
    const project = new Project(DEMO, { changed: () => {}, built: () => {} });
    const snap = project.snapshot();
    const files = Object.fromEntries(snap.files.map((f) => [f.file, f.text]));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["extensions/screen_tint.schema.json", "theme/theme.json"]));
    for (const f of Object.keys(files)) expect(isProjectText(f), f).toBe(true);
    const model = buildModel(files, snap.assets);
    expect(model.errors).toBe(0);
    expect(model.check.theme?.get("color.accent")).toEqual({ type: "color", value: 0xf5ba0a });
  });
});
