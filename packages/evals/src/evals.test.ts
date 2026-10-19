/**
 * The eval harness without a model: the reference answers score full marks,
 * doing nothing scores nothing, and the trend report reads runs in order.
 * (The real runs need ANTHROPIC_API_KEY and are started by hand; see main.ts.)
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRuntime } from "@himawari/tools";
import { describe, expect, test } from "vitest";
import { idleAgent, scriptedAgent } from "./agents.js";
import { type RunResult, runSuite } from "./run.js";
import { TASKS } from "./tasks.js";
import { loadResults, saveResult, trendReport } from "./trend.js";

const examples = fileURLToPath(new URL("../../../examples", import.meta.url));
const runtime = findRuntime();

describe("the eval suite", () => {
  test("the reference answers score full marks on every task", async () => {
    const r = await runSuite(scriptedAgent(), { examples, runtime });
    expect(r.tasks.map((t) => t.id)).toEqual(TASKS.map((t) => t.id));
    for (const t of r.tasks) {
      expect({ id: t.id, task: t.scores.task, validation: t.scores.validation, stopped: t.run.stopped }).toEqual({ id: t.id, task: 1, validation: 1, stopped: undefined });
      if (runtime) expect(t.scores.playtest, t.id).toBe(1);
    }
    expect(r.tasks.find((t) => t.id === "write-scene")?.scores.bible).toBe(1);
  }, 300000);

  test("doing nothing scores nothing (and the planted bug fails the playtest)", async () => {
    const r = await runSuite(idleAgent(), { examples, runtime });
    for (const t of r.tasks) expect(t.scores.task, t.id).toBe(0);
    if (runtime) expect(r.tasks.find((t) => t.id === "fix-unreachable")?.scores.playtest).toBe(0);
  }, 300000);

  test("results are saved by date and the trend shows the change since a model's last run", () => {
    const dir = mkdtempSync(join(tmpdir(), "hw-evals-"));
    try {
      const run = (date: string, task: number): RunResult => ({
        version: 1,
        date,
        agent: "claude",
        model: "claude-haiku-5-5",
        tasks: [{ id: "proofread", scores: { validation: 1, playtest: 1, bible: null, task }, run: { turns: 3, toolCalls: 2, cost: 0.01 }, ms: 1000, notes: ["a | b"] }],
        summary: { validation: 1, playtest: 1, bible: null, task, cost: 0.01 },
      });
      saveResult(dir, run("2026-10-20T09:00:00.000Z", 1));
      saveResult(dir, run("2026-10-19T09:00:00.000Z", 0.5));
      const all = loadResults(dir);
      expect(all.map((r) => r.date)).toEqual(["2026-10-19T09:00:00.000Z", "2026-10-20T09:00:00.000Z"]);
      const md = trendReport(all);
      expect(md).toContain("| 2026-10-20 09:00 | claude | claude-haiku-5-5 | 100% (+50) |");
      expect(md).toContain("| proofread | 100% |");
      expect(md).toContain("a / b");
      expect(trendReport([])).toContain("No runs yet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
