/**
 * Error-recovering CST parser for Himawari Script (spec/language.md, plan §9.1).
 *
 * The language puts one statement on each line, so recovery is line-scoped:
 * a broken line becomes an error node with one diagnostic and parsing goes on
 * with the next line. Blocks are formed by indentation. The tree is lossless:
 * every token, including trivia, lands in exactly one node.
 */
import { type Diagnostic, type Span, diagnostic } from "./diagnostics.js";
import { type Token, isTrivia, lex } from "./lexer.js";
import type { CstElement, CstNode, NodeKind } from "./cst.js";

export interface ParseResult {
  root: CstNode;
  diagnostics: Diagnostic[];
}

/** Reserved words: never valid as speaker, scene, character, or variable names. */
export const KEYWORDS: ReadonlySet<string> = new Set([
  "scene", "define", "jump", "call", "return", "end", "if", "elif", "else", "menu", "once",
  "show", "hide", "move", "bg", "cg", "music", "sfx", "ambient", "voice", "stop", "wait",
  "shake", "flash", "with", "at", "and", "or", "not", "true", "false",
]);

type Ctx = "file" | "scene" | "menu";

interface Line {
  leading: Token[]; // Bom and/or Indent
  content: Token[]; // between the indent and the newline
  newline: Token | undefined;
  indent: number; // columns; a tab counts as 4
  blank: boolean; // no significant tokens
}

export function parse(source: string): ParseResult {
  const { tokens, diagnostics } = lex(source);
  const parser = new Parser(splitLines(tokens), diagnostics);
  return { root: parser.parseFile(), diagnostics };
}

function splitLines(tokens: Token[]): Line[] {
  const lines: Line[] = [];
  let cur: Token[] = [];
  for (const t of tokens) {
    cur.push(t);
    if (t.kind === "Newline") {
      lines.push(makeLine(cur));
      cur = [];
    }
  }
  if (cur.length > 0) lines.push(makeLine(cur));
  return lines;
}

function makeLine(toks: Token[]): Line {
  let k = 0;
  const leading: Token[] = [];
  while (k < toks.length && (toks[k]?.kind === "Bom" || toks[k]?.kind === "Indent")) {
    leading.push(toks[k] as Token);
    k++;
  }
  let end = toks.length;
  let newline: Token | undefined;
  if (end > k && toks[end - 1]?.kind === "Newline") {
    newline = toks[end - 1];
    end--;
  }
  const content = toks.slice(k, end);
  const indentTok = leading.find((t) => t.kind === "Indent");
  let indent = 0;
  for (const ch of indentTok?.text ?? "") indent += ch === "\t" ? 4 : 1;
  return { leading, content, newline, indent, blank: !content.some((t) => !isTrivia(t.kind)) };
}

function tokenSpan(t: Token): Span {
  return { start: t.start, end: t.start + t.text.length };
}

function lineSpan(line: Line): Span {
  const sig = line.content.filter((t) => !isTrivia(t.kind));
  const first = sig[0];
  const last = sig[sig.length - 1];
  if (!first || !last) {
    const anchor = line.leading[0] ?? line.newline;
    return anchor ? tokenSpan(anchor) : { start: 0, end: 0 };
  }
  return { start: first.start, end: last.start + last.text.length };
}

const isKw = (t: Token | undefined, kw: string) => t?.kind === "Identifier" && t.text === kw;

/** Walks one line's content tokens and builds nodes, keeping trivia in place. */
class Cursor {
  private i = 0;
  private readonly stack: CstElement[][];
  /** Set when this line already has an error, to avoid stacking diagnostics. */
  failed = false;

  constructor(
    private readonly toks: Token[],
    root: CstElement[],
  ) {
    this.stack = [root];
  }

  private get out(): CstElement[] {
    return this.stack[this.stack.length - 1] as CstElement[];
  }

  peek(n = 0): Token | undefined {
    let seen = 0;
    for (let j = this.i; j < this.toks.length; j++) {
      const t = this.toks[j] as Token;
      if (isTrivia(t.kind)) continue;
      if (seen === n) return t;
      seen++;
    }
    return undefined;
  }

  /** Moves any trivia, then the next significant token, into the current node. */
  bump(): Token {
    while (this.i < this.toks.length && isTrivia((this.toks[this.i] as Token).kind)) {
      this.out.push(this.toks[this.i++] as Token);
    }
    const t = this.toks[this.i++] as Token;
    this.out.push(t);
    return t;
  }

  start(kind: NodeKind): void {
    const node: CstNode = { kind, children: [] };
    this.out.push(node);
    this.stack.push(node.children);
  }

  /** Wraps the last element of the current node in a new node and enters it (for binary operators). */
  wrapLast(kind: NodeKind): void {
    const last = this.out.pop();
    const node: CstNode = { kind, children: last ? [last] : [] };
    this.out.push(node);
    this.stack.push(node.children);
  }

  finish(): void {
    this.stack.pop();
  }

  /** Moves everything left on the line into the current node; extra significant tokens become an Error node. */
  rest(): Token[] {
    const extra: Token[] = [];
    while (this.i < this.toks.length) {
      const t = this.toks[this.i] as Token;
      if (isTrivia(t.kind)) {
        this.out.push(t);
        this.i++;
        continue;
      }
      this.start("Error");
      while (this.i < this.toks.length) {
        const u = this.toks[this.i] as Token;
        if (isTrivia(u.kind) && this.toks.slice(this.i).every((v) => isTrivia(v.kind))) break;
        this.out.push(u);
        if (!isTrivia(u.kind)) extra.push(u);
        this.i++;
      }
      this.finish();
    }
    return extra;
  }
}

class Parser {
  private pos = 0;

  constructor(
    private readonly lines: Line[],
    private readonly diags: Diagnostic[],
  ) {}

  parseFile(): CstNode {
    return { kind: "SourceFile", children: this.parseItems(0, "file") };
  }

  private error(code: Parameters<typeof diagnostic>[0], span: Span, params: Record<string, string> = {}): void {
    this.diags.push(diagnostic(code, span, params));
  }

  /** Parses lines at `indent` until a line dedents below it. */
  private parseItems(indent: number, ctx: Ctx): CstElement[] {
    const items: CstElement[] = [];
    const pending: CstElement[] = [];
    let pendingStart = -1;
    let reportedDeeper = false;

    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos] as Line;
      if (line.blank) {
        if (pendingStart < 0) pendingStart = this.pos;
        pending.push(this.triviaLine(line));
        this.pos++;
        continue;
      }
      if (line.indent < indent) {
        // Comments right before a dedented line belong to the outer block.
        if (pendingStart >= 0) {
          this.pos = pendingStart;
          pending.length = 0;
        }
        break;
      }
      items.push(...pending);
      pending.length = 0;
      pendingStart = -1;

      if (line.indent > indent && !reportedDeeper) {
        this.error("HW0004", lineSpan(line));
        reportedDeeper = true;
      } else if (line.indent === indent) {
        reportedDeeper = false;
      }
      const stmt = this.parseStatement(line, ctx, items);
      if (stmt) items.push(stmt);
    }
    items.push(...pending);
    return items;
  }

  private triviaLine(line: Line): CstNode {
    const hasComment = line.content.some((t) => t.kind === "Comment" || t.kind === "LineTag");
    return this.lineNode(hasComment ? "CommentLine" : "BlankLine", line, () => {});
  }

  /** Builds a node covering one whole line; `fill` consumes the statement's tokens. */
  private lineNode(kind: NodeKind, line: Line, fill: (c: Cursor) => void): CstNode {
    const node: CstNode = { kind, children: [...line.leading] };
    const c = new Cursor(line.content, node.children);
    fill(c);
    const extra = c.rest();
    const first = extra[0];
    const last = extra[extra.length - 1];
    if (first && last && !c.failed) {
      this.error("HW0013", { start: first.start, end: last.start + last.text.length });
    }
    if (line.newline) node.children.push(line.newline);
    return node;
  }

  /** Parses the indented block after a header line at `headerIndent`. */
  private parseBlock(headerIndent: number, ctx: Ctx, statement: string, header: Line): CstNode {
    let j = this.pos;
    while (j < this.lines.length && (this.lines[j] as Line).blank) j++;
    const next = this.lines[j];
    if (next && next.indent > headerIndent) {
      if ((next.indent - headerIndent) % 4 !== 0) {
        this.error("HW0006", lineSpan(next));
      }
      return { kind: "Block", children: this.parseItems(next.indent, ctx) };
    }
    this.error("HW0005", lineSpan(header), { statement });
    return { kind: "Block", children: [] };
  }

  private parseStatement(line: Line, ctx: Ctx, siblings: CstElement[]): CstNode | null {
    this.pos++;
    const first = line.content.find((t) => !isTrivia(t.kind)) as Token;
    const word = first.kind === "Identifier" ? first.text : "";

    // Placement rules.
    if (ctx === "file" && word !== "scene" && word !== "define") {
      this.error("HW0012", lineSpan(line), { statement: word || textHead(first), reason: "put it inside a scene" });
    } else if (ctx !== "file" && (word === "scene" || word === "define")) {
      this.error("HW0012", lineSpan(line), {
        statement: word,
        reason: word === "scene" ? "scenes can't be nested" : "macros must be defined at the top level",
      });
    } else if (ctx === "menu" && first.kind !== "String" && word !== "once") {
      this.error("HW0015", lineSpan(line));
    }

    switch (word) {
      case "scene":
        return this.blockStmt("SceneDecl", "SceneHeader", line, "scene", "scene", (c) => {
          c.bump();
          this.expectName(c, "a scene name");
          this.expectColon(c);
        });
      case "define":
        return this.blockStmt("DefineDecl", "DefineHeader", line, "scene", "define", (c) => {
          // Macro signatures are specified in Phase 5; keep the tokens, require the trailing colon.
          while (c.peek() && c.peek(1)) c.bump();
          this.expectColon(c);
        });
      case "if":
        return this.ifStmt(line);
      case "elif":
      case "else":
        return this.elseClause(line, word, siblings);
      case "menu":
        return this.blockStmt("MenuStmt", "MenuHeader", line, "menu", "menu", (c) => {
          c.bump();
          if (c.peek()?.kind === "String") this.literal(c);
          this.expectColon(c);
        });
      case "once":
        return this.option(line);
      case "jump":
      case "call":
        return this.lineNode(word === "jump" ? "JumpStmt" : "CallStmt", line, (c) => {
          c.bump();
          this.expectName(c, "a scene name");
        });
      case "return":
      case "end":
        return this.lineNode(word === "return" ? "ReturnStmt" : "EndStmt", line, (c) => c.bump());
      case "show":
        return this.lineNode("ShowStmt", line, (c) => {
          c.bump();
          this.expectName(c, "a character name");
          this.attrs(c, true);
          this.atClause(c);
          this.withClause(c);
        });
      case "hide":
        return this.lineNode("HideStmt", line, (c) => {
          c.bump();
          this.expectName(c, "a character name");
          this.withClause(c);
        });
      case "move":
        return this.lineNode("MoveStmt", line, (c) => {
          c.bump();
          this.expectName(c, "a character name");
          if (isKw(c.peek(), "at")) this.atClause(c);
          else this.fail(c, "\"at\" and a position");
          this.withClause(c);
        });
      case "bg":
      case "cg":
        return this.lineNode(word === "bg" ? "BgStmt" : "CgStmt", line, (c) => {
          c.bump();
          this.expectName(c, "an image name");
          this.withClause(c);
        });
      case "music":
      case "ambient":
      case "sfx":
      case "voice":
        return this.lineNode("AudioStmt", line, (c) => {
          c.bump();
          this.expectName(c, "a sound name");
          this.fadeClause(c);
        });
      case "stop":
        return this.lineNode("StopStmt", line, (c) => {
          c.bump();
          const what = c.peek();
          if (what && ["music", "ambient", "voice"].includes(what.text)) c.bump();
          else this.fail(c, "music, ambient, or voice");
          this.fadeClause(c);
        });
      case "wait":
        return this.lineNode("WaitStmt", line, (c) => {
          c.bump();
          if (c.peek()?.kind === "LParen") this.argList(c);
          else this.fail(c, "a duration in parentheses, like wait(500)");
        });
      case "shake":
      case "flash":
        return this.lineNode("EffectStmt", line, (c) => {
          c.bump();
          if (c.peek()?.kind === "LParen") this.argList(c);
        });
      default:
        break;
    }

    if (first.kind === "String") {
      return ctx === "menu" ? this.option(line) : this.lineNode("NarrationStmt", line, (c) => this.literal(c));
    }
    if (first.kind === "Dollar") {
      return this.lineNode("AssignStmt", line, (c) => {
        c.bump();
        this.expectName(c, "a variable name");
        const op = c.peek();
        if (op && ["Eq", "PlusEq", "MinusEq", "StarEq"].includes(op.kind)) {
          c.bump();
          this.expr(c);
        } else {
          this.fail(c, "=, +=, -=, or *=");
        }
      });
    }
    if (first.kind === "Identifier" && !KEYWORDS.has(first.text)) {
      return this.lineNode("SayStmt", line, (c) => {
        c.bump(); // speaker
        this.attrs(c, false);
        if (c.peek()?.kind === "String") this.literal(c);
        else this.fail(c, "a quoted line of dialogue");
      });
    }

    this.error("HW0010", lineSpan(line));
    return this.lineNode("ErrorStmt", line, (c) => {
      c.failed = true;
    });
  }

  private blockStmt(
    kind: NodeKind,
    headerKind: NodeKind,
    line: Line,
    ctx: Ctx,
    name: string,
    fill: (c: Cursor) => void,
  ): CstNode {
    const header = this.lineNode(headerKind, line, fill);
    return { kind, children: [header, this.parseBlock(line.indent, ctx, name, line)] };
  }

  private ifStmt(line: Line): CstNode {
    const clause = this.blockStmt("IfClause", "IfHeader", line, "scene", "if", (c) => {
      c.bump();
      this.expr(c);
      this.expectColon(c);
    });
    return { kind: "IfStmt", children: [clause] };
  }

  /** Attaches elif/else to the preceding IfStmt (moving any trivia lines in between into it). */
  private elseClause(line: Line, word: "elif" | "else", siblings: CstElement[]): null | CstNode {
    const clause = this.blockStmt("IfClause", word === "elif" ? "ElifHeader" : "ElseHeader", line, "scene", word, (c) => {
      c.bump();
      if (word === "elif") this.expr(c);
      this.expectColon(c);
    });
    let k = siblings.length - 1;
    while (k >= 0) {
      const s = siblings[k] as CstNode;
      if (s.kind !== "BlankLine" && s.kind !== "CommentLine") break;
      k--;
    }
    const target = siblings[k] as CstNode | undefined;
    const closed = target?.kind === "IfStmt" && lastClauseIsElse(target);
    if (target?.kind === "IfStmt" && !closed) {
      target.children.push(...siblings.splice(k + 1), clause);
      return null;
    }
    this.error("HW0014", lineSpan(line), { statement: word });
    return { kind: "ErrorStmt", children: [clause] };
  }

  private option(line: Line): CstNode {
    return this.blockStmt("MenuOption", "OptionHeader", line, "scene", "menu option", (c) => {
      if (isKw(c.peek(), "once")) c.bump();
      if (c.peek()?.kind === "String") this.literal(c);
      else this.fail(c, "the option text in quotes");
      if (isKw(c.peek(), "if")) {
        c.bump();
        this.expr(c);
      }
      this.expectColon(c);
    });
  }

  // ---- parts ----

  private fail(c: Cursor, expected: string): void {
    if (c.failed) return;
    c.failed = true;
    const t = c.peek();
    const span = t ? tokenSpan(t) : this.endOfLineSpan();
    this.error("HW0011", span, { expected });
  }

  private endOfLineSpan(): Span {
    const line = this.lines[this.pos - 1];
    const last = line?.content[line.content.length - 1] ?? line?.leading[line.leading.length - 1];
    const end = last ? last.start + last.text.length : 0;
    return { start: end, end };
  }

  private expectName(c: Cursor, what: string): void {
    const t = c.peek();
    if (t?.kind === "Identifier" && !KEYWORDS.has(t.text)) c.bump();
    else this.fail(c, what);
  }

  private expectColon(c: Cursor): void {
    if (c.peek()?.kind === "Colon") c.bump();
    else this.fail(c, "\":\" at the end of the line");
  }

  private literal(c: Cursor): void {
    c.start("Literal");
    c.bump();
    c.finish();
  }

  /** Attributes: `word` or `-word`. In `show`, stops at `at`/`with`. */
  private attrs(c: Cursor, inShow: boolean): void {
    for (;;) {
      const t = c.peek();
      if (!t) return;
      if (t.kind === "Minus" && c.peek(1)?.kind === "Identifier") {
        c.start("Attr");
        c.bump();
        c.bump();
        c.finish();
        continue;
      }
      if (t.kind === "Identifier" && !(inShow && (t.text === "at" || t.text === "with")) && !KEYWORDS.has(t.text)) {
        c.start("Attr");
        c.bump();
        c.finish();
        continue;
      }
      return;
    }
  }

  private atClause(c: Cursor): void {
    if (!isKw(c.peek(), "at")) return;
    c.start("AtClause");
    c.bump();
    this.expectName(c, "a position name");
    c.finish();
  }

  private withClause(c: Cursor): void {
    if (!isKw(c.peek(), "with")) return;
    c.start("WithClause");
    c.bump();
    const t = c.peek();
    if (t?.kind === "Identifier" && !KEYWORDS.has(t.text)) {
      c.start("Transition");
      c.bump();
      if (c.peek()?.kind === "LParen") this.argList(c);
      c.finish();
    } else {
      this.fail(c, "a transition such as fade(300)");
    }
    c.finish();
  }

  /** `fade(ms)` after an audio statement. */
  private fadeClause(c: Cursor): void {
    if (!isKw(c.peek(), "fade")) return;
    c.start("FadeClause");
    c.bump();
    if (c.peek()?.kind === "LParen") this.argList(c);
    else this.fail(c, "a duration in parentheses, like fade(1000)");
    c.finish();
  }

  /** `( arg, arg, ... )` where args are numbers, names, or strings. */
  private argList(c: Cursor): void {
    c.start("ArgList");
    c.bump(); // (
    if (c.peek()?.kind !== "RParen") {
      for (;;) {
        const t = c.peek();
        if (t?.kind === "Number" || t?.kind === "String") this.literal(c);
        else if (t?.kind === "Identifier") {
          c.start("NameRef");
          c.bump();
          c.finish();
        } else {
          this.fail(c, "a value");
          break;
        }
        if (c.peek()?.kind === "Comma") c.bump();
        else break;
      }
    }
    if (c.peek()?.kind === "RParen") c.bump();
    else this.fail(c, "\")\"");
    c.finish();
  }

  // ---- expressions (Pratt) ----

  private static readonly BINARY: Readonly<Record<string, number>> = {
    or: 1,
    and: 2,
    EqEq: 4,
    NotEq: 4,
    Lt: 4,
    Le: 4,
    Gt: 4,
    Ge: 4,
    Plus: 5,
    Minus: 5,
    Star: 6,
    Slash: 6,
    Percent: 6,
  };

  private binaryPrec(t: Token | undefined): number | undefined {
    if (!t) return undefined;
    if (t.kind === "Identifier") return t.text === "and" || t.text === "or" ? Parser.BINARY[t.text] : undefined;
    return Parser.BINARY[t.kind];
  }

  private expr(c: Cursor, minPrec = 1): void {
    if (!this.primary(c)) return;
    for (;;) {
      const prec = this.binaryPrec(c.peek());
      if (prec === undefined || prec < minPrec) return;
      c.wrapLast("BinaryExpr");
      c.bump();
      this.expr(c, prec + 1);
      c.finish();
    }
  }

  private primary(c: Cursor): boolean {
    const t = c.peek();
    if (!t) {
      this.fail(c, "an expression");
      return false;
    }
    if (t.kind === "Number" || t.kind === "String" || isKw(t, "true") || isKw(t, "false")) {
      this.literal(c);
      return true;
    }
    if (isKw(t, "not") || t.kind === "Minus") {
      c.start("UnaryExpr");
      c.bump();
      this.expr(c, t.kind === "Minus" ? 7 : 3);
      c.finish();
      return true;
    }
    if (t.kind === "LParen") {
      c.start("ParenExpr");
      c.bump();
      this.expr(c);
      if (c.peek()?.kind === "RParen") c.bump();
      else this.fail(c, "\")\"");
      c.finish();
      return true;
    }
    if (t.kind === "Identifier" && !KEYWORDS.has(t.text)) {
      if (c.peek(1)?.kind === "LParen") {
        c.start("CallExpr");
        c.bump();
        this.argList(c);
        c.finish();
      } else {
        c.start("NameRef");
        c.bump();
        c.finish();
      }
      return true;
    }
    this.fail(c, "an expression");
    return false;
  }
}

function lastClauseIsElse(ifStmt: CstNode): boolean {
  const clauses = ifStmt.children.filter((ch): ch is CstNode => "children" in ch && ch.kind === "IfClause");
  const last = clauses[clauses.length - 1];
  const header = last?.children[0];
  return !!header && "children" in header && header.kind === "ElseHeader";
}

function textHead(t: Token): string {
  return t.text.length > 12 ? `${t.text.slice(0, 12)}…` : t.text;
}
