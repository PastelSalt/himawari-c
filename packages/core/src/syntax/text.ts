/**
 * Parser for the text inside a string literal (spec/language.md §2.2):
 * escapes, `[var]` interpolation, `{tag}…{/tag}` and `{tag=value}` tags, ruby
 * `{rb=reading}base{/rb}`, and `{select var: key="text" …}` variants.
 */
import { type Diagnostic, diagnostic } from "./diagnostics.js";

export type TextPart =
  | { t: string }
  | { var: string }
  | { tag: string; value?: string; children: TextPart[] }
  | { tag: string; value?: string }
  | { select: string; cases: Record<string, TextPart[]> };

/** Tags that wrap text and need a closing tag. */
const WRAPPING = new Set(["b", "i", "color", "size", "speed", "shake", "rb"]);
/** Tags that stand alone. */
const STANDALONE = new Set(["w", "nw", "alt"]);
/** Tags that require `=value`. */
const NEEDS_VALUE = new Set(["color", "size", "speed", "rb", "w", "alt"]);

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** A variable used in text: `[name]`, or the variable of a `{select …}` with its case keys. */
export interface TextRef {
  name: string;
  span: { start: number; end: number };
  selectCases?: string[];
}

export interface TextResult {
  parts: TextPart[];
  diagnostics: Diagnostic[];
  refs: TextRef[];
}

/**
 * Parses a string token's text (including its quotes). `offset` is the
 * token's position in the file, used for diagnostic spans.
 */
export function parseText(token: string, offset: number): TextResult {
  const diagnostics: Diagnostic[] = [];
  const refs: TextRef[] = [];
  const closed = token.length >= 2 && token.endsWith('"') && !token.endsWith('\\"');
  const body = token.slice(1, closed ? -1 : undefined);
  const base = offset + 1;

  // Stack of open wrapping tags; each frame collects its children.
  const root: TextPart[] = [];
  const stack: { tag: string; value?: string; children: TextPart[]; start: number }[] = [];
  const out = () => (stack.length ? (stack[stack.length - 1] as { children: TextPart[] }).children : root);
  let buf = "";
  const flush = () => {
    if (buf) out().push({ t: buf });
    buf = "";
  };

  let i = 0;
  while (i < body.length) {
    const c = body[i] as string;
    if (c === "\\" && i + 1 < body.length) {
      const n = body[i + 1] as string;
      buf += n === "n" ? "\n" : n;
      i += 2;
      continue;
    }
    if (c === "[") {
      const end = body.indexOf("]", i);
      const name = end > i ? body.slice(i + 1, end).trim() : "";
      if (end < 0 || !IDENT.test(name)) {
        diagnostics.push(diagnostic("HW0019", { start: base + i, end: base + (end < 0 ? body.length : end + 1) }));
        buf += c;
        i++;
        continue;
      }
      flush();
      out().push({ var: name });
      refs.push({ name, span: { start: base + i, end: base + end + 1 } });
      i = end + 1;
      continue;
    }
    if (c === "{") {
      const end = findClose(body, i);
      if (end < 0) {
        diagnostics.push(diagnostic("HW0017", { start: base + i, end: base + body.length }, { tag: body.slice(i + 1, i + 8) }));
        buf += body.slice(i);
        break;
      }
      const inner = body.slice(i + 1, end);
      const span = { start: base + i, end: base + end + 1 };
      i = end + 1;

      if (inner.startsWith("/")) {
        const name = inner.slice(1).trim();
        const top = stack[stack.length - 1];
        if (!top || top.tag !== name) {
          diagnostics.push(diagnostic("HW0018", span, { tag: name }));
          continue;
        }
        flush();
        stack.pop();
        const part: TextPart = top.value === undefined ? { tag: top.tag, children: top.children } : { tag: top.tag, value: top.value, children: top.children };
        out().push(part);
        continue;
      }

      if (inner.startsWith("select ") || inner.startsWith("select\t")) {
        flush();
        const sel = parseSelect(inner.slice(7), base, span, diagnostics);
        if (sel && "select" in sel) {
          out().push(sel);
          refs.push({ name: sel.select, span, selectCases: Object.keys(sel.cases) });
        }
        continue;
      }

      const eq = inner.indexOf("=");
      const name = (eq >= 0 ? inner.slice(0, eq) : inner).trim();
      const value = eq >= 0 ? inner.slice(eq + 1) : undefined;
      if (!WRAPPING.has(name) && !STANDALONE.has(name)) {
        diagnostics.push(diagnostic("HW0016", span, { tag: name }));
        continue;
      }
      if (NEEDS_VALUE.has(name) && value === undefined) {
        diagnostics.push(diagnostic("HW0021", span, { tag: name }));
        continue;
      }
      flush();
      if (STANDALONE.has(name)) {
        out().push(value === undefined ? { tag: name } : { tag: name, value });
      } else {
        stack.push(value === undefined ? { tag: name, children: [], start: span.start } : { tag: name, value, children: [], start: span.start });
      }
      continue;
    }
    buf += c;
    i++;
  }
  flush();

  // Unclosed tags: report, then keep their content inline so nothing is lost.
  while (stack.length) {
    const top = stack.pop() as { tag: string; children: TextPart[]; start: number };
    diagnostics.push(diagnostic("HW0017", { start: top.start, end: top.start + top.tag.length + 2 }, { tag: top.tag }));
    out().push(...top.children);
  }
  return { parts: mergeText(root), diagnostics, refs };
}

/** Index of the `}` closing the `{` at `from`, skipping quoted strings inside (for select). */
function findClose(s: string, from: number): number {
  let inQuote = false;
  for (let j = from + 1; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === '"') inQuote = !inQuote;
    else if (c === "}" && !inQuote) return j;
  }
  return -1;
}

function parseSelect(
  src: string,
  base: number,
  span: { start: number; end: number },
  diagnostics: Diagnostic[],
): TextPart | undefined {
  const colon = src.indexOf(":");
  const name = (colon >= 0 ? src.slice(0, colon) : "").trim();
  if (!IDENT.test(name)) {
    diagnostics.push(diagnostic("HW0020", span, { reason: "expected {select variable: key=\"text\" …}" }));
    return undefined;
  }
  const cases: Record<string, TextPart[]> = {};
  const re = /\s*([a-z_][a-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/gy;
  let rest = src.slice(colon + 1);
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(rest)) !== null) {
    const key = m[1] as string;
    const text = parseText(`"${m[2] as string}"`, base);
    cases[key] = text.parts;
    consumed = re.lastIndex;
  }
  rest = rest.slice(consumed).trim();
  if (rest.length > 0) {
    diagnostics.push(diagnostic("HW0020", span, { reason: `unexpected "${rest.slice(0, 20)}"` }));
  }
  if (!("other" in cases)) {
    diagnostics.push(diagnostic("HW0020", span, { reason: "an \"other\" case is required" }));
  }
  return { select: name, cases };
}

function mergeText(parts: TextPart[]): TextPart[] {
  const out: TextPart[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if ("t" in p && prev && "t" in prev) prev.t += p.t;
    else out.push(p);
  }
  return out;
}

/** Plain text of parts, for search, previews, and diffs. */
export function plainText(parts: TextPart[]): string {
  let s = "";
  for (const p of parts) {
    if ("t" in p) s += p.t;
    else if ("var" in p) s += `[${p.var}]`;
    else if ("select" in p) s += p.cases["other"] ? plainText(p.cases["other"]) : "";
    else if ("children" in p) s += plainText(p.children);
  }
  return s;
}
