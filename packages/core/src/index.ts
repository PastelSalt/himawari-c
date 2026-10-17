export { CORE_VERSION, SPEC_BASE_URL, SPEC_VERSIONS, type SpecName } from "./version.js";
export {
  LINE_ID_ALPHABET,
  LINE_ID_LENGTH,
  cryptoRandomSource,
  extractLineId,
  generateLineId,
  isLineId,
  type RandomSource,
} from "./ids.js";
export { type Diagnostic, type DiagnosticCode, type Severity, type Span, SYNTAX_DIAGNOSTICS } from "./syntax/diagnostics.js";
export { type LexResult, type Token, type TokenKind, isTrivia, lex } from "./syntax/lexer.js";
export {
  type CstElement,
  type CstNode,
  type NodeKind,
  childNodes,
  childTokens,
  isNode,
  spanOf,
  textOf,
  tokensOf,
  walk,
} from "./syntax/cst.js";
export { KEYWORDS, type ParseResult, parse } from "./syntax/parser.js";
export { type TextPart, parseText, plainText } from "./syntax/text.js";
export { type LineCol, LineIndex } from "./syntax/position.js";
export { renderDiagnostic } from "./render-diagnostic.js";
export { type FormatOptions, type FormatResult, format } from "./format.js";
export { type EditOp, type EditOptions, type EditResult, addLineIds, applyEdits } from "./edit.js";
export { DIAGNOSTICS, type Fix, SEMANTIC_DIAGNOSTICS } from "./syntax/diagnostics.js";
export { type Ref } from "./syntax/ast.js";
export { type FileReport, type ProjectCheck, type ProjectInput, type SourceFile, checkProject } from "./project/check.js";
export { type Character, characterWords, readCharacter } from "./project/character.js";
export { DEFAULT_POSITIONS, type Manifest, type VarType, type VariableDecl, readManifest } from "./project/manifest.js";
export { editDistance, suggest } from "./project/suggest.js";
export { lineIdToNumber, numberToLineId } from "./ids.js";
export { type CompileResult, compile } from "./bytecode/compiler.js";
export { writeHwb } from "./bytecode/writer.js";
export { HwbError, readHwb } from "./bytecode/reader.js";
export { disassemble, textPreview } from "./bytecode/disasm.js";
export { HWB_MAJOR, HWB_MINOR, type HwbModule, Op, TextOp } from "./bytecode/format.js";
export {
  type L10nEntry,
  type L10nStatus,
  type L10nTable,
  type SourceLine,
  type SyncResult,
  applyTranslations,
  collectLines,
  parityProblems,
  parseTable,
  stringifyTable,
  syncTable,
} from "./l10n/table.js";
export { parseCsv, toCsv, toXliff, translationsFromCsv, translationsFromXliff } from "./l10n/exchange.js";
export {
  AST_VERSION,
  type Ast,
  type AstResult,
  type AttrChange,
  type Expr,
  type MenuOption,
  type Scene,
  type Stmt,
  type Transition,
  endsFlow,
  parseAst,
} from "./syntax/ast.js";
