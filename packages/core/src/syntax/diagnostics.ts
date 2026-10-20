/**
 * Diagnostics (plan §2.2 P6, §9.1). Every diagnostic carries a stable code and
 * parameters, so Studio can render it in the UI language (plan §11.5); the
 * English `message` is the default rendering used by the CLI.
 *
 * Codes: HW00xx syntax, HW01xx project files (manifest, characters),
 * HW02xx names and types, HW03xx story flow.
 */

export type Severity = "error" | "warning" | "info";

export interface Span {
  /** Offset of the first UTF-16 code unit. */
  start: number;
  /** Offset one past the last UTF-16 code unit. */
  end: number;
}

/** A one-click fix: replace each span with its text (P6). */
export interface Fix {
  title: string;
  edits: { span: Span; text: string }[];
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  span: Span;
  params: Record<string, string>;
  /** A short hint, e.g. `did you mean "smile"?`. */
  help?: string;
  /** Extra context, e.g. the list of valid names. */
  note?: string;
  fixes?: Fix[];
}

/** Syntax diagnostics, HW0001–HW0099. */
export const SYNTAX_DIAGNOSTICS = {
  HW0001: { severity: "error", message: "Indentation must use spaces, not tabs." },
  HW0002: { severity: "error", message: "This string is missing its closing quote." },
  HW0003: { severity: "error", message: "Unexpected character \"{char}\"." },
  HW0004: { severity: "error", message: "This line is indented more than expected." },
  HW0005: { severity: "error", message: "\"{statement}\" needs an indented block below it." },
  HW0006: { severity: "error", message: "Indentation must be a multiple of 4 spaces." },
  HW0010: { severity: "error", message: "I don't understand this line." },
  HW0011: { severity: "error", message: "Expected {expected} here." },
  HW0012: { severity: "error", message: "\"{statement}\" can't appear here; {reason}." },
  HW0013: { severity: "error", message: "Unexpected text at the end of the line." },
  HW0014: { severity: "error", message: "\"{statement}\" without a matching \"if\"." },
  HW0015: { severity: "error", message: "Only menu options can appear inside a menu." },
  HW0016: { severity: "error", message: "Unknown text tag \"{tag}\"." },
  HW0017: { severity: "error", message: "The tag \"{tag}\" is never closed." },
  HW0018: { severity: "error", message: "\"{/{tag}}\" closes a tag that isn't open." },
  HW0019: { severity: "error", message: "Expected a variable name inside [ ]." },
  HW0020: { severity: "error", message: "Invalid select: {reason}." },
  HW0021: { severity: "error", message: "The tag \"{tag}\" needs a value, like {{tag}=…}." },
  HW0022: { severity: "warning", message: "\"{tag}\" isn't a valid line ID, so it's read as an ordinary comment." },
} as const satisfies Record<string, { severity: Severity; message: string }>;

/** Project and semantic diagnostics, HW0100–HW0399. */
export const SEMANTIC_DIAGNOSTICS = {
  HW0101: { severity: "error", message: "himawari.json isn't valid JSON: {reason}." },
  HW0102: { severity: "error", message: "In himawari.json, {field} {problem}." },
  HW0110: { severity: "error", message: "This character file has no valid frontmatter: {reason}." },
  HW0111: { severity: "error", message: "In this character file, {field} {problem}." },
  HW0120: { severity: "error", message: "This extension schema is invalid: {reason}." },
  HW0130: { severity: "error", message: "The theme is invalid: {reason}." },
  HW0131: { severity: "warning", message: "Unknown theme setting \"{key}\"." },
  HW0132: { severity: "warning", message: "The {element} goes past the {side} edge of the screen." },
  HW0133: { severity: "warning", message: "Text in {fg} on {bg} has a contrast of only {ratio}:1; at least 4.5:1 keeps it readable." },
  HW0201: { severity: "error", message: "\"{name}\" isn't a character." },
  HW0202: { severity: "error", message: "There's no character called \"{name}\"." },
  HW0204: { severity: "error", message: "{character} has no expression or attribute called \"{name}\"." },
  HW0205: { severity: "error", message: "There's no position called \"{name}\"." },
  HW0206: { severity: "error", message: "Unknown transition \"{name}\"." },
  HW0207: { severity: "error", message: "\"{name}\" takes {expected}." },
  HW0208: { severity: "error", message: "There's no scene called \"{name}\"." },
  HW0209: { severity: "error", message: "The scene \"{name}\" is defined more than once (also in {other})." },
  HW0210: { severity: "error", message: "\"{name}\" isn't a declared variable." },
  HW0211: { severity: "error", message: "Type mismatch: {problem}." },
  HW0212: { severity: "error", message: "\"{value}\" isn't one of the values of {name}." },
  HW0213: { severity: "info", message: "The {channel} \"{name}\" isn't in assets/{folder}/ yet; a placeholder will be shown." },
  HW0214: { severity: "error", message: "Unknown function \"{name}\"." },
  HW0215: { severity: "error", message: "The entry scene \"{name}\" set in himawari.json doesn't exist." },
  HW0216: { severity: "error", message: "The line ID {id} is used more than once (also in {other})." },
  HW0217: { severity: "error", message: "{name} isn't a string enum, so it can't be used in select." },
  HW0220: { severity: "error", message: "There's no macro or extension statement called \"{name}\"." },
  HW0221: { severity: "error", message: "{name} has no parameter \"{param}\" (or names it twice)." },
  HW0222: { severity: "error", message: "{name} needs a value for \"{param}\"." },
  HW0223: { severity: "error", message: "\"{param}\" of {name} must be {expected}, not {value}." },
  HW0224: { severity: "error", message: "{name} takes at most {count} argument(s)." },
  HW0225: { severity: "error", message: "The macro \"{name}\" is defined more than once (also in {other})." },
  HW0226: { severity: "error", message: "\"{name}\" is both a macro and an extension statement." },
  HW0227: { severity: "error", message: "A macro can't contain {statement}: each line needs its own line ID." },
  HW0228: { severity: "error", message: "\"{type}\" can't be a macro parameter type." },
  HW0229: { severity: "error", message: "A statement can have only one quoted text." },
  HW0230: { severity: "error", message: "The macro {name} calls itself ({chain}); macros can't be recursive." },
  HW0310: { severity: "warning", message: "\"return\" in the scene \"{scene}\", which is never called." },
  HW0320: { severity: "warning", message: "The scene \"{name}\" can reach its end without jump, return, or end; the game would stop there." },
  HW0321: { severity: "info", message: "The scene \"{name}\" is never reached from the entry scene." },
  HW0340: { severity: "info", message: "{name} speaks here, but was hidden earlier in this scene." },
  HW0341: { severity: "info", message: "The variable {name} is set ({count} time(s)) but nothing reads it." },
  HW0342: { severity: "info", message: "The variable {name} is used in a condition but never set, so it's always {value}." },
  HW0350: { severity: "info", message: "This choice has only one option, so the player doesn't really choose." },
  HW0351: { severity: "info", message: "Two options in this choice say \"{text}\"." },
  HW0352: { severity: "info", message: "This line is the same as the one before it." },
  HW0353: { severity: "info", message: "This line has two spaces in a row." },
  HW0354: { severity: "info", message: "This line opens \"{open}\" but doesn't close it with \"{close}\" (or the other way round)." },
  HW0355: { severity: "info", message: "{name} never speaks in the story yet." },
  HW0356: { severity: "info", message: "{a} and {b} differ only in capital letters, which can mix them up on other systems." },
  HW0357: { severity: "info", message: "This line may be too long for the textbox (about {lines} lines; {max} fit)." },
  HW0358: { severity: "info", message: "{name} is {w} × {h}, much bigger than the game ({gw} × {gh}): it makes the game bigger and slower to load." },
  HW0359: { severity: "info", message: "{name} is {w} × {h}, a different shape from the game ({gw} × {gh}), so its edges are cut off to fill the screen." },
  HW0331: { severity: "warning", message: "Every option in this menu is \"once\", so it can run out of choices (it is then skipped)." },
  HW0332: { severity: "error", message: "A menu can have at most {max} options (this one has {count})." },
  HW0333: { severity: "error", message: "One statement can change at most {max} sprite attributes (this one changes {count})." },
  HW0401: { severity: "error", message: "The {lang} translation of line {id} {problem}." },
  HW0402: { severity: "info", message: "{count} line(s) aren't translated into {lang} yet." },
  HW0403: { severity: "warning", message: "The source of line {id} changed since this {lang} table was synced." },
  HW0404: { severity: "info", message: "{count} {lang} translation(s) need review." },
  HW0405: { severity: "warning", message: "Line {id} is in the {lang} table but no longer in the scripts." },
  HW0406: { severity: "error", message: "This string table can't be read: {reason}." },
  HW0407: { severity: "info", message: "The {lang} translation of line {id} doesn't use the glossary's \"{want}\" for \"{term}\"." },
} as const satisfies Record<string, { severity: Severity; message: string }>;

export const DIAGNOSTICS = { ...SYNTAX_DIAGNOSTICS, ...SEMANTIC_DIAGNOSTICS };

export type DiagnosticCode = keyof typeof DIAGNOSTICS;

export function diagnostic(
  code: DiagnosticCode,
  span: Span,
  params: Record<string, string> = {},
  extra: Pick<Diagnostic, "help" | "note" | "fixes"> = {},
): Diagnostic {
  const def = DIAGNOSTICS[code];
  const message = def.message.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
  return { code, severity: def.severity, message, span, params, ...extra };
}
