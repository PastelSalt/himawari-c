/**
 * The built-in assistant's agent loop (plan §10.9, Mode B), without Electron,
 * so it can be tested. One tool registry, two outputs: the same @himawari/tools
 * definitions himawari-mcp serves become SDK tools here (betaZodTool), and
 * writes become proposals through the same gate as Mode A.
 *
 * Prompt caching: the prefix is the tool list (fixed order) → the engine guide
 * → llm-reference → AGENTS.md and character bibles, read once per
 * conversation. Volatile context (open file, selection, mentions, reply
 * language) goes only into the newest user message.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SandboxError, TOOLS, type ToolContext, type ToolDef, ToolError, isConfirm } from "@himawari/tools";
import type { AssistantEvent, AssistantUsage } from "../shared/api.js";

/** US dollars per million tokens (Anthropic first-party prices, 2026-10). Cache writes (5 min) cost 1.25× input. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function usageOf(model: string, u: Anthropic.Beta.BetaUsage): AssistantUsage {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"]!;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const cost = (u.input_tokens * p.input + u.output_tokens * p.output + read * p.cacheRead + write * p.input * 1.25) / 1e6;
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: read, cacheWriteTokens: write, cost };
}

/** Server-side refusal fallbacks are on for the models that offer them (Opus 5.5, Sonnet 5.5). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export interface ProjectDocs {
  /** spec/agent-guide.md (layer 1). */
  guide: string;
  /** spec/llm-reference.md. */
  reference: string;
  /** The project's AGENTS.md (layer 2), if any. */
  agents: string | null;
  /** Character files (frontmatter and bible), for voice and "Must never" rules. */
  characters: { file: string; text: string }[];
}

/** The system prompt as cacheable blocks: stable for the whole conversation. */
export function systemBlocks(docs: ProjectDocs): Anthropic.Beta.BetaTextBlockParam[] {
  const studio = [
    "You are the assistant panel inside Himawari Studio, next to the developer's script editor and a live preview of their game.",
    "Your writes don't touch the files directly: each one appears in Studio as a proposal (a diff with your rationale) that the developer accepts or rejects; the tool result tells you which.",
    "Each user message starts with <studio_context>: what the developer has open, their selection, things they @mentioned, and the language to reply in. Use it; don't repeat it back.",
  ].join("\n");
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: `${docs.guide}\n\n${studio}` },
    { type: "text", text: `# Himawari Script reference\n\n${docs.reference}` },
  ];
  const project = [
    docs.agents ? `# This project's AGENTS.md (layer 2)\n\n${docs.agents}` : "# This project has no AGENTS.md.",
    ...docs.characters.map((c) => `# ${c.file}\n\n${c.text}`),
  ].join("\n\n");
  // One breakpoint at the end of the stable prefix; the conversation is cached by the top-level breakpoint.
  blocks.push({ type: "text", text: project, cache_control: { type: "ephemeral" } });
  return blocks;
}

export interface StudioContext {
  replyLanguage: string;
  openFile?: string;
  selection?: string;
  /** Expanded @mentions: label and content. */
  mentions: { label: string; text: string }[];
}

/** The newest user turn: volatile context first, then what the developer typed. */
export function userTurn(text: string, ctx: StudioContext): Anthropic.Beta.BetaMessageParam {
  const parts = [`Reply in ${ctx.replyLanguage}.`];
  if (ctx.openFile) parts.push(`Open file: ${ctx.openFile}`);
  if (ctx.selection) parts.push(`Selected text:\n${ctx.selection}`);
  for (const m of ctx.mentions) parts.push(`@${m.label}:\n${m.text}`);
  return { role: "user", content: [{ type: "text", text: `<studio_context>\n${parts.join("\n\n")}\n</studio_context>\n\n${text}` }] };
}

type ToolResultBlock = Exclude<Anthropic.Beta.BetaToolResultBlockParam["content"], string | undefined>[number];

/** Studio exposes the registry minus `build` (exporting is the Build panel's job, with the user's click). */
export const ASSISTANT_TOOLS: readonly ToolDef[] = TOOLS.filter((t) => t.name !== "build");

/** The registry as SDK tools, in the registry's fixed order (a stable cache prefix). */
export function sdkTools(context: (def: ToolDef, args: Record<string, unknown>) => ToolContext, onTool: (name: string, args: Record<string, unknown>) => void) {
  return ASSISTANT_TOOLS.map((def) => ({
    ...betaZodTool({
      name: def.name,
      description: def.description,
      inputSchema: def.input,
      run: async (args: Record<string, unknown>) => {
        onTool(def.name, args);
        try {
          const out = await def.run(context(def, args), args as never);
          if (isConfirm(out)) return `Needs confirmation: ${out.confirm.message}`;
          const blocks: ToolResultBlock[] = [{ type: "text", text: out.text }];
          if (out.image) blocks.push({ type: "image", source: { type: "base64", media_type: out.image.mimeType as "image/png", data: out.image.data } });
          return blocks.length === 1 ? out.text : blocks;
        } catch (e) {
          if (e instanceof ToolError || e instanceof SandboxError) return `Error: ${e.message}`;
          throw e;
        }
      },
    }),
    eager_input_streaming: true,
  }));
}

export interface TurnOptions {
  model: string;
  effort: "high" | "low";
  system: Anthropic.Beta.BetaTextBlockParam[];
  tools: ReturnType<typeof sdkTools>;
  messages: Anthropic.Beta.BetaMessageParam[];
  turn: string;
  emit: (e: AssistantEvent) => void;
  /** Set when the user presses Stop. */
  signal: AbortSignal;
}

class TruncatedToolInput extends Error {}

/**
 * Runs one user turn through the tool runner, streaming text to the panel.
 * Returns the conversation after the turn (to send next time).
 */
export async function runTurn(client: Anthropic, o: TurnOptions): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const params = {
    model: o.model,
    max_tokens: 64000,
    system: o.system,
    tools: o.tools,
    messages: o.messages,
    thinking: { type: "adaptive" as const, display: "summarized" as const },
    output_config: { effort: o.effort },
    cache_control: { type: "ephemeral" as const },
    stream: true as const,
    ...(FALLBACK_MODELS.has(o.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
  let runner = client.beta.messages.toolRunner(params, { signal: o.signal });
  let stop = "end_turn";
  let last: Anthropic.Beta.BetaMessage | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      for await (const stream of runner) {
        let thinking = false;
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "thinking" && !thinking) {
            thinking = true;
            o.emit({ kind: "thinking", turn: o.turn });
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            o.emit({ kind: "text", turn: o.turn, text: event.delta.text });
          }
        }
        const message = await stream.finalMessage();
        last = message;
        attempt = 0;
        o.emit({ kind: "usage", turn: o.turn, usage: usageOf(message.model, message.usage) });
        stop = message.stop_reason ?? "end_turn";
        const hasToolUse = message.content.some((b) => b.type === "tool_use");
        if (message.stop_reason === "max_tokens" && hasToolUse) throw new TruncatedToolInput("a tool call was cut off at the output limit");
        // A refusal can cut a tool call off mid-input: never run that turn's tools.
        if (message.stop_reason === "refusal") break;
      }
      break;
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError) {
        stop = "cancelled";
        break;
      }
      if (err instanceof Anthropic.APIError || err instanceof TruncatedToolInput || attempt >= 2) throw err;
      // A tool input that wasn't parseable JSON: re-issue the turn from the conversation so far.
      runner = client.beta.messages.toolRunner({ ...runner.params }, { signal: o.signal });
    }
  }
  o.emit({ kind: "done", turn: o.turn, stop });
  // Keep the final reply in the conversation (unless it ends in a tool call nobody answered).
  const messages = [...(runner.params.messages as Anthropic.Beta.BetaMessageParam[])];
  const tail = messages[messages.length - 1];
  if (last && tail?.role !== "assistant" && !last.content.some((b) => b.type === "tool_use")) {
    messages.push({ role: "assistant", content: last.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return messages;
}
