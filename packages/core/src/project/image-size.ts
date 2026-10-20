/**
 * An image's size from the first bytes of its file: PNG, JPEG, and WebP, the
 * formats the runtime reads. No decoding and no I/O: callers pass the head of
 * the file (64 KiB is plenty, even for a JPEG with a big EXIF block first).
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** How many bytes of a file `imageSize` wants. */
export const IMAGE_HEAD_BYTES = 65536;

export function imageSize(head: Uint8Array): ImageSize | null {
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const at = (i: number, s: string) => [...s].every((c, k) => head[i + k] === c.charCodeAt(0));
  // PNG: the IHDR chunk comes first.
  if (head.length >= 24 && head[0] === 0x89 && at(1, "PNG") && at(12, "IHDR")) {
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xff) return null;
      const marker = head[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      const len = v.getUint16(i + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  // WebP: lossy (VP8), lossless (VP8L), or extended (VP8X).
  if (head.length >= 30 && at(0, "RIFF") && at(8, "WEBP")) {
    if (at(12, "VP8 ")) return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    if (at(12, "VP8L")) {
      const b = v.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
    }
    if (at(12, "VP8X")) {
      const u24 = (i: number) => head[i]! | (head[i + 1]! << 8) | (head[i + 2]! << 16);
      return { width: u24(24) + 1, height: u24(27) + 1 };
    }
  }
  return null;
}
