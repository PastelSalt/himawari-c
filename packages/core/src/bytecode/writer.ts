/** Serializes an HwbModule to .hwb bytes (spec/bytecode.md §1–2). */
import { crc32 } from "./crc32.js";
import { FLAG_DEBUG, HEADER_SIZE, type HwbModule, MAGIC } from "./format.js";

/** A section's content as 32-bit words (STRS is built separately because it holds bytes). */
function words(...parts: (number | readonly number[])[]): Uint8Array {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") flat.push(p);
    else flat.push(...p);
  }
  const out = new Uint8Array(flat.length * 4);
  const view = new DataView(out.buffer);
  flat.forEach((w, i) => view.setUint32(i * 4, w >>> 0, true));
  return out;
}

function stringsSection(strings: readonly string[]): Uint8Array {
  const enc = new TextEncoder();
  const encoded = strings.map((s) => enc.encode(s));
  const headerBytes = 4 + 4 * strings.length;
  const offsets: number[] = [];
  let pos = headerBytes;
  for (const e of encoded) {
    offsets.push(pos);
    pos += e.length + 1;
  }
  const out = new Uint8Array((pos + 3) & ~3);
  out.set(words(strings.length, offsets), 0);
  encoded.forEach((e, i) => out.set(e, offsets[i] as number));
  return out;
}

export function writeHwb(m: HwbModule): Uint8Array {
  const enumValues: number[] = [];
  const varEntries: number[] = [];
  for (const v of m.vars) {
    varEntries.push(v.name, v.type | (v.scope << 8), v.default, v.enumValues.length > 0 ? enumValues.length : 0, v.enumValues.length);
    enumValues.push(...v.enumValues);
  }

  const textOffsets: number[] = [];
  const textWords: number[] = [];
  for (const t of m.texts) {
    textOffsets.push(textWords.length);
    textWords.push(...t);
  }

  const mt = m.meta;
  const sections: [string, Uint8Array][] = [
    ["META", words(mt.title, mt.id, mt.width, mt.height, mt.sourceLanguage, mt.languages.length, mt.languages,
      mt.positions.length, mt.positions.flatMap((p) => [p.name, p.x, p.y]))],
    ["STRS", stringsSection(m.strings)],
    ["VARS", words(m.vars.length, varEntries, enumValues.length, enumValues)],
    ["CHAR", words(m.chars.length, m.chars.flatMap((c) => [c.id, c.name, c.color]))],
    ["SCNE", words(m.scenes.length, m.scenes.flatMap((s) => [s.name, s.entryPc, s.file]), m.entryScene)],
    ["LINE", words(m.lines.length, m.lines.flatMap((l) => [l.lineId, l.speaker, l.text, l.flags]))],
    ["TEXT", words(m.texts.length, textOffsets, textWords.length, textWords)],
    ["CODE", words(m.code.length, m.code)],
  ];
  if (m.locales.length > 0) {
    const table: number[] = [];
    const entries: number[] = [];
    for (const l of m.locales) {
      entries.push(l.language, table.length);
      table.push(...l.lineTexts, ...l.charNames);
    }
    sections.push(["LOCL", words(m.locales.length, entries, table.length, table)]);
  }
  if (m.sprites.length > 0) {
    const entries: number[] = [];
    const groups: number[] = [];
    const presets: number[] = [];
    const rules: number[] = [];
    const pool: number[] = [];
    const list = (xs: readonly number[]) => {
      pool.push(...xs);
      return [pool.length - xs.length, xs.length];
    };
    for (const s of m.sprites) {
      entries.push(s.char, s.root, s.anchorX, s.anchorY, s.scale, groups.length / 6, s.groups.length, presets.length / 3, s.presets.length,
        rules.length / 4, s.rules.length);
      for (const g of s.groups) groups.push(g.name, g.flags, ...list(g.defaults), ...list(g.attrs));
      for (const p of s.presets) presets.push(p.name, ...list(p.layers.flat()).map((v, i) => (i === 1 ? v / 2 : v)));
      for (const r of s.rules) rules.push(r.hide, r.show, ...list(r.when));
    }
    sections.push(["SPRT", words(m.sprites.length, entries, groups.length / 6, groups, presets.length / 3, presets, rules.length / 4, rules,
      pool.length, pool)]);
  }
  if (m.debug) sections.push(["DBUG", words(m.debug.length, m.debug.flatMap((d) => [d.pc, d.file, d.line]))]);

  const tableSize = sections.length * 12;
  let offset = HEADER_SIZE + tableSize;
  const placed = sections.map(([tag, data]) => {
    const at = offset;
    offset += data.length; // every section is already a multiple of 4 bytes
    return { tag, data, at };
  });

  const out = new Uint8Array(offset);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint16(4, m.major, true);
  view.setUint16(6, m.minor, true);
  view.setUint32(8, m.debug ? FLAG_DEBUG : 0, true);
  view.setUint32(12, sections.length, true);
  view.setUint32(16, out.length, true);
  placed.forEach((s, i) => {
    const e = HEADER_SIZE + i * 12;
    for (let k = 0; k < 4; k++) out[e + k] = s.tag.charCodeAt(k);
    view.setUint32(e + 4, s.at, true);
    view.setUint32(e + 8, s.data.length, true);
    out.set(s.data, s.at);
  });
  view.setUint32(20, crc32(out), true); // computed with the crc field still 0
  return out;
}
