/**
 * Localization string tables (plan §7). One `locales/<lang>.json` per target
 * language, keyed by line ID. Translations use the same text markup as the
 * source; placeholder parity (same variables, tags, and selects) is checked
 * so translators can't break a line.
 */
import type { AstResult } from "../syntax/ast.js";
import { type CstNode, childNodes, childTokens, isNode } from "../syntax/cst.js";
import { parseText } from "../syntax/text.js";

export type L10nStatus = "ok" | "needs-review" | "missing";

export interface L10nEntry {
  id: string;
  /** The source text when this entry was last synced or translated (markup as written). */
  source: string;
  /** The translation (markup as written), or "" when missing. */
  text: string;
  status: L10nStatus;
  provenance: "human" | "ai" | "ai-edited";
}

export interface L10nTable {
  language: string;
  sourceLanguage: string;
  lines: L10nEntry[];
}

/** A translatable line from the scripts. */
export interface SourceLine {
  id: string;
  file: string;
  scene: string;
  /** Character id for dialogue; "" for narration and menu options. */
  speaker: string;
  kind: "say" | "narration" | "option";
  /** The text between the quotes, as written. */
  text: string;
}

/** Every tagged dialogue line, narration line, and menu option, in script order. */
export function collectLines(parsed: ReadonlyMap<string, AstResult>): SourceLine[] {
  const out: SourceLine[] = [];
  for (const [file, r] of parsed) {
    let scene = "";
    const visit = (n: CstNode) => {
      if (n.kind === "SceneHeader") scene = childTokens(n, "Identifier")[1]?.text ?? "";
      const kind = n.kind === "SayStmt" ? "say" : n.kind === "NarrationStmt" ? "narration" : n.kind === "OptionHeader" ? "option" : null;
      if (kind) {
        const tag = childTokens(n, "LineTag")[0];
        const lit = childNodes(n, "Literal")[0];
        const str = lit ? childTokens(lit, "String")[0] : undefined;
        if (tag && str) {
          out.push({
            id: tag.text.slice("#line:".length),
            file,
            scene,
            speaker: kind === "say" ? (childTokens(n, "Identifier")[0]?.text ?? "") : "",
            kind,
            text: str.text.slice(1, str.text.endsWith('"') ? -1 : undefined),
          });
        }
      }
      for (const c of n.children) if (isNode(c)) visit(c);
    };
    visit(r.cst);
  }
  return out;
}

export interface SyncResult {
  table: L10nTable;
  added: number;
  changed: number;
  removed: number;
}

/** Brings a table in line with the scripts: new lines are missing, changed lines need review, deleted lines go. */
export function syncTable(existing: L10nTable | null, lines: readonly SourceLine[], language: string, sourceLanguage: string): SyncResult {
  const old = new Map((existing?.lines ?? []).map((e) => [e.id, e]));
  let added = 0;
  let changed = 0;
  const entries = lines.map((l): L10nEntry => {
    const prev = old.get(l.id);
    if (!prev) {
      added++;
      return { id: l.id, source: l.text, text: "", status: "missing", provenance: "human" };
    }
    old.delete(l.id);
    if (prev.source !== l.text) {
      changed++;
      return { ...prev, source: l.text, status: prev.text ? "needs-review" : "missing" };
    }
    return prev;
  });
  return { table: { language, sourceLanguage, lines: entries }, added, changed, removed: old.size };
}

// ---- placeholder parity ----

interface Signature {
  vars: string[];
  tags: string[];
  selects: string[];
  errors: string[];
}

/** Variables, tags (except ruby), and select variables used by a text, plus its markup errors. */
export function textSignature(markup: string): Signature {
  const r = parseText(`"${markup}"`, 0);
  const vars: string[] = [];
  const tags: string[] = [];
  const selects: string[] = [];
  const visit = (parts: ReturnType<typeof parseText>["parts"]) => {
    for (const p of parts) {
      if ("var" in p) vars.push(p.var);
      else if ("select" in p) {
        selects.push(p.select);
        for (const c of Object.values(p.cases)) visit(c);
      } else if ("tag" in p) {
        if (p.tag !== "rb") tags.push(p.tag);
        if ("children" in p) visit(p.children);
      }
    }
  };
  visit(r.parts);
  return { vars: vars.sort(), tags: tags.sort(), selects: selects.sort(), errors: r.diagnostics.map((d) => d.message) };
}

/** Why `translation` can't stand in for `source`, or [] if it can. */
export function parityProblems(source: string, translation: string): string[] {
  if (translation === "") return [];
  const s = textSignature(source);
  const t = textSignature(translation);
  const problems = [...t.errors];
  const diff = (what: string, a: string[], b: string[], show: (x: string) => string) => {
    const missing = a.filter((x) => !b.includes(x) || a.filter((y) => y === x).length > b.filter((y) => y === x).length);
    const extra = b.filter((x) => !a.includes(x) || b.filter((y) => y === x).length > a.filter((y) => y === x).length);
    for (const x of [...new Set(missing)]) problems.push(`is missing ${show(x)}`);
    for (const x of [...new Set(extra)]) problems.push(`has ${show(x)}, which the source ${what === "tag" ? "doesn't use" : "doesn't have"}`);
  };
  diff("var", s.vars, t.vars, (x) => `[${x}]`);
  diff("tag", s.tags, t.tags, (x) => `{${x}}`);
  diff("select", s.selects, t.selects, (x) => `{select ${x}: …}`);
  return problems;
}

// ---- reading and writing tables ----

export function parseTable(json: string): L10nTable {
  const raw = JSON.parse(json) as Partial<L10nTable>;
  if (typeof raw.language !== "string" || !Array.isArray(raw.lines)) throw new Error("not a Himawari string table");
  return {
    language: raw.language,
    sourceLanguage: typeof raw.sourceLanguage === "string" ? raw.sourceLanguage : "",
    lines: raw.lines.map((e) => ({
      id: String(e.id), source: String(e.source ?? ""), text: String(e.text ?? ""),
      status: (["ok", "needs-review", "missing"].includes(e.status as string) ? e.status : "missing") as L10nStatus,
      provenance: (["human", "ai", "ai-edited"].includes(e.provenance as string) ? e.provenance : "human") as L10nEntry["provenance"],
    })),
  };
}

export function stringifyTable(t: L10nTable): string {
  return `${JSON.stringify(t, null, 2)}\n`;
}

/** Applies translations (id → text) from a translator; entries that break placeholders are refused. */
export function applyTranslations(
  table: L10nTable,
  translations: ReadonlyMap<string, string>,
  provenance: L10nEntry["provenance"] = "human",
): { table: L10nTable; updated: number; refused: { id: string; problems: string[] }[]; unknown: string[] } {
  const known = new Set(table.lines.map((e) => e.id));
  const refused: { id: string; problems: string[] }[] = [];
  let updated = 0;
  const lines = table.lines.map((e) => {
    const t = translations.get(e.id);
    if (t === undefined || t === e.text) return e;
    const problems = parityProblems(e.source, t);
    if (problems.length > 0) {
      refused.push({ id: e.id, problems });
      return e;
    }
    updated++;
    // AI translations always need a human look (plan §7).
    const status: L10nStatus = t === "" ? "missing" : provenance === "human" ? "ok" : "needs-review";
    return { ...e, text: t, status, provenance };
  });
  const unknown = [...translations.keys()].filter((id) => !known.has(id));
  return { table: { ...table, lines }, updated, refused, unknown };
}
