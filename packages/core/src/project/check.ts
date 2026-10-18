/**
 * Semantic validator (plan §9.1 `validator`, P6). Pure: callers pass file
 * contents and the asset list; Core does no I/O, so the CLI, Studio, and MCP
 * all get identical results.
 */
import { pushAll } from "../arrays.js";
import { type AstResult, type Expr, type MenuOption, type Ref, type Stmt, endsFlow, parseAst } from "../syntax/ast.js";
import { type Diagnostic, type DiagnosticCode, type Span, diagnostic } from "../syntax/diagnostics.js";
import { lex } from "../syntax/lexer.js";
import type { Ast } from "../syntax/ast.js";
import { type Character, characterWords, readCharacter } from "./character.js";
import { type ExtensionDef, type MacroEntry, collectMacros, expandInvokes, readExtension } from "./invoke.js";
import { type ThemeEntries, readTheme } from "./theme.js";
import { DEFAULT_POSITIONS, type Manifest, type VarType, readManifest } from "./manifest.js";
import { listNames, suggest } from "./suggest.js";
import { type L10nTable, type SourceLine, collectLines, parityProblems, parseTable } from "../l10n/table.js";

export interface SourceFile {
  /** Project-relative path with forward slashes, e.g. script/ch1.hws. */
  file: string;
  text: string;
}

export interface ProjectInput {
  /** himawari.json, if the project has one. Without it, variable and flow checks are skipped. */
  manifest?: SourceFile;
  /** characters/*.md */
  characters?: SourceFile[];
  /** script/*.hws */
  scripts: SourceFile[];
  /** Files under assets/, relative to it (e.g. bg/classroom_day.png). Omit to skip asset checks. */
  assets?: readonly string[];
  /** locales/<lang>.json string tables. */
  locales?: SourceFile[];
  /** extensions/<name>.schema.json: extension statement signatures (rfcs/0007). */
  extensions?: SourceFile[];
  /** theme/theme.json (rfcs/0007). */
  theme?: SourceFile;
}

export interface FileReport {
  file: string;
  source: string;
  diagnostics: Diagnostic[];
}

export interface ProjectCheck {
  files: FileReport[];
  manifest: Manifest | null;
  characters: Map<string, Character>;
  /** Parsed scripts by file, for callers that also need the AST or refs. */
  parsed: Map<string, AstResult>;
  /** String tables from locales/ that could be read (the compiler builds LOCL from them). */
  locales: L10nTable[];
  /** Each script's AST with macro calls expanded (for the compiler, flow checks, and the story graph). */
  expanded: Map<string, Ast>;
  macros: Map<string, MacroEntry>;
  extensions: Map<string, ExtensionDef>;
  /** The compiled theme, when the project has one that could be read. */
  theme: ThemeEntries | null;
}

/** Built-in transitions and how many arguments each accepts (spec/language.md §2.4). */
const TRANSITIONS: Readonly<Record<string, readonly [number, number, string]>> = {
  fade: [0, 1, "an optional duration, like fade(300)"],
  dissolve: [0, 1, "an optional duration, like dissolve(500)"],
  slide_left: [0, 1, "an optional duration"],
  slide_right: [0, 1, "an optional duration"],
  slide_up: [0, 1, "an optional duration"],
  slide_down: [0, 1, "an optional duration"],
  wipe: [0, 1, "an optional duration"],
  rule: [1, 2, "a mask image and an optional duration, like rule(wipe_left, 500)"],
};

/** Asset folder per channel (plan §5.5; rule masks live in assets/rules/). */
const ASSET_FOLDERS: Readonly<Record<string, string>> = {
  bg: "bg", cg: "cg", music: "music", sfx: "sfx", ambient: "ambient", voice: "voice", rule: "rules",
};

/** The player character; always a valid speaker. */
const PLAYER = "me";

/**
 * The last parse of each file, reused while its text is the same: Studio checks the whole project after
 * every pause in typing, and a big project has a hundred files that didn't change (parsing is most of the work).
 * Callers get their own `refs` and `diagnostics` arrays, because checking adds to them.
 */
const parses = new Map<string, { text: string; result: AstResult }>();
function parseCached(text: string, file: string): AstResult {
  let hit = parses.get(file);
  if (!hit || hit.text !== text) {
    hit = { text, result: parseAst(text, file) };
    parses.set(file, hit);
    if (parses.size > 4000) parses.delete(parses.keys().next().value as string); // projects come and go; keep it bounded
  }
  return { ...hit.result, refs: [...hit.result.refs], diagnostics: [...hit.result.diagnostics] };
}

export function checkProject(input: ProjectInput): ProjectCheck {
  const reports = new Map<string, FileReport>();
  const report = (file: string, source: string) => {
    let r = reports.get(file);
    if (!r) reports.set(file, (r = { file, source, diagnostics: [] }));
    return r;
  };

  // Manifest and characters.
  let manifest: Manifest | null = null;
  if (input.manifest) {
    const m = readManifest(input.manifest.text);
    manifest = m.manifest;
    pushAll(report(input.manifest.file, input.manifest.text).diagnostics, m.diagnostics);
  }
  const characters = new Map<string, Character>();
  for (const cf of input.characters ?? []) {
    const c = readCharacter(cf.file, cf.text, input.assets ?? []);
    pushAll(report(cf.file, cf.text).diagnostics, c.diagnostics);
    if (c.character) characters.set(c.character.id, c.character);
  }

  const extensions = new Map<string, ExtensionDef>();
  for (const ef of input.extensions ?? []) {
    const e = readExtension(ef.file, ef.text);
    pushAll(report(ef.file, ef.text).diagnostics, e.diagnostics);
    if (e.ext) extensions.set(e.ext.name, e.ext);
  }
  let theme: ThemeEntries | null = null;
  if (input.theme) {
    const t = readTheme(input.theme.text, manifest ? { aspect: manifest.resolution[0] / manifest.resolution[1] } : {});
    pushAll(report(input.theme.file, input.theme.text).diagnostics, t.diagnostics);
    theme = t.entries;
  }

  // Parse every script, then build the project-wide index.
  const parsed = new Map<string, AstResult>();
  for (const s of input.scripts) {
    const r = parseCached(s.text, s.file);
    parsed.set(s.file, r);
    pushAll(report(s.file, s.text).diagnostics, r.diagnostics);
  }

  // Macros and extension statements: check every call, expand macros (rfcs/0007, rfcs/0008).
  const files = input.scripts.map((s) => ({ file: s.file, source: s.text, parsed: parsed.get(s.file) as AstResult }));
  const reportFile = (file: string) => report(file, input.scripts.find((x) => x.file === file)?.text ?? "").diagnostics;
  const macros = collectMacros(files, extensions, reportFile);
  const expansion = expandInvokes(files, macros, extensions, reportFile);

  const scenes = new Map<string, { file: string; span: Span }>();
  const lineIds = new Map<string, string>();
  for (const s of input.scripts) {
    const r = parsed.get(s.file) as AstResult;
    for (const ref of r.refs) {
      if (ref.kind !== "sceneDecl") continue;
      const first = scenes.get(ref.name);
      if (first) {
        report(s.file, s.text).diagnostics.push(diagnostic("HW0209", ref.span, { name: ref.name, other: first.file }));
      } else {
        scenes.set(ref.name, { file: s.file, span: ref.span });
      }
    }
    for (const t of lex(s.text).tokens) {
      if (t.kind !== "LineTag") continue;
      const id = t.text.slice("#line:".length);
      const other = lineIds.get(id);
      if (other !== undefined) {
        report(s.file, s.text).diagnostics.push(
          diagnostic("HW0216", { start: t.start, end: t.start + t.text.length }, { id, other }, { help: "run hwc fmt to give the later copy a new ID" }),
        );
      } else {
        lineIds.set(id, s.file);
      }
    }
  }

  // Scenes that some file `call`s (a `return` anywhere else is suspicious).
  const calls = new Set<string>();
  for (const ast of expansion.asts.values()) {
    for (const sc of ast.scenes) walk(sc.body, (x) => {
      if (x.kind === "Call") calls.add(x.target);
    });
  }

  const ctx: Ctx = { manifest, characters, scenes, calls, assets: input.assets };
  for (const s of input.scripts) {
    const r = parsed.get(s.file) as AstResult;
    const out = report(s.file, s.text).diagnostics;
    checkRefs(r.refs, ctx, out);
    // Names that came from a macro body: reported at the call, without quick fixes (they'd edit the wrong text).
    const fromMacros: Diagnostic[] = [];
    checkRefs(expansion.expandedRefs.get(s.file) ?? [], ctx, fromMacros);
    pushAll(out, fromMacros.map((d) => ({ ...d, fixes: [], note: d.note ? `${d.note} (from a macro)` : "from a macro" })));
    checkTypesAndFlow({ ...r, ast: expansion.asts.get(s.file) ?? r.ast }, s.text, ctx, out);
  }

  // Project-level flow: the entry scene and reachability.
  if (manifest && input.manifest && manifest.entry) {
    if (!scenes.has(manifest.entry)) {
      report(input.manifest.file, input.manifest.text).diagnostics.push(
        diagnostic("HW0215", { start: 0, end: 0 }, { name: manifest.entry }, withSuggestion(manifest.entry, scenes.keys())),
      );
    } else {
      const reachable = reachableScenes(manifest.entry, expansion.asts);
      for (const [name, where] of scenes) {
        if (!reachable.has(name)) {
          const src = input.scripts.find((x) => x.file === where.file) as SourceFile;
          report(where.file, src.text).diagnostics.push(diagnostic("HW0321", where.span, { name }));
        }
      }
    }
  }

  // String tables: placeholder parity and freshness (plan §7).
  const locales: L10nTable[] = [];
  if (input.locales?.length) {
    const lines = new Map(collectLines(parsed).map((l) => [l.id, l]));
    for (const lf of input.locales) {
      const table = checkLocale(lf, lines, report(lf.file, lf.text).diagnostics);
      if (table) locales.push(table);
    }
  }

  for (const r of reports.values()) r.diagnostics.sort((a, b) => a.span.start - b.span.start);
  return { files: [...reports.values()], manifest, characters, parsed, locales, expanded: expansion.asts, macros, extensions: extensions, theme };
}

/** String tables as last read, per file, reused while the text is the same (a big game's table is megabytes). */
const tables = new Map<string, { text: string; table: L10nTable; ids: Map<string, number> | null }>();
/** Placeholder checks of (source, translation) pairs already done: most lines don't change between checks. */
const parity = new Map<string, readonly string[]>();

function parityCached(source: string, text: string): readonly string[] {
  const key = `${source}\u0000${text}`;
  let p = parity.get(key);
  if (!p) {
    p = parityProblems(source, text);
    if (parity.size > 400000) parity.clear();
    parity.set(key, p);
  }
  return p;
}

function checkLocale(lf: SourceFile, lines: ReadonlyMap<string, SourceLine>, out: Diagnostic[]): L10nTable | null {
  let cached = tables.get(lf.file);
  if (!cached || cached.text !== lf.text) {
    try {
      cached = { text: lf.text, table: parseTable(lf.text), ids: null };
    } catch (e) {
      out.push(diagnostic("HW0406", { start: 0, end: 0 }, { reason: (e as Error).message }));
      return null;
    }
    tables.set(lf.file, cached);
  }
  const entry = cached;
  const table = entry.table;
  const lang = table.language;
  // Where each line's entry is: found once per file (a search per diagnostic is slow when thousands of lines changed).
  const at = (id: string): Span => {
    if (!entry.ids) {
      entry.ids = new Map();
      for (const m of lf.text.matchAll(/"id"\s*:\s*"([^"]+)"/g)) entry.ids.set(m[1] ?? "", (m.index ?? 0) + m[0].length - (m[1] ?? "").length - 2);
    }
    const i = entry.ids.get(id) ?? -1;
    return i < 0 ? { start: 0, end: 0 } : { start: i, end: i + id.length + 2 };
  };
  let missing = 0;
  let review = 0;
  for (const e of table.lines) {
    const src = lines.get(e.id);
    if (!src) {
      out.push(diagnostic("HW0405", at(e.id), { id: e.id, lang }, { help: "run hwc l10n sync" }));
      continue;
    }
    if (e.text === "") missing++;
    else if (e.status === "needs-review") review++;
    if (src.text !== e.source) {
      // The writer changed the line since it was translated: the translation needs review, and its markup is
      // checked again then. Never an error, so editing a translated line is never refused.
      out.push(diagnostic("HW0403", at(e.id), { id: e.id, lang }, { help: "run hwc l10n sync" }));
      continue;
    }
    for (const problem of parityCached(src.text, e.text)) out.push(diagnostic("HW0401", at(e.id), { lang, id: e.id, problem }));
  }
  const inTable = new Set(table.lines.map((e) => e.id));
  missing += [...lines.keys()].filter((id) => !inTable.has(id)).length;
  if (missing > 0) out.push(diagnostic("HW0402", { start: 0, end: 0 }, { count: String(missing), lang }, { help: "run hwc l10n sync, then hwc l10n export" }));
  if (review > 0) out.push(diagnostic("HW0404", { start: 0, end: 0 }, { count: String(review), lang }));
  return table;
}

interface Ctx {
  manifest: Manifest | null;
  characters: Map<string, Character>;
  scenes: Map<string, { file: string; span: Span }>;
  /** Every scene that is the target of a `call` anywhere in the project. */
  calls: Set<string>;
  assets: readonly string[] | undefined;
}

function withSuggestion(name: string, candidates: Iterable<string>, span?: Span): Pick<Diagnostic, "help" | "fixes"> {
  const s = suggest(name, candidates);
  if (!s) return {};
  return span
    ? { help: `did you mean "${s}"?`, fixes: [{ title: `Change to "${s}"`, edits: [{ span, text: s }] }] }
    : { help: `did you mean "${s}"?` };
}

function checkRefs(refs: readonly Ref[], ctx: Ctx, out: Diagnostic[]): void {
  const push = (code: DiagnosticCode, ref: Ref, params: Record<string, string>, extra: Pick<Diagnostic, "help" | "note" | "fixes"> = {}) =>
    out.push(diagnostic(code, ref.span, params, extra));
  const positions = ctx.manifest ? ctx.manifest.positions : DEFAULT_POSITIONS;

  for (const ref of refs) {
    switch (ref.kind) {
      case "speaker":
      case "character": {
        if (ref.name === PLAYER || ctx.characters.has(ref.name)) break;
        const extra = withSuggestion(ref.name, ctx.characters.keys(), ref.span);
        push(ref.kind === "speaker" ? "HW0201" : "HW0202", ref, { name: ref.name }, {
          ...extra,
          help: extra.help ?? `create characters/${ref.name}.md to add this character`,
        });
        break;
      }
      case "attr": {
        const c = ctx.characters.get(ref.owner ?? "");
        if (!c || !c.hasSprite) break; // unknown owner is reported above; no sprite = placeholder (P5)
        const words = characterWords(c);
        if (words.has(ref.name)) break;
        push("HW0204", ref, { character: c.displayName, name: ref.name }, {
          ...withSuggestion(ref.name, words, nameSpan(ref)),
          note: `${c.displayName}'s expressions: ${listNames(c.presets.size > 0 ? c.presets : words)}`,
        });
        break;
      }
      case "position":
        if (!(ref.name in positions)) {
          push("HW0205", ref, { name: ref.name }, { ...withSuggestion(ref.name, Object.keys(positions), ref.span), note: `positions: ${listNames(Object.keys(positions))}` });
        }
        break;
      case "transition": {
        const t = TRANSITIONS[ref.name];
        if (!t) {
          push("HW0206", ref, { name: ref.name }, { ...withSuggestion(ref.name, Object.keys(TRANSITIONS), ref.span), note: `transitions: ${listNames(Object.keys(TRANSITIONS))}` });
        } else if ((ref.argCount ?? 0) < t[0] || (ref.argCount ?? 0) > t[1]) {
          push("HW0207", ref, { name: ref.name, expected: t[2] });
        }
        break;
      }
      case "scene":
        if (!ctx.scenes.has(ref.name)) push("HW0208", ref, { name: ref.name }, withSuggestion(ref.name, ctx.scenes.keys(), ref.span));
        break;
      case "asset": {
        if (!ctx.assets) break;
        const folder = ASSET_FOLDERS[ref.channel ?? ""];
        if (!folder) break;
        const prefix = `${folder}/${ref.name}.`;
        if (ctx.assets.some((a) => a.startsWith(prefix))) break;
        const names = ctx.assets.filter((a) => a.startsWith(`${folder}/`)).map((a) => a.slice(folder.length + 1).replace(/\.[^.]+$/, ""));
        push("HW0213", ref, { channel: ref.channel === "rule" ? "rule mask" : (ref.channel ?? ""), name: ref.name, folder }, withSuggestion(ref.name, names, ref.span));
        break;
      }
      case "variable": {
        if (!ctx.manifest) break;
        const decl = ctx.manifest.variables[ref.name];
        if (!decl) {
          const extra = withSuggestion(ref.name, Object.keys(ctx.manifest.variables), ref.selectCases ? undefined : nameSpan(ref));
          push("HW0210", ref, { name: ref.name }, { ...extra, help: extra.help ?? "declare it under \"variables\" in himawari.json" });
          break;
        }
        if (ref.selectCases) {
          if (decl.type !== "str" || !decl.enum) {
            push("HW0217", ref, { name: ref.name });
          } else {
            for (const key of ref.selectCases) {
              if (key !== "other" && !decl.enum.includes(key)) {
                push("HW0212", ref, { value: key, name: ref.name }, { note: `${ref.name}: ${decl.enum.join(", ")}` });
              }
            }
          }
        }
        break;
      }
      case "function":
        if (ref.name !== "rand") push("HW0214", ref, { name: ref.name }, { help: "the only function is rand(n)" });
        break;
      case "invoke":
        break; // checked with its arguments in invoke.ts
      default:
        break;
    }
  }
}

/** For `[name]` text refs the span includes the brackets; the fix should replace only the name. */
function nameSpan(ref: Ref): Span {
  return ref.span.end - ref.span.start === ref.name.length + 2 ? { start: ref.span.start + 1, end: ref.span.end - 1 } : ref.span;
}

// ---- types and flow ----

type T = VarType | "unknown";

function checkTypesAndFlow(r: AstResult, source: string, ctx: Ctx, out: Diagnostic[]): void {
  const vars = ctx.manifest?.variables;
  /** The rest of the line from `offset`, skipping its indentation so carets point at the statement. */
  const lineAt = (offset: number): Span => {
    let start = offset;
    while (source[start] === " " || source[start] === "\t") start++;
    const nl = source.indexOf("\n", start);
    return { start, end: nl < 0 ? source.length : nl };
  };
  const typeError = (span: Span, problem: string) => out.push(diagnostic("HW0211", span, { problem }));

  const typeOf = (e: Expr, problems: string[]): T => {
    switch (e.kind) {
      case "Int":
        return "int";
      case "Bool":
        return "bool";
      case "Str":
        return "str";
      case "Var":
        return vars?.[e.name]?.type ?? "unknown";
      case "Call":
        if (e.args.length !== 1 || typeOf(e.args[0] as Expr, problems) === "bool") problems.push("rand takes one whole number, like rand(6)");
        return "int";
      case "Unary": {
        const t = typeOf(e.operand, problems);
        const want = e.op === "not" ? "bool" : "int";
        if (t !== "unknown" && t !== want) problems.push(`"${e.op}" needs a${want === "int" ? " number" : " true/false value"}, not ${t}`);
        return want;
      }
      case "Binary": {
        const l = typeOf(e.left, problems);
        const rt = typeOf(e.right, problems);
        const known = l !== "unknown" && rt !== "unknown";
        if (["+", "-", "*", "/", "%"].includes(e.op)) {
          if ((l !== "unknown" && l !== "int") || (rt !== "unknown" && rt !== "int")) problems.push(`"${e.op}" works on numbers, not ${l === "int" ? rt : l}`);
          return "int";
        }
        if (["<", "<=", ">", ">="].includes(e.op)) {
          if ((l !== "unknown" && l !== "int") || (rt !== "unknown" && rt !== "int")) problems.push(`"${e.op}" compares numbers, not ${l === "int" ? rt : l}`);
          return "bool";
        }
        if (e.op === "==" || e.op === "!=") {
          if (known && l !== rt) problems.push(`can't compare ${l} with ${rt}`);
          return "bool";
        }
        if (e.op === "and" || e.op === "or") {
          if ((l !== "unknown" && l !== "bool") || (rt !== "unknown" && rt !== "bool")) problems.push(`"${e.op}" needs true/false values on both sides`);
          return "bool";
        }
        return "unknown";
      }
      default:
        return "unknown";
    }
  };

  const condition = (cond: Expr | null, at: number) => {
    if (!cond || !vars) return;
    const problems: string[] = [];
    const t = typeOf(cond, problems);
    if (t !== "unknown" && t !== "bool") problems.push(`a condition must be true/false, not ${t}`);
    for (const p of problems) typeError(lineAt(at), p);
  };

  for (const scene of r.ast.scenes) {
    walk(scene.body, (s) => {
      if (s.kind === "Assign" && vars) {
        const decl = vars[s.name];
        if (!decl) return; // HW0210 already reported
        const problems: string[] = [];
        const t = typeOf(s.value, problems);
        if (s.op !== "=" && decl.type !== "int") problems.push(`"${s.op}" needs a number variable, but ${s.name} is ${decl.type}`);
        else if (t !== "unknown" && t !== decl.type) problems.push(`${s.name} is ${decl.type}, but the value is ${t}`);
        if (decl.enum && s.value.kind === "Str" && !decl.enum.includes(s.value.value)) {
          out.push(diagnostic("HW0212", lineAt(s.span.start), { value: s.value.value, name: s.name }, { note: `${s.name}: ${decl.enum.join(", ")}` }));
        }
        for (const p of problems) typeError(lineAt(s.span.start), p);
      } else if (s.kind === "If") {
        for (const c of s.clauses) condition(c.cond, s.span.start);
      } else if (s.kind === "Menu") {
        for (const o of s.options) condition(o.cond, o.span.start);
        if (s.options.length > 0 && s.options.every((o: MenuOption) => o.once)) out.push(diagnostic("HW0331", lineAt(s.span.start)));
        // MENU carries 2 + 2 × options arguments in an 8-bit count (spec/bytecode.md §2.7).
        if (s.options.length > MAX_MENU_OPTIONS) {
          out.push(diagnostic("HW0332", lineAt(s.span.start), { max: String(MAX_MENU_OPTIONS), count: String(s.options.length) }));
        }
      } else if (s.kind === "Show" || s.kind === "Say") {
        // SHOW carries 7 + attribute words arguments in an 8-bit count.
        const words = s.kind === "Show" ? s.add.length + s.remove.length : s.attrs.add.length + s.attrs.remove.length;
        if (words > MAX_ATTR_WORDS) out.push(diagnostic("HW0333", lineAt(s.span.start), { max: String(MAX_ATTR_WORDS), count: String(words) }));
      } else if (s.kind === "Return" && !ctx.calls.has(scene.id)) {
        out.push(diagnostic("HW0310", s.span, { scene: scene.id }));
      }
    });
    if (!endsFlow(scene.body)) {
      const decl = r.refs.find((x) => x.kind === "sceneDecl" && x.name === scene.id && x.span.start >= scene.span.start);
      out.push(diagnostic("HW0320", decl?.span ?? lineAt(scene.span.start), { name: scene.id }, { help: "end it with jump, return, or end" }));
    }
  }
}

/** Bytecode limits: an instruction has at most 255 arguments (spec/bytecode.md §2.7). */
const MAX_MENU_OPTIONS = 126;
const MAX_ATTR_WORDS = 248;

/** Visits every statement, including inside if branches and menu options. */
function walk(body: readonly Stmt[], fn: (s: Stmt) => void): void {
  for (const s of body) {
    fn(s);
    if (s.kind === "If") for (const c of s.clauses) walk(c.body, fn);
    if (s.kind === "Menu") for (const o of s.options) walk(o.body, fn);
  }
}

function reachableScenes(entry: string, asts: Map<string, Ast>): Set<string> {
  const edges = new Map<string, Set<string>>();
  for (const ast of asts.values()) {
    for (const sc of ast.scenes) {
      const targets = edges.get(sc.id) ?? new Set<string>();
      walk(sc.body, (s) => {
        if (s.kind === "Jump" || s.kind === "Call") targets.add(s.target);
      });
      edges.set(sc.id, targets);
    }
  }
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    for (const next of edges.get(queue.pop() as string) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
