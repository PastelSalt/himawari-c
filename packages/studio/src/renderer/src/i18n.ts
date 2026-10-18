/**
 * Studio UI messages (plan §11.5): ICU MessageFormat in locales/<lang>.json,
 * English by default, Japanese required. "en-XA" is a pseudo-locale for
 * development builds: accented letters and ~30% padding, so truncated or
 * hard-coded strings stand out.
 */
import en from "@locales/en.json";
import ja from "@locales/ja.json";
import type { UiLanguage } from "../../shared/api";

type Messages = Record<string, string>;

const ACCENTS: Record<string, string> = {
  a: "á", b: "ƀ", c: "ç", d: "đ", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ",
  n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Đ", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ļ", M: "Ṁ",
  N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

/** Accents letters outside ICU arguments ({…}) and quoted text ('…'), then pads by ~30%. */
export function pseudoLocalize(message: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  let letters = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i]!;
    if (ch === "'" && (quoted || message[i + 1] === "{" || message[i + 1] === "}")) quoted = !quoted;
    else if (!quoted && ch === "{") depth++;
    else if (!quoted && ch === "}") depth--;
    const accent = depth === 0 && !quoted ? ACCENTS[ch] : undefined;
    if (accent) letters++;
    out += accent ?? ch;
  }
  return `[${out}${"·".repeat(Math.ceil(letters * 0.3))}]`;
}

const pseudo: Messages = Object.fromEntries(Object.entries(en as Messages).map(([k, v]) => [k, pseudoLocalize(v)]));

export const MESSAGES: Record<UiLanguage, Messages> = { en: en as Messages, ja: { ...(en as Messages), ...(ja as Messages) }, "en-XA": pseudo };

/** The BCP 47 locale react-intl formats numbers and dates with. */
export function intlLocale(lang: UiLanguage): string {
  return lang === "en-XA" ? "en" : lang;
}

/** The languages a project can be written in, for pickers (their own names, so a reader finds theirs). */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ja: "日本語",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
  it: "Italiano",
};
