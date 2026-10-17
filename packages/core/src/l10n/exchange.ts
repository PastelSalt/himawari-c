/**
 * Translator exchange formats (plan §7): CSV/TSV-style spreadsheets and
 * XLIFF 2.0 for CAT tools. Both carry the line ID, context (scene, speaker),
 * source, and translation, and both round-trip through `applyTranslations`.
 */
import type { L10nTable, SourceLine } from "./table.js";

// ---- CSV (RFC 4180) ----

const CSV_HEADER = ["id", "scene", "speaker", "source", "translation", "status"];

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 BOM so spreadsheet apps detect the encoding. */
export function toCsv(table: L10nTable, lines: readonly SourceLine[]): string {
  const ctx = new Map(lines.map((l) => [l.id, l]));
  const rows = [CSV_HEADER];
  for (const e of table.lines) {
    const l = ctx.get(e.id);
    rows.push([e.id, l?.scene ?? "", l?.speaker ?? "", e.source, e.text, e.status]);
  }
  return `﻿${rows.map((r) => r.map(csvField).join(",")).join("\r\n")}\r\n`;
}

/** Parses RFC 4180 CSV into rows. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** id → translation from an exported (and edited) CSV. */
export function translationsFromCsv(text: string): Map<string, string> {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const idCol = header.indexOf("id");
  const trCol = header.indexOf("translation");
  if (idCol < 0 || trCol < 0) throw new Error('the CSV needs "id" and "translation" columns');
  const out = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const id = r[idCol];
    if (id) out.set(id, r[trCol] ?? "");
  }
  return out;
}

// ---- XLIFF 2.0 ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const XLIFF_STATE = { ok: "reviewed", "needs-review": "translated", missing: "initial" } as const;

export function toXliff(table: L10nTable, lines: readonly SourceLine[]): string {
  const ctx = new Map(lines.map((l) => [l.id, l]));
  const units = table.lines.map((e) => {
    const l = ctx.get(e.id);
    const notes = [
      l?.scene ? `<note category="scene">${esc(l.scene)}</note>` : "",
      l?.speaker ? `<note category="speaker">${esc(l.speaker)}</note>` : "",
    ].filter(Boolean);
    return [
      `    <unit id="${esc(e.id)}">`,
      notes.length ? `      <notes>${notes.join("")}</notes>` : "",
      `      <segment state="${XLIFF_STATE[e.status]}">`,
      `        <source>${esc(e.source)}</source>`,
      `        <target>${esc(e.text)}</target>`,
      "      </segment>",
      "    </unit>",
    ].filter(Boolean).join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="${esc(table.sourceLanguage)}" trgLang="${esc(table.language)}">`,
    '  <file id="script">',
    ...units,
    "  </file>",
    "</xliff>",
    "",
  ].join("\n");
}

/** id → target text from an XLIFF 2.0 file (as exported, after translation). */
export function translationsFromXliff(text: string): Map<string, string> {
  if (!/<xliff[^>]*version="2\.\d"/.test(text)) throw new Error("not an XLIFF 2 file");
  const out = new Map<string, string>();
  const unit = /<unit\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/unit>/g;
  for (const m of text.matchAll(unit)) {
    const body = m[2] as string;
    const target = /<target(?:\s[^>]*)?>([\s\S]*?)<\/target>|<target(?:\s[^>]*)?\/>/.exec(body);
    if (target) out.set(unesc(m[1] as string), unesc(target[1] ?? ""));
  }
  return out;
}
