/** xxHash64 (the reference algorithm, https://github.com/Cyan4973/xxHash): pack entry keys (spec/pack.md). */

const M = (1n << 64n) - 1n;
const P1 = 11400714785074694791n;
const P2 = 14029467366897019727n;
const P3 = 1609587929392839161n;
const P4 = 9650029242287828579n;
const P5 = 2870177450012600261n;

const rotl = (x: bigint, r: bigint) => ((x << r) | (x >> (64n - r))) & M;
const round = (acc: bigint, input: bigint) => (rotl((acc + input * P2) & M, 31n) * P1) & M;
const merge = (acc: bigint, val: bigint) => (((acc ^ round(0n, val)) * P1) & M) + P4 & M;

export function xxh64(data: Uint8Array, seed = 0n): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (i: number) => view.getBigUint64(i, true);
  const len = data.length;
  let p = 0;
  let h: bigint;
  if (len >= 32) {
    let v1 = (seed + P1 + P2) & M;
    let v2 = (seed + P2) & M;
    let v3 = seed & M;
    let v4 = (seed - P1) & M;
    while (p <= len - 32) {
      v1 = round(v1, u64(p));
      v2 = round(v2, u64(p + 8));
      v3 = round(v3, u64(p + 16));
      v4 = round(v4, u64(p + 24));
      p += 32;
    }
    h = (rotl(v1, 1n) + rotl(v2, 7n) + rotl(v3, 12n) + rotl(v4, 18n)) & M;
    h = merge(h, v1);
    h = merge(h, v2);
    h = merge(h, v3);
    h = merge(h, v4);
  } else {
    h = (seed + P5) & M;
  }
  h = (h + BigInt(len)) & M;
  while (len - p >= 8) {
    h = ((rotl(h ^ round(0n, u64(p)), 27n) * P1) & M) + P4 & M;
    p += 8;
  }
  if (len - p >= 4) {
    h = ((rotl(h ^ ((BigInt(view.getUint32(p, true)) * P1) & M), 23n) * P2) & M) + P3 & M;
    p += 4;
  }
  while (p < len) {
    h = (rotl(h ^ ((BigInt(data[p] as number) * P5) & M), 11n) * P1) & M;
    p++;
  }
  h ^= h >> 33n;
  h = (h * P2) & M;
  h ^= h >> 29n;
  h = (h * P3) & M;
  h ^= h >> 32n;
  return h;
}

/** xxHash64 of a string's UTF-8 bytes. */
export const xxh64String = (s: string) => xxh64(new TextEncoder().encode(s));
