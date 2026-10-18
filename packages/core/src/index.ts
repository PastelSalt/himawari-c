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
export { type Character, type SpriteDef, type SpriteGroup, characterWords, readCharacter } from "./project/character.js";
export { type SpriteAttr, type SpriteLayer, type SpriteState, applySpriteWords, spriteLayers } from "./project/sprite.js";
export { type GraphEdge, type GraphNode, type StoryGraph, exprToString, graphToMermaid, storyGraph } from "./project/graph.js";
export { DEFAULT_POSITIONS, type Manifest, type VarType, type VariableDecl, readManifest } from "./project/manifest.js";
export { editDistance, suggest } from "./project/suggest.js";
export { RenameError, type RenameKind, type RenamePlan, planRename, splitFrontmatter } from "./project/rename.js";
export { type ExtensionDef, type ExtensionParam, type MacroEntry, PARAM_TYPES, type ParamType, readExtension } from "./project/invoke.js";
export {
  CONTRAST_PAIRS,
  THEME_COLORS,
  THEME_DEFAULTS,
  THEME_PALETTES,
  THEME_PRESETS,
  THEME_PRESET_NAMES,
  THEME_SETTINGS,
  THEME_STRING_KEYS,
  type ResolvedTheme,
  type ThemeColor,
  type ThemeEntries,
  type ThemeJson,
  type ThemeValue,
  contrastRatio,
  fixContrast,
  readTheme,
  resolveTheme,
} from "./project/theme.js";
export { lineIdToNumber, numberToLineId } from "./ids.js";
export { type CompileResult, compile } from "./bytecode/compiler.js";
export { writeHwb } from "./bytecode/writer.js";
export { HwbError, readHwb } from "./bytecode/reader.js";
export { disassemble, textPreview } from "./bytecode/disasm.js";
export { xxh64, xxh64String } from "./pack/hash.js";
export { lz4Compress, lz4Decompress } from "./pack/lz4.js";
export {
  Codec, PACK_MAJOR, PACK_MINOR, type PackEntry, PackError, type PackFile, type PackOptions, type ReadPack, diffForPatch, normalizePackPath, readPack,
  writePack,
} from "./pack/pack.js";
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
  type ArgValue,
  type AttrChange,
  type Expr,
  type InvokeArg,
  type MacroDef,
  type MacroParam,
  type MenuOption,
  type Scene,
  type Stmt,
  type Transition,
  endsFlow,
  parseAst,
} from "./syntax/ast.js";
