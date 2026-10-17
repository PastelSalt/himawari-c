/** Loads a Himawari project from disk for `checkProject` (Core itself does no I/O). */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { ProjectInput, SourceFile } from "@himawari/core";

/** The nearest folder at or above `from` that contains himawari.json. */
export function findProjectRoot(from: string): string | undefined {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "himawari.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Files under `dir` (recursive), relative to `base`, with forward slashes. */
function listFiles(dir: string, base: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (p: string) => {
    for (const name of readdirSync(p)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(p, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (keep(name)) out.push(relative(base, full).replaceAll("\\", "/"));
    }
  };
  visit(dir);
  return out.sort();
}

const read = (root: string, file: string): SourceFile => ({ file, text: readFileSync(join(root, file), "utf8") });

/**
 * Reads himawari.json, characters/*.md, the given scripts (default: every
 * script/**\/*.hws), and the assets/ listing.
 */
export function loadProject(root: string, scripts?: readonly string[]): ProjectInput {
  const scriptFiles = scripts
    ? scripts.map((s) => relative(root, resolve(s)).replaceAll("\\", "/"))
    : listFiles(join(root, "script"), root, (n) => n.endsWith(".hws"));
  return {
    manifest: read(root, "himawari.json"),
    characters: listFiles(join(root, "characters"), root, (n) => n.endsWith(".md")).map((f) => read(root, f)),
    scripts: scriptFiles.map((f) => read(root, f)),
    assets: listFiles(join(root, "assets"), join(root, "assets"), () => true),
  };
}
