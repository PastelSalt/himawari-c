/**
 * Canonical formatter and line-ID assignment (`hwc fmt`, plan §9.2;
 * spec/language.md §1, §3).
 *
 * Works on the lossless CST: indentation is rebuilt from block depth (4 spaces
 * per level), token spacing is normalized, runs of blank lines collapse to one,
 * trailing comments and string contents are kept verbatim, and every dialogue
 * line, narration line, and menu option gets a `#line:` ID. Duplicate IDs
 * (from copy-paste) are reassigned on the later copy.
 *
 * Files with syntax errors are returned unchanged (like gofmt), except for the
 * indentation errors the formatter itself fixes (tabs, non-multiple-of-4).
 */
import { type RandomSource, cryptoRandomSource, generateLineId } from "./ids.js";
import { type CstElement, type CstNode, isNode } from "./syntax/cst.js";
import type { Diagnostic } from "./syntax/diagnostics.js";
import { type Token, isTrivia } from "./syntax/lexer.js";
import { KEYWORDS, parse } from "./syntax/parser.js";

/** Keywords written like calls: `wait(500)`, `shake(200)`, `flash(100)`. */
const CALL_LIKE: ReadonlySet<string> = new Set(["wait", "shake", "flash"]);

export interface FormatOptions {
  /** Add missing line IDs and reassign duplicates (default true). */
  lineIds?: boolean;
  /** IDs already used elsewhere in the project, so new ones don't collide. */
  takenIds?: ReadonlySet<string>;
  random?: RandomSource;
}

export interface FormatResult {
  text: string;
  changed: boolean;
  /** Present when the file was left unchanged because of syntax errors. */
  refused: Diagnostic[] | null;
  /** IDs added to lines that had none. */
  added: string[];
  /** Duplicate IDs that were replaced: [old, new]. */
  reassigned: [string, string][];
}

const FIXABLE: ReadonlySet<string> = new Set(["HW0001", "HW0006"]);

/** Nodes made of other lines plus blocks. Everything else is one line. */
const COMPOUND: ReadonlySet<string> = new Set([
  "SceneDecl", "DefineDecl", "IfStmt", "IfClause", "MenuStmt", "MenuOption",
]);

/** Line kinds that carry a line ID (plus menu headers that have a prompt). */
const NEEDS_ID: ReadonlySet<string> = new Set(["SayStmt", "NarrationStmt", "OptionHeader"]);

const INDENT = "    ";
const TAG_SEP = "   ";

export function format(source: string, options: FormatOptions = {}): FormatResult {
  const { root, diagnostics } = parse(source);
  const blocking = diagnostics.filter((d) => d.severity === "error" && !FIXABLE.has(d.code));
  if (blocking.length > 0) {
    return { text: source, changed: false, refused: blocking, added: [], reassigned: [] };
  }

  const f = new Formatter(options);
  f.collectIds(root);
  for (const child of root.children) {
    if (isNode(child)) f.node(child, 0);
  }
  const text = f.finish();
  return { text, changed: text !== source, refused: null, added: f.added, reassigned: f.reassigned };
}

class Formatter {
  private readonly lines: string[] = [];
  readonly added: string[] = [];
  readonly reassigned: [string, string][] = [];
  private readonly taken = new Set<string>();
  private readonly seen = new Set<string>();
  private readonly lineIds: boolean;
  private readonly random: RandomSource;
  private lastWasHeader = false;

  constructor(options: FormatOptions) {
    this.lineIds = options.lineIds ?? true;
    this.random = options.random ?? cryptoRandomSource;
    for (const id of options.takenIds ?? []) this.taken.add(id);
  }

  /** Every ID present in the file is reserved before any new one is generated. */
  collectIds(root: CstNode): void {
    for (const t of allTokens(root)) {
      if (t.kind === "LineTag") this.taken.add(t.text.trim().slice(6));
    }
  }

  node(n: CstNode, depth: number): void {
    if (COMPOUND.has(n.kind)) {
      for (const child of n.children) {
        if (!isNode(child)) continue;
        if (child.kind === "Block") {
          for (const item of child.children) if (isNode(item)) this.node(item, depth + 1);
        } else {
          this.node(child, depth);
        }
      }
      return;
    }
    this.line(n, depth);
  }

  private line(n: CstNode, depth: number): void {
    const parts: { tok: Token; parent: string }[] = [];
    collect(n, n.kind, parts);
    const sig = parts.filter((p) => !isTrivia(p.tok.kind));
    const comment = parts.find((p) => p.tok.kind === "Comment")?.tok;
    let tag = parts.find((p) => p.tok.kind === "LineTag")?.tok.text.trim();

    if (sig.length === 0 && !comment && !tag) {
      // Blank line: at most one in a row, none at the start of a block.
      const prev = this.lines[this.lines.length - 1];
      if (prev !== undefined && prev !== "" && !this.lastWasHeader) this.lines.push("");
      return;
    }
    this.lastWasHeader = n.kind.endsWith("Header");

    let text = "";
    for (let i = 0; i < sig.length; i++) {
      const cur = sig[i] as { tok: Token; parent: string };
      const prev = sig[i - 1];
      if (prev && spaceBetween(prev, cur)) text += " ";
      text += cur.tok.text;
    }

    const isPrompt = n.kind === "MenuHeader" && sig.some((p) => p.tok.kind === "String");
    if (this.lineIds && (NEEDS_ID.has(n.kind) || isPrompt)) {
      const id = tag?.slice(6);
      if (!id) {
        const fresh = this.fresh();
        this.added.push(fresh);
        tag = `#line:${fresh}`;
      } else if (this.seen.has(id)) {
        const fresh = this.fresh();
        this.reassigned.push([id, fresh]);
        tag = `#line:${fresh}`;
      }
      this.seen.add((tag as string).slice(6));
    }

    // The tag comes first so a trailing comment can't swallow it: `"…"   #line:k3f9a1  # note`.
    const trailing = [tag, comment?.text.trimEnd()].filter((s): s is string => !!s).join("  ");
    if (text === "") {
      text = trailing;
    } else if (trailing) {
      text += TAG_SEP + trailing;
    }
    this.lines.push(INDENT.repeat(depth) + text);
  }

  private fresh(): string {
    const id = generateLineId(this.taken, this.random);
    this.taken.add(id);
    return id;
  }

  finish(): string {
    while (this.lines.length > 0 && this.lines[this.lines.length - 1] === "") this.lines.pop();
    // One blank line before each top-level scene/define, unless a comment directly describes it.
    const out: string[] = [];
    for (const l of this.lines) {
      const prev = out[out.length - 1];
      const isTop = /^(scene|define)\b/.test(l);
      if (isTop && prev !== undefined && prev !== "" && !prev.startsWith("#")) out.push("");
      out.push(l);
    }
    return out.length === 0 ? "" : out.join("\n") + "\n";
  }
}

function collect(e: CstElement, parent: string, out: { tok: Token; parent: string }[]): void {
  if (!isNode(e)) {
    out.push({ tok: e, parent });
    return;
  }
  for (const c of e.children) collect(c, e.kind, out);
}

function* allTokens(e: CstElement): Generator<Token> {
  if (!isNode(e)) {
    yield e;
    return;
  }
  for (const c of e.children) yield* allTokens(c);
}

/** Canonical spacing between two significant tokens on a line. */
function spaceBetween(prev: { tok: Token; parent: string }, cur: { tok: Token; parent: string }): boolean {
  const p = prev.tok.kind;
  const c = cur.tok.kind;
  if (c === "Colon" || c === "Comma" || c === "RParen") return false;
  if (p === "LParen") return false;
  if (c === "LParen") {
    // f(x), fade(300), wait(500), shake(200); but keywords like `if (a)` and `not (b)` keep a space.
    return !(p === "Identifier" && (!KEYWORDS.has(prev.tok.text) || CALL_LIKE.has(prev.tok.text)));
  }
  if (p === "Minus" && (prev.parent === "UnaryExpr" || prev.parent === "Attr")) return false; // -1, -glasses
  return true;
}
