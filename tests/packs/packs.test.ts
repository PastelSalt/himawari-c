/**
 * Pack fixtures shared with the C runtime's tests (runtime/tests/test_pack.c):
 * a base pack (obfuscated) with the `extend` conformance case's bytecode and
 * a few assets, and a patch that changes one file, adds one, and removes one.
 * The packer is deterministic, so the committed bytes must match.
 *
 * Regenerate (then review!) with: UPDATE_CONFORMANCE=1 corepack pnpm vitest run tests/packs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { diffForPatch, readPack, writePack } from "../../packages/core/src/pack/pack.js";

const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));
const UPDATE = process.env["UPDATE_CONFORMANCE"] === "1";
const enc = new TextEncoder();

const hwb = new Uint8Array(readFileSync(here("../conformance/cases/extend/expected.hwb")));
const notes = enc.encode("The lanterns float down the river. ".repeat(50));
const base = [
  { path: "game.hwb", data: hwb },
  { path: "assets/bg/park.png", data: enc.encode("not really a PNG") },
  { path: "assets/notes.txt", data: notes },
  { path: "assets/music/theme.ogg", data: new Uint8Array(256).map((_, i) => i) },
];
const later = [
  { path: "game.hwb", data: hwb },
  { path: "assets/notes.txt", data: enc.encode("Revised notes.") },
  { path: "assets/music/theme.ogg", data: new Uint8Array(256).map((_, i) => i) },
  { path: "assets/cg/fireworks.png", data: enc.encode("new picture") },
];

function check(name: string, bytes: Uint8Array) {
  const file = here(name);
  if (UPDATE || !existsSync(file)) writeFileSync(file, bytes);
  expect(Buffer.from(bytes).equals(readFileSync(file)), `${name} matches the packer`).toBe(true);
}

test("pack fixtures", () => {
  const data = writePack(base, { gameId: "dev.moesoft.conformance.extend", obfuscate: true });
  check("data.hwp", data);
  const shipped = new Map(readPack(data).entries.map((e) => [e.path, e]));
  const { changed, removed } = diffForPatch(shipped, later);
  expect(removed).toEqual(["assets/bg/park.png"]);
  check("patch1.hwp", writePack(changed, { gameId: "dev.moesoft.conformance.extend", priority: 1, removed }));
});
