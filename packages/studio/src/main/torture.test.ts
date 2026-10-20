/**
 * Never-lose-work torture tests (FINALIZATION.md §11.7), the ones a test can
 * stage on one PC: Japanese and very long project paths, a clock that moved
 * backwards, a file another program holds open (antivirus, OneDrive), and a
 * save cut off half way. The rest (full disk, online-only OneDrive files, a
 * clean Windows install) are manual, in the release checklist.
 */
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { buildModel } from "../renderer/src/model.js";
import { Project } from "./project.js";

const DEMO = fileURLToPath(new URL("../../../../examples/sunflower-demo/", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "hw-torture-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A copy of the demo at `root`, opened the way Studio opens it. */
function open(root: string): Project {
  cpSync(DEMO, root, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
  const p = new Project(root, { changed: () => {}, built: () => {} }, { historyBase: join(work, "history") });
  const snap = p.snapshot();
  expect(buildModel(Object.fromEntries(snap.files.map((f) => [f.file, f.text])), snap.assets, snap.imageSizes).errors).toBe(0);
  return p;
}

/** Saves, keeps history, and builds: the everyday loop. */
function everyday(p: Project): void {
  const file = "script/start.hws";
  const before = p.fs.read(file);
  expect(p.write(file, `${before}# edited\n`)).toEqual({ ok: true });
  expect(p.history!.read(file, p.history!.list(file)[0]!.at)).toBe(before);
  expect(p.build().ok).toBe(true);
}

describe("never lose work (FINALIZATION.md §11.7)", () => {
  test("a Japanese user name and project path", () => {
    const p = open(join(work, "ユーザー 太郎", "ドキュメント", "はじめての ゲーム"));
    everyday(p);
    p.close();
  });

  test("a project path over 300 characters", () => {
    let root = join(work, "long");
    while (root.length < 300) root = join(root, "a folder with a long name");
    const p = open(root);
    expect(p.root.length).toBeGreaterThan(300);
    everyday(p);
    p.close();
  });

  test("the clock moved backwards: builds still rebuild", () => {
    const p = open(join(work, "clock"));
    expect(p.build().ok).toBe(true);
    // The last build looks like it's from next year.
    const out = p.fs.path("build/game.hwb");
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    utimesSync(out, future, future);
    const before = readFileSync(out);
    const file = "script/start.hws";
    p.write(file, p.fs.read(file).replace(/"([^"]+)"/, '"Rebuilt after the clock change."'));
    expect(p.build().ok).toBe(true);
    expect(readFileSync(out).equals(before)).toBe(false);
    p.close();
  });

  test("a save waits out a program holding the file (antivirus, OneDrive)", async () => {
    const p = open(join(work, "locked"));
    const file = "script/start.hws";
    const full = p.fs.path(file);
    // PowerShell opens the file with no sharing for 0.8 s, like a scanner would.
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `$f = [System.IO.File]::Open('${full.replace(/'/g, "''")}', 'Open', 'ReadWrite', 'None'); 'locked'; Start-Sleep -Milliseconds 800; $f.Close()`,
    ]);
    await new Promise<void>((resolve, reject) => {
      ps.stdout.on("data", (d: Buffer) => d.toString().includes("locked") && resolve());
      ps.on("error", reject);
    });
    const t0 = Date.now();
    expect(p.write(file, "scene start:\n    \"Saved after the lock.\"\n    end\n")).toEqual({ ok: true });
    expect(Date.now() - t0).toBeGreaterThan(200); // it really waited
    expect(p.fs.read(file)).toContain("Saved after the lock.");
    await new Promise((resolve) => ps.on("close", resolve));
    p.close();
  }, 20000);

  test("a save cut off half way leaves the old file whole, and the leftover is ignored", () => {
    const p = open(join(work, "crash"));
    const file = "script/start.hws";
    const before = p.fs.read(file);
    // What a crash between writing the temporary file and renaming it leaves behind.
    mkdirSync(join(p.root, "script"), { recursive: true });
    writeFileSync(`${p.fs.path(file)}.tmp-4242`, before.slice(0, 20));
    expect(p.fs.read(file)).toBe(before);
    const reopened = new Project(p.root, { changed: () => {}, built: () => {} });
    expect(reopened.snapshot().files.some((f) => f.file.includes(".tmp-"))).toBe(false);
    expect(reopened.build().ok).toBe(true);
    reopened.close();
    p.close();
  });
});
