#!/usr/bin/env node
/**
 * The AI eval suite (plan §16.1):
 *
 *   node packages/evals/dist/main.js run [--model claude-haiku-5-5] [--task id …] [--effort low|medium|high]
 *   node packages/evals/dist/main.js run --agent scripted     (the reference answers; no key, no cost)
 *   node packages/evals/dist/main.js trend [--write]
 *
 * `run` needs ANTHROPIC_API_KEY for the claude agent (it costs real money: a
 * few cents to a dollar per run, depending on the model). Results go to
 * packages/evals/results/; `trend --write` updates packages/evals/TREND.md.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRuntime } from "@himawari/tools";
import { Anthropic, claudeAgent, scriptedAgent } from "./agents.js";
import { runSuite } from "./run.js";
import { TASKS } from "./tasks.js";
import { loadResults, saveResult, trendReport } from "./trend.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const resultsDir = join(here, "..", "results");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const all = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));

async function main(): Promise<number> {
  const command = args[0];
  if (command === "trend") {
    const report = trendReport(loadResults(resultsDir));
    if (args.includes("--write")) writeFileSync(join(here, "..", "TREND.md"), report);
    process.stdout.write(report);
    return 0;
  }
  if (command !== "run") {
    console.error("usage: main.js run [--agent claude|scripted] [--model id] [--task id …] [--effort low|medium|high] | trend [--write]");
    console.error(`tasks: ${TASKS.map((t) => t.id).join(", ")}`);
    return 2;
  }
  const kind = flag("agent") ?? "claude";
  let agent;
  if (kind === "scripted") agent = scriptedAgent();
  else {
    if (!process.env["ANTHROPIC_API_KEY"]) {
      console.error("Set ANTHROPIC_API_KEY to run the claude agent (or use --agent scripted to check the harness).");
      return 2;
    }
    const effort = flag("effort");
    agent = claudeAgent({
      client: new Anthropic(),
      model: flag("model") ?? "claude-sonnet-5-5",
      spec: join(root, "spec"),
      ...(effort === "low" || effort === "medium" || effort === "high" ? { effort } : {}),
    });
  }
  const runtime = findRuntime();
  if (!runtime) console.error("note: no built runtime, so playtest scores are skipped");
  const result = await runSuite(agent, { examples: join(root, "examples"), runtime, only: all("task"), log: (l) => console.log(l) });
  const s = result.summary;
  console.log(`\ntask ${(s.task * 100).toFixed(0)}%  valid ${(s.validation * 100).toFixed(0)}%  playtest ${s.playtest === null ? "–" : `${(s.playtest * 100).toFixed(0)}%`}  bible ${s.bible === null ? "–" : `${(s.bible * 100).toFixed(0)}%`}  $${s.cost.toFixed(2)}`);
  // Scripted runs check the harness; only real agents go into the trend.
  if (kind !== "scripted") console.log(`saved results/${saveResult(resultsDir, result)}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
