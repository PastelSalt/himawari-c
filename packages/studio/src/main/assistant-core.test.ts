/**
 * The assistant's request shape (plan §10.9). The live test is the plan's
 * prompt-cache check: with a real key (ANTHROPIC_API_KEY), the second turn
 * must read the cached prefix. It's skipped without a key (it costs a few cents).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { ProjectFs, TOOLS } from "@himawari/tools";
import { describe, expect, test } from "vitest";
import type { AssistantEvent } from "../shared/api.js";
import { ASSISTANT_TOOLS, PRICES, runTurn, sdkTools, systemBlocks, usageOf, userTurn } from "./assistant-core.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const spec = (name: string) => readFileSync(join(ROOT, "spec", name), "utf8");
const docs = { guide: spec("agent-guide.md"), reference: spec("llm-reference.md"), agents: "Keep it cozy.", characters: [{ file: "characters/kai.md", text: "---\nid: kai\n---\n" }] };

describe("the assistant's request", () => {
  test("the system prompt is stable blocks with one cache breakpoint at the end", () => {
    const blocks = systemBlocks(docs);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.text).toContain("Never generate");
    expect(blocks[0]!.text).toContain("proposal");
    expect(blocks[1]!.text).toContain("Himawari Script");
    expect(blocks[2]!.text).toContain("Keep it cozy.");
    expect(blocks.map((b) => b.cache_control ?? null)).toEqual([null, null, { type: "ephemeral" }]);
    // Deterministic: the same inputs give the same bytes (a stable cache prefix).
    expect(JSON.stringify(systemBlocks(docs))).toBe(JSON.stringify(blocks));
  });

  test("tools are the registry in its fixed order, minus build, streaming their inputs", () => {
    const tools = sdkTools(
      () => ({ fs: new ProjectFs(ROOT), runtime: null, allowBuild: false }),
      () => {},
    );
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name).filter((n) => n !== "build"));
    expect(ASSISTANT_TOOLS.some((t) => t.name === "build")).toBe(false);
    expect(tools.every((t) => t.eager_input_streaming === true)).toBe(true);
  });

  test("volatile context goes only in the newest user turn", () => {
    const turn = userTurn("Make it warmer.", { replyLanguage: "Japanese", openFile: "script/start.hws", selection: '"Hi."', mentions: [{ label: "scene start", text: "scene start:" }] });
    const text = (turn.content as { text: string }[])[0]!.text;
    expect(text).toMatch(/^<studio_context>/);
    expect(text).toContain("Reply in Japanese.");
    expect(text).toContain("@scene start:");
    expect(text.endsWith("Make it warmer.")).toBe(true);
  });

  test("the cost meter uses per-token prices, with cache reads and writes", () => {
    const u = usageOf("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 2_000_000, cache_creation_input_tokens: 0 } as Anthropic.Beta.BetaUsage);
    expect(u.cost).toBeCloseTo(4 + 2 + 0.4, 6);
    expect(Object.keys(PRICES)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  });
});

describe.skipIf(!process.env["ANTHROPIC_API_KEY"])("prompt caching against the real API", () => {
  test("the second turn reads the cached prefix", async () => {
    const dir = mkdtempSync(join(tmpdir(), "himawari-assistant-"));
    try {
      cpSync(join(ROOT, "examples/tutorial"), dir, { recursive: true });
      const fs = new ProjectFs(dir);
      const tools = sdkTools(
        () => ({ fs, runtime: null, allowBuild: false, propose: async () => ({ status: "rejected", reason: "test" }) }),
        () => {},
      );
      const events: AssistantEvent[] = [];
      const client = new Anthropic();
      const base = { model: "claude-opus-5-5", effort: "low" as const, system: systemBlocks(docs), tools, emit: (e: AssistantEvent) => events.push(e), signal: new AbortController().signal };
      const ctx = { replyLanguage: "English", mentions: [] };
      const first = await runTurn(client, { ...base, turn: "t1", messages: [userTurn("Reply with just the word OK.", ctx)] });
      await runTurn(client, { ...base, turn: "t2", messages: [...first, userTurn("Reply with just the word OK again.", ctx)] });
      const second = events.filter((e): e is Extract<AssistantEvent, { kind: "usage" }> => e.kind === "usage" && e.turn === "t2");
      expect(second.length).toBeGreaterThan(0);
      expect(second[0]!.usage.cacheReadTokens).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
