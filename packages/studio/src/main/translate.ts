/**
 * "Translate with AI" in Studio's main process (translate-core.ts does the
 * work). Uses the assistant's stored API key; the renderer never sees it. The
 * renderer applies each batch to its own copy of the table (one undo step per
 * batch), so a cancelled run keeps what it already has.
 */
import { GLOSSARY_FILE, type LineToTranslate, aiHelpAllowed, readGlossary, translationInstructions } from "@himawari/core";
import { check, stampAi } from "@himawari/tools";
import type { TranslateEstimate, TranslateEvent, TranslateRequest } from "../shared/api.js";
import type { AssistantHost } from "./assistant.js";
import type { Project } from "./project.js";
import { TRANSLATION_MODELS, estimateCost, translateLines } from "./translate-core.js";
import { describeApiError } from "./assistant.js";

const englishName = (tag: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
};

export class TranslateHost {
  private abort: AbortController | null = null;
  private jobs = 0;

  constructor(
    private assistant: AssistantHost,
    private project: () => Project | null,
    private emit: (event: TranslateEvent) => void,
  ) {}

  private prepare(raw: unknown): { lang: string; model: string; lines: LineToTranslate[]; instructions: string } {
    const r = raw as TranslateRequest;
    const p = this.project();
    if (!p) throw new Error("No project is open.");
    if (!aiHelpAllowed(p.fs.exists("himawari.json") ? p.fs.read("himawari.json") : null)) throw new Error("AI help is turned off for this project.");
    if (!r || typeof r.lang !== "string" || !Array.isArray(r.lines)) throw new Error("Nothing to translate.");
    const model = (TRANSLATION_MODELS as readonly string[]).includes(r.model) ? r.model : TRANSLATION_MODELS[0];
    const lines = r.lines
      .filter((l): l is LineToTranslate => !!l && typeof l.id === "string" && typeof l.text === "string")
      .map((l) => ({ id: l.id, speaker: String(l.speaker ?? ""), kind: String(l.kind ?? "say"), text: l.text }));
    const { check: c } = check(p.fs);
    const m = c.manifest;
    if (!m || !m.languages.includes(r.lang) || r.lang === m.sourceLanguage) throw new Error(`"${r.lang}" isn't a target language of this game.`);
    const instructions = translationInstructions({
      sourceLanguage: englishName(m.sourceLanguage),
      language: `${englishName(r.lang)} (${r.lang})`,
      tag: r.lang,
      glossary: readGlossary(p.fs.exists(GLOSSARY_FILE) ? p.fs.read(GLOSSARY_FILE) : null),
      names: [...c.characters.values()].map((ch) => ({ source: ch.names[m.sourceLanguage] ?? ch.displayName, target: ch.names[r.lang] })),
      projectGuide: p.fs.exists("AGENTS.md") ? p.fs.read("AGENTS.md") : "",
    });
    return { lang: r.lang, model, lines, instructions };
  }

  estimate(raw: unknown): TranslateEstimate {
    const j = this.prepare(raw);
    return { lines: j.lines.length, model: j.model, cost: estimateCost(j.model, j.lines, j.instructions), hasKey: this.assistant.keyStatus().hasKey };
  }

  start(raw: unknown): string {
    if (this.abort) throw new Error("A translation is already running.");
    const j = this.prepare(raw);
    const client = this.assistant.apiClient();
    const project = this.project()!;
    const job = `x${++this.jobs}`;
    const abort = new AbortController();
    this.abort = abort;
    let cost = 0;
    void translateLines(client, { model: j.model, instructions: j.instructions, lines: j.lines, signal: abort.signal }, {
      batch: (translations, usage) => {
        cost += usage.cost;
        // Provenance (plan §10.6): the renderer refuses lines whose markup breaks, and a stamp whose text never landed is never matched.
        stampAi(project.fs, "translations", new Map([...translations].map(([id, text]) => [`${j.lang}:${id}`, text])));
        this.emit({ kind: "batch", job, lang: j.lang, translations: [...translations].map(([id, text]) => ({ id, text })), cost });
      },
      progress: (done, total) => this.emit({ kind: "progress", job, done, total }),
    })
      .then((r) => this.emit({ kind: "done", job, missed: r.missed.length, refusals: r.refusals, cancelled: r.cancelled, cost }))
      .catch((e: unknown) => this.emit({ kind: "error", job, message: describeApiError(e) }))
      .finally(() => {
        if (this.abort === abort) this.abort = null;
      });
    return job;
  }

  cancel(): void {
    this.abort?.abort();
  }
}
