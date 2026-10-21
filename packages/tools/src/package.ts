/**
 * Compiling a project and packaging a playable Windows folder (plan §9.2
 * `hwc build --release`, §14.4): build/windows/<Game>/<Game>.exe (the
 * runtime), data.hwp (the bytecode and every asset, spec/pack.md), and
 * CREDITS.txt. Later releases can ship a patch pack with only what changed.
 * A single-file export puts data.hwp inside the exe instead (spec/pack.md §7).
 * Shared by the `build` tool, hwc, and Studio's export.
 */
import { closeSync, openSync, readFileSync } from "node:fs";
import { type PackFile, compile, diffForPatch, readPack, writeHwb, writePack } from "@himawari/core";
import { brandExe } from "./brand.js";
import { appendPackToExe, embeddedPack } from "./embed.js";
import { isReservedName } from "./fs.js";
import type { ProjectFs } from "./fs.js";
import { check, describeDiagnostics, diagnosticsJson } from "./project.js";

export interface Compiled {
  bytes: Uint8Array | null;
  /** Why it didn't compile. */
  errors: string;
  title: string;
  /** himawari.json `id` (packs are tied to their game). */
  gameId: string;
  /** himawari.json `version` (for the exe's file properties). */
  version: string;
}

export function compileProject(fs: ProjectFs, options: { debug?: boolean } = {}): Compiled {
  const { check: c } = check(fs);
  const r = compile(c, { debug: options.debug ?? true });
  if (!r.module) {
    const ds = diagnosticsJson(c).filter((d) => d.severity === "error");
    return { bytes: null, errors: ds.length ? describeDiagnostics(ds) : r.errors.map((e) => `${e.file}: ${e.message}`).join("\n"), title: "", gameId: "", version: "" };
  }
  let version = "1.0.0";
  try {
    const v = (JSON.parse(fs.read("himawari.json")) as { version?: unknown }).version;
    if (typeof v === "string") version = v;
  } catch {
    /* the checker already reported it */
  }
  return { bytes: writeHwb(r.module), errors: "", title: c.manifest?.name ?? "game", gameId: c.manifest?.id ?? "game", version };
}


/**
 * A file name from the game's title: letters, digits, spaces, - and _ only; at most 64 characters
 * (Windows allows 255 per name, but players unzip into deep folders); never a reserved device name
 * (BREAK_IT.md finding B-8).
 */
export function safeName(title: string): string {
  let s = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, " ");
  s = Array.from(s).slice(0, 64).join("").trim();
  if (isReservedName(s)) s = `${s} game`;
  return s || "game";
}

export interface Packaged {
  dir: string;
  exe: string;
  /** Files in the folder. */
  files: number;
  /** The pack written: data.hwp, the exe (single file), or patch<N>.hwp for a patch; null when a patch found nothing changed. */
  pack: string | null;
  /** Assets and bytecode in that pack (for a patch: changed and removed ones). */
  entries: number;
  /** Things that didn't stop the export but are worth saying (an icon that couldn't be used). */
  warnings: string[];
}

export interface PackageOptions {
  /** Write patch<N>.hwp with only what changed since the packs already in the folder, instead of a new data.hwp. */
  patch?: boolean;
  /** Light obfuscation of the pack (not DRM). */
  obfuscate?: boolean;
  /** The game's version for the exe's file properties (himawari.json `version`). */
  version?: string;
  /** One file: the pack goes inside the exe instead of data.hwp beside it (FINALIZATION.md OC-6). */
  singleFile?: boolean;
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
  const warnings: string[] = [];
  const files = packFiles(fs, bytes);
  const exePath = `${dir}/${name}.exe`;
  // The game from the last export may still be running: Windows won't let its exe be replaced.
  // Say so before writing anything, instead of a rename error seconds later (BREAK_IT.md finding B-13).
  if (!options.patch && fs.exists(exePath)) {
    try {
      closeSync(openSync(fs.path(exePath), "r+"));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EBUSY" || code === "EPERM" || code === "EACCES") throw new Error(`"${name}.exe" is open: the game from your last export is still running (or the file is read-only). Close it, then export again.`);
    }
  }
  let pack: string | null = options.singleFile ? exePath : `${dir}/data.hwp`;
  let entries = files.length;
  let packBytes: Uint8Array | null = null;
  if (options.patch) {
    // The merged view of what players already have: data.hwp (or the pack inside a single-file exe), then each patch by priority.
    const shipped = fs.list(dir, (n) => /^(data|patch\d*)\.hwp$/i.test(n)).map((f) => readPack(new Uint8Array(fs.readBytes(f))));
    if (!shipped.some((p) => p.priority === 0) && fs.exists(exePath)) {
      const inside = embeddedPack(new Uint8Array(fs.readBytes(exePath)));
      if (inside) shipped.push(readPack(inside));
    }
    if (!shipped.some((p) => p.priority === 0)) throw new Error(`${dir} has no released game yet: build a full release first, then patches`);
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
    // A patch leaves the exe as players have it.
    fs.write(`${dir}/CREDITS.txt`, CREDITS);
    return { dir, exe: exePath, files: fs.list(dir).length, pack, entries, warnings };
  } else {
    // A full release: the runtime, one pack, the credits. Loose files from older exports and old patches go,
    // and so does data.hwp for a single file (beside the exe, it would win over the pack inside).
    for (const old of fs.list(dir, (n) => n === "game.hwb" || /^patch\d*\.hwp$/i.test(n) || (options.singleFile === true && n === "data.hwp"))) fs.remove(old);
    for (const old of fs.list(`${dir}/assets`)) fs.remove(old);
    packBytes = writePack(files, { gameId, obfuscate: options.obfuscate ?? false });
    if (!options.singleFile) fs.write(pack!, packBytes);
  }
  // The exe carries the game's name, version, and icon (assets/icon.png) in its file properties.
  const icon = fs.exists("assets/icon.png") ? new Uint8Array(fs.readBytes("assets/icon.png")) : undefined;
  let exe: Uint8Array = new Uint8Array(readFileSync(runtimeExe));
  try {
    exe = brandExe(exe, { title, fileName: `${name}.exe`, version: options.version ?? "1.0.0", ...(icon ? { iconPng: icon } : {}) });
  } catch (e) {
    warnings.push(`The exe keeps Himawari's icon and details: ${(e as Error).message}.`);
  }
  // Branded first, then the pack appended: rewriting the exe's resources would drop what follows it.
  if (options.singleFile && packBytes) exe = appendPackToExe(exe, packBytes);
  fs.write(exePath, exe);
  fs.write(`${dir}/CREDITS.txt`, CREDITS);
  return { dir, exe: exePath, files: fs.list(dir).length, pack, entries, warnings };
}
