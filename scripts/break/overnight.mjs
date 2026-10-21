#!/usr/bin/env node
/**
 * The overnight break-it run (BREAK_IT.md §6): every runtime fuzz target in
 * turn, with corpora kept between nights, then Core's and Studio's property
 * tests at high run counts. Writes a short morning report.
 *
 *   node scripts/break/overnight.mjs [--hours 8]
 *
 * Needs the win64-fuzz build (MSYS2 CLANG64 first on PATH):
 *   cmake --preset win64-fuzz && cmake --build --preset win64-fuzz   (from runtime/)
 * Corpora, crashes, and reports go to runtime/build/break/ (not committed).
 * A crash is saved as crash-<hash> beside its target's corpus; minimize it, add it
 * to runtime/fuzz/regressions/, and log it in BREAK_IT.md §8.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RUNTIME = join(ROOT, "runtime");
const FUZZ = join(RUNTIME, "build", "win64-fuzz");
const OUT = join(RUNTIME, "build", "break");
const hoursArg = process.argv.indexOf("--hours");
const hours = hoursArg > 0 ? Number(process.argv[hoursArg + 1]) : 8;
const env = { ...process.env, PATH: `C:\\msys64\\clang64\\bin;${process.env.PATH}` };

const copyAll = (from, to) => {
  if (!existsSync(from)) return;
  for (const f of readdirSync(from)) copyFileSync(join(from, f), join(to, f));
};

/** Each target: how to seed its corpus the first time, and extra libFuzzer flags. */
const TARGETS = [
  { name: "fuzz_utf8", seed: () => {} },
  { name: "fuzz_json", seed: () => {} },
  {
    name: "fuzz_hwb",
    seed: (dir) => {
      const cases = join(ROOT, "tests", "conformance", "cases");
      for (const c of readdirSync(cases)) if (existsSync(join(cases, c, "expected.hwb"))) copyFileSync(join(cases, c, "expected.hwb"), join(dir, `${c}.hwb`));
    },
  },
  {
    name: "fuzz_save",
    seed: (dir) => spawnSync(join(FUZZ, "test_save.exe"), [], { env: { ...env, HW_WRITE_SAVE: join(dir, "basic.hwsav") } }),
  },
  { name: "fuzz_pack", seed: (dir) => copyAll(join(ROOT, "tests", "packs"), dir), flags: ["-max_len=8192"] },
  { name: "fuzz_image", seed: (dir) => copyAll(join(RUNTIME, "fuzz", "seeds", "image"), dir), flags: ["-max_len=262144"] },
  { name: "fuzz_layout", seed: (dir) => copyAll(join(RUNTIME, "fuzz", "seeds", "layout"), dir) },
];

const missing = TARGETS.filter((t) => !existsSync(join(FUZZ, `${t.name}.exe`)));
if (missing.length) {
  console.error(`Build the fuzz targets first (missing: ${missing.map((t) => t.name).join(", ")}).`);
  process.exit(1);
}

const started = new Date();
// About 85 % of the time for fuzzing, shared equally; the rest for the property tests.
const perTarget = Math.max(60, Math.floor((hours * 3600 * 0.85) / TARGETS.length));
const rows = [];
for (const t of TARGETS) {
  const corpus = join(OUT, "corpus", t.name);
  const crashes = join(OUT, "crashes", t.name);
  mkdirSync(crashes, { recursive: true });
  if (!existsSync(corpus)) {
    mkdirSync(corpus, { recursive: true });
    t.seed(corpus);
  }
  console.log(`${new Date().toISOString()}  ${t.name} for ${perTarget} s`);
  const r = spawnSync(join(FUZZ, `${t.name}.exe`), [`-max_total_time=${perTarget}`, `-artifact_prefix=${crashes}/`, "-print_final_stats=1", ...(t.flags ?? []), corpus], { env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  writeFileSync(join(crashes, "last-run.log"), log);
  const last = (re) => [...log.matchAll(re)].pop()?.[1] ?? "?";
  rows.push({
    target: t.name,
    exit: r.status,
    execs: last(/stat::number_of_executed_units:\s*(\d+)/g),
    cov: last(/cov: (\d+)/g),
    corpus: readdirSync(corpus).length,
    found: readdirSync(crashes).filter((f) => /^(crash|leak|oom|timeout)-/.test(f)),
  });
}

// The property tests (BREAK_IT.md §2.2, E-10) at many more runs than CI's.
console.log(`${new Date().toISOString()}  property tests`);
const props = spawnSync("corepack", ["pnpm", "vitest", "run", "packages/core/src/properties.test.ts", "packages/studio/src/main/screenplay-edit.properties.test.ts"], {
  cwd: ROOT,
  env: { ...process.env, HW_PROPERTY_RUNS: "20000" },
  encoding: "utf8",
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});

const day = started.toISOString().slice(0, 10);
const report = [
  `# Overnight break-it run, ${day}`,
  "",
  `Started ${started.toISOString()}, finished ${new Date().toISOString()} (${hours} h planned, ${perTarget} s per fuzz target).`,
  "",
  "| Target | Runs | Coverage | Corpus | Found |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.target} | ${r.execs} | ${r.cov} | ${r.corpus} | ${r.found.length ? r.found.join(", ") : "nothing"} |`),
  "",
  `Property tests (20 000 runs each): ${props.status === 0 ? "all passed" : "**failed**: see below"}.`,
  ...(props.status === 0 ? [] : ["", "```", (props.stdout ?? "").slice(-6000), "```"]),
  "",
  "Next: minimize anything found (`<target>.exe -minimize_crash=1 <file>`), add it to `runtime/fuzz/regressions/`, fix it, and log it in BREAK_IT.md §8.",
];
const reportFile = join(OUT, `report-${day}.md`);
writeFileSync(reportFile, `${report.join("\n")}\n`);
console.log(`\nReport: ${reportFile}`);
process.exit(rows.some((r) => r.found.length) || props.status !== 0 ? 1 : 0);
