/**
 * Compiling a project and packaging a playable Windows folder (plan §9.2
 * `hwc build --release`, §14.4): build/windows/<Game>/<Game>.exe (the
 * runtime), data.hwp (the bytecode and every asset, spec/pack.md), and
 * CREDITS.txt. Later releases can ship a patch pack with only what changed.
 * Shared by the `build` tool, hwc, and Studio's export.
 */
import { readFileSync } from "node:fs";
import { type PackFile, compile, diffForPatch, readPack, writeHwb, writePack } from "@himawari/core";
import type { ProjectFs } from "./fs.js";
import { check, describeDiagnostics, diagnosticsJson } from "./project.js";

export interface Compiled {
  bytes: Uint8Array | null;
  /** Why it didn't compile. */
  errors: string;
  title: string;
  /** himawari.json `id` (packs are tied to their game). */
  gameId: string;
}

export function compileProject(fs: ProjectFs, options: { debug?: boolean } = {}): Compiled {
  const { check: c } = check(fs);
  const r = compile(c, { debug: options.debug ?? true });
  if (!r.module) {
    const ds = diagnosticsJson(c).filter((d) => d.severity === "error");
    return { bytes: null, errors: ds.length ? describeDiagnostics(ds) : r.errors.map((e) => `${e.file}: ${e.message}`).join("\n"), title: "", gameId: "" };
  }
  return { bytes: writeHwb(r.module), errors: "", title: c.manifest?.name ?? "game", gameId: c.manifest?.id ?? "game" };
}

/** A file name from the game's title: letters, digits, spaces, - and _ only. */
export function safeName(title: string): string {
  const s = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, " ");
  return s || "game";
}

export interface Packaged {
  dir: string;
  exe: string;
  /** Files in the folder. */
  files: number;
  /** The pack written: data.hwp, or patch<N>.hwp for a patch; null when a patch found nothing changed. */
  pack: string | null;
  /** Assets and bytecode in that pack (for a patch: changed and removed ones). */
  entries: number;
}

export interface PackageOptions {
  /** Write patch<N>.hwp with only what changed since the packs already in the folder, instead of a new data.hwp. */
  patch?: boolean;
  /** Light obfuscation of the pack (not DRM). */
  obfuscate?: boolean;
}

/** Third-party notices shipped with every game (FreeType's license requires the credit). */
export const CREDITS = `This game was made with Himawari (https://github.com/PastelSalt/himawari-c).

The Himawari runtime is licensed under the zlib license and uses:
- SDL 3 and SDL3_mixer (zlib license), Copyright (C) 1997-2026 Sam Lantinga.
- FreeType: Portions of this software are copyright (C) The FreeType Project (www.freetype.org). All rights reserved.
- libunibreak (zlib license), Copyright (C) 2008-2026 Wu Yongwei and contributors.
- libwebp (BSD license), Copyright (C) 2010 Google Inc. All rights reserved.
- stb_image (public domain / MIT), by Sean Barrett and contributors.
- stb_vorbis and dr_mp3 through SDL3_mixer (public domain / MIT-0).

Fonts and other assets keep their own licenses; see the game's own credits.
`;

/** Every file a pack holds: the bytecode as game.hwb and assets/** as they are. */
function packFiles(fs: ProjectFs, bytes: Uint8Array): PackFile[] {
  return [{ path: "game.hwb", data: bytes }, ...fs.list("assets").map((a) => ({ path: a, data: new Uint8Array(fs.readBytes(a)) }))];
}

/** Writes build/windows/<Game>/ (project-relative paths in the result). */
export function packageGame(fs: ProjectFs, bytes: Uint8Array, title: string, gameId: string, runtimeExe: string, options: PackageOptions = {}): Packaged {
  const name = safeName(title);
  const dir = `build/windows/${name}`;
  const files = packFiles(fs, bytes);
  let pack: string | null = `${dir}/data.hwp`;
  let entries = files.length;
  if (options.patch) {
    // The merged view of what players already have: data.hwp, then each patch by priority.
    const shipped = fs.list(dir, (n) => /^(data|patch\d*)\.hwp$/i.test(n)).map((f) => readPack(new Uint8Array(fs.readBytes(f))));
    if (!shipped.some((p) => p.priority === 0)) throw new Error(`${dir}/data.hwp isn't there yet: build a full release first, then patches`);
    shipped.sort((a, b) => a.priority - b.priority);
    const view = new Map<string, { size: number; crc: number }>();
    for (const p of shipped) {
      for (const e of p.entries) {
        if (e.codec === 2) view.delete(e.path);
        else view.set(e.path, { size: e.size, crc: e.crc });
      }
    }
    const { changed, removed } = diffForPatch(view, files);
    entries = changed.length + removed.length;
    const priority = Math.max(...shipped.map((p) => p.priority)) + 1;
    pack = entries ? `${dir}/patch${priority}.hwp` : null;
    if (pack) fs.write(pack, writePack(changed, { gameId, priority, removed, obfuscate: options.obfuscate ?? false }));
  } else {
    // A full release: the runtime, one pack, the credits. Loose files from older exports and old patches go.
    for (const old of fs.list(dir, (n) => n === "game.hwb" || /^patch\d*\.hwp$/i.test(n))) fs.remove(old);
    for (const old of fs.list(`${dir}/assets`)) fs.remove(old);
    fs.write(pack, writePack(files, { gameId, obfuscate: options.obfuscate ?? false }));
  }
  fs.write(`${dir}/${name}.exe`, readFileSync(runtimeExe));
  fs.write(`${dir}/CREDITS.txt`, CREDITS);
  return { dir, exe: `${dir}/${name}.exe`, files: fs.list(dir).length, pack, entries };
}
