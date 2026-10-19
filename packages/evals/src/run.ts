/**
 * Runs the eval tasks with an agent and scores them (plan §16.1 "AI quality":
 * validation pass rate, playtest success, bible consistency, tracked over
 * time, never blocking CI).
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectFs, TOOLS, type ToolContext, check, isConfirm } from "@himawari/tools";
import { type EvalTask, TASKS } from "./tasks.js";

/** What an agent did with one task. */
export interface AgentRun {
  /** Model turns (requests). */
  turns: number;
  toolCalls: number;
  /** US dollars, from the API's usage (0 for the scripted agent). */
  cost: number;
  /** Set when the agent stopped early (a refusal, an API error, the turn limit). */
  stopped?: string;
}

export interface Agent {
  name: string;
  model: string;
  run(task: EvalTask, ctx: ToolContext): Promise<AgentRun>;
}

export interface TaskResult {
  id: string;
  scores: {
    /** 1 when the project has no errors afterwards. */
    validation: number;
    /** 1 when a headless playtest reaches every ending without runtime errors; null without a runtime. */
    playtest: number | null;
    bible: number | null;
    task: number;
  };
  run: AgentRun;
  ms: number;
  notes: string[];
}

export interface RunResult {
  version: 1;
  /** ISO time the run started. */
  date: string;
  agent: string;
  model: string;
  tasks: TaskResult[];
  /** Means over the tasks that have the score. */
  summary: { validation: number; playtest: number | null; bible: number | null; task: number; cost: number };
}

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

async function playtestScore(ctx: ToolContext, notes: string[]): Promise<number | null> {
  if (!ctx.runtime) return null;
  const tool = TOOLS.find((t) => t.name === "playtest")!;
  try {
    const out = await tool.run(ctx, tool.input.parse({}) as never);
    if (isConfirm(out)) return 0;
    const d = out.data as { endings?: { reached: number; total: number }; errors?: unknown[] };
    const ok = !!d.endings && d.endings.reached === d.endings.total && (d.errors?.length ?? 0) === 0;
    if (!ok) notes.push(`playtest: ${out.text.split("\n").slice(1, 2).join(" ")}`);
    return ok ? 1 : 0;
  } catch (e) {
    notes.push(`playtest failed: ${(e as Error).message}`);
    return 0;
  }
}

export async function runTask(task: EvalTask, agent: Agent, o: { examples: string; runtime: string | null }): Promise<TaskResult> {
  const dir = mkdtempSync(join(tmpdir(), `hw-eval-${task.id}-`));
  try {
    cpSync(join(o.examples, task.project), dir, { recursive: true, filter: (s) => !/[\\/](build|\.himawari)$/.test(s) });
    const fs = new ProjectFs(dir);
    const planted = task.setup(fs);
    const ctx: ToolContext = { fs, runtime: o.runtime, allowBuild: false, confirmed: true };
    const t0 = performance.now();
    let run: AgentRun;
    try {
      run = await agent.run(task, ctx);
    } catch (e) {
      run = { turns: 0, toolCalls: 0, cost: 0, stopped: `error: ${(e as Error).message}` };
    }
    const ms = Math.round(performance.now() - t0);
    const scored = task.score(fs, planted);
    const notes = [...scored.notes];
    const errors = check(fs).check.files.flatMap((f) => f.diagnostics.filter((d) => d.severity === "error").map((d) => `${f.file}: ${d.code} ${d.message}`));
    if (errors.length) notes.push(...errors.slice(0, 5));
    const playtest = await playtestScore(ctx, notes);
    return { id: task.id, scores: { validation: errors.length ? 0 : 1, playtest, bible: scored.bible, task: scored.task }, run, ms, notes };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function runSuite(agent: Agent, o: { examples: string; runtime: string | null; only?: readonly string[]; log?: (line: string) => void }): Promise<RunResult> {
  const date = new Date().toISOString();
  const tasks: TaskResult[] = [];
  for (const task of TASKS.filter((t) => !o.only?.length || o.only.includes(t.id))) {
    const r = await runTask(task, agent, o);
    o.log?.(`${task.id.padEnd(16)} task ${r.scores.task.toFixed(2)}  valid ${r.scores.validation}  playtest ${r.scores.playtest ?? "–"}  bible ${r.scores.bible?.toFixed(2) ?? "–"}  ${r.run.turns} turn(s) $${r.run.cost.toFixed(3)}${r.run.stopped ? `  stopped: ${r.run.stopped}` : ""}${r.notes.length ? `\n    ${r.notes.join("\n    ")}` : ""}`);
    tasks.push(r);
  }
  return {
    version: 1,
    date,
    agent: agent.name,
    model: agent.model,
    tasks,
    summary: {
      validation: mean(tasks.map((t) => t.scores.validation)) ?? 0,
      playtest: mean(tasks.map((t) => t.scores.playtest)),
      bible: mean(tasks.map((t) => t.scores.bible)),
      task: mean(tasks.map((t) => t.scores.task)) ?? 0,
      cost: tasks.reduce((a, t) => a + t.run.cost, 0),
    },
  };
}
