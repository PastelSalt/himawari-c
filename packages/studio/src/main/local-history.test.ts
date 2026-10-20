import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { LocalHistory } from "./local-history.js";

let base = "";
let clock = 1_000_000;
const history = () => new LocalHistory(base, "C:/Projects/Game", () => clock);

afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("local history", () => {
  test("keeps the version before a burst of typing, then a new one after a pause", () => {
    base = mkdtempSync(join(tmpdir(), "hw-history-"));
    const h = history();
    h.save("script/ch1.hws", "v1", "edit");
    clock += 2000;
    h.save("script/ch1.hws", "v1 typing", "edit"); // merged into the burst
    clock += 15_000;
    h.save("script/ch1.hws", "v2", "edit");
    const list = h.list("script/ch1.hws");
    expect(list.map((v) => v.reason)).toEqual(["edit", "edit"]);
    expect(h.read("script/ch1.hws", list[1]!.at)).toBe("v1");
    expect(h.read("script/ch1.hws", list[0]!.at)).toBe("v2");
  });

  test("keeps at most 50 versions per file", () => {
    base = mkdtempSync(join(tmpdir(), "hw-history-"));
    const h = history();
    for (let i = 0; i < 60; i++) {
      clock += 20_000;
      h.save("a.hws", `v${i}`, "edit");
    }
    const list = h.list("a.hws");
    expect(list).toHaveLength(50);
    expect(h.read("a.hws", list[0]!.at)).toBe("v59");
  });

  test("deleted files can be found and read back", () => {
    base = mkdtempSync(join(tmpdir(), "hw-history-"));
    const h = history();
    h.save("script/old route.hws", "scene a:\n    end\n", "delete");
    const gone = h.deleted(() => false);
    expect(gone.map((d) => d.file)).toEqual(["script/old route.hws"]);
    expect(h.read(gone[0]!.file, gone[0]!.at)).toBe("scene a:\n    end\n");
    expect(h.deleted(() => true)).toEqual([]);
  });

  test("restore points keep every file at once, newest first", () => {
    base = mkdtempSync(join(tmpdir(), "hw-history-"));
    const h = history();
    const id = h.point("Before renaming hana to haruka", { "a.hws": "A", "b.hws": "B" });
    clock += 1000;
    h.point("Before importing translations", { "c.json": "{}" });
    expect(h.points().map((p) => [p.label, p.files])).toEqual([
      ["Before importing translations", 1],
      ["Before renaming hana to haruka", 2],
    ]);
    expect(h.readPoint(id)).toEqual({ "a.hws": "A", "b.hws": "B" });
    expect(h.readPoint("../../etc")).toBeNull();
  });

  test("each project has its own history", () => {
    base = mkdtempSync(join(tmpdir(), "hw-history-"));
    expect(new LocalHistory(base, "C:/A").dir).not.toBe(new LocalHistory(base, "C:/B").dir);
  });
});
