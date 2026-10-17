/**
 * Compiling a project and packaging a playable Windows folder (plan §9.2
 * `hwc build --release`): build/windows/<Game>/<Game>.exe (the runtime),
 * game.hwb beside it, and assets/. Shared by the `build` tool and hwc.
 */
import { readFileSync } from "node:fs";
import { compile, writeHwb } from "@himawari/core";
import type { ProjectFs } from "./fs.js";
import { check, describeDiagnostics, diagnosticsJson } from "./project.js";

export interface Compiled {
  bytes: Uint8Array | null;
  /** Why it didn't compile. */
  errors: string;
  title: string;
}

export function compileProject(fs: ProjectFs, options: { debug?: boolean } = {}): Compiled {
  const { check: c } = check(fs);
  const r = compile(c, { debug: options.debug ?? true });
  if (!r.module) {
    const ds = diagnosticsJson(c).filter((d) => d.severity === "error");
    return { bytes: null, errors: ds.length ? describeDiagnostics(ds) : r.errors.map((e) => `${e.file}: ${e.message}`).join("\n"), title: "" };
  }
  return { bytes: writeHwb(r.module), errors: "", title: c.manifest?.name ?? "game" };
}

/** A file name from the game's title: letters, digits, spaces, - and _ only. */
export function safeName(title: string): string {
  const s = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, " ");
  return s || "game";
}

export interface Packaged {
  dir: string;
  exe: string;
  files: number;
}

/** Writes build/windows/<Game>/ (project-relative paths in the result). */
export function packageGame(fs: ProjectFs, bytes: Uint8Array, title: string, runtimeExe: string): Packaged {
  const name = safeName(title);
  const dir = `build/windows/${name}`;
  fs.write(`${dir}/${name}.exe`, readFileSync(runtimeExe));
  fs.write(`${dir}/game.hwb`, bytes);
  let files = 2;
  for (const a of fs.list("assets")) {
    fs.write(`${dir}/${a}`, fs.readBytes(a));
    files++;
  }
  return { dir, exe: `${dir}/${name}.exe`, files };
}
