/**
 * Never-lose-work torture tests (FINALIZATION.md §11.7), the ones a test can
 * stage on one PC: Japanese and very long project paths, a clock that moved
 * backwards, a file another program holds open (antivirus, OneDrive), and a
 * save cut off half way. The rest (full disk, online-only OneDrive files, a
 * clean Windows install) are manual, in the release checklist.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPack } from "@himawari/core";
import { findRuntime } from "@himawari/tools";
import { afterAll, describe, expect, test } from "vitest";
import { buildModel } from "../renderer/src/model.js";
import { Project } from "./project.js";

const DEMO = fileURLToPath(new URL("../../../../examples/sunflower-demo/", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "hw-torture-"));
const RELEASE = ((r) => (r && existsSync(r) ? r : null))(findRuntime());
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

  // BREAK_IT.md S-6: random disk faults (held files, access denied, a full disk, I/O errors) while saving.
  test("S-6: under random disk faults, a save is all or nothing and no temporary file is left", () => {
    const p = open(join(work, "faults"));
    const file = "script/start.hws";
    let good = p.fs.read(file);
    let failed = 0;
    process.env["HW_FAULTS"] = "0.3";
    try {
      for (let i = 0; i < 300; i++) {
        const next = `${good}# version ${i}\n`;
        let ok = false;
        try {
          ok = p.write(file, next).ok;
        } catch {
          failed++;
        }
        delete process.env["HW_FAULTS"];
        const disk = p.fs.read(file);
        process.env["HW_FAULTS"] = "0.3";
        expect(disk === next || disk === good, `after attempt ${i}`).toBe(true);
        if (ok) good = next;
        else if (disk === next) good = next; // the rename landed, then a later step failed
      }
    } finally {
      delete process.env["HW_FAULTS"];
    }
    expect(failed).toBeGreaterThan(10); // the faults really happened
    expect(readdirSync(join(p.root, "script")).filter((f) => f.includes(".tmp-"))).toEqual([]);
    expect(p.write(file, `${good}# after\n`)).toEqual({ ok: true });
    p.close();
  }, 60000); // injected "busy file" faults wait out the real retry backoff

  // BREAK_IT.md S-7: a full disk during export never leaves a half-written game behind.
  test.skipIf(!RELEASE)("S-7: an export that runs out of disk leaves only whole files", () => {
    const p = open(join(work, "full-disk"));
    expect(p.exportGame(RELEASE!, false).ok).toBe(true);
    const dir = join(p.root, "build", "windows", "Sunflower Days");
    const exe = readFileSync(join(dir, "Sunflower Days.exe"));
    let failed = 0;
    for (let i = 0; i < 30; i++) {
      process.env["HW_FAULTS"] = "0.2:ENOSPC";
      try {
        p.exportGame(RELEASE!, false);
      } catch {
        failed++;
      } finally {
        delete process.env["HW_FAULTS"];
      }
      expect(readFileSync(join(dir, "Sunflower Days.exe")).equals(exe)).toBe(true);
      expect(() => readPack(new Uint8Array(readFileSync(join(dir, "data.hwp"))))).not.toThrow();
      expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
    }
    expect(failed).toBeGreaterThan(0);
    p.close();
  }, 120000);
});
