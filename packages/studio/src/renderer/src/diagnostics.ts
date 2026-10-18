/** Core diagnostics in the UI language (plan §11.5): by code and parameters, with Core's English as the fallback. */
import type { Diagnostic } from "@himawari/core";
import { useIntl } from "react-intl";

export interface DiagnosticText {
  message: string;
  /** A localized "did you mean" when Core offers a one-word fix; otherwise Core's own hint. */
  help: string | null;
  note: string | null;
}

export function useDiagnosticText(): (d: Diagnostic) => DiagnosticText {
  const intl = useIntl();
  return (d) => {
    const id = `diag.${d.code}`;
    const message = id in intl.messages ? intl.formatMessage({ id }, d.params) : d.message;
    const fix = d.fixes?.[0];
    const single = fix && fix.edits.length === 1 ? fix.edits[0]!.text : null;
    const help = single !== null && /^[\p{L}\p{N}_]+$/u.test(single) ? intl.formatMessage({ id: "diagnostic.didYouMean" }, { suggestion: single }) : (d.help ?? null);
    return { message, help, note: d.note ?? null };
  };
}

/** Applies a quick fix's edits to a text (P6: one click). */
export function applyFix(text: string, edits: { span: { start: number; end: number }; text: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.span.start - a.span.start)) out = out.slice(0, e.span.start) + e.text + out.slice(e.span.end);
  return out;
}
