import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import * as ResEdit from "resedit";
import { describe, expect, test } from "vitest";
import { brandExe, pngSize, pngToIco } from "./brand.js";
import { findRuntime } from "./runtime.js";

/** A plain colored square PNG (no image library needed). */
function png(size: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, size);
  hv.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raw.set([245, 186, 10, 255], y * (1 + size * 4) + 1 + x * 4);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("the exported exe looks like the game's own", () => {
  test("an icon from a PNG", () => {
    expect(pngSize(png(64))).toEqual({ width: 64, height: 64 });
    const ico = pngToIco(png(256));
    expect(ico[6]).toBe(0); // 256 is written as 0
    expect(() => pngToIco(png(300))).toThrow(/256×256/);
    expect(() => pngToIco(new Uint8Array([1, 2, 3]))).toThrow(/PNG/);
  });

  const runtime = findRuntime();
  test.skipIf(!runtime)("the runtime exe gets the game's name, version, credit note, and icon", () => {
    const out = brandExe(new Uint8Array(readFileSync(runtime!)), { title: "Sunflower Days", fileName: "Sunflower Days.exe", version: "1.2.3", iconPng: png(128) });
    const res = ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(out, { ignoreCert: true }));
    const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]!;
    expect(vi.fixedInfo.fileVersionMS).toBe((1 << 16) | 2);
    const strings = vi.getStringValues({ lang: 1033, codepage: 1200 });
    expect(strings["ProductName"]).toBe("Sunflower Days");
    expect(strings["Comments"]).toBe("Made with Himawari");
    expect(ResEdit.Resource.IconGroupEntry.fromEntries(res.entries).length).toBeGreaterThan(0);
  });
});
