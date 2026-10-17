/**
 * The project folder, sandboxed (plan §10.2 rule 6): every path is relative
 * to the project root and may not leave it. Writes go to a temporary file and
 * are renamed into place, so a crash never leaves half a file.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export class SandboxError extends Error {}

export class ProjectFs {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** The absolute path of a project-relative path, refusing anything outside the project. */
  path(rel: string): string {
    if (rel.includes("\0") || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new SandboxError(`"${rel}" must be a path inside the project`);
    const full = resolve(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new SandboxError(`"${rel}" is outside the project`);
    return full;
  }

  /** Project-relative, forward slashes. */
  rel(full: string): string {
    return relative(this.root, full).replaceAll("\\", "/");
  }

  exists(rel: string): boolean {
    return existsSync(this.path(rel));
  }

  read(rel: string): string {
    return readFileSync(this.path(rel), "utf8");
  }

  readBytes(rel: string): Buffer {
    return readFileSync(this.path(rel));
  }

  write(rel: string, data: string | Uint8Array): void {
    const full = this.path(rel);
    mkdirSync(dirname(full), { recursive: true });
    const tmp = `${full}.tmp-${process.pid}`;
    writeFileSync(tmp, data);
    renameSync(tmp, full);
  }

  remove(rel: string): void {
    rmSync(this.path(rel), { force: true });
  }

  /** Files under `dir` (recursive, sorted), project-relative; hidden folders and node_modules are skipped. */
  list(dir: string, keep: (name: string) => boolean = () => true): string[] {
    const start = this.path(dir);
    if (!existsSync(start)) return [];
    const out: string[] = [];
    const visit = (p: string) => {
      for (const name of readdirSync(p)) {
        if (name.startsWith(".") || name === "node_modules") continue;
        const full = join(p, name);
        if (statSync(full).isDirectory()) visit(full);
        else if (keep(name)) out.push(this.rel(full));
      }
    };
    visit(start);
    return out.sort();
  }
}
