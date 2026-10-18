/**
 * Macros (Tier A, rfcs/0008) and extension statements (Tier B, rfcs/0007):
 * both are written `name(arg, key=value)`. A macro is defined in .hws with
 * `define statement` and expanded at compile time; an extension is declared in
 * `extensions/<name>.schema.json` and runs as native code in the runtime. Either
 * way the call is fully checked: arguments are typed by the parameters, and a
 * macro's expansion goes through the same checks as hand-written statements
 * (plan §12: every extension takes part in lint, completion, and translation).
 */
import type { ArgValue, Ast, AstResult, InvokeArg, MacroDef, Ref, Stmt } from "../syntax/ast.js";
import { parseAst } from "../syntax/ast.js";
import { type Diagnostic, type Span, diagnostic } from "../syntax/diagnostics.js";
import { lex } from "../syntax/lexer.js";
import { KEYWORDS } from "../syntax/parser.js";
import { suggest } from "./suggest.js";

/** Parameter types for macros and extensions. Asset types name their folder. */
export const PARAM_TYPES = ["character", "position", "scene", "bg", "cg", "music", "sfx", "ambient", "voice", "transition", "word", "int", "bool", "text"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export interface ExtensionParam {
  name: string;
  type: ParamType;
  /** Absent → required. */
  default?: number | boolean | string;
  /** For `word`: the allowed values. */
  enum?: string[];
  description?: string;
}

/** An extension statement's signature (`extensions/<name>.schema.json`). */
export interface ExtensionDef {
  name: string;
  file: string;
  description: string;
  /** The story waits until the extension finishes (like `wait`). */
  blocking: boolean;
  params: ExtensionParam[];
}

/** Statements a macro body can't contain: each needs its own line ID, which an expansion can't give. */
const NOT_IN_MACROS: Readonly<Record<string, string>> = { Say: "dialogue", Narration: "narration", Menu: "a menu" };
const MAX_DEPTH = 16;

export function readExtension(file: string, text: string): { ext: ExtensionDef | null; diagnostics: Diagnostic[] } {
  const fail = (reason: string) => ({ ext: null, diagnostics: [diagnostic("HW0120", { start: 0, end: 0 }, { reason })] });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return fail(`it isn't valid JSON (${(e as Error).message})`);
  }
  if (!raw || typeof raw !== "object") return fail("it must be a JSON object");
  const o = raw as Record<string, unknown>;
  const expected = file.replace(/^extensions\//, "").replace(/\.schema\.json$/, "");
  if (typeof o["name"] !== "string" || !/^[a-z_][a-z0-9_]*$/.test(o["name"])) return fail("\"name\" must be lowercase letters, digits, and _");
  if (o["name"] !== expected) return fail(`"name" must match the file name (${expected})`);
  if (KEYWORDS.has(o["name"])) return fail(`"${o["name"]}" is a reserved word`);
  const params: ExtensionParam[] = [];
  let texts = 0;
  for (const [i, p] of (Array.isArray(o["params"]) ? o["params"] : []).entries()) {
    const q = p as Record<string, unknown>;
    if (typeof q["name"] !== "string" || !/^[a-z_][a-z0-9_]*$/.test(q["name"])) return fail(`params[${i}].name must be lowercase letters, digits, and _`);
    if (!PARAM_TYPES.includes(q["type"] as ParamType)) return fail(`params[${i}].type must be one of ${PARAM_TYPES.join(", ")}`);
    if (q["type"] === "text") texts++;
    const param: ExtensionParam = { name: q["name"], type: q["type"] as ParamType };
    if (Array.isArray(q["enum"])) param.enum = q["enum"].filter((x): x is string => typeof x === "string");
    const d = q["default"];
    if (d !== undefined) {
      const why = defaultProblem(param.type, d, param.enum);
      if (why) return fail(`params[${i}].default ${why}`);
      param.default = d as number | boolean | string;
    }
    if (typeof q["description"] === "string") param.description = q["description"];
    params.push(param);
  }
  if (texts > 1) return fail("at most one parameter can be of type text (it gets the line's ID)");
  // XCALL carries 2 + one value per parameter in an 8-bit count (spec/bytecode.md §2.7).
  if (params.length > 253) return fail("a statement can have at most 253 parameters");
  if (o["params"] !== undefined && !Array.isArray(o["params"])) return fail("\"params\" must be a list");
  return {
    ext: {
      name: o["name"],
      file,
      description: typeof o["description"] === "string" ? o["description"] : "",
      blocking: o["blocking"] === true,
      params,
    },
    diagnostics: [],
  };
}

/** Why a schema default can't be a `type` value, or null. */
function defaultProblem(type: ParamType, d: unknown, allowed?: string[]): string | null {
  if (type === "text") return "isn't allowed: a text has a line ID, so it must be written in the call";
  if (type === "int") return typeof d === "number" && Number.isInteger(d) && d >= -2147483648 && d <= 2147483647 ? null : "must be a whole number";
  if (type === "bool") return typeof d === "boolean" ? null : "must be true or false";
  if (typeof d !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(d) || KEYWORDS.has(d)) return "must be a name, like the ones written in scripts";
  if (allowed && !allowed.includes(d)) return `must be one of ${allowed.join(", ")}`;
  return null;
}

export interface MacroEntry {
  def: MacroDef;
  file: string;
  source: string;
}

/** Collects macros project-wide, reporting duplicates, bad parameters, and statements a macro can't hold. */
export function collectMacros(
  files: { file: string; source: string; parsed: AstResult }[],
  extensions: ReadonlyMap<string, ExtensionDef>,
  report: (file: string) => Diagnostic[],
): Map<string, MacroEntry> {
  const macros = new Map<string, MacroEntry>();
  for (const f of files) {
    for (const def of f.parsed.ast.macros) {
      const out = report(f.file);
      if (!def.name) continue;
      const first = macros.get(def.name);
      if (first) {
        out.push(diagnostic("HW0225", def.span, { name: def.name, other: first.file }));
        continue;
      }
      if (extensions.has(def.name)) out.push(diagnostic("HW0226", def.span, { name: def.name }));
      const seen = new Set<string>();
      for (const p of def.params) {
        if (!PARAM_TYPES.includes(p.type as ParamType)) {
          out.push(diagnostic("HW0228", p.span, { type: p.type }, { note: `types: ${PARAM_TYPES.filter((t) => t !== "text").join(", ")}` }));
        } else if (p.type === "text") {
          out.push(diagnostic("HW0228", p.span, { type: p.type }, { note: "text needs a line ID, so macros can't take it; use an extension statement" }));
        }
        if (seen.has(p.name)) out.push(diagnostic("HW0221", p.span, { name: def.name, param: p.name }));
        seen.add(p.name);
        const wrong = p.default && PARAM_TYPES.includes(p.type as ParamType) ? typeProblem(p.type as ParamType, p.default) : null;
        if (p.default && wrong) {
          out.push(diagnostic("HW0223", p.span, { param: p.name, name: def.name, expected: wrong, value: valueText(p.default) }));
        }
      }
      walkStmts(def.body, (s) => {
        const what = NOT_IN_MACROS[s.kind];
        if (what) out.push(diagnostic("HW0227", s.span, { statement: what }));
      });
      macros.set(def.name, { def, file: f.file, source: f.source });
    }
  }
  return macros;
}

interface Signature {
  name: string;
  params: { name: string; type: ParamType; default: ArgValue | null; enum?: string[] }[];
}

const signatureOf = (m: MacroEntry | undefined, e: ExtensionDef | undefined): Signature | null => {
  if (m) return { name: m.def.name, params: m.def.params.map((p) => ({ name: p.name, type: p.type as ParamType, default: p.default })) };
  if (e) {
    return {
      name: e.name,
      params: e.params.map((p) => {
        const def: ArgValue | null =
          p.default === undefined ? null : typeof p.default === "number" ? { kind: "int", value: p.default } : { kind: "name", value: String(p.default) };
        return p.enum ? { name: p.name, type: p.type, default: def, enum: p.enum } : { name: p.name, type: p.type, default: def };
      }),
    };
  }
  return null;
};

/** Binds a call's arguments to parameters: positional first, then by name. Reports problems; returns the bound values. */
export function bindArgs(
  sig: Signature,
  args: readonly InvokeArg[],
  callSpan: Span,
  out: Diagnostic[],
): Map<string, { value: ArgValue; span: Span | null }> {
  const bound = new Map<string, { value: ArgValue; span: Span | null }>();
  let positional = 0;
  let texts = 0;
  const given = new Set<string>();
  for (const a of args) {
    if (a.value.kind === "text" && ++texts === 2) out.push(diagnostic("HW0229", a.span));
    let p;
    if (a.name === null) {
      p = sig.params[positional++];
      if (!p) {
        out.push(diagnostic("HW0224", a.span, { name: sig.name, count: String(sig.params.length) }));
        continue;
      }
    } else {
      p = sig.params.find((x) => x.name === a.name);
      if (!p) {
        out.push(diagnostic("HW0221", a.span, { name: sig.name, param: a.name }));
        continue;
      }
    }
    given.add(p.name);
    const problem = typeProblem(p.type, a.value, p.enum);
    if (problem) {
      out.push(diagnostic("HW0223", a.span, { param: p.name, name: sig.name, expected: problem, value: valueText(a.value) }));
      continue;
    }
    bound.set(p.name, { value: a.value, span: a.span });
  }
  for (const p of sig.params) {
    if (bound.has(p.name) || given.has(p.name)) continue;
    if (p.default) bound.set(p.name, { value: p.default, span: null });
    else out.push(diagnostic("HW0222", callSpan, { name: sig.name, param: p.name }));
  }
  return bound;
}

/** The values of an extension call that checked clean, in parameter order (null: an optional text left out). */
export function extensionValues(e: ExtensionDef, args: readonly InvokeArg[], at: Span): (ArgValue | null)[] {
  const bound = bindArgs(signatureOf(undefined, e) as Signature, args, at, []);
  return e.params.map((p) => bound.get(p.name)?.value ?? null);
}

const NAME_TYPES: ReadonlySet<string> = new Set(["character", "position", "scene", "bg", "cg", "music", "sfx", "ambient", "voice", "transition", "word"]);

/** Why `v` can't be a `type` (as the expected kind of value), or null. */
function typeProblem(type: ParamType, v: ArgValue, allowed?: string[]): string | null {
  if (type === "int") return v.kind === "int" ? null : "a whole number";
  if (type === "bool") return v.kind === "name" && (v.value === "true" || v.value === "false") ? null : "true or false";
  if (type === "text") return v.kind === "text" ? null : "text in quotes";
  if (NAME_TYPES.has(type)) {
    if (v.kind !== "name" || KEYWORDS.has(v.value)) return `a ${type === "word" ? "word" : `${type} name`}`;
    if (allowed && !allowed.includes(v.value)) return `one of ${allowed.join(", ")}`;
    return null;
  }
  return null;
}

export function valueText(v: ArgValue): string {
  return v.kind === "int" ? String(v.value) : v.kind === "name" ? v.value : `"${v.raw}"`;
}

/** The typed ref an argument stands for (validated, renamed, and hovered like a written one). */
function argRef(type: ParamType, value: ArgValue, span: Span): Ref | null {
  if (value.kind !== "name") return null;
  switch (type) {
    case "character":
      return { kind: "character", name: value.value, span };
    case "position":
      return { kind: "position", name: value.value, span };
    case "scene":
      return { kind: "scene", name: value.value, span };
    case "transition":
      return { kind: "transition", name: value.value, span, argCount: 0 };
    case "bg":
    case "cg":
    case "music":
    case "sfx":
    case "ambient":
    case "voice":
      return { kind: "asset", name: value.value, span, channel: type };
    default:
      return null;
  }
}

export interface Expansion {
  /** Each file's AST with macro calls replaced by their statements (extensions stay as Invoke). */
  asts: Map<string, Ast>;
  /** Refs from expansions, all placed at their call (checked like written refs, minus quick fixes). */
  expandedRefs: Map<string, Ref[]>;
}

/**
 * Checks every call (unknown names, arguments) and expands macros.
 * Adds typed refs for arguments to each file's refs (so rename and hover see them).
 */
export function expandInvokes(
  files: { file: string; source: string; parsed: AstResult }[],
  macros: ReadonlyMap<string, MacroEntry>,
  extensions: ReadonlyMap<string, ExtensionDef>,
  report: (file: string) => Diagnostic[],
): Expansion {
  const asts = new Map<string, Ast>();
  const expandedRefs = new Map<string, Ref[]>();
  for (const f of files) {
    const out = report(f.file);
    const extraRefs: Ref[] = [];
    const synthetic: Ref[] = [];
    /**
     * `chain`: the macros being expanded (empty for the script itself). Inside an expansion, statements are
     * already placed at the outermost call, so problems are reported there with a note; `passed` holds the
     * names the outermost call passed in, which were checked at their arguments already.
     */
    const visit = (body: Stmt[], chain: string[], passed: ReadonlySet<string>): Stmt[] => {
      const top = chain.length === 0;
      const note = top ? null : `inside the macro ${chain[chain.length - 1]}`;
      const report = (d: Diagnostic) => out.push(note ? { ...d, note: d.note ? `${d.note} (${note})` : note, fixes: [] } : d);
      const result: Stmt[] = [];
      for (const s of body) {
        if (s.kind === "If") {
          result.push({ ...s, clauses: s.clauses.map((c) => ({ ...c, body: visit(c.body, chain, passed) })) });
          continue;
        }
        if (s.kind === "Menu") {
          result.push({ ...s, options: s.options.map((o) => ({ ...o, body: visit(o.body, chain, passed) })) });
          continue;
        }
        if (s.kind !== "Invoke") {
          result.push(s);
          continue;
        }
        const m = macros.get(s.name);
        const e = extensions.get(s.name);
        const sig = signatureOf(m, e);
        if (!sig) {
          const close = suggest(s.name, [...macros.keys(), ...extensions.keys()]);
          report(diagnostic("HW0220", s.span, { name: s.name }, close ? { help: `did you mean "${close}"?` } : {}));
          result.push(s);
          continue;
        }
        const diags: Diagnostic[] = [];
        const bound = bindArgs(sig, s.args, s.span, diags);
        for (const d of diags) report(d);
        for (const p of sig.params) {
          const b = bound.get(p.name);
          if (!b?.span) continue;
          const r = argRef(p.type, b.value, top ? b.span : s.span);
          // A name written in the script is checked (and renamed) at its argument; one written in a macro body, at the call.
          if (r && top) extraRefs.push(r);
          else if (r && !passed.has(r.name)) synthetic.push(r);
        }
        if (!m) {
          result.push(s); // an extension: compiled to XCALL
          continue;
        }
        if (chain.includes(s.name) || chain.length >= MAX_DEPTH) {
          out.push(diagnostic("HW0230", s.span, { name: s.name, chain: [...chain, s.name].join(" → ") }));
          continue;
        }
        if (diags.some((d) => d.severity === "error")) continue;
        const exp = expandMacro(m, bound, s.span, out);
        // Names passed as arguments were checked at the argument (with a precise quick fix); skip them here.
        // (and names a nested call passes on were just checked at that call).
        const given = [...bound.values()].filter((b) => b.span).map((b) => valueText(b.value));
        const names = new Set([...passed, ...given]);
        synthetic.push(...exp.refs.filter((r) => r.kind !== "invoke" && !names.has(r.name)));
        result.push(...visit(exp.stmts, [...chain, s.name], names));
      }
      return result;
    };
    const ast = f.parsed.ast;
    asts.set(f.file, { ...ast, scenes: ast.scenes.map((sc) => ({ ...sc, body: visit(sc.body, [], new Set()) })) });
    f.parsed.refs.push(...extraRefs);
    f.parsed.refs.sort((a, b) => a.span.start - b.span.start);
    expandedRefs.set(f.file, synthetic);
  }
  return { asts, expandedRefs };
}

/** The macro body with arguments substituted, parsed; every statement and ref is placed at the call. */
function expandMacro(m: MacroEntry, bound: Map<string, { value: ArgValue; span: Span | null }>, at: Span, out: Diagnostic[]): { stmts: Stmt[]; refs: Ref[] } {
  const body = m.def.bodySpan;
  if (!body) return { stmts: [], refs: [] };
  const start = m.source.lastIndexOf("\n", body.start - 1) + 1;
  let end = m.source.indexOf("\n", body.end);
  if (end < 0) end = m.source.length;
  const text = m.source.slice(start, end);
  let substituted = "";
  let last = 0;
  for (const t of lex(text).tokens) {
    if (t.kind !== "Identifier") continue;
    const b = bound.get(t.text);
    if (!b) continue;
    substituted += text.slice(last, t.start) + valueText(b.value);
    last = t.start + t.text.length;
  }
  substituted += text.slice(last);
  const lines = substituted.split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  const scene = `scene __macro__:\n${lines.map((l) => `    ${l.slice(Math.min(indent, /^ */.exec(l)![0].length))}`).join("\n")}\n`;
  const r = parseAst(scene, `<macro ${m.def.name}>`);
  const note = `inside the macro ${m.def.name} (${m.file})`;
  for (const d of r.diagnostics) {
    if (d.severity === "error") out.push({ ...d, span: at, note, fixes: [] });
  }
  const place = <T extends { span: Span }>(x: T): T => ({ ...x, span: at });
  const relocate = (body: Stmt[]): Stmt[] =>
    body.map((s) => {
      if (s.kind === "If") return place({ ...s, clauses: s.clauses.map((c) => ({ ...c, body: relocate(c.body) })) });
      if (s.kind === "Menu") return place({ ...s, options: s.options.map((o) => place({ ...o, body: relocate(o.body) })) });
      return place(s);
    });
  return { stmts: relocate(r.ast.scenes[0]?.body ?? []), refs: r.refs.filter((x) => x.kind !== "sceneDecl").map((x) => ({ ...x, span: at })) };
}

export function walkStmts(body: readonly Stmt[], fn: (s: Stmt) => void): void {
  for (const s of body) {
    fn(s);
    if (s.kind === "If") for (const c of s.clauses) walkStmts(c.body, fn);
    if (s.kind === "Menu") for (const o of s.options) walkStmts(o.body, fn);
  }
}

