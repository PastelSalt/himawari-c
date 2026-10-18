/**
 * LZ4 block format (https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md):
 * a greedy compressor with a 4-byte hash table, and a decoder for tests.
 * The runtime's decoder is runtime/src/core/hw_pack.c.
 */

const MIN_MATCH = 4;
const LAST_LITERALS = 5; // the last 5 bytes are always literals
const MF_LIMIT = 12; // no match may start within the last 12 bytes
const HASH_BITS = 16;
const MAX_OFFSET = 65535;

export function lz4Compress(src: Uint8Array): Uint8Array {
  const n = src.length;
  // The worst case (incompressible input) grows by one byte per 255 plus a little; bytes, not a number[], so big files stay cheap.
  const out = new Uint8Array(n + Math.ceil(n / 255) + 16);
  let o = 0;
  const table = new Int32Array(1 << HASH_BITS).fill(-1);
  const read32 = (i: number) => ((src[i] as number) | ((src[i + 1] as number) << 8) | ((src[i + 2] as number) << 16) | ((src[i + 3] as number) << 24)) >>> 0;
  const hash = (v: number) => (Math.imul(v, 2654435761) >>> (32 - HASH_BITS)) & ((1 << HASH_BITS) - 1);
  const length = (v: number) => {
    // The rest of a length after the token's 15: 255s, then the remainder.
    for (; v >= 255; v -= 255) out[o++] = 255;
    out[o++] = v;
  };
  const sequence = (litStart: number, litEnd: number, offset: number, matchLen: number) => {
    const lit = litEnd - litStart;
    const ml = matchLen - MIN_MATCH;
    const token = (Math.min(lit, 15) << 4) | (matchLen ? Math.min(ml, 15) : 0);
    out[o++] = token;
    if (lit >= 15) length(lit - 15);
    out.set(src.subarray(litStart, litEnd), o);
    o += lit;
    if (!matchLen) return;
    out[o++] = offset & 255;
    out[o++] = offset >> 8;
    if (ml >= 15) length(ml - 15);
  };

  let anchor = 0;
  let i = 0;
  const limit = n - MF_LIMIT;
  while (i < limit) {
    const v = read32(i);
    const h = hash(v);
    const cand = table[h] as number;
    table[h] = i;
    if (cand >= 0 && i - cand <= MAX_OFFSET && read32(cand) === v) {
      let len = MIN_MATCH;
      const maxLen = n - LAST_LITERALS - i;
      while (len < maxLen && src[cand + len] === src[i + len]) len++;
      sequence(anchor, i, i - cand, len);
      i += len;
      anchor = i;
    } else {
      i++;
    }
  }
  sequence(anchor, n, 0, 0);
  return out.slice(0, o);
}

export function lz4Decompress(src: Uint8Array, size: number): Uint8Array {
  const dst = new Uint8Array(size);
  let i = 0;
  let o = 0;
  const more = (v: number) => {
    let b: number;
    do {
      b = src[i++] as number;
      v += b;
    } while (b === 255);
    return v;
  };
  while (i < src.length) {
    const token = src[i++] as number;
    let lit = token >> 4;
    if (lit === 15) lit = more(lit);
    dst.set(src.subarray(i, i + lit), o);
    i += lit;
    o += lit;
    if (i >= src.length) break;
    const off = (src[i] as number) | ((src[i + 1] as number) << 8);
    i += 2;
    let len = token & 15;
    if (len === 15) len = more(len);
    len += MIN_MATCH;
    for (let k = 0; k < len; k++, o++) dst[o] = dst[o - off] as number;
  }
  if (o !== size) throw new Error("lz4: wrong decoded size");
  return dst;
}
