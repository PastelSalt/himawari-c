/**
 * Themes (plan §8.10, §11.6; rfcs/0007, rfcs/0010): `theme/theme.json`
 * describes the built-in UI's look and layout: colors, shapes, where the
 * textbox, nameplate, text area, choices, quick bar, title, and menus are,
 * text outlines, choice animations, UI sounds, and per-language UI strings.
 * A theme can start from a preset. Core validates it and compiles it into
 * typed entries (bytecode `THEM`), so the runtime never reads JSON (D01).
 *
 * THEME_DEFAULTS is the runtime's own look (the `himawari` preset): the
 * runtime falls back to exactly these values (runtime/src/app/hw_theme.c).
 */
import { type Diagnostic, diagnostic } from "../syntax/diagnostics.js";
import { suggest } from "./suggest.js";

/** A compiled theme entry. Colors are 0xRRGGBB; strings are asset names, choices, or UI text. */
export type ThemeValue = { type: "int"; value: number } | { type: "color"; value: number } | { type: "str"; value: string };
export type ThemeEntries = Map<string, ThemeValue>;

/**
 * The runtime's UI strings a theme can replace, per language (`strings.<lang>.<key>`).
 * Kept in step with runtime/src/app/hw_ui_text.c (tests/theme-keys.test.ts checks it).
 */
export const THEME_STRING_KEYS: readonly string[] = [
  "start", "load", "save", "language", "quit", "resume", "back", "title", "history", "auto", "skip", "menu", "rollback",
  "text_speed", "empty_slot", "slot", "quick_slot", "saved", "loaded", "load_remapped", "load_fallback", "load_failed",
  "no_quick_save", "the_end", "error_title", "error_release", "click_to_continue", "confirm_quit", "yes", "no", "history_empty",
  "reloaded", "reload_failed", "config", "extras", "gallery", "music_room", "locked", "auto_speed", "text_size", "line_spacing",
  "font", "font_default", "font_readable", "textbox_opacity", "high_contrast", "reduce_motion", "skip_unread", "fullscreen",
  "volume_music", "volume_ambient", "volume_sfx", "volume_voice", "controls", "keyboard", "gamepad", "press_key",
  "reset_controls", "accessibility", "a11y_prompt", "a11y_prompt_body", "continue", "on", "off", "default", "replay_voice",
  "now_playing", "stop", "action_advance", "action_back", "action_up", "action_down", "action_left", "action_right",
  "action_rollback", "action_skip", "action_auto", "action_history", "action_hide", "action_quick_save", "action_quick_load",
  "auto_slot", "overwrite", "last_saved_now", "last_saved_minutes", "last_saved_hours", "mute_background",
];

/** UI strings that are formats: a theme's version must keep exactly these placeholders (the runtime ignores it otherwise). */
const FORMATS: Readonly<Record<string, string>> = {
  slot: "%d", load_failed: "%s", reload_failed: "%s", last_saved_minutes: "%d", last_saved_hours: "%d",
};

/** The printf placeholders in a string ("%%" is a literal percent sign). */
const placeholders = (s: string) => (s.replace(/%%/g, "").match(/%./g) ?? []).join("");

/* ---- the settings ---- */

export const THEME_COLORS = [
  "accent", "text", "dim", "textbox", "nameplate", "choice", "choice_hover", "choice_text", "background", "panel",
  "outline", "border", "button", "button_text", "title",
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

/** What each flattened setting accepts. `pct`: percent of the screen with one decimal, compiled to tenths. */
type Spec =
  | { kind: "color" }
  | { kind: "int"; min: number; max: number }
  | { kind: "pct"; min: number; max: number }
  | { kind: "bool" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "name" };

const int = (min: number, max: number): Spec => ({ kind: "int", min, max });
const pct = (min: number, max: number): Spec => ({ kind: "pct", min, max });
const BOOL: Spec = { kind: "bool" };
const NAME: Spec = { kind: "name" };
const oneOf = (...values: string[]): Spec => ({ kind: "enum", values });

const box = (prefix: string): Record<string, Spec> => ({
  [`${prefix}.x`]: pct(0, 95),
  [`${prefix}.y`]: pct(0, 95),
  [`${prefix}.width`]: pct(5, 100),
  [`${prefix}.height`]: pct(5, 100),
});
const column = (prefix: string): Record<string, Spec> => ({
  [`${prefix}.x`]: pct(0, 100),
  [`${prefix}.y`]: pct(0, 95),
  [`${prefix}.width`]: int(80, 1800),
  [`${prefix}.height`]: int(32, 200),
  [`${prefix}.gap`]: int(0, 120),
});

/** Every setting a theme can have, flattened with dots (`layout.textbox.x`); colors are `color.<name>`. */
export const THEME_SETTINGS: Readonly<Record<string, Spec>> = {
  ...Object.fromEntries(THEME_COLORS.map((c) => [`color.${c}`, { kind: "color" } as Spec])),
  "textbox.opacity": int(0, 100),
  "textbox.height": int(10, 60),
  "textbox.padding": int(0, 200),
  "textbox.image": NAME,
  "textbox.slice.left": int(0, 4096),
  "textbox.slice.top": int(0, 4096),
  "textbox.slice.right": int(0, 4096),
  "textbox.slice.bottom": int(0, 4096),
  "text.size": int(12, 96),
  "text.outline": int(0, 6),
  "font.main": NAME,
  "font.name": NAME,
  "title.background": NAME,
  "title.music": NAME,
  "menu.background": NAME,
  "transition.ms": int(0, 10000),
  "shape.radius": int(0, 64),
  "shape.border": int(0, 12),
  "shape.shadow": int(0, 48),
  "shape.hover": oneOf("bar", "outline", "fill"),
  ...box("layout.textbox"),
  ...box("layout.page"),
  "layout.text.left": int(0, 400),
  "layout.text.top": int(0, 300),
  "layout.text.right": int(0, 400),
  "layout.nameplate.x": int(-400, 1600),
  "layout.nameplate.y": int(-300, 300),
  "layout.nameplate.height": int(24, 200),
  "layout.choices.x": pct(0, 100),
  "layout.choices.y": pct(0, 100),
  "layout.choices.width": pct(10, 100),
  "layout.choices.height": int(32, 300),
  "layout.choices.gap": int(0, 120),
  "layout.quickbar.show": BOOL,
  "layout.quickbar.align": oneOf("left", "center", "right"),
  "layout.title.x": pct(0, 100),
  "layout.title.y": pct(0, 100),
  "layout.title.size": int(16, 200),
  "layout.title.show": BOOL,
  // The "Made with Himawari" line (himawari.json credit: "title"). Its alignment follows x: left third, middle, right third.
  "layout.credit.x": pct(0, 100),
  "layout.credit.y": pct(0, 100),
  "layout.credit.size": int(10, 60),
  ...column("layout.title_menu"),
  ...column("layout.game_menu"),
  "motion.choices": oneOf("none", "fade", "rise"),
  "motion.ms": int(0, 2000),
  "sound.hover": NAME,
  "sound.click": NAME,
};

const GROUPS = ["preset", "colors", "textbox", "text", "font", "title", "menu", "transition", "shape", "layout", "motion", "sound", "strings"];

/** A theme as written (theme.schema.json 2.0): groups of settings, `layout` one level deeper. */
export type ThemeJson = {
  preset?: string;
  colors?: Partial<Record<ThemeColor, string>>;
  strings?: Record<string, Record<string, string>>;
  [group: string]: unknown;
};

/* ---- the look so far, presets, and palettes ---- */

/** The runtime's built-in look (the `himawari` preset), every setting filled in. */
export const THEME_DEFAULTS = {
  colors: {
    accent: "#ffc440", text: "#ffffff", dim: "#bec4d6", textbox: "#101320", nameplate: "#101320", choice: "#161a2b",
    choice_hover: "#3a4466", choice_text: "#ffffff", background: "#05060c", panel: "#1c2033", outline: "#12121c",
    border: "#ffc440", button: "#1c2033", button_text: "#ffffff", title: "#2b3a67",
  },
  textbox: { opacity: 82 },
  text: { size: 40, outline: 2 },
  shape: { radius: 0, border: 0, shadow: 0, hover: "bar" },
  layout: {
    textbox: { x: 8, y: 70, width: 84, height: 27 },
    page: { x: 6, y: 5, width: 88, height: 90 },
    text: { left: 44, top: 18, right: 44 },
    nameplate: { x: 24, y: -58, height: 58 },
    choices: { x: 50, y: 40, width: 55, height: 76, gap: 18 },
    quickbar: { show: true, align: "right" },
    title: { x: 50, y: 28, size: 88, show: true },
    credit: { x: 98.5, y: 97.5, size: 20 },
    title_menu: { x: 50, y: 40, width: 440, height: 66, gap: 16 },
    game_menu: { x: 50, y: 14, width: 520, height: 68, gap: 20 },
  },
  motion: { choices: "none", ms: 250 },
  transition: { ms: 500 },
} as const;

/** Full color sets: a light one (dark text on pale panels) or a dark one. */
function lightColors(c: { ink: string; dim: string; paper: string; tint: string; hover: string; deep: string; line: string; back: string; title: string }) {
  return {
    accent: c.deep, text: c.ink, dim: c.dim, textbox: c.paper, nameplate: c.tint, choice: c.paper, choice_hover: c.hover,
    choice_text: c.ink, background: c.back, panel: c.paper, outline: c.paper, border: c.line, button: c.paper, button_text: c.ink, title: c.title,
  };
}
function darkColors(c: { ink: string; dim: string; panel: string; plate: string; hover: string; accent: string; line: string; back: string; title: string }) {
  return {
    accent: c.accent, text: c.ink, dim: c.dim, textbox: c.panel, nameplate: c.plate, choice: c.panel, choice_hover: c.hover,
    choice_text: c.ink, background: c.back, panel: c.panel, outline: c.back, border: c.line, button: c.panel, button_text: c.ink, title: c.title,
  };
}

const SAKURA = lightColors({ ink: "#3d3346", dim: "#776c84", paper: "#fffaf6", tint: "#fde3ec", hover: "#fde7ef", deep: "#a8436e", line: "#f2cad9", back: "#f7eee9", title: "#fbe1ea" });
const NIGHT = darkColors({ ink: "#e9eef5", dim: "#a4b0c2", panel: "#141a2a", plate: "#1d2740", hover: "#24314d", accent: "#8fd6c8", line: "#2d3b5a", back: "#0b0f1a", title: "#1b2747" });

/** Color sets that keep a layout and change every color (the UI Designer's palettes). */
export const THEME_PALETTES: Readonly<Record<string, Record<ThemeColor, string>>> = {
  sakura: SAKURA,
  mint: lightColors({ ink: "#24392f", dim: "#5f7468", paper: "#f8fdf9", tint: "#d9f2e3", hover: "#e2f5ea", deep: "#2a7550", line: "#bfe3cd", back: "#edf6f0", title: "#d6efe0" }),
  lavender: lightColors({ ink: "#342e48", dim: "#6f6888", paper: "#fbf9ff", tint: "#e8e1fb", hover: "#ece6fb", deep: "#6a4fb3", line: "#d6cbf3", back: "#f1eef9", title: "#e3dbf8" }),
  peach: lightColors({ ink: "#43322a", dim: "#7d685d", paper: "#fffaf6", tint: "#fde3d3", hover: "#fde8dc", deep: "#a5501f", line: "#f3cdb6", back: "#f8eee7", title: "#fcdfcd" }),
  sky: lightColors({ ink: "#26364a", dim: "#5f7186", paper: "#f8fbff", tint: "#dbeafb", hover: "#e3effc", deep: "#2f68a3", line: "#c3d9f1", back: "#edf3fa", title: "#d6e6f8" }),
  sunflower: lightColors({ ink: "#3b3122", dim: "#76694f", paper: "#fffcf2", tint: "#fbefc4", hover: "#fcf1cf", deep: "#8a6200", line: "#efd98f", back: "#f7f1e1", title: "#f8e7ad" }),
  night: NIGHT,
  ember: darkColors({ ink: "#f6ece6", dim: "#c3aca0", panel: "#22171a", plate: "#33201f", hover: "#4a2c28", accent: "#f2a07b", line: "#5a3a33", back: "#120b0c", title: "#3a221f" }),
  mono: darkColors({ ink: "#f2f2f2", dim: "#b5b5b5", panel: "#151515", plate: "#202020", hover: "#333333", accent: "#ffffff", line: "#4a4a4a", back: "#080808", title: "#262626" }),
};

/** Ready-made looks: a theme's `preset` (its own settings override the preset's). */
export const THEME_PRESETS: Readonly<Record<string, ThemeJson>> = {
  himawari: {},
  pastel: {
    colors: SAKURA,
    textbox: { opacity: 94 },
    text: { size: 38, outline: 0 },
    shape: { radius: 22, border: 2, shadow: 10, hover: "fill" },
    layout: {
      textbox: { x: 10, y: 71, width: 80, height: 25 },
      text: { left: 56, top: 36, right: 56 },
      nameplate: { x: 40, y: -30, height: 56 },
      choices: { width: 50, height: 78, gap: 20 },
      quickbar: { align: "center" },
      title_menu: { width: 460, height: 64, gap: 18 },
      game_menu: { width: 500, height: 64, gap: 18 },
    },
    motion: { choices: "rise", ms: 260 },
  },
  minimal: {
    colors: {
      accent: "#9ad0ff", text: "#f4f6fa", dim: "#a9b0bd", textbox: "#0b0d12", nameplate: "#0b0d12", choice: "#0b0d12",
      choice_hover: "#1e2a3a", choice_text: "#f4f6fa", background: "#07080b", panel: "#11141b", outline: "#000000",
      border: "#3a4250", button: "#11141b", button_text: "#f4f6fa", title: "#1a2333",
    },
    textbox: { opacity: 72 },
    text: { size: 38, outline: 1 },
    shape: { radius: 12, border: 1, shadow: 0, hover: "outline" },
    layout: {
      textbox: { x: 14, y: 74, width: 72, height: 22 },
      text: { left: 40, top: 22, right: 40 },
      nameplate: { x: 0, y: -52, height: 46 },
      choices: { width: 46, height: 66, gap: 14 },
      quickbar: { align: "center" },
      title_menu: { width: 400, height: 58, gap: 12 },
      game_menu: { width: 440, height: 58, gap: 14 },
    },
    motion: { choices: "fade", ms: 200 },
  },
  paper: {
    colors: lightColors({ ink: "#2e2620", dim: "#6f6458", paper: "#f7f0e1", tint: "#efe3cb", hover: "#ecdcbc", deep: "#8c3f22", line: "#c9b48f", back: "#e9dfcc", title: "#d8c7a6" }),
    textbox: { opacity: 96 },
    text: { size: 40, outline: 0 },
    shape: { radius: 6, border: 2, shadow: 6, hover: "bar" },
    layout: {
      textbox: { x: 6, y: 62, width: 88, height: 34 },
      page: { x: 8, y: 6, width: 84, height: 88 },
      text: { left: 64, top: 30, right: 64 },
      nameplate: { x: 40, y: -50, height: 50 },
    },
  },
  night: {
    colors: NIGHT,
    textbox: { opacity: 88 },
    shape: { radius: 16, border: 1, shadow: 16, hover: "outline" },
    layout: { nameplate: { x: 28, y: -64, height: 56 }, text: { left: 48, top: 24, right: 48 } },
    motion: { choices: "fade", ms: 240 },
  },
  retro: {
    colors: {
      accent: "#ffd75e", text: "#ffffff", dim: "#c8d2ff", textbox: "#1e2a78", nameplate: "#1e2a78", choice: "#1e2a78",
      choice_hover: "#3346b5", choice_text: "#ffffff", background: "#0c1238", panel: "#1e2a78", outline: "#0c1238",
      border: "#ffffff", button: "#1e2a78", button_text: "#ffffff", title: "#24339a",
    },
    textbox: { opacity: 96 },
    shape: { radius: 4, border: 4, shadow: 0, hover: "bar" },
    layout: { textbox: { x: 4, y: 68, width: 92, height: 29 }, nameplate: { x: 0, y: -62, height: 58 } },
  },
  "high-contrast": {
    colors: {
      accent: "#ffe000", text: "#ffffff", dim: "#e8e8e8", textbox: "#000000", nameplate: "#000000", choice: "#000000",
      choice_hover: "#1a3fbf", choice_text: "#ffffff", background: "#000000", panel: "#000000", outline: "#000000",
      border: "#ffffff", button: "#000000", button_text: "#ffffff", title: "#000000",
    },
    textbox: { opacity: 100 },
    text: { size: 44, outline: 3 },
    shape: { radius: 8, border: 3, shadow: 0, hover: "outline" },
  },
};

export const THEME_PRESET_NAMES = Object.keys(THEME_PRESETS);

/* ---- colors and contrast (WCAG 2) ---- */

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const toHex = ([r, g, b]: readonly number[]) => `#${hex2(r ?? 0)}${hex2(g ?? 0)}${hex2(b ?? 0)}`;

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two #rrggbb colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** The color nearest to `fg` (same hue, darker or lighter) with at least `min`:1 against `bg`. */
export function fixContrast(fg: string, bg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const towardBlack = luminance(bg) > 0.18;
  const [r, g, b] = rgb(fg);
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const mix = towardBlack ? [r, g, b].map((v) => v * (1 - t)) : [r, g, b].map((v) => v + (255 - v) * t);
    const c = toHex(mix);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return towardBlack ? "#000000" : "#ffffff";
}

/** Text colors and what they're drawn on, for the contrast check. */
export const CONTRAST_PAIRS: readonly [ThemeColor, ThemeColor][] = [
  ["text", "textbox"],
  ["choice_text", "choice"],
  ["accent", "choice_hover"],
  ["button_text", "button"],
];

/* ---- reading a theme ---- */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `over` on top of `base`, recursively (objects merge, everything else replaces). */
function merge(base: unknown, over: unknown): unknown {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v);
  return out;
}

type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : { -readonly [K in keyof T]: Widen<T[K]> };
/** A theme with every setting filled in. */
export type ResolvedTheme = Widen<typeof THEME_DEFAULTS> & ThemeJson;

/** Every setting of a theme (defaults, then its preset, then its own), for editors like Studio's UI Designer. */
export function resolveTheme(raw: unknown): ResolvedTheme {
  const own = isObject(raw) ? raw : {};
  const preset = typeof own["preset"] === "string" ? (THEME_PRESETS[own["preset"]] ?? {}) : {};
  const merged = merge(merge(THEME_DEFAULTS, preset), own) as ResolvedTheme;
  // 1.0's textbox.height (and padding) still place the textbox when the layout doesn't.
  const tb = isObject(own["textbox"]) ? own["textbox"] : {};
  const ownLayout = isObject(own["layout"]) ? own["layout"] : {};
  const presetLayout = isObject(preset["layout"]) ? preset["layout"] : {};
  if (!isObject(ownLayout["textbox"]) && !isObject(presetLayout["textbox"]) && typeof tb["height"] === "number") {
    merged.layout = { ...merged.layout, textbox: { ...merged.layout.textbox, height: tb["height"], y: 97 - tb["height"] } };
  }
  if (!isObject(ownLayout["text"]) && typeof tb["padding"] === "number") {
    merged.layout = { ...merged.layout, text: { ...merged.layout.text, left: tb["padding"], right: tb["padding"] } };
  }
  return merged;
}

/** Flattens a theme's groups into dotted keys (`layout.textbox.x`, `color.accent`, `textbox.slice.left`). */
function flatten(raw: Record<string, unknown>, bad: (key: string, reason: string) => void, unknown: (key: string, known: Iterable<string>) => void) {
  const flat = new Map<string, unknown>();
  for (const [group, value] of Object.entries(raw)) {
    if (group === "$schema" || group === "strings" || group === "preset") continue;
    if (!GROUPS.includes(group)) {
      unknown(group, GROUPS);
      continue;
    }
    if (!isObject(value)) {
      bad(group, "must be an object of settings");
      continue;
    }
    for (const [k, v] of Object.entries(value)) {
      if (group === "textbox" && k === "slice") {
        if (!Array.isArray(v) || v.length !== 4) {
          bad("textbox.slice", "must be four numbers: [left, top, right, bottom]");
          continue;
        }
        ["left", "top", "right", "bottom"].forEach((side, i) => flat.set(`textbox.slice.${side}`, v[i]));
      } else if (group === "layout") {
        if (!isObject(v)) {
          if (Object.keys(THEME_SETTINGS).some((s) => s.startsWith(`layout.${k}.`))) bad(`layout.${k}`, "must be an object of settings");
          else unknown(`layout.${k}`, Object.keys(THEME_SETTINGS));
          continue;
        }
        for (const [kk, vv] of Object.entries(v)) flat.set(`layout.${k}.${kk}`, vv);
      } else {
        flat.set(`${group === "colors" ? "color" : group}.${k}`, v);
      }
    }
  }
  return flat;
}

export function readTheme(text: string, opts: { aspect?: number } = {}): { entries: ThemeEntries | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const at = (needle: string) => {
    const i = text.indexOf(`"${needle}"`);
    return i < 0 ? { start: 0, end: 0 } : { start: i, end: i + needle.length + 2 };
  };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { entries: null, diagnostics: [diagnostic("HW0130", { start: 0, end: 0 }, { reason: `it isn't valid JSON (${(e as Error).message})` })] };
  }
  if (!isObject(raw)) {
    return { entries: null, diagnostics: [diagnostic("HW0130", { start: 0, end: 0 }, { reason: "it must be a JSON object" })] };
  }
  const entries: ThemeEntries = new Map();
  const bad = (key: string, reason: string) => diagnostics.push(diagnostic("HW0130", at(key.split(".").pop() ?? key), { reason: `${key} ${reason}` }));
  const unknown = (key: string, known: Iterable<string>) => {
    const s = suggest(key, known);
    diagnostics.push(diagnostic("HW0131", at(key.split(".").pop() ?? key), { key }, s ? { help: `did you mean "${s}"?` } : {}));
  };

  // The preset's settings come first; the file's own override them.
  let preset: ThemeJson = {};
  if (raw["preset"] !== undefined) {
    const name = raw["preset"];
    if (typeof name !== "string" || !(name in THEME_PRESETS)) bad("preset", `must be one of ${THEME_PRESET_NAMES.join(", ")}`);
    else preset = THEME_PRESETS[name] as ThemeJson;
  }
  const flat = flatten(merge(preset, raw) as Record<string, unknown>, bad, unknown);
  const known = Object.keys(THEME_SETTINGS);
  for (const [key, v] of flat) {
    const spec = THEME_SETTINGS[key];
    if (!spec) {
      unknown(key, known);
      continue;
    }
    switch (spec.kind) {
      case "color":
        if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) bad(key, "must be a color like \"#ffc440\"");
        else entries.set(key, { type: "color", value: Number.parseInt(v.slice(1), 16) });
        break;
      case "int":
        if (typeof v !== "number" || !Number.isInteger(v) || v < spec.min || v > spec.max) bad(key, `must be a whole number from ${spec.min} to ${spec.max}`);
        else entries.set(key, { type: "int", value: v });
        break;
      case "pct":
        if (typeof v !== "number" || !Number.isFinite(v) || v < spec.min || v > spec.max) bad(key, `must be a percent of the screen from ${spec.min} to ${spec.max}`);
        else entries.set(key, { type: "int", value: Math.round(v * 10) });
        break;
      case "bool":
        if (typeof v !== "boolean") bad(key, "must be true or false");
        else entries.set(key, { type: "int", value: v ? 1 : 0 });
        break;
      case "enum":
        if (typeof v !== "string" || !spec.values.includes(v)) bad(key, `must be one of ${spec.values.map((x) => `"${x}"`).join(", ")}`);
        else entries.set(key, { type: "str", value: v });
        break;
      case "name":
        if (typeof v !== "string" || !/^[a-z0-9_][a-z0-9_/-]*$/.test(v)) bad(key, "must be an asset name like \"ui/textbox\" (no extension)");
        else entries.set(key, { type: "str", value: v });
        break;
    }
  }

  const strings = raw["strings"];
  if (strings !== undefined) {
    if (!isObject(strings)) {
      bad("strings", "must map languages to strings, like { \"en\": { \"start\": \"Begin\" } }");
    } else {
      for (const [lang, table] of Object.entries(strings)) {
        if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) {
          bad(`strings.${lang}`, "must be named by a language tag, like \"en\", \"ja\", or \"zh-Hans\"");
          continue;
        }
        if (!isObject(table)) {
          bad(`strings.${lang}`, "must be an object of UI strings");
          continue;
        }
        for (const [k, v] of Object.entries(table)) {
          if (!THEME_STRING_KEYS.includes(k)) unknown(`strings.${lang}.${k}`, THEME_STRING_KEYS.map((x) => `strings.${lang}.${x}`));
          else if (typeof v !== "string") bad(`strings.${lang}.${k}`, "must be text");
          else if (placeholders(v) !== (FORMATS[k] ?? "")) {
            const want = FORMATS[k];
            bad(`strings.${lang}.${k}`, want ? `must contain ${want} exactly once (where the value goes)` : "can't contain % placeholders (write %% for a percent sign)");
          } else entries.set(`string.${lang}.${k}`, { type: "str", value: v });
        }
      }
    }
  }

  if (diagnostics.every((d) => d.severity !== "error")) diagnostics.push(...designChecks(raw, text, at, opts.aspect ?? 16 / 9));
  return { entries, diagnostics };
}

/** Warnings about a design that works but would look broken or be hard to read (HW0132, HW0133). */
function designChecks(raw: Record<string, unknown>, text: string, at: (needle: string) => { start: number; end: number }, aspect: number): Diagnostic[] {
  const out: Diagnostic[] = [];
  const t = resolveTheme(raw);
  const L = t.layout;
  const screenW = 1080 * aspect; // pixels are at a 1080-pixel-high screen
  const edges: [string, number, number, number, number][] = [
    ["textbox", L.textbox.x, L.textbox.y, L.textbox.width, L.textbox.height],
    ["page", L.page.x, L.page.y, L.page.width, L.page.height],
    ["choices", L.choices.x - L.choices.width / 2, L.choices.y, L.choices.width, 0],
    ["title_menu", L.title_menu.x - (L.title_menu.width / screenW) * 50, L.title_menu.y, (L.title_menu.width / screenW) * 100, 0],
    ["game_menu", L.game_menu.x - (L.game_menu.width / screenW) * 50, L.game_menu.y, (L.game_menu.width / screenW) * 100, 0],
  ];
  for (const [name, x, y, w, h] of edges) {
    const side = x < -0.05 ? "left" : x + w > 100.05 ? "right" : y + h > 100.05 ? "bottom" : null;
    if (side) out.push(diagnostic("HW0132", at(name), { element: name.replace("_", " "), side }));
  }
  const colors = t.colors as Record<ThemeColor, string>;
  const hasImage = isObject(raw["textbox"]) && typeof raw["textbox"]["image"] === "string";
  for (const [fg, bg] of CONTRAST_PAIRS) {
    if (hasImage && bg === "textbox") continue;
    const a = colors[fg];
    const b = colors[bg];
    if (!/^#[0-9a-fA-F]{6}$/.test(a) || !/^#[0-9a-fA-F]{6}$/.test(b)) continue;
    const ratio = contrastRatio(a, b);
    if (ratio >= 4.5) continue;
    const where = text.includes(`"${fg}"`) ? fg : text.includes(`"${bg}"`) ? bg : "preset";
    out.push(
      diagnostic("HW0133", at(where), { fg: `${fg} ${a}`, bg: `${bg} ${b}`, ratio: ratio.toFixed(1) }, { help: `${fixContrast(a, b)} would be readable on ${b}` }),
    );
  }
  return out;
}
