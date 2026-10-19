/**
 * Agents for the eval suite. `claude` is the real thing: the tool registry
 * (minus build) through the SDK's tool runner, with the same engine guide the
 * MCP server and Studio's assistant give. `scripted` does each task the way
 * a careful writer would, with the same tools; it's the reference the scores
 * are checked against, and it needs no key.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type ToolContext, type ToolDef, SandboxError, TOOLS, ToolError, isConfirm } from "@himawari/tools";
import type { Agent, AgentRun } from "./run.js";
import type { EvalTask } from "./tasks.js";

/** US dollars per million tokens (as Studio's assistant meter). */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

function costOf(model: string, u: Anthropic.Beta.BetaUsage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"]!;
  return (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25) / 1e6;
}

const FALLBACKS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export function claudeAgent(o: { client: Anthropic; model: string; spec: string; effort?: "low" | "medium" | "high"; maxTurns?: number }): Agent {
  const guide = readFileSync(join(o.spec, "agent-guide.md"), "utf8");
  const reference = readFileSync(join(o.spec, "llm-reference.md"), "utf8");
  return {
    name: "claude",
    model: o.model,
    async run(task: EvalTask, ctx: ToolContext): Promise<AgentRun> {
      const run: AgentRun = { turns: 0, toolCalls: 0, cost: 0 };
      const tools = (TOOLS as readonly ToolDef[])
        .filter((t) => t.name !== "build")
        .map((def) =>
          betaZodTool({
            name: def.name,
            description: def.description,
            inputSchema: def.input,
            run: async (args: Record<string, unknown>) => {
              run.toolCalls++;
              try {
                const out = await def.run({ ...ctx, tool: def.name }, args as never);
                return isConfirm(out) ? `Needs confirmation: ${out.confirm.message}` : out.text;
              } catch (e) {
                if (e instanceof ToolError || e instanceof SandboxError) return `Error: ${e.message}`;
                throw e;
              }
            },
          }),
        );
      const agents = ctx.fs.exists("AGENTS.md") ? ctx.fs.read("AGENTS.md") : "This project has no AGENTS.md.";
      const runner = o.client.beta.messages.toolRunner({
        model: o.model,
        max_tokens: 32000,
        max_iterations: o.maxTurns ?? 30,
        system: [
          { type: "text", text: guide },
          { type: "text", text: `# Himawari Script reference\n\n${reference}` },
          { type: "text", text: `# This project's AGENTS.md\n\n${agents}\n\nYou are running unattended in an evaluation: there is no one to ask, so finish the task with the tools.`, cache_control: { type: "ephemeral" } },
        ],
        tools,
        messages: [{ role: "user", content: task.prompt }],
        thinking: { type: "adaptive" },
        output_config: { effort: o.effort ?? "medium" },
        stream: true,
        ...(FALLBACKS.has(o.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      for await (const stream of runner) {
        const message = await stream.finalMessage();
        run.turns++;
        run.cost += costOf(o.model, message.usage);
        if (message.stop_reason === "refusal") {
          run.stopped = "refusal";
          break;
        }
        if (message.stop_reason === "max_tokens") {
          run.stopped = "max_tokens";
          break;
        }
      }
      if (!run.stopped && run.turns >= (o.maxTurns ?? 30)) run.stopped = "turn limit";
      return run;
    },
  };
}

/** Calls a tool the way the model would (arguments validated by its schema). */
async function call(ctx: ToolContext, name: string, args: Record<string, unknown>) {
  const def = (TOOLS as readonly ToolDef[]).find((t) => t.name === name);
  if (!def) throw new Error(`no tool ${name}`);
  const out = await def.run({ ...ctx, tool: name }, def.input.parse(args) as never);
  if (isConfirm(out)) throw new Error(`${name} asked for confirmation`);
  if (out.isError) throw new Error(`${name}: ${out.text}`);
  return out;
}

/** The reference answers. */
const SCRIPTS: Record<string, (ctx: ToolContext) => Promise<number>> = {
  async "write-scene"(ctx) {
    await call(ctx, "create_scene", {
      rationale: "The walk home after the goldfish stall closes.",
      file: "script/endings.hws",
      hws: [
        "scene night_walk:",
        "    bg shrine_evening with fade(600)",
        "    show hana happy at center with dissolve(300)",
        '    "The lanterns are still lit when we finally close the stall."',
        '    hana "We sold out of prizes! Can you believe it?"',
        '    hana "Tomorrow I want to try a ring toss too… if you\'ll help again."',
        '    "I tell her I will. She hums the whole way home."',
        "    $ endings_seen += 1",
        "    end",
        "",
      ].join("\n"),
    });
    // goldfish_ending now goes on to the walk home (which counts the ending instead).
    const scene = await call(ctx, "read_scene", { scene: "goldfish_ending" });
    const { revision, hws } = scene.data as { revision: string; hws: string };
    const tail = "    $ endings_seen += 1\n    end\n";
    if (!hws.includes(tail)) throw new Error("goldfish_ending changed");
    await call(ctx, "update_scene", { rationale: "Go on to the walk home instead of ending.", scene: "goldfish_ending", base_revision: revision, hws: hws.replace(tail, "    jump night_walk\n") });
    return 3;
  },
  async continuity(ctx) {
    await call(ctx, "add_note", { line_id: "evq001", kind: "character", text: "Hana's bible says she must never say the stall doesn't matter to her; this line does." });
    return 1;
  },
  async translate(ctx) {
    const found = await call(ctx, "search_dialogue", { scene: "flute_ending", lang: "ja" });
    const lines = (found.data as { lines: { id: string; translation: string }[] }).lines;
    const ja: Record<string, string> = {
      "5aenqx": "開会式。町じゅうが静まりかえっている。",
      xa5w1a: "蓮が篠笛を構える。一瞬、その手が止まった。",
      e22xtw: "それから人混みの中に私を見つけて、昨夜の曲を吹いた。",
      hbfz3t: "それから目を閉じて、それでも吹いた。",
      dpvswy: "言っただろ。大したことないって。",
      "1dnxmq": "彼の手はまだ震えている。私は何も言わない。",
    };
    let n = 0;
    for (const l of lines) {
      const text = ja[l.id];
      if (!text || l.translation) continue;
      await call(ctx, "set_translation", { rationale: "Translate flute_ending.", lang: "ja", id: l.id, text });
      n++;
    }
    return n + 1;
  },
  async "fix-unreachable"(ctx) {
    const scene = await call(ctx, "read_scene", { scene: "start" });
    const { revision, hws } = scene.data as { revision: string; hws: string };
    const fixed = hws.replace('"With Ren, on the shrine steps." if lantern_stall:', '"With Ren, on the shrine steps.":');
    await call(ctx, "update_scene", { rationale: "The Ren option was hidden behind lantern_stall, which is never true at the start.", scene: "start", base_revision: revision, hws: fixed });
    return 2;
  },
  async proofread(ctx) {
    const scene = await call(ctx, "read_scene", { scene: "both_route" });
    const revision = (scene.data as { revision: string }).revision;
    await call(ctx, "patch_scene", {
      rationale: "teh → the; rigth → right",
      scene: "both_route",
      base_revision: revision,
      ops: [
        { op: "replace_text", lineId: "janw5p", text: "I run to the stall, then to the steps, then back to the stall." },
        { op: "replace_text", lineId: "khf2gn", text: "Speaking as half of the problem, she's right." },
      ],
    });
    return 1;
  },
};

export function scriptedAgent(): Agent {
  return {
    name: "scripted",
    model: "none",
    async run(task, ctx) {
      const script = SCRIPTS[task.id];
      if (!script) return { turns: 0, toolCalls: 0, cost: 0, stopped: "no script for this task" };
      return { turns: 0, toolCalls: await script(ctx), cost: 0 };
    },
  };
}

/** An agent that does nothing: every task should score 0 (the scores aren't free). */
export function idleAgent(): Agent {
  return { name: "idle", model: "none", run: async () => ({ turns: 0, toolCalls: 0, cost: 0 }) };
}

export { Anthropic };
