import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { ProjectFs, SandboxError } from "./fs.js";

const work = mkdtempSync(join(tmpdir(), "hw-fs-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("the project sandbox", () => {
  test("refuses names that leave the project", () => {
    const fs = new ProjectFs(join(work, "plain"));
    // B-4: "assets/.." passes an "assets/" prefix check but means the project itself.
    for (const bad of ["../x", "a/../../x", "C:/Windows/win.ini", "/etc/passwd", "a\0b", "assets/..", "assets/../.git/hooks/pre-commit", "assets/./x", "."]) {
      expect(() => fs.path(bad), bad).toThrow(SandboxError);
    }
    expect(fs.path("script/start.hws")).toBe(join(work, "plain", "script", "start.hws"));
  });

  // BREAK_IT.md finding B-3: a junction (made without admin rights) inside a shared project.
  test("B-3: a link inside the project that leads outside can't be listed, read, or written", () => {
    const outside = join(work, "private");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "secret.txt"), "the user's private file");
    const root = join(work, "game");
    mkdirSync(join(root, "assets", "bg"), { recursive: true });
    writeFileSync(join(root, "assets", "bg", "park.png"), "png");
    symlinkSync(outside, join(root, "assets", "leak"), "junction");
    const fs = new ProjectFs(root);

    expect(fs.list("assets")).toEqual(["assets/bg/park.png"]);
    expect(() => fs.read("assets/leak/secret.txt")).toThrow(SandboxError);
    expect(() => fs.write("assets/leak/planted.txt", "x")).toThrow(SandboxError);
    expect(() => fs.write("assets/leak/new-folder/planted.txt", "x")).toThrow(SandboxError);
    expect(fs.read("assets/bg/park.png")).toBe("png");
  });

  test("a link that stays inside the project still works", () => {
    const root = join(work, "inner");
    mkdirSync(join(root, "assets", "shared"), { recursive: true });
    writeFileSync(join(root, "assets", "shared", "a.png"), "a");
    symlinkSync(join(root, "assets", "shared"), join(root, "assets", "alias"), "junction");
    const fs = new ProjectFs(root);
    expect(fs.list("assets")).toEqual(["assets/alias/a.png", "assets/shared/a.png"]);
    expect(fs.read("assets/alias/a.png")).toBe("a");
  });
});
