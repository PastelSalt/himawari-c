/**
 * Results over time: one JSON file per run in packages/evals/results/, and a
 * Markdown trend report (each model's scores run by run, with the change since
 * its previous run, then the latest run task by task).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunResult } from "./run.js";

/** results/2026-10-19T11-20-00Z-claude-haiku-5-5.json */
export function saveResult(dir: string, r: RunResult): string {
  mkdirSync(dir, { recursive: true });
  const name = `${r.date.replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z")}-${r.agent}-${r.model}.json`;
  writeFileSync(join(dir, name), `${JSON.stringify(r, null, 2)}\n`);
  return name;
}

export function loadResults(dir: string): RunResult[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8")) as RunResult;
      } catch {
        return null;
      }
    })
    .filter((r): r is RunResult => r !== null && r.version === 1)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const delta = (now: number | null, before: number | null | undefined) => {
  if (now === null || before === null || before === undefined) return "";
  const d = Math.round((now - before) * 100);
  return d === 0 ? " (=)" : d > 0 ? ` (+${d})` : ` (${d})`;
};

export function trendReport(results: readonly RunResult[]): string {
  if (results.length === 0) return "# AI eval trend\n\nNo runs yet. Run `node packages/evals/dist/main.js run` with ANTHROPIC_API_KEY set.\n";
  const out = [
    "# AI eval trend",
    "",
    "Scores are means over the tasks (plan §16.1 \"AI quality\"): **task** (the task itself), **valid** (no errors afterwards), **playtest** (every ending reached), **bible** (character rules kept in new lines). Tracked over time; never blocking.",
    "",
    "| Date | Agent | Model | Task | Valid | Playtest | Bible | Cost |",
    "|---|---|---|---|---|---|---|---|",
  ];
  const previous = new Map<string, RunResult>();
  for (const r of results) {
    const key = `${r.agent}/${r.model}`;
    const p = previous.get(key);
    const s = r.summary;
    out.push(
      `| ${r.date.slice(0, 16).replace("T", " ")} | ${r.agent} | ${r.model} | ${pct(s.task)}${delta(s.task, p?.summary.task)} | ${pct(s.validation)}${delta(s.validation, p?.summary.validation)} | ${pct(s.playtest)}${delta(s.playtest, p?.summary.playtest)} | ${pct(s.bible)}${delta(s.bible, p?.summary.bible)} | $${s.cost.toFixed(2)} |`,
    );
    previous.set(key, r);
  }
  const last = results[results.length - 1]!;
  out.push("", `## Latest run: ${last.agent} / ${last.model}, ${last.date.slice(0, 10)}`, "", "| Task | Task score | Valid | Playtest | Bible | Turns | Cost | Notes |", "|---|---|---|---|---|---|---|---|");
  for (const t of last.tasks) {
    const notes = [t.run.stopped ? `stopped: ${t.run.stopped}` : "", ...t.notes].filter(Boolean).join("; ").replace(/\|/g, "/");
    out.push(`| ${t.id} | ${pct(t.scores.task)} | ${pct(t.scores.validation)} | ${pct(t.scores.playtest)} | ${pct(t.scores.bible)} | ${t.run.turns} | $${t.run.cost.toFixed(3)} | ${notes || "–"} |`);
  }
  return `${out.join("\n")}\n`;
}
