/**
 * Lossless lexer for Himawari Script (spec/language.md §1).
 *
 * Every character of the source ends up in exactly one token, including
 * indentation, spaces, comments, line tags, and newlines, so concatenating the
 * token texts reproduces the file byte for byte. The lexer never fails: bad
 * input becomes `Error` tokens plus diagnostics.
 */
import { type Diagnostic, diagnostic } from "./diagnostics.js";

export type TokenKind =
  // trivia
  | "Bom"
  | "Indent"
  | "Whitespace"
  | "Comment"
  | "LineTag"
  | "Newline"
  // atoms
  | "Identifier"
  | "Number"
  | "String"
  // punctuation and operators
  | "Dollar"
  | "Colon"
  | "Comma"
  | "LParen"
  | "RParen"
  | "Plus"
  | "Minus"
  | "Star"
  | "Slash"
  | "Percent"
  | "Eq"
  | "PlusEq"
  | "MinusEq"
  | "StarEq"
  | "EqEq"
  | "NotEq"
  | "Lt"
  | "Le"
  | "Gt"
  | "Ge"
  | "Error";

export interface Token {
  kind: TokenKind;
  text: string;
  /** Offset of the token's first UTF-16 code unit in the source. */
  start: number;
}

const TRIVIA: ReadonlySet<TokenKind> = new Set(["Bom", "Indent", "Whitespace", "Comment", "LineTag", "Newline"]);

export function isTrivia(kind: TokenKind): boolean {
  return TRIVIA.has(kind);
}

/** A line tag at the start of a comment, followed by end of line or whitespace. */
const LINE_TAG_PREFIX = /^#line:[0-9a-hjkmnp-tv-z]{6}(?=\s|$)/;

const OPERATORS: ReadonlyArray<readonly [string, TokenKind]> = [
  ["==", "EqEq"],
  ["!=", "NotEq"],
  ["<=", "Le"],
  [">=", "Ge"],
  ["+=", "PlusEq"],
  ["-=", "MinusEq"],
  ["*=", "StarEq"],
  ["=", "Eq"],
  ["<", "Lt"],
  [">", "Gt"],
  ["+", "Plus"],
  ["-", "Minus"],
  ["*", "Star"],
  ["/", "Slash"],
  ["%", "Percent"],
  ["(", "LParen"],
  [")", "RParen"],
  [":", "Colon"],
  [",", "Comma"],
  ["$", "Dollar"],
];

const isIdentStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || (c >= "0" && c <= "9");
const isDigit = (c: string) => c >= "0" && c <= "9";

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let atLineStart = true;
  const push = (kind: TokenKind, end: number) => {
    tokens.push({ kind, text: source.slice(i, end), start: i });
    i = end;
  };

  if (source.startsWith("﻿")) {
    push("Bom", 1);
  }

  while (i < source.length) {
    const c = source[i] as string;

    // Newlines: \n or \r\n (a lone \r is also accepted as a line break).
    if (c === "\n" || c === "\r") {
      push("Newline", c === "\r" && source[i + 1] === "\n" ? i + 2 : i + 1);
      atLineStart = true;
      continue;
    }

    // Indentation: leading spaces and tabs.
    if (atLineStart) {
      atLineStart = false;
      let j = i;
      while (source[j] === " " || source[j] === "\t") j++;
      if (j > i) {
        const text = source.slice(i, j);
        const tab = text.indexOf("\t");
        if (tab >= 0 && !isBlankRest(source, j)) {
          diagnostics.push(diagnostic("HW0001", { start: i + tab, end: i + tab + 1 }));
        }
        push("Indent", j);
        continue;
      }
    }

    if (c === " " || c === "\t") {
      let j = i;
      while (source[j] === " " || source[j] === "\t") j++;
      push("Whitespace", j);
      continue;
    }

    if (c === "#") {
      let j = i;
      while (j < source.length && source[j] !== "\n" && source[j] !== "\r") j++;
      // `#line:xxxxxx` may be followed by an ordinary comment: `#line:k3f9a1  # note`.
      const tag = LINE_TAG_PREFIX.exec(source.slice(i, j));
      if (tag) {
        push("LineTag", i + tag[0].length);
        continue;
      }
      push("Comment", j);
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < source.length && source[j] !== "\n" && source[j] !== "\r") {
        if (source[j] === "\\" && j + 1 < source.length && source[j + 1] !== "\n" && source[j + 1] !== "\r") {
          j += 2;
          continue;
        }
        if (source[j] === '"') {
          closed = true;
          j++;
          break;
        }
        j++;
      }
      if (!closed) {
        diagnostics.push(diagnostic("HW0002", { start: i, end: j }));
      }
      push("String", j);
      continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < source.length && isIdentPart(source[j] as string)) j++;
      push("Identifier", j);
      continue;
    }

    if (isDigit(c)) {
      let j = i + 1;
      while (j < source.length && isDigit(source[j] as string)) j++;
      push("Number", j);
      continue;
    }

    const op = OPERATORS.find(([text]) => source.startsWith(text, i));
    if (op) {
      push(op[1], i + op[0].length);
      continue;
    }

    // Anything else is one code point of garbage.
    const cp = source.codePointAt(i) ?? 0;
    const len = cp > 0xffff ? 2 : 1;
    diagnostics.push(diagnostic("HW0003", { start: i, end: i + len }, { char: source.slice(i, i + len) }));
    push("Error", i + len);
  }

  return { tokens, diagnostics };
}

/** True if only spaces/tabs remain before the end of the line (a blank line). */
function isBlankRest(source: string, from: number): boolean {
  let j = from;
  while (source[j] === " " || source[j] === "\t") j++;
  return j >= source.length || source[j] === "\n" || source[j] === "\r";
}
