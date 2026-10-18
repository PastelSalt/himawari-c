/**
 * Stable line IDs (plan §5.1, §5.2; spec/language.md "Line IDs").
 *
 * A line ID is 6 characters of lowercase Crockford base32 (30 bits). IDs are
 * persistent tags, not content hashes: tooling assigns them once and they
 * survive edits and moves. They are written as a trailing `#line:xxxxxx`.
 */

/** Crockford base32, lowercase. Omits i, l, o, u to avoid misreading. */
export const LINE_ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const LINE_ID_LENGTH = 6;

const LINE_ID_RE = /^[0-9a-hjkmnp-tv-z]{6}$/;
const LINE_TAG_RE = /#line:([0-9a-hjkmnp-tv-z]{6})\s*$/;

export function isLineId(value: string): boolean {
  return LINE_ID_RE.test(value);
}

/** Returns the line ID from a trailing `#line:xxxxxx` tag, or `undefined`. */
export function extractLineId(sourceLine: string): string | undefined {
  return LINE_TAG_RE.exec(sourceLine)?.[1];
}

/** Returns a random integer in `[0, 2^30)`. Injected so tests are deterministic. */
export type RandomSource = () => number;

const ID_SPACE = 2 ** (5 * LINE_ID_LENGTH);

/** Web Crypto, which Node and the browser (Studio's renderer) both provide, so Core stays I/O- and platform-free. */
const webCrypto = (globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }).crypto;

/** 2^30 divides 2^32, so masking a uniform 32-bit value stays uniform. */
export const cryptoRandomSource: RandomSource = () => webCrypto.getRandomValues(new Uint32Array(1))[0]! & (ID_SPACE - 1);

function encode(n: number): string {
  let out = "";
  for (let i = 0; i < LINE_ID_LENGTH; i++) {
    out = LINE_ID_ALPHABET[n & 31] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/** The 30-bit number of a line ID (first character most significant), as stored in .hwb files. */
export function lineIdToNumber(id: string): number {
  let n = 0;
  for (const c of id) n = n * 32 + LINE_ID_ALPHABET.indexOf(c);
  return n;
}

/** Inverse of `lineIdToNumber`. */
export function numberToLineId(n: number): string {
  return encode(n);
}

/**
 * Generates a line ID that is not in `taken`. Collisions are retried; the
 * space is ~1.07 billion IDs, so a project would need hundreds of millions
 * of lines before retries become common.
 */
export function generateLineId(
  taken: ReadonlySet<string>,
  random: RandomSource = cryptoRandomSource,
): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    const id = encode(random() % ID_SPACE);
    if (!taken.has(id)) return id;
  }
  throw new Error("generateLineId: could not find a free line ID after 64 attempts");
}
