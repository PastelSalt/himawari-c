/**
 * A quick fingerprint of a file's text (FNV-1a, 32-bit, over UTF-16 code units), the same in
 * Studio's window and its main process. A save carries the fingerprint of the text it was based
 * on; if the disk no longer matches it, someone else changed the file meanwhile and Studio asks
 * instead of overwriting (BREAK_IT.md finding B-11). Not for security: only to notice a change.
 */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
