/**
 * Single-file games (FINALIZATION.md OC-6, spec/pack.md §7): the data pack
 * appended to the player exe, then a 24-byte trailer, so a game is one file
 * to send. The runtime uses it when there is no data.hwp beside the exe;
 * patch*.hwp beside it still apply on top.
 *
 * Sign the exe (Authenticode) after appending: signing puts the certificate
 * table after the trailer, and the runtime looks for the trailer just before
 * a certificate table that ends the file.
 */

/** The trailer's magic: "HWPEXE" 01 00. */
export const EMBED_MAGIC = new Uint8Array([0x48, 0x57, 0x50, 0x45, 0x58, 0x45, 0x01, 0x00]);
export const EMBED_TRAILER = 24;

/** The exe with `pack` appended: exe bytes, pack bytes, then { u64 pack_offset, u64 pack_size, u8[8] magic }. */
export function appendPackToExe(exe: Uint8Array, pack: Uint8Array): Uint8Array {
  if (embeddedPack(exe)) throw new Error("this exe already has a game inside it: start from the plain runtime");
  const out = new Uint8Array(exe.length + pack.length + EMBED_TRAILER);
  out.set(exe, 0);
  out.set(pack, exe.length);
  const view = new DataView(out.buffer, out.byteOffset + exe.length + pack.length, EMBED_TRAILER);
  view.setBigUint64(0, BigInt(exe.length), true);
  view.setBigUint64(8, BigInt(pack.length), true);
  out.set(EMBED_MAGIC, exe.length + pack.length + 16);
  return out;
}

/** Where a trailer would end: the start of an Authenticode certificate table that ends the file, else the file's end. */
function trailerEnd(exe: Uint8Array): number {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  if (exe.length < 64 || exe[0] !== 0x4d || exe[1] !== 0x5a) return exe.length;
  const pe = view.getUint32(0x3c, true);
  if (pe + 26 > exe.length || view.getUint32(pe, true) !== 0x00004550) return exe.length;
  const opt = pe + 24;
  const magic = view.getUint16(opt, true);
  const dirs = opt + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0);
  if (dirs === opt || dirs + 40 > exe.length || view.getUint32(dirs - 4, true) < 5) return exe.length;
  const at = view.getUint32(dirs + 32, true);
  const size = view.getUint32(dirs + 36, true);
  return size > 0 && at + size === exe.length ? at : exe.length;
}

/** The pack inside a single-file game, or null (the same rules as the runtime's hw_vfs_find_embedded). */
export function embeddedPack(exe: Uint8Array): Uint8Array | null {
  const end = trailerEnd(exe);
  if (end < EMBED_TRAILER + 48) return null;
  const t = exe.subarray(end - EMBED_TRAILER, end);
  if (!EMBED_MAGIC.every((b, i) => t[16 + i] === b)) return null;
  const view = new DataView(t.buffer, t.byteOffset, EMBED_TRAILER);
  const offset = Number(view.getBigUint64(0, true));
  const size = Number(view.getBigUint64(8, true));
  if (size < 48 || offset + size !== end - EMBED_TRAILER) return null;
  return exe.subarray(offset, offset + size);
}
