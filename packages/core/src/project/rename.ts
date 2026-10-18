/**
 * Refactor-safe renames (plan §2 P9, §9.1 services): a scene, character, or
 * variable, across every script, himawari.json, and the character file. Driven
 * by the refs index, so only real references change, never look-alike text.
 * Shared by Studio (F2) and the MCP `rename` tool. Core does no I/O: the
 * caller passes a `read` function for the files outside the parsed scripts.
 */
import { parseDocument } from "yaml";
import type { ProjectCheck } from "./check.js";

export type RenameKind = "scene" | "character" | "variable";

export class RenameError extends Error {}

export interface RenamePlan {
  /** New text per file; null deletes the file (a character file moves to its new name). */
  changes: Map<string, string | null>;
  /** References rewritten in scripts. */
  count: number;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** A character file's YAML frontmatter and the bible below it. */
export function splitFrontmatter(text: string): { yaml: string; bible: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  return m ? { yaml: m[1] ?? "", bible: m[2] ?? "" } : { yaml: "", bible: text };
}

export function planRename(c: ProjectCheck, kind: RenameKind, from: string, to: string, read: (file: string) => string): RenamePlan {
  if (!IDENT.test(to)) throw new RenameError(`"${to}" isn't a valid name: use lowercase letters, digits, and _, starting with a letter or _`);
  if (from === to) throw new RenameError("the new name is the same as the old one");
  const sceneExists = (name: string) => [...c.parsed.values()].some((r) => r.ast.scenes.some((s) => s.id === name));
  if (kind === "scene" && !sceneExists(from)) throw new RenameError(`there is no scene "${from}"`);
  if (kind === "scene" && sceneExists(to)) throw new RenameError(`a scene named "${to}" already exists`);
  if (kind === "character" && !c.characters.has(from)) throw new RenameError(`there is no character "${from}"`);
  if (kind === "character" && c.characters.has(to)) throw new RenameError(`a character named "${to}" already exists`);
  if (kind === "variable" && !c.manifest?.variables[from]) throw new RenameError(`there is no variable "${from}"`);
  if (kind === "variable" && c.manifest?.variables[to]) throw new RenameError(`a variable named "${to}" already exists`);

  const kinds = kind === "scene" ? new Set(["sceneDecl", "scene"]) : kind === "character" ? new Set(["speaker", "character"]) : new Set(["variable"]);
  const changes = new Map<string, string | null>();
  let count = 0;
  for (const [file, r] of c.parsed) {
    const spans = r.refs.filter((ref) => kinds.has(ref.kind) && ref.name === from).map((ref) => ref.span).sort((a, b) => b.start - a.start);
    if (!spans.length) continue;
    let text = c.files.find((f) => f.file === file)?.source ?? read(file);
    for (const sp of spans) text = text.slice(0, sp.start) + to + text.slice(sp.end);
    changes.set(file, text);
    count += spans.length;
  }
  if (kind !== "character") {
    const m = JSON.parse(read("himawari.json")) as Record<string, unknown> & { entry?: string; variables?: Record<string, unknown> };
    let touched = false;
    if (kind === "scene" && m.entry === from) {
      m.entry = to;
      touched = true;
    }
    if (kind === "variable" && m.variables && from in m.variables) {
      m.variables = Object.fromEntries(Object.entries(m.variables).map(([k, v]) => [k === from ? to : k, v]));
      touched = true;
    }
    if (touched) changes.set("himawari.json", `${JSON.stringify(m, null, 2)}\n`);
  } else {
    const old = c.characters.get(from)?.file ?? `characters/${from}.md`;
    const doc = splitFrontmatter(read(old));
    const yaml = parseDocument(doc.yaml);
    yaml.set("id", to);
    changes.set(old, null);
    changes.set(`characters/${to}.md`, `---\n${yaml.toString().trimEnd()}\n---\n${doc.bible.replace(/^\n/, "")}`);
  }
  return { changes, count };
}
