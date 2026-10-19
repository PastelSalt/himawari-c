/**
 * "Translate with AI" (plan §7, §10.9, Phase 7): the missing lines of one
 * language, about 40 at a time, through structured outputs, so every batch
 * comes back as `{ translations: [{ id, text }] }` and nothing else. Claude
 * Haiku 5.5 by default: bulk translation is the cheap, fast model's job.
 * Without Electron, so it can be tested.
 *
 * Results land the same way set_translation's do: as needs-review, with the
 * markup checked (applyTranslations refuses a line that breaks it).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LineToTranslate } from "@himawari/core";
import { z } from "zod";
import type { AssistantUsage } from "../shared/api.js";
import { usageOf } from "./assistant-core.js";

export const TRANSLATION_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export const BATCH_SIZE = 40;

const Result = z.object({ translations: z.array(z.object({ id: z.string(), text: z.string() })) });

/** Server-side refusal fallbacks exist for Sonnet 5.5 (and Opus); Haiku 5.5 runs alone. */
const FALLBACKS = new Set(["claude-sonnet-5-5", "claude-opus-5-5"]);

export interface TranslateCallbacks {
  /** One batch is back: id → text, only the ids that were asked for. */
  batch(translations: Map<string, string>, usage: AssistantUsage): void;
  progress(done: number, total: number): void;
}

export interface TranslateOutcome {
  /** Lines asked for that didn't come back (a refusal, a cut-off answer, or an id the model dropped). */
  missed: string[];
  refusals: number;
  cancelled: boolean;
}

/** A rough cost before starting: about 60 tokens of input and 50 of output per line, plus the instructions once per batch. */
export function estimateCost(model: string, lines: readonly LineToTranslate[], instructions: string): number {
  const batches = Math.ceil(lines.length / BATCH_SIZE);
  const chars = lines.reduce((n, l) => n + l.text.length + l.speaker.length + 30, 0);
  const input = chars / 3 + (instructions.length / 3) * Math.min(batches, 1);
  const cached = (instructions.length / 3) * Math.max(0, batches - 1);
  return usageOf(model, { input_tokens: Math.round(input), output_tokens: Math.round(chars / 2.5), cache_read_input_tokens: Math.round(cached), cache_creation_input_tokens: 0 } as Anthropic.Beta.BetaUsage).cost;
}

export async function translateLines(
  client: Pick<Anthropic, "beta">,
  o: { model: string; instructions: string; lines: readonly LineToTranslate[]; signal: AbortSignal; batchSize?: number },
  on: TranslateCallbacks,
): Promise<TranslateOutcome> {
  const size = o.batchSize ?? BATCH_SIZE;
  const missed: string[] = [];
  let refusals = 0;
  let done = 0;
  on.progress(0, o.lines.length);
  for (let i = 0; i < o.lines.length; i += size) {
    if (o.signal.aborted) return { missed: [...missed, ...o.lines.slice(i).map((l) => l.id)], refusals, cancelled: true };
    const batch = o.lines.slice(i, i + size);
    const asked = new Set(batch.map((l) => l.id));
    let message;
    try {
      message = await client.beta.messages.parse(
        {
          model: o.model,
          max_tokens: 16000,
          // The instructions (rules, names, glossary, AGENTS.md) are the same for every batch: cached after the first.
          system: [{ type: "text", text: o.instructions, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: JSON.stringify(batch.map((l) => ({ id: l.id, speaker: l.speaker, kind: l.kind, text: l.text }))) }],
          output_config: { effort: "low", format: betaZodOutputFormat(Result) },
          ...(FALLBACKS.has(o.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: o.signal },
      );
    } catch (e) {
      if (o.signal.aborted || e instanceof Anthropic.APIUserAbortError) return { missed: [...missed, ...o.lines.slice(i).map((l) => l.id)], refusals, cancelled: true };
      throw e;
    }
    const got = new Map<string, string>();
    if (message.stop_reason === "refusal") refusals++;
    else for (const t of message.parsed_output?.translations ?? []) if (asked.has(t.id) && !got.has(t.id)) got.set(t.id, t.text);
    for (const id of asked) if (!got.has(id)) missed.push(id);
    done += batch.length;
    on.batch(got, usageOf(o.model, message.usage));
    on.progress(done, o.lines.length);
  }
  return { missed, refusals, cancelled: false };
}
