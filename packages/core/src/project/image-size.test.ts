import { describe, expect, test } from "vitest";
import { imageSize } from "./image-size.js";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("imageSize", () => {
  test("PNG", () => {
    const png = bytes([0x89], "PNG", [13, 10, 26, 10, 0, 0, 0, 13], "IHDR", [0, 0, 7, 128, 0, 0, 4, 56]);
    expect(imageSize(png)).toEqual({ width: 1920, height: 1080 });
  });

  test("JPEG, past an APP1 block to the frame", () => {
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe1, 0, 6, 1, 2, 3, 4, 0xff, 0xc0, 0, 17, 8, 4, 56, 7, 128, 3]);
    expect(imageSize(jpeg)).toEqual({ width: 1920, height: 1080 });
  });

  test("WebP: lossy, lossless, extended", () => {
    const head = (kind: string, body: number[]) => bytes("RIFF", [0, 0, 0, 0], "WEBP", kind, [0, 0, 0, 0], body);
    expect(imageSize(head("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 128, 7, 56, 4, 0, 0]))).toEqual({ width: 1920, height: 1080 });
    // VP8L: signature 0x2f, then 14 bits width-1 and 14 bits height-1.
    const b = (1919 | (1079 << 14)) >>> 0;
    expect(imageSize(head("VP8L", [0x2f, b & 255, (b >>> 8) & 255, (b >>> 16) & 255, (b >>> 24) & 255, 0, 0, 0, 0, 0, 0]))).toEqual({ width: 1920, height: 1080 });
    expect(imageSize(head("VP8X", [0, 0, 0, 0, 1919 & 255, 1919 >> 8, 0, 1079 & 255, 1079 >> 8, 0]))).toEqual({ width: 1920, height: 1080 });
  });

  test("anything else", () => {
    expect(imageSize(bytes("GIF89a", [0, 0, 0, 0]))).toBeNull();
    expect(imageSize(new Uint8Array())).toBeNull();
  });
});
