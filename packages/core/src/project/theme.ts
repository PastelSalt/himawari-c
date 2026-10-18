/**
 * Themes (plan §8.10, §12; rfcs/0007): `theme/theme.json` restyles the
 * default UI: colors, the textbox (including a nine-slice image), fonts, the
 * title screen, the default transition time, and per-language UI strings. Core
 * validates it and compiles it into typed entries (bytecode `THEM`), so the
 * runtime never reads JSON (D01).
 */
import { type Diagnostic, diagnostic } from "../syntax/diagnostics.js";
import { suggest } from "./suggest.js";

/** A compiled theme entry. Colors are 0xRRGGBB; strings are asset names or UI text. */
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
];

/** UI strings that are formats: a theme's version must keep exactly these placeholders (the runtime ignores it otherwise). */
const FORMATS: Readonly<Record<string, string>> = { slot: "%d", load_failed: "%s", reload_failed: "%s" };

/** The printf placeholders in a string ("%%" is a literal percent sign). */
const placeholders = (s: string) => (s.replace(/%%/g, "").match(/%./g) ?? []).join("");

const COLORS = ["accent", "text", "dim", "textbox", "nameplate", "choice", "choice_hover", "choice_text", "background", "panel"];

/** Known numeric settings and their ranges. */
const INTS: Readonly<Record<string, [number, number]>> = {
  "textbox.opacity": [0, 100],
  "textbox.height": [10, 60],
  "textbox.padding": [0, 200],
  "textbox.slice.left": [0, 4096],
  "textbox.slice.top": [0, 4096],
  "textbox.slice.right": [0, 4096],
  "textbox.slice.bottom": [0, 4096],
  "text.size": [12, 96],
  "transition.ms": [0, 10000],
};

/** Known asset-name settings. */
const NAMES = ["textbox.image", "font.main", "font.name", "title.background", "title.music", "menu.background"];

const NAME_RE = /^[a-z0-9_][a-z0-9_/-]*$/;

export function readTheme(text: string): { entries: ThemeEntries | null; diagnostics: Diagnostic[] } {
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { entries: null, diagnostics: [diagnostic("HW0130", { start: 0, end: 0 }, { reason: "it must be a JSON object" })] };
  }
  const entries: ThemeEntries = new Map();
  const bad = (key: string, reason: string) => diagnostics.push(diagnostic("HW0130", at(key.split(".").pop() ?? key), { reason: `${key} ${reason}` }));
  const unknown = (key: string, known: Iterable<string>) => {
    const s = suggest(key, known);
    diagnostics.push(diagnostic("HW0131", at(key.split(".").pop() ?? key), { key }, s ? { help: `did you mean "${s}"?` } : {}));
  };

  // Flatten one level of groups: {"textbox": {"opacity": 85}} → textbox.opacity.
  const flat = new Map<string, unknown>();
  const GROUPS = ["colors", "textbox", "text", "font", "title", "menu", "transition", "strings"];
  for (const [group, value] of Object.entries(raw as Record<string, unknown>)) {
    if (group === "$schema") continue;
    if (group === "strings") continue;
    if (!GROUPS.includes(group)) {
      unknown(group, GROUPS);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (group === "textbox" && k === "slice" && Array.isArray(v)) {
          const [l, t, r, b] = v as unknown[];
          flat.set("textbox.slice.left", l);
          flat.set("textbox.slice.top", t);
          flat.set("textbox.slice.right", r);
          flat.set("textbox.slice.bottom", b);
        } else {
          flat.set(`${group === "colors" ? "color" : group}.${k}`, v);
        }
      }
    } else {
      bad(group, "must be an object of settings");
    }
  }
  const known = [...COLORS.map((c) => `color.${c}`), ...Object.keys(INTS), ...NAMES];
  for (const [key, v] of flat) {
    if (key.startsWith("color.")) {
      if (!COLORS.includes(key.slice(6))) unknown(key, known);
      else if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) bad(key, "must be a color like \"#ffc440\"");
      else entries.set(key, { type: "color", value: Number.parseInt(v.slice(1), 16) });
    } else if (key in INTS) {
      const [lo, hi] = INTS[key] as [number, number];
      if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) bad(key, `must be a whole number from ${lo} to ${hi}`);
      else entries.set(key, { type: "int", value: v });
    } else if (NAMES.includes(key)) {
      if (typeof v !== "string" || !NAME_RE.test(v)) bad(key, "must be an asset name like \"ui/textbox\" (no extension)");
      else entries.set(key, { type: "str", value: v });
    } else {
      unknown(key, known);
    }
  }

  const strings = (raw as Record<string, unknown>)["strings"];
  if (strings !== undefined) {
    if (!strings || typeof strings !== "object" || Array.isArray(strings)) {
      bad("strings", "must map languages to strings, like { \"en\": { \"start\": \"Begin\" } }");
    } else {
      for (const [lang, table] of Object.entries(strings as Record<string, unknown>)) {
        if (!table || typeof table !== "object") {
          bad(`strings.${lang}`, "must be an object of UI strings");
          continue;
        }
        for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
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
  return { entries, diagnostics };
}
