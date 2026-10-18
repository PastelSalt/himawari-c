/**
 * Layered sprite resolution (plan §6.1, rfcs/0005), the same rules the
 * runtime's VM applies (runtime/src/core/hw_vm.c `apply_word`,
 * `hw_sprite_layers`), for tools that draw characters: Studio's sprite
 * composer and expression thumbnails.
 *
 *  - A preset sets each of its layers; an attribute replaces its group's
 *    other attributes unless the group is `multiple`.
 *  - `-attr` removes it; on a default it leaves a "removed" marker, so the
 *    default stays off until it is set again.
 *  - In effect: `always` groups (unless removed), else the group's set
 *    attributes, else its defaults (unless removed). Then rules: a rule
 *    holds when every `when` word is in effect (an attribute, or a preset
 *    whose attributes all are); it hides one attribute or shows another.
 */
import type { SpriteDef } from "./character.js";

export interface SpriteAttr {
  group: string;
  attr: string;
  /** A default switched off with `-attr`. */
  removed: boolean;
}

export type SpriteState = SpriteAttr[];

export interface SpriteLayer {
  group: string;
  attr: string;
}

/** The first group that lists `attr` (as an attribute or a default). */
function groupOf(sprite: SpriteDef, attr: string): string | null {
  for (const g of sprite.groups) if (g.attrs.includes(attr) || g.defaults.includes(attr)) return g.name;
  return null;
}

function setAttr(sprite: SpriteDef, state: SpriteState, group: string, attr: string): SpriteState {
  const multiple = sprite.groups.find((g) => g.name === group)?.multiple ?? false;
  const next = state.filter((a) => !(a.group === group && a.attr === attr && a.removed));
  const kept = multiple ? next : next.filter((a) => a.group !== group || a.removed || a.attr === attr);
  if (!kept.some((a) => a.group === group && a.attr === attr && !a.removed)) kept.push({ group, attr, removed: false });
  return kept;
}

function unsetAttr(sprite: SpriteDef, state: SpriteState, group: string, attr: string): SpriteState {
  const next = state.filter((a) => !(a.group === group && a.attr === attr && !a.removed));
  const isDefault = sprite.groups.find((g) => g.name === group)?.defaults.includes(attr) ?? false;
  if (isDefault && !next.some((a) => a.group === group && a.attr === attr && a.removed)) next.push({ group, attr, removed: true });
  return next;
}

/** Applies the words of a `show` or a dialogue line (`smile`, `-glasses`, a preset) to a character's state. */
export function applySpriteWords(sprite: SpriteDef, state: SpriteState, words: readonly string[]): SpriteState {
  let s = state;
  for (const raw of words) {
    const add = !raw.startsWith("-");
    const word = add ? raw : raw.slice(1);
    const preset = sprite.presets.find((p) => p.name === word);
    if (preset) {
      for (const [group, attr] of preset.layers) s = add ? setAttr(sprite, s, group, attr) : unsetAttr(sprite, s, group, attr);
      continue;
    }
    const group = groupOf(sprite, word);
    if (group) s = add ? setAttr(sprite, s, group, word) : unsetAttr(sprite, s, group, word);
  }
  return s;
}

/** The layers to draw, bottom to top. */
export function spriteLayers(sprite: SpriteDef, state: SpriteState): SpriteLayer[] {
  const removed = (group: string, attr: string) => state.some((a) => a.group === group && a.attr === attr && a.removed);
  const base: SpriteLayer[] = [];
  for (const g of sprite.groups) {
    if (g.always) {
      for (const attr of g.attrs) if (!removed(g.name, attr)) base.push({ group: g.name, attr });
      continue;
    }
    const set = state.filter((a) => a.group === g.name && !a.removed).map((a) => ({ group: g.name, attr: a.attr }));
    if (set.length > 0) base.push(...set);
    else for (const attr of g.defaults) if (!removed(g.name, attr)) base.push({ group: g.name, attr });
  }
  // Rules see the layers before any rule applies.
  const has = (attr: string) => base.some((l) => l.attr === attr);
  const holds = (word: string) => {
    if (has(word)) return true;
    const p = sprite.presets.find((x) => x.name === word);
    return p !== undefined && p.layers.length > 0 && p.layers.every(([, attr]) => has(attr));
  };
  const hidden = new Set<number>();
  const shown: SpriteLayer[] = [];
  for (const rule of sprite.rules) {
    if (rule.when.length === 0 || !rule.when.every(holds)) continue;
    base.forEach((l, i) => {
      if (rule.hide && l.attr === rule.hide) hidden.add(i);
    });
    if (rule.show && !has(rule.show) && !shown.some((l) => l.attr === rule.show)) {
      const group = groupOf(sprite, rule.show);
      if (group) shown.push({ group, attr: rule.show });
    }
  }
  const out: SpriteLayer[] = [];
  for (const g of sprite.groups) {
    base.forEach((l, i) => {
      if (l.group === g.name && !hidden.has(i)) out.push(l);
    });
    for (const l of shown) if (l.group === g.name) out.push(l);
  }
  return out;
}
