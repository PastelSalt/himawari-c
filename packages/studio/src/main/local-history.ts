/**
 * Local history (FINALIZATION.md S-2, S-8): earlier versions of every project
 * text file, kept outside the project in Studio's own data folder, so a file
 * can be brought back to how it was yesterday, after a restart or a crash,
 * and a deleted file can be restored. Like VS Code's local history: the state
 * before a change, bursts of typing merged into one version, about 50 kept per file.
 * Restore points keep every text file at once, before a wide change.
 * No Electron here, so it can be tested.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type VersionReason = "edit" | "delete" | "outside";

export interface Version {
  at: number;
  reason: VersionReason;
  size: number;
}

export interface RestorePoint {
  id: string;
  at: number;
  label: string;
  files: number;
}

const MERGE_MS = 10_000;
const KEEP = 50;
const KEEP_POINTS = 20;
/** Bigger files (a huge translation table) are left out; git and the Recycle Bin still cover them. */
const MAX_BYTES = 4 * 1024 * 1024;

const enc = (file: string) => encodeURIComponent(file);
const dec = (name: string) => decodeURIComponent(name);

export class LocalHistory {
  readonly dir: string;

  /** `base`: Studio's data folder; each project gets its own folder named by a hash of its path. */
  constructor(base: string, projectRoot: string, private now: () => number = Date.now) {
    this.dir = join(base, "History", createHash("sha1").update(projectRoot.toLowerCase()).digest("hex").slice(0, 16));
  }

  private fileDir(file: string) {
    return join(this.dir, "files", enc(file));
  }

  /** Keeps `text` as an earlier version of `file` (call it before changing or deleting the file). */
  save(file: string, text: string, reason: VersionReason): void {
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return;
    const dir = this.fileDir(file);
    const now = this.now();
    const existing = this.list(file);
    const last = existing[0];
    // Typing: keep the version from before the burst, not one per keystroke.
    if (reason === "edit" && last && last.reason === "edit" && now - last.at < MERGE_MS) return;
    if (last && reason !== "delete" && readFileSync(join(dir, `${last.at}-${last.reason}.txt`), "utf8") === text) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${now}-${reason}.txt`), text);
    for (const old of [...existing, { at: now, reason, size: 0 }].sort((a, b) => b.at - a.at).slice(KEEP)) rmSync(join(dir, `${old.at}-${old.reason}.txt`), { force: true });
  }

  /** Versions of `file`, newest first. */
  list(file: string): Version[] {
    const dir = this.fileDir(file);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((n) => /^(\d+)-(edit|delete|outside)\.txt$/.exec(n))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ at: Number(m[1]), reason: m[2] as VersionReason, size: statSync(join(dir, m[0])).size }))
      .sort((a, b) => b.at - a.at);
  }

  read(file: string, at: number): string | null {
    const v = this.list(file).find((x) => x.at === at);
    return v ? readFileSync(join(this.fileDir(file), `${v.at}-${v.reason}.txt`), "utf8") : null;
  }

  /** Files whose newest version is a deletion and that don't exist now (they can be restored). */
  deleted(exists: (file: string) => boolean): { file: string; at: number }[] {
    const root = join(this.dir, "files");
    if (!existsSync(root)) return [];
    const out: { file: string; at: number }[] = [];
    for (const name of readdirSync(root)) {
      const file = dec(name);
      const newest = this.list(file)[0];
      if (newest?.reason === "delete" && !exists(file)) out.push({ file, at: newest.at });
    }
    return out.sort((a, b) => b.at - a.at);
  }

  /** A restore point: every text file as it is now, before a wide change. */
  point(label: string, files: Record<string, string>): string {
    const id = String(this.now());
    const dir = join(this.dir, "points", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "point.json"), JSON.stringify({ label, files }));
    const all = this.points();
    for (const old of all.slice(KEEP_POINTS)) rmSync(join(this.dir, "points", old.id), { recursive: true, force: true });
    return id;
  }

  points(): RestorePoint[] {
    const root = join(this.dir, "points");
    if (!existsSync(root)) return [];
    const out: RestorePoint[] = [];
    for (const id of readdirSync(root)) {
      try {
        const p = JSON.parse(readFileSync(join(root, id, "point.json"), "utf8")) as { label: string; files: Record<string, string> };
        out.push({ id, at: Number(id), label: p.label, files: Object.keys(p.files).length });
      } catch {
        /* a broken point is skipped */
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }

  readPoint(id: string): Record<string, string> | null {
    if (!/^\d+$/.test(id)) return null;
    try {
      return (JSON.parse(readFileSync(join(this.dir, "points", id, "point.json"), "utf8")) as { files: Record<string, string> }).files;
    } catch {
      return null;
    }
  }
}
