/**
 * The glossary (plan §7, Phase 7): how the game's own words are translated
 * (places, festivals, nicknames), in `glossary.json` at the project root.
 * Translators and the AI follow it; the checker notes translations that don't.
 *
 *   { "terms": [{ "source": "Sunflower Field", "translations": { "ja": "ひまわり畑" }, "note": "a place" }] }
 */

export const GLOSSARY_FILE = "glossary.json";

export interface GlossaryTerm {
  /** The word or phrase in the source language. */
  source: string;
  /** Its translation per language tag. */
  translations: Record<string, string>;
  note?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Terms from the file's text; malformed entries are skipped. */
export function readGlossary(text: string | undefined | null): GlossaryTerm[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const list = isObject(raw) && Array.isArray(raw["terms"]) ? raw["terms"] : [];
  const out: GlossaryTerm[] = [];
  for (const t of list) {
    if (!isObject(t) || typeof t["source"] !== "string" || !t["source"].trim()) continue;
    const translations: Record<string, string> = {};
    if (isObject(t["translations"])) for (const [k, v] of Object.entries(t["translations"])) if (typeof v === "string" && v.trim()) translations[k] = v;
    out.push({ source: t["source"], translations, ...(typeof t["note"] === "string" && t["note"] ? { note: t["note"] } : {}) });
  }
  return out;
}

export function stringifyGlossary(terms: readonly GlossaryTerm[]): string {
  return `${JSON.stringify({ terms }, null, 2)}\n`;
}

/** True when `term` appears in `text` as a whole word (case-insensitive; any match for non-Latin scripts). */
function contains(text: string, term: string): boolean {
  const t = term.toLowerCase();
  const s = text.toLowerCase();
  if (!/^[\p{Script=Latin}\d\s'-]+$/u.test(term)) return s.includes(t);
  return new RegExp(`(^|[^\\p{L}\\d])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\d])`, "u").test(s);
}

/** Glossary terms the source line uses whose agreed translation the translated line doesn't. */
export function glossaryMisses(terms: readonly GlossaryTerm[], lang: string, source: string, translation: string): GlossaryTerm[] {
  if (!translation) return [];
  return terms.filter((t) => {
    const want = t.translations[lang];
    return want !== undefined && contains(source, t.source) && !translation.includes(want);
  });
}

/** The glossary as prompt lines for one language ("Sunflower Field → ひまわり畑 (a place)"). */
export function glossaryForPrompt(terms: readonly GlossaryTerm[], lang: string): string {
  return terms
    .filter((t) => t.translations[lang])
    .map((t) => `- ${t.source} → ${t.translations[lang]}${t.note ? ` (${t.note})` : ""}`)
    .join("\n");
}

/** One line to translate, as the batch translator sends it. */
export interface LineToTranslate {
  id: string;
  /** The speaker's name in the source language, or "" for narration and choices. */
  speaker: string;
  kind: string;
  text: string;
}

/**
 * The batch translator's instructions (Studio's "Translate with AI"; the same rules as
 * spec/agent-guide.md and MCP's translate_scene prompt). Stable per language, so it caches.
 */
export function translationInstructions(o: {
  /** Language names for the model ("English", "Japanese"). */
  sourceLanguage: string;
  language: string;
  /** The target's tag (ja), for the glossary. */
  tag: string;
  glossary: readonly GlossaryTerm[];
  /** Character names: id → "Hana" / "花". */
  names: readonly { source: string; target?: string | undefined }[];
  projectGuide: string;
}): string {
  const g = glossaryForPrompt(o.glossary, o.tag);
  const names = o.names.filter((n) => n.target).map((n) => `- ${n.source} → ${n.target}`).join("\n");
  return [
    `You translate the dialogue of a visual novel from ${o.sourceLanguage} into ${o.language}. You get lines as JSON (id, speaker, kind, text) and return the same ids with their translations.`,
    [
      "Rules:",
      "- Keep every markup token exactly: [variable], {b}…{/b}, {i}…{/i}, {color=…}…{/color}, {size=…}…{/size}, {speed=…}…{/speed}, {w=…}, {nw}, {shake}…{/shake}, {alt=…}, and {select var: key=\"…\" other=\"…\"} (translate the quoted case texts, keep the keys). Ruby {rb=reading}…{/rb} may be added or dropped.",
      "- Write natural, spoken dialogue that fits each speaker; keep line breaks (\\n) and the length close to the original so it fits the textbox.",
      "- Translate choices (kind \"option\") as short, clickable phrases.",
      "- Don't add notes or explanations. Return every id you were given, once.",
    ].join("\n"),
    names ? `Character names:\n${names}` : "",
    g ? `Glossary (always use these):\n${g}` : "",
    o.projectGuide.trim() ? `The project's own guide (tone, rating, style):\n${o.projectGuide.trim().slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
