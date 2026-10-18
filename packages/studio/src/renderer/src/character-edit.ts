/**
 * Editing a character file (plan §6.3): YAML frontmatter plus the character
 * bible in Markdown. Edits go through the `yaml` Document API, so comments and
 * key order in the frontmatter survive.
 */
import { splitFrontmatter } from "@himawari/core";
import { type Document, isMap, parseDocument } from "yaml";

function open(text: string): { doc: Document; bible: string } {
  const { yaml, bible } = splitFrontmatter(text);
  return { doc: parseDocument(yaml), bible };
}

function close(doc: Document, bible: string): string {
  return `---\n${doc.toString().trimEnd()}\n---\n${bible.replace(/^\n/, "")}`;
}

/** The bible template every new character gets (the headings the agent guide refers to). */
export const BIBLE_TEMPLATE = "\n## Personality\n\n## Speech style\n\n## Must never\n";

export function newCharacterFile(id: string, name: string, color: string): string {
  return `---\nid: ${id}\nname: ${JSON.stringify(name)}\ncolor: ${JSON.stringify(color)}\n---\n${BIBLE_TEMPLATE.replace(/^\n/, "")}`;
}

export function getBible(text: string): string {
  return splitFrontmatter(text).bible;
}

export function setBible(text: string, bible: string): string {
  const { doc } = open(text);
  return close(doc, bible);
}

/** Sets the display name in one language. A plain name becomes { source: old, lang: new } when needed. */
export function setName(text: string, lang: string, sourceLang: string, value: string): string {
  const { doc, bible } = open(text);
  const current = doc.get("name");
  if (isMap(current)) {
    if (value) current.set(lang, value);
    else current.delete(lang);
  } else if (lang === sourceLang) {
    doc.set("name", value);
  } else if (value) {
    const map: Record<string, string> = {};
    if (typeof current === "string" && current) map[sourceLang] = current;
    map[lang] = value;
    doc.set("name", doc.createNode(map, { flow: true }));
  }
  return close(doc, bible);
}

export function getNames(text: string): Record<string, string> {
  const { doc } = open(text);
  const n = doc.toJS({ maxAliasCount: 0 })?.name as unknown;
  if (typeof n === "string") return { "": n };
  if (n && typeof n === "object") return Object.fromEntries(Object.entries(n).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return {};
}

export function setColor(text: string, color: string): string {
  const { doc, bible } = open(text);
  doc.set("color", color);
  return close(doc, bible);
}

/** Adds or replaces a preset: { group: attr } for the groups it sets. */
export function setPreset(text: string, name: string, layers: Record<string, string>): string {
  const { doc, bible } = open(text);
  doc.setIn(["sprite", "presets", name], doc.createNode(layers, { flow: true }));
  return close(doc, bible);
}

export function deletePreset(text: string, name: string): string {
  const { doc, bible } = open(text);
  doc.deleteIn(["sprite", "presets", name]);
  return close(doc, bible);
}

export interface ImportedGroup {
  name: string;
  always: boolean;
  multiple: boolean;
  defaults: string[];
}

/** Writes the `sprite:` block after an import (groups bottom to top), keeping presets and rules that still apply. */
export function setSprite(text: string, root: string, groups: ImportedGroup[]): string {
  const { doc, bible } = open(text);
  const old = doc.toJS({ maxAliasCount: 0 })?.sprite as Record<string, unknown> | undefined;
  const g: Record<string, Record<string, unknown>> = {};
  for (const x of groups) {
    const flags: Record<string, unknown> = {};
    if (x.always) flags["always"] = true;
    if (x.multiple) flags["multiple"] = true;
    if (x.defaults.length > 0 && !x.always) flags["default"] = x.multiple ? x.defaults : x.defaults[0];
    if (x.name === "eyes") flags["blink"] = true;
    if (x.name === "mouth") flags["lipflap"] = true;
    g[x.name] = flags;
  }
  const sprite: Record<string, unknown> = { root, anchor: (old?.["anchor"] as unknown) ?? [0.5, 1.0], groups: g };
  if (old?.["scale"] !== undefined) sprite["scale"] = old["scale"];
  if (old?.["rules"]) sprite["rules"] = old["rules"];
  if (old?.["presets"]) sprite["presets"] = old["presets"];
  const node = doc.createNode(sprite);
  for (const item of (node as { items?: { key: { value: string }; value: { flow?: boolean; items?: unknown[] } }[] }).items ?? []) {
    if (item.key.value === "anchor") item.value.flow = true;
    if (item.key.value === "groups" || item.key.value === "presets") {
      for (const child of (item.value.items ?? []) as { value: { flow?: boolean } }[]) child.value.flow = true;
    }
  }
  doc.set("sprite", node);
  return close(doc, bible);
}
