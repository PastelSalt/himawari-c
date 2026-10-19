/**
 * "Translate with AI" against a scripted client: the request shape (structured
 * output, cached instructions, low effort, no fallback on Haiku), batching,
 * dropped and stray ids, refusals, and cancelling. No key, no network.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { BATCH_SIZE, estimateCost, translateLines } from "./translate-core.js";

const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${String(i).padStart(5, "0")}`, speaker: "Hana", kind: "say", text: `Line ${i}` }));

type Reply = { stop_reason: string; translations?: { id: string; text: string }[] };

function scripted(reply: (ids: string[], call: number) => Reply) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          requests.push(params);
          const ids = (JSON.parse((params["messages"] as { content: string }[])[0]!.content) as { id: string }[]).map((l) => l.id);
          const r = reply(ids, requests.length);
          return { stop_reason: r.stop_reason, usage, parsed_output: r.translations ? { translations: r.translations } : null };
        },
      },
    },
  } as unknown as Pick<Anthropic, "beta">;
  return { client, requests };
}

const run = (client: Pick<Anthropic, "beta">, n: number, model = "claude-haiku-5-5", signal = new AbortController().signal) => {
  const batches: Map<string, string>[] = [];
  const progress: number[] = [];
  const done = translateLines(client, { model, instructions: "RULES", lines: lines(n), signal }, { batch: (t) => batches.push(t), progress: (d) => progress.push(d) });
  return { done, batches, progress };
};

describe("translate with AI", () => {
  test("batches of 40, structured output, cached instructions, low effort; Haiku runs without fallbacks", async () => {
    const { client, requests } = scripted((ids) => ({ stop_reason: "end_turn", translations: ids.map((id) => ({ id, text: `訳 ${id}` })) }));
    const r = run(client, 95);
    expect(await r.done).toEqual({ missed: [], refusals: 0, cancelled: false });
    expect(requests).toHaveLength(Math.ceil(95 / BATCH_SIZE));
    expect(r.batches.map((b) => b.size)).toEqual([40, 40, 15]);
    expect(r.progress).toEqual([0, 40, 80, 95]);
    const first = requests[0]!;
    expect(first["model"]).toBe("claude-haiku-5-5");
    expect(first["system"]).toEqual([{ type: "text", text: "RULES", cache_control: { type: "ephemeral" } }]);
    const config = first["output_config"] as { effort: string; format: { type: string; schema: unknown } };
    expect(config.effort).toBe("low");
    expect(config.format.type).toBe("json_schema");
    expect(first["fallbacks"]).toBeUndefined();
    expect(first["betas"]).toBeUndefined();
  });

  test("Sonnet asks for server-side fallbacks", async () => {
    const { client, requests } = scripted((ids) => ({ stop_reason: "end_turn", translations: ids.map((id) => ({ id, text: "x" })) }));
    await run(client, 3, "claude-sonnet-5-5").done;
    expect(requests[0]!["fallbacks"]).toBe("default");
    expect(requests[0]!["betas"]).toEqual(["server-side-fallback-2026-07-01"]);
  });

  test("dropped ids are missed, stray and repeated ids are ignored, a refusal misses its batch", async () => {
    const { client } = scripted((ids, call) =>
      call === 2
        ? { stop_reason: "refusal" }
        : {
            stop_reason: "end_turn",
            translations: [...ids.slice(1).map((id) => ({ id, text: "ok" })), { id: "zzzzzz", text: "stray" }, { id: ids[1]!, text: "again" }],
          },
    );
    const r = run(client, 50);
    const out = await r.done;
    expect(out.refusals).toBe(1);
    expect(out.missed).toEqual(["l00000", ...lines(50).slice(40).map((l) => l.id)]);
    expect([...r.batches[0]!.keys()]).not.toContain("zzzzzz");
    expect(r.batches[0]!.get("l00001")).toBe("ok");
    expect(r.batches[1]!.size).toBe(0);
  });

  test("cancelling keeps what came back and stops before the next batch", async () => {
    const abort = new AbortController();
    const { client, requests } = scripted((ids, call) => {
      if (call === 1) abort.abort();
      return { stop_reason: "end_turn", translations: ids.map((id) => ({ id, text: "x" })) };
    });
    const r = run(client, 100, "claude-haiku-5-5", abort.signal);
    const out = await r.done;
    expect(out.cancelled).toBe(true);
    expect(requests).toHaveLength(1);
    expect(r.batches[0]!.size).toBe(40);
    expect(out.missed).toHaveLength(60);
  });

  test("the estimate grows with the text and is cheaper on Haiku", () => {
    const few = estimateCost("claude-haiku-5-5", lines(10), "RULES");
    const many = estimateCost("claude-haiku-5-5", lines(1000), "RULES");
    expect(many).toBeGreaterThan(few * 50);
    expect(estimateCost("claude-sonnet-5-5", lines(1000), "RULES")).toBeGreaterThan(many);
  });
});
