/**
 * Diagnostics (plan §2.2 P6, §9.1). Every diagnostic carries a stable code and
 * parameters, so Studio can render it in the UI language (plan §11.5); the
 * English `message` is the default rendering used by the CLI.
 */

export type Severity = "error" | "warning" | "info";

export interface Span {
  /** Offset of the first UTF-16 code unit. */
  start: number;
  /** Offset one past the last UTF-16 code unit. */
  end: number;
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  span: Span;
  params: Record<string, string>;
}

/** Syntax diagnostics, HW0001–HW0099. Semantic codes (HW02xx, HW03xx) live with the validator. */
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

export type DiagnosticCode = keyof typeof SYNTAX_DIAGNOSTICS;

export function diagnostic(code: DiagnosticCode, span: Span, params: Record<string, string> = {}): Diagnostic {
  const def = SYNTAX_DIAGNOSTICS[code];
  const message = def.message.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
  return { code, severity: def.severity, message, span, params };
}
