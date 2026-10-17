/**
 * Typed AST derived from the CST (plan §5.3). This is the JSON shape Studio,
 * MCP, and external tools read; edits never go through it (they use the CST,
 * so formatting and comments survive).
 */
import { type CstElement, type CstNode, childNodes, childTokens, isNode, spanOf } from "./cst.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Token } from "./lexer.js";
import { KEYWORDS, type ParseResult, parse } from "./parser.js";
import { type TextPart, parseText } from "./text.js";

export const AST_VERSION = "1.0";

export type Expr =
  | { kind: "Int"; value: number }
  | { kind: "Bool"; value: boolean }
  | { kind: "Str"; value: string }
  | { kind: "Var"; name: string }
  | { kind: "Unary"; op: "-" | "not"; operand: Expr }
  | { kind: "Binary"; op: string; left: Expr; right: Expr }
  | { kind: "Call"; name: string; args: Expr[] }
  | { kind: "Invalid" };

export interface Transition {
  type: string;
  args: (number | string)[];
}

interface Base {
  span: Span;
}

export type Stmt =
  | (Base & { kind: "Say"; lineId: string | null; speaker: string; attrs: AttrChange; text: TextPart[] })
  | (Base & { kind: "Narration"; lineId: string | null; text: TextPart[] })
  | (Base & { kind: "Show"; char: string; add: string[]; remove: string[]; at: string | null; transition: Transition | null })
  | (Base & { kind: "Hide"; char: string; transition: Transition | null })
  | (Base & { kind: "Move"; char: string; at: string | null; transition: Transition | null })
  | (Base & { kind: "Bg" | "Cg"; asset: string; transition: Transition | null })
  | (Base & { kind: "Audio"; channel: "music" | "ambient" | "sfx" | "voice"; asset: string; fadeMs: number | null })
  | (Base & { kind: "Stop"; channel: string; fadeMs: number | null })
  | (Base & { kind: "Wait"; ms: number | null })
  | (Base & { kind: "Effect"; effect: "shake" | "flash"; ms: number | null })
  | (Base & { kind: "Assign"; name: string; op: "=" | "+=" | "-=" | "*="; value: Expr })
  | (Base & { kind: "Jump" | "Call"; target: string })
  | (Base & { kind: "Return" | "End" })
  | (Base & { kind: "If"; clauses: { cond: Expr | null; body: Stmt[] }[] })
  | (Base & { kind: "Menu"; prompt: TextPart[] | null; promptLineId: string | null; options: MenuOption[] });

export interface AttrChange {
  add: string[];
  remove: string[];
}

export interface MenuOption {
  span: Span;
  lineId: string | null;
  once: boolean;
  text: TextPart[];
  cond: Expr | null;
  body: Stmt[];
  /** True when the body can finish without jump/return/end, so play continues after the menu. */
  fallsThrough: boolean;
}

export interface Scene {
  kind: "Scene";
  id: string;
  span: Span;
  body: Stmt[];
}

export interface Ast {
  version: string;
  file: string;
  scenes: Scene[];
}

/**
 * A name used somewhere in the file, with its exact span. This index drives the
 * validator, and later go-to-definition, find-references, and rename.
 */
export interface Ref {
  kind: "sceneDecl" | "scene" | "speaker" | "character" | "attr" | "position" | "transition" | "asset" | "variable" | "function";
  name: string;
  span: Span;
  /** attr: the character it applies to. */
  owner?: string;
  /** attr: written as `-attr`. */
  remove?: boolean;
  /** asset: bg, cg, music, sfx, ambient, voice, or rule (a rule-transition mask). */
  channel?: string;
  /** variable: the target of an assignment. */
  assign?: boolean;
  /** variable: used by `{select …}`, with its case keys. */
  selectCases?: string[];
  /** transition: number of arguments given. */
  argCount?: number;
}

export interface AstResult {
  ast: Ast;
  /** Syntax and text diagnostics, sorted by position. */
  diagnostics: Diagnostic[];
  /** Every name used in the file, in source order. */
  refs: Ref[];
  cst: ParseResult["root"];
}

/** Parses `source` and builds its AST. */
export function parseAst(source: string, file = "<memory>"): AstResult {
  const parsed = parse(source);
  const b = new Builder();
  const scenes = childNodes(parsed.root, "SceneDecl").map((n) => b.scene(n));
  const diagnostics = [...parsed.diagnostics, ...b.diagnostics].sort((x, y) => x.span.start - y.span.start);
  const refs = [...collectRefs(parsed.root), ...b.textRefs].sort((x, y) => x.span.start - y.span.start);
  return { ast: { version: AST_VERSION, file, scenes }, diagnostics, refs, cst: parsed.root };
}

const tokSpan = (t: Token): Span => ({ start: t.start, end: t.start + t.text.length });

/** Structural references from the CST (text interpolation refs come from the text parser). */
function collectRefs(root: CstNode): Ref[] {
  const refs: Ref[] = [];
  const idents = (n: CstNode) => childTokens(n, "Identifier");
  const add = (kind: Ref["kind"], t: Token | undefined, extra: Partial<Ref> = {}) => {
    if (t && !KEYWORDS.has(t.text)) refs.push({ kind, name: t.text, span: tokSpan(t), ...extra });
  };
  const attrs = (n: CstNode, owner: string) => {
    for (const a of childNodes(n, "Attr")) {
      add("attr", idents(a)[0], { owner, remove: childTokens(a, "Minus").length > 0 });
    }
  };
  const clauses = (n: CstNode) => {
    const at = childNodes(n, "AtClause")[0];
    if (at) add("position", idents(at)[1]);
    const w = childNodes(n, "WithClause")[0];
    const tr = w ? childNodes(w, "Transition")[0] : undefined;
    if (tr) {
      const args = childNodes(tr, "ArgList")[0];
      const argNodes = args ? childNodes(args) : [];
      add("transition", idents(tr)[0], { argCount: argNodes.length });
      const first = argNodes[0];
      if (idents(tr)[0]?.text === "rule" && first?.kind === "NameRef") add("asset", idents(first)[0], { channel: "rule" });
    }
  };

  const visit = (n: CstNode, inExpr: boolean) => {
    const ids = idents(n);
    switch (n.kind) {
      case "SceneHeader":
        add("sceneDecl", ids[1]);
        break;
      case "SayStmt":
        add("speaker", ids[0]);
        attrs(n, ids[0]?.text ?? "");
        break;
      case "ShowStmt":
      case "HideStmt":
      case "MoveStmt":
        add("character", ids[1]);
        attrs(n, ids[1]?.text ?? "");
        clauses(n);
        break;
      case "BgStmt":
      case "CgStmt":
        add("asset", ids[1], { channel: ids[0]?.text ?? "" });
        clauses(n);
        break;
      case "AudioStmt":
        add("asset", ids[1], { channel: ids[0]?.text ?? "" });
        break;
      case "JumpStmt":
      case "CallStmt":
        add("scene", ids[1]);
        break;
      case "AssignStmt":
        add("variable", ids[0], { assign: true });
        break;
      case "CallExpr":
        add("function", ids[0]);
        break;
      case "NameRef":
        if (inExpr) add("variable", ids[0]);
        break;
      default:
        break;
    }
    // Names inside transitions, fades, waits, and effects are arguments, not variables.
    const exprContext = !["Transition", "FadeClause", "WaitStmt", "EffectStmt", "WithClause"].includes(n.kind);
    for (const c of n.children) {
      if (isNode(c)) visit(c, inExpr ? exprContext : exprContext && isExprRoot(n, c));
    }
  };
  visit(root, false);
  return refs;
}

const EXPR_KINDS: ReadonlySet<string> = new Set(["BinaryExpr", "UnaryExpr", "ParenExpr", "NameRef", "CallExpr", "Literal"]);

/** True when `child` is the expression of a header or assignment (where names are variables). */
function isExprRoot(parent: CstNode, child: CstNode): boolean {
  return EXPR_KINDS.has(child.kind) && ["IfHeader", "ElifHeader", "OptionHeader", "AssignStmt"].includes(parent.kind);
}

const sig = (n: CstNode): Token[] =>
  childTokens(n).filter((t) => !["Indent", "Whitespace", "Newline", "Comment", "LineTag", "Bom"].includes(t.kind));

const firstIdent = (n: CstNode, skip = 0): string => {
  const ids = childTokens(n, "Identifier");
  return ids[skip]?.text ?? "";
};

const span = (e: CstElement): Span => spanOf(e) ?? { start: 0, end: 0 };

const lineIdOf = (n: CstNode): string | null => {
  const tag = childTokens(n, "LineTag")[0];
  return tag ? tag.text.trim().slice("#line:".length) : null;
};

const blockOf = (n: CstNode): CstNode | undefined => childNodes(n, "Block")[0];

class Builder {
  readonly diagnostics: Diagnostic[] = [];
  readonly textRefs: Ref[] = [];

  scene(n: CstNode): Scene {
    const header = n.children[0] as CstNode;
    const block = blockOf(n);
    return { kind: "Scene", id: firstIdent(header, 1), span: span(n), body: block ? this.block(block) : [] };
  }

  block(n: CstNode): Stmt[] {
    const out: Stmt[] = [];
    for (const c of n.children) {
      if (!isNode(c)) continue;
      const s = this.stmt(c);
      if (s) out.push(s);
    }
    return out;
  }

  text(n: CstNode): TextPart[] {
    const lit = childNodes(n, "Literal")[0];
    const tok = lit ? childTokens(lit, "String")[0] : undefined;
    if (!tok) return [];
    const r = parseText(tok.text, tok.start);
    this.diagnostics.push(...r.diagnostics);
    for (const ref of r.refs) {
      this.textRefs.push(
        ref.selectCases
          ? { kind: "variable", name: ref.name, span: ref.span, selectCases: ref.selectCases }
          : { kind: "variable", name: ref.name, span: ref.span },
      );
    }
    return r.parts;
  }

  attrs(n: CstNode): AttrChange {
    const add: string[] = [];
    const remove: string[] = [];
    for (const a of childNodes(n, "Attr")) {
      const name = childTokens(a, "Identifier")[0]?.text ?? "";
      if (childTokens(a, "Minus").length > 0) remove.push(name);
      else add.push(name);
    }
    return { add, remove };
  }

  transition(n: CstNode): Transition | null {
    const w = childNodes(n, "WithClause")[0];
    const t = w ? childNodes(w, "Transition")[0] : undefined;
    if (!t) return null;
    return { type: childTokens(t, "Identifier")[0]?.text ?? "", args: this.args(childNodes(t, "ArgList")[0]) };
  }

  args(list: CstNode | undefined): (number | string)[] {
    if (!list) return [];
    return childNodes(list).map((a) => {
      const tok = sig(a)[0];
      if (!tok) return "";
      if (tok.kind === "Number") return Number(tok.text);
      if (tok.kind === "String") return tok.text.slice(1, -1);
      return tok.text;
    });
  }

  firstNumber(list: CstNode | undefined): number | null {
    const n = this.args(list)[0];
    return typeof n === "number" ? n : null;
  }

  stmt(n: CstNode): Stmt | null {
    const s = span(n);
    switch (n.kind) {
      case "SayStmt":
        return { kind: "Say", span: s, lineId: lineIdOf(n), speaker: firstIdent(n), attrs: this.attrs(n), text: this.text(n) };
      case "NarrationStmt":
        return { kind: "Narration", span: s, lineId: lineIdOf(n), text: this.text(n) };
      case "ShowStmt": {
        const { add, remove } = this.attrs(n);
        const at = childNodes(n, "AtClause")[0];
        return {
          kind: "Show", span: s, char: firstIdent(n, 1), add, remove,
          at: at ? firstIdent(at, 1) || null : null, transition: this.transition(n),
        };
      }
      case "HideStmt":
        return { kind: "Hide", span: s, char: firstIdent(n, 1), transition: this.transition(n) };
      case "MoveStmt": {
        const at = childNodes(n, "AtClause")[0];
        return { kind: "Move", span: s, char: firstIdent(n, 1), at: at ? firstIdent(at, 1) || null : null, transition: this.transition(n) };
      }
      case "BgStmt":
      case "CgStmt":
        return { kind: n.kind === "BgStmt" ? "Bg" : "Cg", span: s, asset: firstIdent(n, 1), transition: this.transition(n) };
      case "AudioStmt": {
        const fade = childNodes(n, "FadeClause")[0];
        return {
          kind: "Audio", span: s, channel: firstIdent(n) as "music" | "ambient" | "sfx" | "voice", asset: firstIdent(n, 1),
          fadeMs: fade ? this.firstNumber(childNodes(fade, "ArgList")[0]) : null,
        };
      }
      case "StopStmt": {
        const fade = childNodes(n, "FadeClause")[0];
        return { kind: "Stop", span: s, channel: firstIdent(n, 1), fadeMs: fade ? this.firstNumber(childNodes(fade, "ArgList")[0]) : null };
      }
      case "WaitStmt":
        return { kind: "Wait", span: s, ms: this.firstNumber(childNodes(n, "ArgList")[0]) };
      case "EffectStmt":
        return { kind: "Effect", span: s, effect: firstIdent(n) as "shake" | "flash", ms: this.firstNumber(childNodes(n, "ArgList")[0]) };
      case "AssignStmt": {
        const opTok = sig(n).find((t) => ["Eq", "PlusEq", "MinusEq", "StarEq"].includes(t.kind));
        const exprNode = n.children.find((c) => isNode(c) && c.kind !== "Error");
        return {
          kind: "Assign", span: s, name: firstIdent(n), op: (opTok?.text ?? "=") as "=" | "+=" | "-=" | "*=",
          value: exprNode && isNode(exprNode) ? this.expr(exprNode) : { kind: "Invalid" },
        };
      }
      case "JumpStmt":
      case "CallStmt":
        return { kind: n.kind === "JumpStmt" ? "Jump" : "Call", span: s, target: firstIdent(n, 1) };
      case "ReturnStmt":
        return { kind: "Return", span: s };
      case "EndStmt":
        return { kind: "End", span: s };
      case "IfStmt":
        return {
          kind: "If", span: s,
          clauses: childNodes(n, "IfClause").map((cl) => {
            const header = cl.children[0] as CstNode;
            const cond = header.kind === "ElseHeader" ? null : this.exprIn(header);
            const block = blockOf(cl);
            return { cond, body: block ? this.block(block) : [] };
          }),
        };
      case "MenuStmt": {
        const header = n.children[0] as CstNode;
        const block = blockOf(n);
        return {
          kind: "Menu", span: s,
          prompt: childNodes(header, "Literal").length > 0 ? this.text(header) : null,
          promptLineId: childNodes(header, "Literal").length > 0 ? lineIdOf(header) : null,
          options: block ? childNodes(block, "MenuOption").map((o) => this.option(o)) : [],
        };
      }
      default:
        return null; // trivia, errors, and nested scenes (already diagnosed)
    }
  }

  option(o: CstNode): MenuOption {
    const header = o.children[0] as CstNode;
    const block = blockOf(o);
    const body = block ? this.block(block) : [];
    return {
      span: span(o),
      lineId: lineIdOf(header),
      once: childTokens(header, "Identifier").some((t) => t.text === "once"),
      text: this.text(header),
      cond: this.exprIn(header),
      body,
      fallsThrough: !endsFlow(body),
    };
  }

  /** The expression node of an if/elif/option header, if any. */
  exprIn(header: CstNode): Expr | null {
    const e = header.children.find(
      (c): c is CstNode => isNode(c) && ["BinaryExpr", "UnaryExpr", "ParenExpr", "NameRef", "CallExpr"].includes(c.kind)
        || (isNode(c) && c.kind === "Literal" && header.kind !== "OptionHeader"),
    );
    return e ? this.expr(e) : null;
  }

  expr(n: CstNode): Expr {
    const toks = sig(n);
    switch (n.kind) {
      case "Literal": {
        const t = toks[0];
        if (!t) return { kind: "Invalid" };
        if (t.kind === "Number") return { kind: "Int", value: Number(t.text) };
        if (t.kind === "String") return { kind: "Str", value: t.text.slice(1, -1) };
        return { kind: "Bool", value: t.text === "true" };
      }
      case "NameRef":
        return { kind: "Var", name: toks[0]?.text ?? "" };
      case "ParenExpr": {
        const inner = childNodes(n)[0];
        return inner ? this.expr(inner) : { kind: "Invalid" };
      }
      case "UnaryExpr": {
        const operand = childNodes(n)[0];
        return { kind: "Unary", op: toks[0]?.text === "not" ? "not" : "-", operand: operand ? this.expr(operand) : { kind: "Invalid" } };
      }
      case "BinaryExpr": {
        const [l, r] = childNodes(n);
        const op = toks[0]?.text ?? "?";
        return { kind: "Binary", op, left: l ? this.expr(l) : { kind: "Invalid" }, right: r ? this.expr(r) : { kind: "Invalid" } };
      }
      case "CallExpr": {
        const list = childNodes(n, "ArgList")[0];
        return { kind: "Call", name: toks[0]?.text ?? "", args: list ? childNodes(list).map((a) => this.expr(a)) : [] };
      }
      default:
        return { kind: "Invalid" };
    }
  }
}

/** True if every path through `body` ends in jump/return/end. */
export function endsFlow(body: Stmt[]): boolean {
  const last = body[body.length - 1];
  if (!last) return false;
  if (last.kind === "Jump" || last.kind === "Return" || last.kind === "End") return true;
  if (last.kind === "If") {
    const hasElse = last.clauses.some((c) => c.cond === null);
    return hasElse && last.clauses.every((c) => endsFlow(c.body));
  }
  if (last.kind === "Menu") {
    // The menu can be skipped (and play falls through) unless some option is always shown.
    const alwaysShown = last.options.some((o) => o.cond === null && !o.once);
    return alwaysShown && last.options.every((o) => endsFlow(o.body));
  }
  return false;
}

/** Source text of a statement's line(s), for previews. */
export function stmtSource(source: string, s: { span: Span }): string {
  return source.slice(s.span.start, s.span.end);
}
