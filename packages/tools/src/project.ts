/** Loading a project through the sandbox, revisions, and the scenes inside files. */
import { createHash } from "node:crypto";
import {
  type Diagnostic,
  IMAGE_HEAD_BYTES,
  type ImageSize,
  LineIndex,
  type ProjectCheck,
  type ProjectInput,
  type Scene,
  type SourceFile,
  checkProject,
  imageSize,
  lex,
} from "@himawari/core";
import type { ProjectFs } from "./fs.js";

/** A short content hash: the `revision` that writes must quote back as `base_revision` (plan §10.2 rule 4). */
export function revisionOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function loadInput(fs: ProjectFs): ProjectInput {
  if (!fs.exists("himawari.json")) throw new Error("this folder has no himawari.json (is it a Himawari project?)");
  const read = (file: string): SourceFile => ({ file, text: fs.read(file) });
  const assets = fs.list("assets").map((f) => f.slice("assets/".length));
  return {
    manifest: read("himawari.json"),
    characters: fs.list("characters", (n) => n.endsWith(".md")).map(read),
    scripts: fs.list("script", (n) => n.endsWith(".hws")).map(read),
    assets,
    assetSizes: imageSizes(fs, assets),
    locales: fs.list("locales", (n) => n.endsWith(".json")).map(read),
    extensions: fs.list("extensions", (n) => n.endsWith(".schema.json")).map(read),
    ...(fs.exists("theme/theme.json") ? { theme: read("theme/theme.json") } : {}),
    ...(fs.exists("glossary.json") ? { glossary: read("glossary.json") } : {}),
  };
}

/** Image sizes already read, by full path, while the file's size and time are the same. */
const sizeCache = new Map<string, { stamp: string; size: ImageSize | null }>();

/**
 * The size of each background and CG (assets/bg, assets/cg), for the "too big" and
 * "wrong shape" hints (FINALIZATION.md W-10). Reads only each file's head, once.
 */
export function imageSizes(fs: ProjectFs, assets: readonly string[]): Map<string, ImageSize> {
  const out = new Map<string, ImageSize>();
  for (const a of assets) {
    if (!/^(bg|cg)\/.+\.(png|jpe?g|webp)$/i.test(a)) continue;
    const rel = `assets/${a}`;
    try {
      const key = fs.path(rel);
      const stamp = fs.stamp(rel);
      let hit = sizeCache.get(key);
      if (hit?.stamp !== stamp) {
        hit = { stamp, size: imageSize(fs.readHead(rel, IMAGE_HEAD_BYTES)) };
        sizeCache.set(key, hit);
      }
      if (hit.size) out.set(a, hit.size);
    } catch {
      /* vanished or locked: no hint for it this time */
    }
  }
  return out;
}

/** File changes: new text, or null to delete the file. */
export type Changes = Map<string, string | null>;

/** The input with some files replaced, added, or deleted (for validating a write before it lands). */
export function withChanges(input: ProjectInput, changes: ReadonlyMap<string, string | null>): ProjectInput {
  const swap = (files: SourceFile[] | undefined, dir: string, ext: string) => {
    const out: SourceFile[] = [];
    for (const f of files ?? []) {
      const c = changes.get(f.file);
      if (c === null) continue;
      out.push(c === undefined ? f : { file: f.file, text: c });
    }
    for (const [file, text] of changes) {
      if (text !== null && file.startsWith(`${dir}/`) && file.endsWith(ext) && !out.some((f) => f.file === file)) out.push({ file, text });
    }
    return out.sort((a, b) => (a.file < b.file ? -1 : 1));
  };
  const next: ProjectInput = {
    scripts: swap(input.scripts, "script", ".hws"),
    characters: swap(input.characters, "characters", ".md"),
    locales: swap(input.locales, "locales", ".json"),
    extensions: swap(input.extensions, "extensions", ".schema.json"),
  };
  if (input.assets) next.assets = input.assets;
  const manifest = changes.get("himawari.json");
  if (typeof manifest === "string") next.manifest = { file: "himawari.json", text: manifest };
  else if (input.manifest) next.manifest = input.manifest;
  const theme = changes.get("theme/theme.json");
  if (typeof theme === "string") next.theme = { file: "theme/theme.json", text: theme };
  else if (theme === undefined && input.theme) next.theme = input.theme;
  const glossary = changes.get("glossary.json");
  if (typeof glossary === "string") next.glossary = { file: "glossary.json", text: glossary };
  else if (glossary === undefined && input.glossary) next.glossary = input.glossary;
  return next;
}

export interface SceneLocation {
  scene: Scene;
  file: string;
  /** The scene's text: from its header to the next scene (or the end of the file). */
  start: number;
  end: number;
  text: string;
}

export function findScene(check: ProjectCheck, name: string): SceneLocation | null {
  for (const [file, r] of check.parsed) {
    const scenes = r.ast.scenes;
    const i = scenes.findIndex((s) => s.id === name);
    if (i < 0) continue;
    const source = check.files.find((f) => f.file === file)?.source ?? "";
    const scene = scenes[i] as Scene;
    const next = scenes[i + 1];
    const start = scene.span.start;
    const end = next ? lineStart(source, next.span.start) : source.length;
    return { scene, file, start, end, text: source.slice(start, end) };
  }
  return null;
}

/** Start of the line containing `pos`, keeping comments that sit directly above a scene with it. */
function lineStart(source: string, pos: number): number {
  let start = source.lastIndexOf("\n", pos - 1) + 1;
  for (;;) {
    const prev = source.lastIndexOf("\n", start - 2) + 1;
    if (start === 0 || !source.slice(prev, start).trimStart().startsWith("#")) return start;
    start = prev;
  }
}

/** Every line ID in the project's scripts. */
export function lineIdsOf(input: ProjectInput): Set<string> {
  const ids = new Set<string>();
  for (const s of input.scripts) for (const t of lex(s.text).tokens) if (t.kind === "LineTag") ids.add(t.text.trim().slice(6));
  return ids;
}

export interface DiagnosticJson {
  code: string;
  severity: string;
  file: string;
  line: number;
  col: number;
  message: string;
  help?: string;
  note?: string;
  fixes?: string[];
}

export function diagnosticsJson(check: ProjectCheck, onlyFiles?: ReadonlySet<string>): DiagnosticJson[] {
  const out: DiagnosticJson[] = [];
  for (const f of check.files) {
    if (onlyFiles && !onlyFiles.has(f.file)) continue;
    const idx = new LineIndex(f.source);
    for (const d of f.diagnostics) out.push(diagJson(f.file, idx, d));
  }
  return out;
}

function diagJson(file: string, idx: LineIndex, d: Diagnostic): DiagnosticJson {
  const { line, col } = idx.at(d.span.start);
  const j: DiagnosticJson = { code: d.code, severity: d.severity, file, line, col, message: d.message };
  if (d.help) j.help = d.help;
  if (d.note) j.note = d.note;
  if (d.fixes?.length) j.fixes = d.fixes.map((x) => x.title);
  return j;
}

export function describeDiagnostics(ds: readonly DiagnosticJson[], max = 20): string {
  const lines = ds.slice(0, max).map((d) => `${d.severity} ${d.code} ${d.file}:${d.line}:${d.col}: ${d.message}${d.help ? ` (${d.help})` : ""}`);
  if (ds.length > max) lines.push(`… and ${ds.length - max} more`);
  return lines.join("\n");
}

/** The last check per project folder: reading a big project is quick, checking it isn't (≈ 0.7 s for 35 000 lines). */
const lastCheck = new Map<string, { input: ProjectInput; check: ProjectCheck }>();

/** True when two inputs have the same files with the same text (and the same assets). */
function sameInput(a: ProjectInput, b: ProjectInput): boolean {
  const files = (i: ProjectInput) => [i.manifest, i.theme, ...(i.characters ?? []), ...(i.scripts ?? []), ...(i.locales ?? []), ...(i.extensions ?? [])];
  const fa = files(a);
  const fb = files(b);
  if (fa.length !== fb.length || (a.assets ?? []).length !== (b.assets ?? []).length) return false;
  for (let i = 0; i < fa.length; i++) {
    if (fa[i]?.file !== fb[i]?.file || fa[i]?.text !== fb[i]?.text) return false;
  }
  const assets = new Set(a.assets ?? []);
  return (b.assets ?? []).every((x) => assets.has(x));
}

/** Checks of inputs already checked (a write checks the project before and after; provenance reads the after again). */
const checked = new WeakMap<ProjectInput, ProjectCheck>();

/** checkProject, once per input object. */
export function checkInput(input: ProjectInput): ProjectCheck {
  let c = checked.get(input);
  if (!c) {
    c = checkProject(input);
    checked.set(input, c);
  }
  return c;
}

/** Loads and checks the project, reusing the last check while no file changed (compared by content, so it's never stale). */
export function check(fs: ProjectFs): { input: ProjectInput; check: ProjectCheck } {
  const input = loadInput(fs);
  const last = lastCheck.get(fs.root);
  if (last && sameInput(last.input, input)) return last;
  const result = { input, check: checkInput(input) };
  lastCheck.set(fs.root, result);
  return result;
}
