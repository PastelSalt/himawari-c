import { describe, expect, test } from "vitest";
import { EMBED_TRAILER, appendPackToExe, embeddedPack } from "./embed.js";

/** A minimal PE32+ header with a certificate table entry (data directory 4). */
function fakeExe(size: number, cert?: { at: number; size: number }): Uint8Array {
  const exe = new Uint8Array(size);
  const view = new DataView(exe.buffer);
  exe[0] = 0x4d;
  exe[1] = 0x5a;
  view.setUint32(0x3c, 0x80, true);
  view.setUint32(0x80, 0x00004550, true); // "PE\0\0"
  const opt = 0x80 + 24;
  view.setUint16(opt, 0x20b, true);
  view.setUint32(opt + 108, 16, true); // NumberOfRvaAndSizes
  if (cert) {
    view.setUint32(opt + 112 + 32, cert.at, true);
    view.setUint32(opt + 112 + 36, cert.size, true);
  }
  return exe;
}

const pack = new Uint8Array(100).map((_, i) => i);

describe("single-file games (spec/pack.md §7)", () => {
  test("the pack and a trailer follow the exe", () => {
    const exe = fakeExe(1024);
    const out = appendPackToExe(exe, pack);
    expect(out.length).toBe(1024 + 100 + EMBED_TRAILER);
    expect([...out.subarray(out.length - 8)]).toEqual([0x48, 0x57, 0x50, 0x45, 0x58, 0x45, 0x01, 0x00]);
    expect(embeddedPack(out)).toEqual(pack);
    expect(embeddedPack(exe)).toBeNull();
  });

  test("a signed exe: the trailer is found before the certificate table", () => {
    const out = appendPackToExe(fakeExe(1024), pack);
    const signed = new Uint8Array(out.length + 64);
    signed.set(out);
    // Signing appends the certificate table and points data directory 4 at it.
    new DataView(signed.buffer).setUint32(0x80 + 24 + 112 + 32, out.length, true);
    new DataView(signed.buffer).setUint32(0x80 + 24 + 112 + 36, 64, true);
    expect(embeddedPack(signed)).toEqual(pack);
  });

  test("an exe can't take a second game", () => {
    expect(() => appendPackToExe(appendPackToExe(fakeExe(1024), pack), pack)).toThrow(/already/);
  });
});
