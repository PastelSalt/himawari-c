/**
 * The project folder, sandboxed (plan §10.2 rule 6): every path is relative
 * to the project root and may not leave it. Writes go to a temporary file and
 * are renamed into place, so a crash never leaves half a file.
 */
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export class SandboxError extends Error {}

/** Errors Windows gives while antivirus, OneDrive, or an indexer briefly holds a file. */
const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Runs `op`, retrying for about two seconds while the file is briefly locked (FINALIZATION.md S-1). */
function retrying<T>(op: () => T): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return op();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT.has(code) || attempt >= 12) throw e;
      pause(Math.min(400, 25 * 2 ** attempt));
    }
  }
}

/** Whether `full` is `root` or inside it (Windows paths compare without case). */
function within(root: string, full: string): boolean {
  const r = root.toLowerCase();
  const f = full.toLowerCase();
  return f === r || f.startsWith(r.endsWith(sep) ? r : r + sep);
}

export class ProjectFs {
  readonly root: string;
  private realRootCache: string | null = null;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** The project folder with every link resolved (it may not exist yet, for a new project). */
  private realRoot(): string {
    if (this.realRootCache) return this.realRootCache;
    if (!existsSync(this.root)) return this.root;
    this.realRootCache = realpathSync.native(this.root);
    return this.realRootCache;
  }

  /**
   * The absolute path of a project-relative path, refusing anything outside the project: by its
   * name (`..`, a drive), and by where it really leads. A symbolic link or junction inside the
   * project that points elsewhere is refused too, so a shared project can't make Studio, `hwc`,
   * an export, or an AI tool read or write the user's other files (BREAK_IT.md, finding B-3).
   */
  path(rel: string): string {
    if (rel.includes("\0") || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new SandboxError(`"${rel}" must be a path inside the project`);
    // No `.` or `..` parts: callers check prefixes like "assets/", and "assets/.." would pass them (finding B-4).
    if (rel.split(/[\\/]/).some((part) => part === ".." || part === ".")) throw new SandboxError(`"${rel}" must be a plain path inside the project (no "." or "..")`);
    const full = resolve(this.root, rel);
    if (!within(this.root, full)) throw new SandboxError(`"${rel}" is outside the project`);
    // Where it really leads: the deepest part that exists, with links resolved.
    let existing = full;
    while (!existsSync(existing)) {
      const up = dirname(existing);
      // A project that doesn't exist yet (being created) has no links in it.
      if (up === existing || !within(this.root, up)) return full;
      existing = up;
    }
    if (!within(this.realRoot(), realpathSync.native(existing))) throw new SandboxError(`"${rel}" leads outside the project through a link`);
    return full;
  }

  /** Project-relative, forward slashes. */
  rel(full: string): string {
    return relative(this.root, full).replaceAll("\\", "/");
  }

  exists(rel: string): boolean {
    return existsSync(this.path(rel));
  }

  /** Reads, retried while another program (antivirus, OneDrive) holds the file. */
  read(rel: string): string {
    const full = this.path(rel);
    return retrying(() => readFileSync(full, "utf8"));
  }

  readBytes(rel: string): Buffer {
    const full = this.path(rel);
    return retrying(() => readFileSync(full));
  }

  /** The first `n` bytes of a file (fewer if it's shorter). */
  readHead(rel: string, n: number): Uint8Array {
    const fd = openSync(this.path(rel), "r");
    try {
      const buf = new Uint8Array(n);
      return buf.subarray(0, readSync(fd, buf, 0, n, 0));
    } finally {
      closeSync(fd);
    }
  }

  /** Size and modification time, for caches. */
  stamp(rel: string): string {
    const st = statSync(this.path(rel));
    return `${st.size}:${st.mtimeMs}`;
  }

  /** Writes the whole file or nothing: a flushed temporary file, then renamed over the old one (retried while locked). */
  write(rel: string, data: string | Uint8Array): void {
    const full = this.path(rel);
    mkdirSync(dirname(full), { recursive: true });
    const tmp = `${full}.tmp-${process.pid}`;
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    try {
      const fd = openSync(tmp, "w");
      try {
        let done = 0;
        while (done < bytes.length) done += writeSync(fd, bytes, done, bytes.length - done);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      retrying(() => renameSync(tmp, full));
    } catch (e) {
      rmSync(tmp, { force: true });
      throw e;
    }
  }

  remove(rel: string): void {
    const full = this.path(rel);
    retrying(() => rmSync(full, { force: true }));
  }

  /** Files under `dir` (recursive, sorted), project-relative; hidden folders and node_modules are skipped. */
  list(dir: string, keep: (name: string) => boolean = () => true): string[] {
    const start = this.path(dir);
    if (!existsSync(start)) return [];
    const out: string[] = [];
    const root = this.realRoot();
    const visit = (p: string) => {
      for (const name of readdirSync(p)) {
        if (name.startsWith(".") || name === "node_modules") continue;
        const full = join(p, name);
        // Links that lead outside the project are left out, as if they weren't there (B-3).
        if (lstatSync(full).isSymbolicLink() && !within(root, realpathSync.native(full))) continue;
        if (statSync(full).isDirectory()) visit(full);
        else if (keep(name)) out.push(this.rel(full));
      }
    };
    visit(start);
    return out.sort();
  }
}
