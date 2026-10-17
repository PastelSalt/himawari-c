/**
 * Plain-text rendering of a diagnostic in the plan §2.2 style:
 *
 *   error[HW0011]: Expected a quoted line of dialogue here.
 *     ┌─ script/ch1.hws:7:20
 *     │
 *   7 │     hana surprised
 *     │                   ^
 */
import type { Diagnostic } from "./syntax/diagnostics.js";
import { LineIndex } from "./syntax/position.js";

export function renderDiagnostic(d: Diagnostic, file: string, source: string, index = new LineIndex(source)): string {
  const { line, col } = index.at(d.span.start);
  const end = index.at(Math.max(d.span.start, d.span.end - 1));
  const text = index.lineText(line);
  const width = Math.max(1, end.line === line ? end.col - col + 1 : text.length - col + 1);
  const gutter = String(line).length;
  const pad = " ".repeat(gutter);
  return [
    `${d.severity}[${d.code}]: ${d.message}`,
    `${pad} ┌─ ${file}:${line}:${col}`,
    `${pad} │`,
    `${line} │ ${text}`,
    `${pad} │ ${" ".repeat(col - 1)}${"^".repeat(width)}`,
  ].join("\n");
}
