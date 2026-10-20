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

describe("never losing work", () => {
  const copy = async () => {
    const { cpSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "hw-safety-"));
    cpSync(DEMO, join(dir, "game"), { recursive: true, filter: (s) => !/[\/]build$/.test(s) });
    return { root: join(dir, "game"), base: join(dir, "data"), dir };
  };

  test("a save keeps the earlier version; a change made outside meanwhile isn't overwritten", async () => {
    const { writeFileSync, rmSync } = await import("node:fs");
    const { root, base, dir } = await copy();
    try {
      const p = new Project(root, { changed: () => {}, built: () => {} }, { historyBase: base });
      p.snapshot(); // Studio has now seen every file
      const file = "script/start.hws";
      const before = p.fs.read(file);
      expect(p.write(file, `${before}# mine\n`)).toEqual({ ok: true });
      expect(p.history!.list(file)).toHaveLength(1);
      expect(p.history!.read(file, p.history!.list(file)[0]!.at)).toBe(before);
      // Another program changes the file; Studio's next save is refused, with the disk's text.
      writeFileSync(p.fs.path(file), "scene start:\n    end\n");
      const r = p.write(file, `${before}# mine again\n`);
      expect(r).toEqual({ ok: false, conflict: "scene start:\n    end\n" });
      expect(p.fs.read(file)).toBe("scene start:\n    end\n");
      // "Keep mine": forced, and the outside version is kept in the history.
      expect(p.write(file, `${before}# mine again\n`, true)).toEqual({ ok: true });
      expect(p.history!.list(file)[0]!.reason).toBe("outside");
      p.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a delete goes to the Recycle Bin and stays restorable from the history", async () => {
    const { rmSync, renameSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { root, base, dir } = await copy();
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      const trashed: string[] = [];
      const p = new Project(root, { changed: () => {}, built: () => {} }, { historyBase: base, trash: async (full) => (trashed.push(full), renameSync(full, join(bin, "x"))) });
      const text = p.fs.read("script/festival.hws");
      await p.remove("script/festival.hws");
      expect(trashed).toHaveLength(1);
      expect(p.fs.exists("script/festival.hws")).toBe(false);
      const gone = p.history!.deleted((f) => p.fs.exists(f));
      expect(gone.map((g) => g.file)).toEqual(["script/festival.hws"]);
      expect(p.history!.read("script/festival.hws", gone[0]!.at)).toBe(text);
      p.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
