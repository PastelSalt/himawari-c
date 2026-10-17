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
} as const satisfies Record<string, { severity: Severity; message: string }>;

/** Project and semantic diagnostics, HW0100–HW0399. */
export const SEMANTIC_DIAGNOSTICS = {
  HW0101: { severity: "error", message: "himawari.json isn't valid JSON: {reason}." },
  HW0102: { severity: "error", message: "In himawari.json, {field} {problem}." },
  HW0110: { severity: "error", message: "This character file has no valid frontmatter: {reason}." },
  HW0111: { severity: "error", message: "In this character file, {field} {problem}." },
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
  HW0310: { severity: "warning", message: "\"return\" in the scene \"{scene}\", which is never called." },
  HW0320: { severity: "warning", message: "The scene \"{name}\" can reach its end without jump, return, or end; the game would stop there." },
  HW0321: { severity: "info", message: "The scene \"{name}\" is never reached from the entry scene." },
  HW0331: { severity: "warning", message: "Every option in this menu is \"once\", so it can run out of choices (it is then skipped)." },
  HW0401: { severity: "error", message: "The {lang} translation of line {id} {problem}." },
  HW0402: { severity: "info", message: "{count} line(s) aren't translated into {lang} yet." },
  HW0403: { severity: "warning", message: "The source of line {id} changed since this {lang} table was synced." },
  HW0404: { severity: "info", message: "{count} {lang} translation(s) need review." },
  HW0405: { severity: "warning", message: "Line {id} is in the {lang} table but no longer in the scripts." },
  HW0406: { severity: "error", message: "This string table can't be read: {reason}." },
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
