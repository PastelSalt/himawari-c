/**
 * Structured edits (plan §9.1 `edit`, §10.3 `patch_scene`). Edits are anchored
 * on line IDs, never line numbers or diffs (plan §10.2). They change only the
 * lines they touch, so comments and layout elsewhere stay byte-for-byte; new
 * lines get fresh line IDs; and a batch that would introduce a syntax error
 * is rejected as a whole, returning the original text.
 *
 * Shared by the Screenplay view, quick fixes, refactors, and MCP.
 */
import { type RandomSource, cryptoRandomSource, generateLineId } from "./ids.js";
import { type CstNode, childNodes, childTokens, isNode, lineText, spanOf } from "./syntax/cst.js";
import type { Diagnostic, Span } from "./syntax/diagnostics.js";
import { type Token, isTrivia, lex } from "./syntax/lexer.js";
import { parse } from "./syntax/parser.js";

export type EditOp =
  /** Insert statements after a line (after its whole block, for menu options). */
  | { op: "insert_after"; lineId: string; hws: string }
  /** Insert statements before a line. */
  | { op: "insert_before"; lineId: string; hws: string }
  /** Append statements at the end of a scene. */
  | { op: "append_to_scene"; scene: string; hws: string }
  /** Replace the quoted text of a dialogue line, narration line, or menu option (.hws string content, markup allowed). */
  | { op: "replace_text"; lineId: string; text: string }
  /** Change the attributes written on a dialogue line: `hana surprised -glasses "…"`. */
  | { op: "set_attrs"; lineId: string; add?: string[]; remove?: string[] }
  /** Delete lines (a menu option is deleted with its block). */
  | { op: "delete"; lineIds: string[] }
  /** Move lines, in document order, to just after another line. */
  | { op: "move"; lineIds: string[]; afterLineId: string };

export interface EditOptions {
  /** Line IDs used elsewhere in the project, so new ones don't collide. */
  takenIds?: ReadonlySet<string>;
  random?: RandomSource;
}

export interface EditResult {
  ok: boolean;
  /** The edited text, or the original when `ok` is false. */
  text: string;
  /** Why the batch was rejected. */
  error?: string;
  /** Syntax diagnostics of the result (or of the rejected attempt). */
  diagnostics: Diagnostic[];
  /** Line IDs given to inserted lines. */
  addedIds: string[];
}

class EditError extends Error {}

/** Lines that carry IDs, and the statement each one belongs to. */
interface Located {
  /** The node owning the ID's line: SayStmt, NarrationStmt, or OptionHeader. */
  line: CstNode;
  /** The whole statement: the line itself, or the MenuOption around an OptionHeader. */
  unit: CstNode;
  /** The line's indentation. */
  indent: string;
}

export function applyEdits(source: string, ops: readonly EditOp[], options: EditOptions = {}): EditResult {
  const before = parse(source).diagnostics.filter((d) => d.severity === "error").length;
  const taken = new Set(options.takenIds ?? []);
  for (const t of lex(source).tokens) if (t.kind === "LineTag") taken.add(t.text.slice(6));
  const random = options.random ?? cryptoRandomSource;
  const addedIds: string[] = [];

  let text = source;
  try {
    for (const op of ops) {
      const r = applyOne(text, op);
      text = r.text;
      if (r.inserted) {
        const tagged = addLineIds(text, r.inserted, taken, random);
        text = tagged.text;
        addedIds.push(...tagged.added);
      }
    }
  } catch (e) {
    if (e instanceof EditError) return { ok: false, text: source, error: e.message, diagnostics: [], addedIds: [] };
    throw e;
  }

  const diagnostics = parse(text).diagnostics;
  const after = diagnostics.filter((d) => d.severity === "error").length;
  if (after > before) {
    return { ok: false, text: source, error: "the edit would introduce syntax errors", diagnostics, addedIds: [] };
  }
  return { ok: true, text, diagnostics, addedIds };
}

function applyOne(text: string, op: EditOp): { text: string; inserted?: Span } {
  const root = parse(text).root;
  switch (op.op) {
    case "insert_after":
    case "insert_before": {
      const at = locate(root, op.lineId);
      const span = unitSpan(at.unit);
      return insertAt(text, op.op === "insert_after" ? span.end : span.start, at.indent, op.hws);
    }
    case "append_to_scene": {
      const scene = childNodes(root, "SceneDecl").find((s) => childTokens(s.children[0] as CstNode, "Identifier")[1]?.text === op.scene);
      if (!scene) throw new EditError(`no scene called "${op.scene}" in this file`);
      const block = childNodes(scene, "Block")[0];
      const stmts = block ? block.children.filter((c): c is CstNode => isNode(c) && c.kind !== "BlankLine" && c.kind !== "CommentLine") : [];
      const last = stmts[stmts.length - 1];
      const indent = last ? indentOf(last) : "    ";
      return insertAt(text, last ? unitSpan(last).end : (spanOf(scene)?.end ?? text.length), indent, op.hws);
    }
    case "replace_text": {
      const at = locate(root, op.lineId);
      const tok = lineText(at.line);
      if (!tok) throw new EditError(`line ${op.lineId} has no text to replace`);
      return { text: splice(text, { start: tok.start, end: tok.start + tok.text.length }, `"${op.text}"`) };
    }
    case "set_attrs": {
      const at = locate(root, op.lineId);
      if (at.line.kind !== "SayStmt") throw new EditError(`line ${op.lineId} isn't a dialogue line, so it has no attributes`);
      const add = op.add ?? [];
      const remove = op.remove ?? [];
      for (const a of [...add, ...remove]) if (!/^[a-z_][a-z0-9_]*$/.test(a)) throw new EditError(`"${a}" isn't a valid attribute name`);
      const changed = new Set([...add, ...remove]);
      const kept = childNodes(at.line, "Attr")
        .map((a) => ({ name: childTokens(a, "Identifier")[0]?.text ?? "", minus: childTokens(a, "Minus").length > 0 }))
        .filter((a) => !changed.has(a.name))
        .map((a) => (a.minus ? `-${a.name}` : a.name));
      const words = [...kept, ...add, ...remove.map((r) => `-${r}`)];
      const speaker = childTokens(at.line, "Identifier")[0] as Token;
      const lit = childNodes(at.line, "Literal")[0];
      const str = lit ? childTokens(lit, "String")[0] : undefined;
      if (!str) throw new EditError(`line ${op.lineId} has no text`);
      const span = { start: speaker.start + speaker.text.length, end: str.start };
      return { text: splice(text, span, ` ${words.length > 0 ? `${words.join(" ")} ` : ""}`) };
    }
    case "delete": {
      const spans = op.lineIds.map((id) => unitSpan(locate(root, id).unit));
      return { text: removeSpans(text, spans) };
    }
    case "move": {
      if (op.lineIds.includes(op.afterLineId)) throw new EditError("can't move a line after itself");
      const units = op.lineIds.map((id) => locate(root, id).unit);
      const anchorUnit = locate(root, op.afterLineId).unit;
      const anchorSpan = unitSpan(anchorUnit);
      const spans = units.map(unitSpan).sort((a, b) => a.start - b.start);
      for (const s of spans) {
        if (anchorSpan.start >= s.start && anchorSpan.end <= s.end) throw new EditError("can't move a line into its own block");
      }
      const moved = spans.map((s) => dedent(withNewline(text.slice(s.start, s.end)))).join("");
      const removed = removeSpans(text, spans);
      // Re-locate the anchor in the text without the moved lines, then insert there.
      const at = locate(parse(removed).root, op.afterLineId);
      const r = insertAt(removed, unitSpan(at.unit).end, at.indent, moved);
      return { text: r.text }; // moved lines keep their IDs
    }
  }
}

// ---- locating ----

function locate(root: CstNode, lineId: string): Located {
  let found: Located | undefined;
  const visit = (n: CstNode) => {
    if (found) return;
    if (n.kind === "SayStmt" || n.kind === "NarrationStmt" || n.kind === "InvokeStmt") {
      if (hasTag(n, lineId)) found = { line: n, unit: n, indent: indentOf(n) };
      return;
    }
    if (n.kind === "MenuOption") {
      const header = n.children[0] as CstNode;
      if (hasTag(header, lineId)) {
        found = { line: header, unit: n, indent: indentOf(header) };
        return;
      }
    }
    for (const c of n.children) if (isNode(c)) visit(c);
  };
  visit(root);
  if (!found) throw new EditError(`no line with ID ${lineId}`);
  return found;
}

function hasTag(line: CstNode, id: string): boolean {
  return childTokens(line, "LineTag").some((t) => t.text === `#line:${id}`);
}

/** Indentation of a line node (or of the first line of a compound node). */
function indentOf(n: CstNode): string {
  const first = n.children[0];
  if (!first) return "";
  if (isNode(first)) return indentOf(first);
  return first.kind === "Indent" ? first.text : "";
}

/** The whole statement as full lines: from the start of its first line to after its last newline. */
function unitSpan(unit: CstNode): Span {
  return spanOf(unit) ?? { start: 0, end: 0 };
}

// ---- text helpers ----

function splice(text: string, span: Span, insert: string): string {
  return text.slice(0, span.start) + insert + text.slice(span.end);
}

/** Removes spans; a span inside another (a line inside a deleted option) is covered by the outer one. */
function removeSpans(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  let out = text;
  for (const s of merged.reverse()) out = out.slice(0, s.start) + out.slice(s.end);
  return out;
}

function withNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

/** Removes the common leading indentation of non-blank lines. */
function dedent(s: string): string {
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  const widths = lines.filter((l) => l.trim() !== "").map((l) => (/^ */.exec(l) as RegExpExecArray)[0].length);
  const min = widths.length > 0 ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(Math.min(min, (/^ */.exec(l) as RegExpExecArray)[0].length))).join("\n");
}

/** Inserts `hws` (re-indented to `indent`) at the line boundary `offset`. */
function insertAt(text: string, offset: number, indent: string, hws: string): { text: string; inserted: Span } {
  const body = dedent(hws).replace(/\n+$/, "");
  if (body.trim() === "") throw new EditError("nothing to insert");
  const lines = body.split("\n").map((l) => (l.trim() === "" ? "" : indent + l));
  let prefix = text.slice(0, offset);
  if (prefix.length > 0 && !prefix.endsWith("\n")) prefix += "\n";
  const block = `${lines.join("\n")}\n`;
  return { text: prefix + block + text.slice(offset), inserted: { start: prefix.length, end: prefix.length + block.length } };
}

/**
 * Adds `#line:` IDs to dialogue, narration, and option lines inside `within`
 * that lack one. Nothing else in the file changes.
 */
export function addLineIds(
  source: string,
  within: Span,
  taken: Set<string>,
  random: RandomSource = cryptoRandomSource,
): { text: string; added: string[] } {
  const root = parse(source).root;
  const inserts: { at: number; text: string }[] = [];
  const added: string[] = [];
  const visit = (n: CstNode) => {
    const isLine = n.kind === "SayStmt" || n.kind === "NarrationStmt" || n.kind === "OptionHeader" || (n.kind === "InvokeStmt" && lineText(n) !== undefined);
    if (isLine) {
      const span = spanOf(n);
      if (span && span.start >= within.start && span.start < within.end && childTokens(n, "LineTag").length === 0) {
        const id = generateLineId(taken, random);
        taken.add(id);
        added.push(id);
        const comment = childTokens(n, "Comment")[0];
        const sig = allTokens(n).filter((t) => !isTrivia(t.kind));
        const last = sig[sig.length - 1];
        if (comment) inserts.push({ at: comment.start, text: `#line:${id}  ` });
        else if (last) inserts.push({ at: last.start + last.text.length, text: `   #line:${id}` });
      }
    }
    for (const c of n.children) if (isNode(c)) visit(c);
  };
  visit(root);
  let text = source;
  for (const ins of inserts.sort((a, b) => b.at - a.at)) text = text.slice(0, ins.at) + ins.text + text.slice(ins.at);
  return { text, added };
}

function allTokens(n: CstNode): Token[] {
  const out: Token[] = [];
  const visit = (e: CstNode) => {
    for (const c of e.children) {
      if (isNode(c)) visit(c);
      else out.push(c);
    }
  };
  visit(n);
  return out;
}
