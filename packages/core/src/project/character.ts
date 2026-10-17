/**
 * Reads a character file: YAML frontmatter + a Markdown bible (plan §6.3,
 * spec/character.schema.json). Collects the words a script may use after the
 * character's name: expression presets and layer attributes.
 */
import { parse as parseYaml } from "yaml";
import { type Diagnostic, diagnostic } from "../syntax/diagnostics.js";

export interface Character {
  id: string;
  file: string;
  /** Display name in the source language (or the id). */
  displayName: string;
  /** Display names by language tag, when the frontmatter gives `name: { en: …, ja: … }`. */
  names: Record<string, string>;
  /** `#rrggbb` from the frontmatter, if set. */
  color: string | null;
  /** True when the file declares a layered sprite (`sprite:`). */
  hasSprite: boolean;
  /** Sprite folder relative to assets/, e.g. sprites/hana. */
  spriteRoot: string;
  presets: Set<string>;
  /** Attributes per layer group, from frontmatter and (when known) asset files. */
  groups: Map<string, Set<string>>;
  /** The layered sprite as the runtime needs it (plan §6.1), or null without one. */
  sprite: SpriteDef | null;
}

export interface SpriteGroup {
  name: string;
  /** Drawn whatever the attributes (a body base). */
  always: boolean;
  /** Several attributes at once (accessories); otherwise a new attribute replaces the old one. */
  multiple: boolean;
  blink: boolean;
  lipflap: boolean;
  defaults: string[];
  attrs: string[];
}

export interface SpriteDef {
  root: string;
  /** Anchor in the sprite's own canvas (0..1), placed on the stage position. */
  anchor: [number, number];
  scale: number;
  /** Bottom to top. */
  groups: SpriteGroup[];
  presets: { name: string; layers: [group: string, attr: string][] }[];
  /** Hide or show an attribute while every word in `when` is active (an attribute, or a preset whose attributes are all active). */
  rules: { hide: string | null; show: string | null; when: string[] }[];
}

const NOWHERE = { start: 0, end: 0 };

/** Frame suffixes used by auto-blink and lip-flap; not attributes on their own. */
const FRAME_SUFFIX = /_(half|closed|open)$/;

export function readCharacter(
  file: string,
  text: string,
  assets: readonly string[] = [],
): { character: Character | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const expectedId = (file.split(/[\\/]/).pop() ?? "").replace(/\.md$/, "");
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!match) {
    diagnostics.push(diagnostic("HW0110", NOWHERE, { reason: "it must start with a --- block of YAML" }));
    return { character: null, diagnostics };
  }
  let fm: unknown;
  try {
    fm = parseYaml(match[1] as string);
  } catch (e) {
    diagnostics.push(diagnostic("HW0110", NOWHERE, { reason: (e as Error).message.split("\n")[0] ?? "invalid YAML" }));
    return { character: null, diagnostics };
  }
  if (typeof fm !== "object" || fm === null) {
    diagnostics.push(diagnostic("HW0110", NOWHERE, { reason: "the frontmatter must be key: value pairs" }));
    return { character: null, diagnostics };
  }
  const f = fm as Record<string, unknown>;

  const id = typeof f["id"] === "string" ? f["id"] : expectedId;
  if (f["id"] !== undefined && f["id"] !== expectedId) {
    diagnostics.push(diagnostic("HW0111", NOWHERE, { field: "id", problem: `must match the file name ("${expectedId}")` }));
  }

  const name = f["name"];
  const displayName =
    typeof name === "string" ? name : typeof name === "object" && name !== null ? String(Object.values(name)[0] ?? id) : id;
  const names: Record<string, string> = {};
  if (typeof name === "object" && name !== null && !Array.isArray(name)) {
    for (const [lang, v] of Object.entries(name)) if (typeof v === "string") names[lang] = v;
  }

  const presets = new Set<string>();
  const groups = new Map<string, Set<string>>();
  const groupOf = (g: string) => {
    let s = groups.get(g);
    if (!s) groups.set(g, (s = new Set()));
    return s;
  };

  const sprite = f["sprite"] as Record<string, unknown> | undefined;
  const hasSprite = typeof sprite === "object" && sprite !== null;
  const spriteRoot = hasSprite && typeof sprite["root"] === "string" ? sprite["root"] : `sprites/${id}`;
  if (hasSprite) {
    const gs = sprite["groups"];
    if (typeof gs === "object" && gs !== null) {
      for (const [g, def] of Object.entries(gs as Record<string, unknown>)) {
        const set = groupOf(g);
        const d = (def as Record<string, unknown> | null)?.["default"];
        for (const v of Array.isArray(d) ? d : d === undefined ? [] : [d]) if (typeof v === "string") set.add(v);
      }
    }
    const ps = sprite["presets"];
    if (typeof ps === "object" && ps !== null) {
      for (const [p, layers] of Object.entries(ps as Record<string, unknown>)) {
        presets.add(p);
        if (typeof layers === "object" && layers !== null) {
          for (const [g, attr] of Object.entries(layers)) if (typeof attr === "string") groupOf(g).add(attr);
        }
      }
    }
  }

  // Folder convention (plan §6.2): assets/<root>/<group>/<attribute>.png
  const prefix = `${spriteRoot}/`;
  for (const a of assets) {
    if (!a.startsWith(prefix)) continue;
    const [group, fileName] = a.slice(prefix.length).split("/");
    if (!group || !fileName) continue;
    const attr = fileName.replace(/\.[^.]+$/, "");
    if (!FRAME_SUFFIX.test(attr)) groupOf(group).add(attr);
  }

  let spriteDef: SpriteDef | null = null;
  if (hasSprite || groups.size > 0) {
    const s = (hasSprite ? sprite : {}) as Record<string, unknown>;
    const declared = (typeof s["groups"] === "object" && s["groups"] !== null ? s["groups"] : {}) as Record<string, unknown>;
    const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const anchor = Array.isArray(s["anchor"]) ? (s["anchor"] as unknown[]) : [];
    const words = (v: unknown) => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : []);
    spriteDef = {
      root: spriteRoot,
      anchor: [num(anchor[0], 0.5), num(anchor[1], 1)],
      scale: num(s["scale"], 1),
      groups: [...groups].map(([name, attrs]) => {
        const d = declared[name] as Record<string, unknown> | null | undefined;
        const def = d?.["default"];
        const defaults = (Array.isArray(def) ? def : def === undefined ? [] : [def]).filter((x): x is string => typeof x === "string");
        return {
          name,
          // A folder-only group with one attribute is a fixed layer (plan §6.2).
          always: d ? d["always"] === true : attrs.size === 1,
          multiple: d?.["multiple"] === true,
          blink: d?.["blink"] === true,
          lipflap: d?.["lipflap"] === true,
          defaults,
          attrs: [...attrs].sort(),
        };
      }),
      presets: Object.entries((typeof s["presets"] === "object" && s["presets"] !== null ? s["presets"] : {}) as Record<string, unknown>).map(
        ([name, layers]) => ({
          name,
          layers: Object.entries((layers ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
        }),
      ),
      rules: (Array.isArray(s["rules"]) ? (s["rules"] as Record<string, unknown>[]) : []).map((r) => ({
        hide: typeof r?.["hide"] === "string" ? r["hide"] : null,
        show: typeof r?.["show"] === "string" ? r["show"] : null,
        when: words(r?.["when"]),
      })),
    };
  }

  return {
    character: {
      sprite: spriteDef,
      id, file, displayName, names,
      color: typeof f["color"] === "string" && /^#[0-9a-fA-F]{6}$/.test(f["color"]) ? f["color"] : null,
      hasSprite: hasSprite || groups.size > 0, spriteRoot, presets, groups,
    },
    diagnostics,
  };
}

/** Every word valid after this character's name: presets and attributes. */
export function characterWords(c: Character): Set<string> {
  const words = new Set(c.presets);
  for (const attrs of c.groups.values()) for (const a of attrs) words.add(a);
  return words;
}
