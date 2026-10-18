/**
 * The packer (spec/pack.md, rfcs/0009): files → a .hwp pack, and patch packs
 * that hold only what changed since a base pack. Pure: callers read and write
 * the files. The runtime reads packs with runtime/src/core/hw_pack.c.
 */
import { crc32 } from "../bytecode/crc32.js";
import { xxh64, xxh64String } from "./hash.js";
import { lz4Compress, lz4Decompress } from "./lz4.js";

export const PACK_MAJOR = 1;
export const PACK_MINOR = 0;
const HEADER = 48;
const ENTRY = 32;
export const PACK_OBFUSCATED = 1;

export const Codec = { store: 0, lz4: 1, removed: 2 } as const;

/** Formats that are already compressed: stored as they are. */
const COMPRESSED = /\.(png|jpe?g|webp|ogg|opus|mp3|flac|zip|ttc|woff2?)$/i;

export interface PackFile {
  /** A path inside the pack: "game.hwb", "assets/bg/park.png". */
  path: string;
  data: Uint8Array;
}

export interface PackOptions {
  /** 0 for the base pack (data.hwp); patches are higher, and the highest wins. */
  priority?: number;
  /** The game id (himawari.json `id`): patches only apply to packs of the same game. */
  gameId: string;
  /** Light obfuscation so files can't be browsed casually. Not DRM: the key is in the file. */
  obfuscate?: boolean;
  /** Paths a patch removes from the packs below it. */
  removed?: string[];
}

export interface PackEntry {
  path: string;
  hash: bigint;
  codec: number;
  size: number;
  stored: number;
  crc: number;
  /** The decoded bytes (null for a removed entry). */
  data: Uint8Array | null;
}

export interface ReadPack {
  major: number;
  minor: number;
  priority: number;
  obfuscated: boolean;
  game: bigint;
  entries: PackEntry[];
}

export class PackError extends Error {}

/** A path as packs key it: forward slashes, ASCII lowercase, no leading "./" or "/". */
export function normalizePackPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function mask(key: bigint, entryHash: bigint, bytes: Uint8Array, at = 0): void {
  const k = key ^ entryHash;
  for (let i = 0; i < bytes.length; i++) {
    const pos = at + i;
    bytes[i] = ((bytes[i] as number) ^ Number((k >> BigInt((pos & 7) * 8)) & 255n) ^ ((pos >>> 3) & 255)) & 255;
  }
}

export function writePack(files: readonly PackFile[], options: PackOptions): Uint8Array {
  const enc = new TextEncoder();
  const game = xxh64String(options.gameId);
  const obfuscate = options.obfuscate ?? false;
  const key = obfuscate ? xxh64String(`himawari:${options.gameId}`) || 1n : 0n;

  interface Planned {
    name: string;
    hash: bigint;
    codec: number;
    size: number;
    crc: number;
    bytes: Uint8Array;
  }
  const seen = new Set<string>();
  const planned: Planned[] = [];
  for (const f of files) {
    const name = normalizePackPath(f.path);
    if (!name) throw new PackError(`empty path in a pack`);
    if (seen.has(name)) throw new PackError(`${name} is in the pack twice`);
    seen.add(name);
    let codec: number = Codec.store;
    let bytes = f.data;
    if (!COMPRESSED.test(name) && f.data.length >= 64) {
      const packed = lz4Compress(f.data);
      if (packed.length < f.data.length * 0.95) {
        codec = Codec.lz4;
        bytes = packed;
      }
    }
    planned.push({ name, hash: xxh64String(name), codec, size: f.data.length, crc: crc32(f.data), bytes: Uint8Array.from(bytes) });
  }
  for (const path of options.removed ?? []) {
    const name = normalizePackPath(path);
    if (seen.has(name)) throw new PackError(`${name} is both in the patch and removed by it`);
    seen.add(name);
    planned.push({ name, hash: xxh64String(name), codec: Codec.removed, size: 0, crc: 0, bytes: new Uint8Array(0) });
  }
  // Sorted by hash (then name), so readers can binary-search; deterministic output.
  planned.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Names: NUL-terminated, padded to 4 bytes.
  const nameOffsets: number[] = [];
  const nameBytes: number[] = [];
  for (const p of planned) {
    nameOffsets.push(nameBytes.length);
    nameBytes.push(...enc.encode(p.name), 0);
  }
  while (nameBytes.length % 4) nameBytes.push(0);
  const names = Uint8Array.from(nameBytes);

  // Data: each entry 4-byte aligned, right after the header.
  let offset = HEADER;
  const offsets: number[] = [];
  for (const p of planned) {
    offsets.push(p.codec === Codec.removed ? 0 : offset);
    if (p.codec !== Codec.removed) offset += (p.bytes.length + 3) & ~3;
  }
  const tocOffset = offset;
  const total = tocOffset + planned.length * ENTRY + names.length;
  if (total > 0xffffffff) throw new PackError("a pack can't be larger than 4 GB; split the assets into patches");
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  planned.forEach((p, i) => {
    if (p.codec === Codec.removed) return;
    const stored = Uint8Array.from(p.bytes);
    if (obfuscate) mask(key, p.hash, stored);
    out.set(stored, offsets[i] as number);
  });
  planned.forEach((p, i) => {
    const e = tocOffset + i * ENTRY;
    view.setBigUint64(e, p.hash, true);
    view.setUint32(e + 8, nameOffsets[i] as number, true);
    view.setUint32(e + 12, offsets[i] as number, true);
    view.setUint32(e + 16, p.bytes.length, true);
    view.setUint32(e + 20, p.size, true);
    view.setUint32(e + 24, p.codec, true);
    view.setUint32(e + 28, p.crc, true);
  });
  const storedNames = Uint8Array.from(names);
  if (obfuscate) mask(key, 0n, storedNames);
  out.set(storedNames, tocOffset + planned.length * ENTRY);

  out.set([0x48, 0x57, 0x50, 0x01], 0); // "HWP\x01"
  view.setUint16(4, PACK_MAJOR, true);
  view.setUint16(6, PACK_MINOR, true);
  view.setUint32(8, obfuscate ? PACK_OBFUSCATED : 0, true);
  view.setUint32(12, options.priority ?? 0, true);
  view.setUint32(16, planned.length, true);
  view.setUint32(20, tocOffset, true);
  view.setUint32(24, names.length, true);
  view.setUint32(28, crc32(out.subarray(tocOffset)), true);
  view.setBigUint64(32, game, true);
  view.setBigUint64(40, key, true);
  return out;
}

/** Reads and checks a whole pack (tools and tests; the runtime reads entries on demand). */
export function readPack(bytes: Uint8Array): ReadPack {
  const fail = (msg: string): never => {
    throw new PackError(msg);
  };
  if (bytes.length < HEADER || bytes[0] !== 0x48 || bytes[1] !== 0x57 || bytes[2] !== 0x50 || bytes[3] !== 0x01) fail("not a .hwp pack");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const major = view.getUint16(4, true);
  const minor = view.getUint16(6, true);
  if (major !== PACK_MAJOR || minor > PACK_MINOR) fail(`unsupported pack version ${major}.${minor}`);
  const flags = view.getUint32(8, true);
  const count = view.getUint32(16, true);
  const tocOffset = view.getUint32(20, true);
  const namesSize = view.getUint32(24, true);
  const key = view.getBigUint64(40, true);
  if (tocOffset < HEADER || tocOffset + count * ENTRY + namesSize !== bytes.length) fail("the table of contents doesn't fit the file");
  if (crc32(bytes.subarray(tocOffset)) !== view.getUint32(28, true)) fail("checksum mismatch in the table of contents");
  const obfuscated = (flags & PACK_OBFUSCATED) !== 0;
  const names = bytes.slice(tocOffset + count * ENTRY);
  if (obfuscated) mask(key, 0n, names);
  const dec = new TextDecoder("utf-8", { fatal: true });
  const entries: PackEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = tocOffset + i * ENTRY;
    const hash = view.getBigUint64(e, true);
    const nameAt = view.getUint32(e + 8, true);
    const offset = view.getUint32(e + 12, true);
    const stored = view.getUint32(e + 16, true);
    const size = view.getUint32(e + 20, true);
    const codec = view.getUint32(e + 24, true);
    const crc = view.getUint32(e + 28, true);
    const end = names.indexOf(0, nameAt);
    if (nameAt >= names.length || end < 0) fail("a name runs past the names");
    const path = dec.decode(names.subarray(nameAt, end));
    if (xxh64(names.subarray(nameAt, end)) !== hash) fail(`${path}: the name doesn't match its hash`);
    if (i > 0 && hash < (entries[i - 1] as PackEntry).hash) fail("entries aren't sorted");
    let data: Uint8Array | null = null;
    if (codec === Codec.removed) {
      if (stored || size) fail(`${path}: a removed entry has data`);
    } else {
      if (offset < HEADER || offset + stored > tocOffset) fail(`${path}: outside the data`);
      const raw = bytes.slice(offset, offset + stored);
      if (obfuscated) mask(key, hash, raw);
      if (codec === Codec.store) data = raw;
      else if (codec === Codec.lz4) data = lz4Decompress(raw, size);
      else fail(`${path}: unknown codec ${codec}`);
      if (data && (data.length !== size || crc32(data) !== crc)) fail(`${path}: the data is damaged`);
    }
    entries.push({ path, hash, codec, size, stored, crc, data });
  }
  return { major, minor, priority: view.getUint32(12, true), obfuscated, game: view.getBigUint64(32, true), entries };
}

/**
 * A patch pack: the files that differ from `base` (the merged view of the
 * packs already shipped), plus removals for paths that are gone.
 */
export function diffForPatch(base: ReadonlyMap<string, { size: number; crc: number }>, files: readonly PackFile[]): { changed: PackFile[]; removed: string[] } {
  const now = new Set(files.map((f) => normalizePackPath(f.path)));
  const changed = files.filter((f) => {
    const b = base.get(normalizePackPath(f.path));
    return !b || b.size !== f.data.length || b.crc !== crc32(f.data);
  });
  const removed = [...base.keys()].filter((p) => !now.has(p)).sort();
  return { changed, removed };
}
