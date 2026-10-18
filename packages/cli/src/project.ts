/** Finding and loading a Himawari project from disk for `checkProject` (Core itself does no I/O). */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ProjectInput } from "@himawari/core";
import { ProjectFs, loadInput } from "@himawari/tools";

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

/**
 * Reads himawari.json, characters/*.md, script/**\/*.hws, locales/*.json, extensions/*.schema.json, theme/theme.json,
 * and the assets/ listing (the same loader the AI tools use).
 */
export function loadProject(root: string): ProjectInput {
  return loadInput(new ProjectFs(root));
}
