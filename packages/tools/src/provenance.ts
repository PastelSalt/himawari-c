/**
 * AI provenance (plan §16.4): `.himawari/provenance.json` records which text
 * an AI wrote, with a hash of the text at the time. Text not listed is human.
 * When the text no longer matches its hash, a human changed it after the AI:
 * it reports as `ai-edited`. The file is committed, so teams can audit it.
 */
import { createHash } from "node:crypto";
import type { ProjectFs } from "./fs.js";

export const PROVENANCE_FILE = ".himawari/provenance.json";

export interface ProvenanceEntry {
  provenance: "ai" | "ai-edited";
  hash: string;
  /** When the AI last wrote it (ISO 8601). */
  at: string;
}

export interface ProvenanceFile {
  version: 1;
  /** Dialogue, narration, menu options and prompts, by line ID. */
  lines: Record<string, ProvenanceEntry>;
  /** Translations, by "<lang>:<line ID>". */
  translations: Record<string, ProvenanceEntry>;
  /** Character bibles, by character id. */
  characters: Record<string, ProvenanceEntry>;
}

export const textHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export function readProvenance(fs: ProjectFs): ProvenanceFile {
  const empty: ProvenanceFile = { version: 1, lines: {}, translations: {}, characters: {} };
  if (!fs.exists(PROVENANCE_FILE)) return empty;
  try {
    const p = JSON.parse(fs.read(PROVENANCE_FILE)) as Partial<ProvenanceFile>;
    return { version: 1, lines: p.lines ?? {}, translations: p.translations ?? {}, characters: p.characters ?? {} };
  } catch {
    return empty;
  }
}

/** Stamps items as AI-written. `kind` picks the table; `items` maps key → current text. */
export function stampAi(fs: ProjectFs, kind: "lines" | "translations" | "characters", items: ReadonlyMap<string, string>, edited = false): void {
  if (items.size === 0) return;
  const p = readProvenance(fs);
  const at = new Date().toISOString();
  for (const [key, text] of items) {
    // An AI rewrite of a human line is "ai-edited"; of an AI line, still "ai".
    const prior = p[kind][key];
    const provenance = edited && prior?.provenance !== "ai" ? "ai-edited" : "ai";
    p[kind][key] = { provenance, hash: textHash(text), at };
  }
  const sorted = (o: Record<string, ProvenanceEntry>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.write(PROVENANCE_FILE, `${JSON.stringify({ version: 1, lines: sorted(p.lines), translations: sorted(p.translations), characters: sorted(p.characters) }, null, 2)}\n`);
}

/** The provenance of an item now: human (not listed), ai, or ai-edited (listed, but changed since). */
export function provenanceNow(entry: ProvenanceEntry | undefined, text: string | undefined): "human" | "ai" | "ai-edited" {
  if (!entry) return "human";
  if (text !== undefined && textHash(text) !== entry.hash) return "ai-edited";
  return entry.provenance;
}
