/**
 * The open project, owned by main (plan §4.2: when Studio runs, it owns writes).
 * Text files are autosaved as the user types; every save rebuilds
 * build/game.hwb so the preview can reload in place (P1, P2). Changes made
 * outside Studio (another editor, git) are picked up by a watcher.
 */
import { createHash } from "node:crypto";
import { type FSWatcher, cpSync, existsSync, mkdirSync, watch } from "node:fs";
import { basename, join, resolve } from "node:path";
import { ProjectFs, compileProject, initProject, packageGame, safeName } from "@himawari/tools";
import { zipSync } from "fflate";
import type { BuildReport, FileChange, NewProjectOptions, ProjectFile, ProjectSnapshot } from "../shared/api.js";

/** The text files Studio loads and edits. */
export function isProjectText(file: string): boolean {
  if (file === "himawari.json" || file === "AGENTS.md" || file === "CLAUDE.md") return true;
  if (file.startsWith("script/") && file.endsWith(".hws")) return true;
  if (file.startsWith("characters/") && file.endsWith(".md")) return true;
  if (file.startsWith("locales/") && file.endsWith(".json")) return true;
  if (file.startsWith("extensions/") && file.endsWith(".schema.json")) return true;
  if (file === "theme/theme.json") return true;
  return false;
}

/** Files Studio may write as text: the project's own files plus translation exchange files. */
function isWritableText(file: string): boolean {
  return isProjectText(file) || (file.startsWith("locales/") && (file.endsWith(".csv") || file.endsWith(".xlf")));
}

const IGNORED = /^(build|\.git|\.himawari|node_modules)(\/|$)/;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ProjectEvents {
  changed(changes: FileChange[], assets: string[] | null): void;
  built(report: BuildReport & { ms: number }): void;
}

export class Project {
  readonly fs: ProjectFs;
  /** What Studio believes is on disk, by content hash (to tell our writes from outside changes). */
  private known = new Map<string, string>();
  private watcher: FSWatcher | null = null;
  private pending = new Set<string>();
  private watchTimer: NodeJS.Timeout | null = null;
  private buildTimer: NodeJS.Timeout | null = null;
  private assetsCache: string[] = [];

  constructor(
    root: string,
    private events: ProjectEvents,
  ) {
    this.fs = new ProjectFs(root);
    if (!this.fs.exists("himawari.json")) throw new Error("This folder has no himawari.json, so it isn't a Himawari project.");
  }

  get root(): string {
    return this.fs.root;
  }

  /** The language the game is written in (the preview starts in it, like render_line). */
  sourceLanguage(): string | undefined {
    try {
      const m = JSON.parse(this.fs.read("himawari.json")) as { sourceLanguage?: unknown };
      return typeof m.sourceLanguage === "string" ? m.sourceLanguage : undefined;
    } catch {
      return undefined;
    }
  }

  snapshot(): ProjectSnapshot {
    const files: ProjectFile[] = [];
    const add = (file: string) => {
      const text = this.fs.read(file);
      this.known.set(file, hash(text));
      files.push({ file, text });
    };
    for (const f of ["himawari.json", "AGENTS.md"]) if (this.fs.exists(f)) add(f);
    for (const f of this.fs.list("script", (n) => n.endsWith(".hws"))) add(f);
    for (const f of this.fs.list("characters", (n) => n.endsWith(".md"))) add(f);
    for (const f of this.fs.list("locales", (n) => n.endsWith(".json"))) add(f);
    for (const f of this.fs.list("extensions", (n) => n.endsWith(".schema.json"))) add(f);
    if (this.fs.exists("theme/theme.json")) add("theme/theme.json");
    this.assetsCache = this.listAssets();
    return { root: this.root, files, assets: this.assetsCache };
  }

  private listAssets(): string[] {
    return this.fs.list("assets").map((f) => f.slice("assets/".length));
  }

  /** Autosave. Paths are checked by the sandbox (inside the project) and by kind (text files only). */
  write(file: string, text: string): void {
    if (!isWritableText(file)) throw new Error(`Studio doesn't write "${file}" as text.`);
    this.fs.write(file, text);
    this.known.set(file, hash(text));
    if (isProjectText(file)) this.scheduleBuild();
  }

  remove(file: string): void {
    if (!isWritableText(file) && !file.startsWith("assets/")) throw new Error(`Studio doesn't delete "${file}".`);
    this.fs.remove(file);
    this.known.delete(file);
    this.scheduleBuild();
  }

  rename(from: string, to: string): void {
    if (!isWritableText(from) || !isWritableText(to)) throw new Error("Only scripts, characters, and locale files can be renamed here.");
    if (this.fs.exists(to)) throw new Error(`"${to}" already exists.`);
    const text = this.fs.read(from);
    this.write(to, text);
    this.remove(from);
  }

  writeAsset(file: string, bytes: Uint8Array): void {
    if (!file.startsWith("assets/")) throw new Error("Assets go under assets/.");
    this.fs.write(file, bytes);
    this.assetsCache = this.listAssets();
    this.events.changed([], this.assetsCache);
    this.scheduleBuild();
  }

  /** Rebuild soon (edits arrive in bursts while typing). */
  scheduleBuild(delay = 60): void {
    if (this.buildTimer) clearTimeout(this.buildTimer);
    this.buildTimer = setTimeout(() => {
      this.buildTimer = null;
      this.build();
    }, delay);
  }

  /** Compiles build/game.hwb with debug info (for the preview's line sync). */
  build(): BuildReport {
    const t0 = performance.now();
    const c = compileProject(this.fs, { debug: true });
    if (!c.bytes) {
      const report = { ok: false, errors: c.errors };
      this.events.built({ ...report, ms: performance.now() - t0 });
      return report;
    }
    this.fs.write("build/game.hwb", c.bytes);
    this.events.built({ ok: true, errors: "", ms: performance.now() - t0 });
    return { ok: true, errors: "" };
  }

  /** build/windows/<Game>/, optionally zipped beside it (plan §14.4). */
  exportGame(runtime: string, zip: boolean): BuildReport {
    const c = compileProject(this.fs, { debug: false });
    if (!c.bytes) return { ok: false, errors: c.errors };
    const p = packageGame(this.fs, c.bytes, c.title, c.gameId, runtime);
    if (!zip) return { ok: true, errors: "", dir: p.dir, exe: p.exe, files: p.files };
    const entries: Record<string, Uint8Array> = {};
    const name = safeName(c.title);
    for (const f of this.fs.list(p.dir)) entries[`${name}/${f.slice(p.dir.length + 1)}`] = this.fs.readBytes(f);
    const zipFile = `build/windows/${name}.zip`;
    this.fs.write(zipFile, zipSync(entries, { level: 6 }));
    return { ok: true, errors: "", dir: p.dir, zip: zipFile, exe: p.exe, files: p.files };
  }

  /** Watches for changes made outside Studio. */
  watch(): void {
    this.watcher = watch(this.root, { recursive: true }, (_event, name) => {
      if (!name) return;
      const file = name.replaceAll("\\", "/");
      if (IGNORED.test(file)) return;
      this.pending.add(file);
      if (this.watchTimer) clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => this.flushWatch(), 150);
    });
  }

  private flushWatch(): void {
    const changes: FileChange[] = [];
    let assetsChanged = false;
    for (const file of this.pending) {
      if (file.startsWith("assets/") || file === "assets") {
        assetsChanged = true;
        continue;
      }
      if (!isProjectText(file)) continue;
      const text = this.fs.exists(file) ? this.fs.read(file) : null;
      const h = text === null ? null : hash(text);
      if (h === (this.known.get(file) ?? null)) continue; /* our own write */
      if (h === null) this.known.delete(file);
      else this.known.set(file, h);
      changes.push({ file, text });
    }
    this.pending.clear();
    if (assetsChanged) this.assetsCache = this.listAssets();
    if (changes.length > 0 || assetsChanged) {
      this.events.changed(changes, this.assetsCache);
      this.scheduleBuild();
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.watchTimer) clearTimeout(this.watchTimer);
    if (this.buildTimer) clearTimeout(this.buildTimer);
  }
}

/** A folder name for a new project: the name with characters Windows forbids removed. */
function folderName(name: string): string {
  const s = name.replace(/[<>:"/\\|?*\p{Cc}]+/gu, "").trim().replace(/[. ]+$/, "");
  return s || "My Novel";
}

export function createProject(o: NewProjectOptions, templatesDir: string): string {
  const template = o.template === "blank" ? "blank" : "adv";
  const root = resolve(o.parent, folderName(o.name));
  initProject(root, template, { name: o.name.trim() || "My Novel", lang: o.sourceLanguage }, templatesDir);
  const fs = new ProjectFs(root);
  if (o.targetLanguages.length > 0) {
    const manifest = JSON.parse(fs.read("himawari.json")) as { languages: string[] };
    manifest.languages = [o.sourceLanguage, ...o.targetLanguages.filter((l) => l !== o.sourceLanguage)];
    fs.write("himawari.json", `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return root;
}

/** Copies a bundled project to Documents/Himawari/<name> (the user's own copy to play with), or reuses that copy. */
export function copyBundled(source: string, documents: string, name: string): string {
  let target = join(documents, "Himawari", name);
  for (let i = 2; existsSync(target) && !existsSync(join(target, "himawari.json")); i++) target = join(documents, "Himawari", `${name} ${i}`);
  if (!existsSync(join(target, "himawari.json"))) {
    mkdirSync(target, { recursive: true });
    cpSync(source, target, { recursive: true, filter: (src) => basename(src) !== "build" && basename(src) !== "cache" });
  }
  return target;
}
