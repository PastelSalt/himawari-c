/** Creating a project from a template (plan §2.1, §9.2): `hwc init` and Studio's New Project wizard. */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type RandomSource, type SourceFile, format } from "@himawari/core";

export const TEMPLATES = ["adv", "blank"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export interface InitOptions {
  name: string;
  lang: string;
  /** Reverse-DNS id; derived from the name when omitted. */
  id?: string;
  random?: RandomSource;
}

/** templates/ at the repository root (next to packages/). Override with HWC_TEMPLATES; Studio passes its own. */
export function templatesDir(): string {
  return process.env["HWC_TEMPLATES"] ?? fileURLToPath(new URL("../../../templates/", import.meta.url));
}

/** A project id like dev.example.my-novel, valid for himawari.json. */
export function projectId(name: string): string {
  let slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) slug = "my-novel";
  if (!/^[a-z]/.test(slug)) slug = `game-${slug}`;
  return `dev.example.${slug}`;
}

/** Reads a template's files (paths relative to the template, forward slashes). */
export function readTemplate(template: TemplateName, dir = templatesDir()): SourceFile[] {
  const root = join(dir, template);
  const out: SourceFile[] = [];
  const visit = (p: string) => {
    for (const n of readdirSync(p).sort()) {
      const full = join(p, n);
      if (statSync(full).isDirectory()) visit(full);
      else out.push({ file: relative(root, full).replaceAll("\\", "/"), text: readFileSync(full, "utf8") });
    }
  };
  visit(root);
  return out;
}

/**
 * Fills a template: substitutes {{name}}, {{id}}, {{lang}} (JSON-escaped in
 * .json files), renames gitignore.txt to .gitignore, and formats scripts so
 * every line gets a fresh line ID.
 */
export function renderTemplate(files: readonly SourceFile[], options: InitOptions): SourceFile[] {
  const values: Record<string, string> = { name: options.name, id: options.id ?? projectId(options.name), lang: options.lang };
  const taken = new Set<string>();
  return files.map((f) => {
    const json = f.file.endsWith(".json");
    let text = f.text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
      const v = values[key];
      if (v === undefined) return m;
      return json ? JSON.stringify(v).slice(1, -1) : v;
    });
    if (f.file.endsWith(".hws")) {
      const r = format(text, options.random ? { takenIds: taken, random: options.random } : { takenIds: taken });
      for (const id of r.added) taken.add(id);
      text = r.text;
    }
    return { file: f.file === "gitignore.txt" ? ".gitignore" : f.file, text };
  });
}

export function initProject(folder: string, template: TemplateName, options: InitOptions, dir = templatesDir()): SourceFile[] {
  if (existsSync(folder) && readdirSync(folder).length > 0) {
    throw new Error(`${folder} already exists and isn't empty`);
  }
  const files = renderTemplate(readTemplate(template, dir), options);
  for (const f of files) {
    const target = join(folder, f.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.text, "utf8");
  }
  return files;
}
