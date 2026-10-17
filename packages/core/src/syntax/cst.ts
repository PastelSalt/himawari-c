/**
 * Lossless concrete syntax tree (plan §4.1, §9.1). Nodes hold tokens and child
 * nodes in source order, including all trivia, so `textOf(root)` is the exact
 * source. The typed AST and the structured edit API are views over this tree.
 */
import type { Token } from "./lexer.js";

export type NodeKind =
  | "SourceFile"
  | "Block"
  // lines with blocks
  | "SceneDecl"
  | "SceneHeader"
  | "DefineDecl"
  | "DefineHeader"
  | "IfStmt"
  | "IfClause"
  | "IfHeader"
  | "ElifHeader"
  | "ElseHeader"
  | "MenuStmt"
  | "MenuHeader"
  | "MenuOption"
  | "OptionHeader"
  // simple statements
  | "SayStmt"
  | "NarrationStmt"
  | "ShowStmt"
  | "HideStmt"
  | "MoveStmt"
  | "BgStmt"
  | "CgStmt"
  | "AudioStmt"
  | "StopStmt"
  | "WaitStmt"
  | "EffectStmt"
  | "AssignStmt"
  | "JumpStmt"
  | "CallStmt"
  | "ReturnStmt"
  | "EndStmt"
  | "BlankLine"
  | "CommentLine"
  | "ErrorStmt"
  // parts
  | "Attr"
  | "AtClause"
  | "WithClause"
  | "Transition"
  | "ArgList"
  | "FadeClause"
  | "Error"
  // expressions
  | "BinaryExpr"
  | "UnaryExpr"
  | "ParenExpr"
  | "Literal"
  | "NameRef"
  | "CallExpr";

export interface CstNode {
  kind: NodeKind;
  children: CstElement[];
}

export type CstElement = CstNode | Token;

export function isNode(e: CstElement): e is CstNode {
  return "children" in e;
}

/** All tokens under `e`, in source order. */
export function* tokensOf(e: CstElement): Generator<Token> {
  if (!isNode(e)) {
    yield e;
    return;
  }
  for (const child of e.children) {
    yield* tokensOf(child);
  }
}

/** Exact source text of `e`. */
export function textOf(e: CstElement): string {
  let s = "";
  for (const t of tokensOf(e)) s += t.text;
  return s;
}

/** Span of `e` as [start, end) offsets, or undefined for an empty node. */
export function spanOf(e: CstElement): { start: number; end: number } | undefined {
  let start: number | undefined;
  let end = 0;
  for (const t of tokensOf(e)) {
    start ??= t.start;
    end = t.start + t.text.length;
  }
  return start === undefined ? undefined : { start, end };
}

export function childNodes(n: CstNode, kind?: NodeKind): CstNode[] {
  return n.children.filter((c): c is CstNode => isNode(c) && (kind === undefined || c.kind === kind));
}

export function childTokens(n: CstNode, kind?: Token["kind"]): Token[] {
  return n.children.filter((c): c is Token => !isNode(c) && (kind === undefined || c.kind === kind));
}

/** Depth-first walk over every node. */
export function* walk(n: CstNode): Generator<CstNode> {
  yield n;
  for (const c of n.children) {
    if (isNode(c)) yield* walk(c);
  }
}
