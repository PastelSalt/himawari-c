/**
 * Text surgery for the Screenplay view. Rows are edited by rewriting their own
 * source lines only, so comments, blank lines, and every other line stay
 * byte-for-byte (the lossless-CST promise, plan §4.1), and a line keeps its
 * hidden line ID wherever it moves.
 */
import { lex } from "@himawari/core";

export interface LineInfo {
  /** Offset of the line's first character. */
  start: number;
  /** Offset of the line break (or the end of the text). */
  end: number;
  indent: string;
  /** The line without its indentation. */
  body: string;
}

export function lineAt(text: string, offset: number): LineInfo {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  let end = text.indexOf("\n", offset);
  if (end < 0) end = text.length;
  const line = text.slice(start, end).replace(/\r$/, "");
  const indent = /^ */.exec(line)![0];
  return { start, end: start + line.length, indent, body: line.slice(indent.length) };
}

/** The lines covering [from, to): from the start of the first line to the end of the last (with its line break). */
export function linesOf(text: string, from: number, to: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  let end = text.indexOf("\n", Math.max(from, to - 1));
  end = end < 0 ? text.length : end + 1;
  return { start, end };
}

/** The quoted text on a line: its raw content and where the quotes are. */
export function quotedOn(line: string): { from: number; to: number; raw: string } | null {
  const t = lex(line).tokens.find((x) => x.kind === "String");
  if (!t || !t.text.endsWith('"') || t.text.length < 2) return null;
  return { from: t.start, to: t.start + t.text.length, raw: t.text.slice(1, -1) };
}

/** Whether the `{` just before `from` has a matching `}` later (escaped pairs like `\}` don't count). */
function braceCloses(s: string, from: number): boolean {
  let depth = 1;
  for (let i = from; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return true;
  }
  return false;
}

/**
 * What a writer sees: \" shown as " (outside {…} tags). Other escapes stay visible: they are markup.
 * Two escapes the text box adds by itself are shown as typed: `\{` whose brace never closes (shown
 * as `{`), and a final `\\` (shown as `\`). Both views must round-trip while someone types, since
 * the text box re-reads the file on every keystroke (BREAK_IT.md, finding B-1).
 */
export function rawToDisplay(raw: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1]!;
      if (next === '"' && depth === 0) out += '"';
      else if (next === "{" && !braceCloses(raw, i + 2)) out += "{";
      else if (next === "\\" && i + 2 === raw.length) out += "\\";
      else out += ch + next;
      i++;
      continue;
    }
    if (ch === "{" && braceCloses(raw, i + 1)) depth++;
    if (ch === "}" && depth > 0) depth--;
    out += ch;
  }
  return out;
}

/**
 * Back to .hws: quotes outside {…} tags are escaped, a `{` that never closes becomes `\{`, and a
 * final lone `\` becomes `\\`, so whatever is typed can't break the file (an unclosed tag or an
 * escaped closing quote would).
 */
export function displayToRaw(display: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < display.length; i++) {
    const ch = display[i]!;
    if (ch === "\\") {
      if (i + 1 === display.length) {
        out += "\\\\";
        continue;
      }
      out += ch + display[i + 1]!;
      i++;
      continue;
    }
    if (ch === "{") {
      if (!braceCloses(display, i + 1)) {
        out += "\\{";
        continue;
      }
      depth++;
    }
    if (ch === "}" && depth > 0) depth--;
    out += ch === '"' && depth === 0 ? '\\"' : ch === "\n" ? "\\n" : ch;
  }
  return out;
}

export const splice = (text: string, from: number, to: number, insert: string) => text.slice(0, from) + insert + text.slice(to);

/** Replaces the quoted text of the line at `offset`. */
export function setQuoted(text: string, offset: number, display: string): string {
  const l = lineAt(text, offset);
  const lineText = text.slice(l.start, l.end);
  const q = quotedOn(lineText);
  if (!q) return text;
  return splice(text, l.start + q.from, l.start + q.to, `"${displayToRaw(display)}"`);
}

/** The part of a dialogue line before its text: speaker and attributes, e.g. `hana smile -glasses `. */
export function setSayHead(text: string, offset: number, speaker: string | null, attrs: string[]): string {
  const l = lineAt(text, offset);
  const lineText = text.slice(l.start, l.end);
  const q = quotedOn(lineText);
  if (!q) return text;
  const head = speaker ? `${[speaker, ...attrs].join(" ")} ` : "";
  return splice(text, l.start + l.indent.length, l.start + q.from, head);
}

/** Where a line's trailing line ID or comment starts (with the spaces before it), or the end of the line. */
function trailerStart(body: string): number {
  const c = lex(body).tokens.find((t) => t.kind === "LineTag" || t.kind === "Comment");
  if (!c) return body.length;
  let s = c.start;
  while (s > 0 && body[s - 1] === " ") s--;
  return s;
}

/**
 * Replaces a whole line's content, keeping its indentation, its hidden line ID, and any
 * comment after it (a coder's `# note` survives every form edit).
 */
export function setLineBody(text: string, offset: number, body: string): string {
  const l = lineAt(text, offset);
  const keep = l.body.slice(trailerStart(l.body));
  return splice(text, l.start + l.indent.length, l.end, body.trim() + keep);
}

/** The editable part of a line: without indentation, its line ID, or a trailing comment. */
export function lineBodyWithoutTag(text: string, offset: number): string {
  const body = lineAt(text, offset).body;
  return body.slice(0, trailerStart(body));
}

/** A menu option's header with "only once" and its condition set (the quoted text, ID, and comment stay). */
export function setOptionHead(text: string, offset: number, once: boolean, cond: string | null): string {
  const l = lineAt(text, offset);
  const q = quotedOn(l.body);
  if (!q) return text;
  return setLineBody(text, offset, `${once ? "once " : ""}${l.body.slice(q.from, q.to)}${cond ? ` if ${cond}` : ""}:`);
}

/** Inserts lines after the statement ending at `end`, at `indent`. Returns the text and where the first new line starts. */
export function insertAfter(text: string, end: number, indent: string, bodies: string[]): { text: string; at: number } {
  const { end: after } = linesOf(text, end, end);
  const needsBreak = after > 0 && text[after - 1] !== "\n";
  const block = bodies.map((b) => `${indent}${b}\n`).join("");
  const insert = (needsBreak ? "\n" : "") + block;
  return { text: splice(text, after, after, insert), at: after + (needsBreak ? 1 : 0) };
}

/** Deletes the lines of [from, to). */
export function deleteLines(text: string, from: number, to: number): string {
  const r = linesOf(text, from, to);
  return splice(text, r.start, r.end, "");
}

/** Moves the lines of [from, to) to just after the statement ending at `afterEnd` (same block level). */
export function moveLines(text: string, from: number, to: number, afterEnd: number): string {
  const src = linesOf(text, from, to);
  const dst = linesOf(text, afterEnd, afterEnd).end;
  if (dst >= src.start && dst <= src.end) return text;
  let block = text.slice(src.start, src.end);
  if (!block.endsWith("\n")) block += "\n";
  if (dst > src.end) return text.slice(0, src.start) + text.slice(src.end, dst) + block + text.slice(dst);
  return text.slice(0, dst) + block + text.slice(dst, src.start) + text.slice(src.end);
}

/** Moves the lines of [from, to) to just before the statement starting at `beforeStart`. */
export function moveLinesBefore(text: string, from: number, to: number, beforeStart: number): string {
  const src = linesOf(text, from, to);
  const dst = linesOf(text, beforeStart, beforeStart).start;
  if (dst >= src.start && dst <= src.end) return text;
  let block = text.slice(src.start, src.end);
  if (!block.endsWith("\n")) block += "\n";
  if (dst > src.end) return text.slice(0, src.start) + text.slice(src.end, dst) + block + text.slice(dst);
  return text.slice(0, dst) + block + text.slice(dst, src.start) + text.slice(src.end);
}

/** A copy of a statement's lines with their line IDs removed (the copy gets new ones on save). */
export function copyWithoutIds(text: string, from: number, to: number): string {
  const r = linesOf(text, from, to);
  return text.slice(r.start, r.end).replace(/\s*#line:[0-9a-hjkmnp-tv-z]{6}/g, "");
}
