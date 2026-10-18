import { describe, expect, test } from "vitest";
import { xxh64, xxh64String } from "./hash.js";
import { lz4Compress, lz4Decompress } from "./lz4.js";
import { Codec, PackError, diffForPatch, normalizePackPath, readPack, writePack } from "./pack.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("xxHash64", () => {
  test("matches the reference vectors", () => {
    expect(xxh64(new Uint8Array(0))).toBe(0xef46db3751d8e999n);
    expect(xxh64String("abc")).toBe(0x44bc2cf5ad770999n);
    expect(xxh64String("Nobody inspects the spammish repetition")).toBe(0xfbcea83c8a378bf1n);
  });
});

describe("LZ4", () => {
  test("round-trips text, repeats, random bytes, and tiny inputs", () => {
    const random = new Uint8Array(5000);
    let x = 12345;
    for (let i = 0; i < random.length; i++) random[i] = (x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 24;
    const cases = [new Uint8Array(0), bytes("a"), bytes("abcdefghijkl"), bytes("hana ".repeat(2000)), new Uint8Array(70000).fill(7), random];
    for (const c of cases) {
      const packed = lz4Compress(c);
      expect(lz4Decompress(packed, c.length)).toEqual(c);
    }
    expect(lz4Compress(bytes("hana ".repeat(2000))).length).toBeLessThan(200);
  });
});

describe("packs", () => {
  const files = [
    { path: "game.hwb", data: bytes("HWB fake ".repeat(40)) },
    { path: "assets/bg/Park.PNG", data: bytes("\x89PNG not really") },
    { path: "assets\\music\\theme.ogg", data: new Uint8Array(300).fill(3) },
  ];

  test("round-trip, with normalized paths, codecs, and obfuscation", () => {
    for (const obfuscate of [false, true]) {
      const pack = writePack(files, { gameId: "dev.example.t", obfuscate });
      const r = readPack(pack);
      expect(r.obfuscated).toBe(obfuscate);
      expect(r.game).toBe(xxh64String("dev.example.t"));
      const byPath = new Map(r.entries.map((e) => [e.path, e]));
      expect([...byPath.keys()].sort()).toEqual(["assets/bg/park.png", "assets/music/theme.ogg", "game.hwb"]);
      expect(byPath.get("game.hwb")?.codec).toBe(Codec.lz4); // compressible
      expect(byPath.get("assets/music/theme.ogg")?.codec).toBe(Codec.store); // already compressed formats are stored
      expect(byPath.get("game.hwb")?.data).toEqual(files[0]?.data);
      if (obfuscate) expect(new TextDecoder().decode(pack).includes("park.png")).toBe(false);
    }
    expect(writePack(files, { gameId: "x" })).toEqual(writePack([...files].reverse(), { gameId: "x" })); // deterministic
  });

  test("patches hold what changed and remove what's gone", () => {
    const base = readPack(writePack(files, { gameId: "g" }));
    const now = [{ path: "game.hwb", data: bytes("changed") }, files[1] as (typeof files)[number], { path: "assets/cg/new.png", data: bytes("new") }];
    const { changed, removed } = diffForPatch(new Map(base.entries.map((e) => [e.path, e])), now);
    expect(changed.map((f) => normalizePackPath(f.path)).sort()).toEqual(["assets/cg/new.png", "game.hwb"]);
    expect(removed).toEqual(["assets/music/theme.ogg"]);
    const patch = readPack(writePack(changed, { gameId: "g", priority: 1, removed }));
    expect(patch.priority).toBe(1);
    expect(patch.entries.find((e) => e.path === "assets/music/theme.ogg")).toMatchObject({ codec: Codec.removed, data: null });
  });

  test("refuses damage", () => {
    const pack = writePack(files, { gameId: "g" });
    const bad = Uint8Array.from(pack);
    bad[bad.length - 3] = (bad[bad.length - 3] as number) ^ 1; // the names
    expect(() => readPack(bad)).toThrow(PackError);
    expect(() => readPack(pack.subarray(0, 40))).toThrow(PackError);
    expect(() => writePack([files[0] as (typeof files)[number], { path: "GAME.hwb", data: bytes("x") }], { gameId: "g" })).toThrow(/twice/);
  });
});
