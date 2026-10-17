#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CORE_VERSION, SPEC_VERSIONS, format, lex, parseAst, renderDiagnostic } from "@himawari/core";

// Commands from plan §9.2. `check` and `fmt` work; the rest land later in Phase 1+.
const PLANNED = ["init", "build", "run", "playtest", "l10n", "sprites", "graph", "report", "migrate", "disasm"];

const HELP = `hwc ${CORE_VERSION}

Usage: hwc <command> [options] [files or folders]

Commands:
  check [paths]          Parse and validate .hws files; exit 1 on errors
  fmt [--check] [paths]  Format files in place and add missing #line: IDs
                         (--check: only report files that need formatting)
  --version              Show versions of hwc and the specs

Paths default to ./script if it exists, otherwise the current folder.
Planned: ${PLANNED.join(", ")}`;

/** All .hws files under the given paths, sorted. */
function findScripts(paths: readonly string[]): string[] {
  const roots = paths.length > 0 ? paths : [existsSync("script") ? "script" : "."];
  const out: string[] = [];
  const visit = (p: string) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        visit(join(p, name));
      }
    } else if (p.endsWith(".hws")) {
      out.push(p);
    }
  };
  for (const r of roots) {
    if (!existsSync(r)) throw new UsageError(`no such file or folder: ${r}`);
    visit(r);
  }
  return out.sort();
}

class UsageError extends Error {}

const display = (file: string) => relative(process.cwd(), file).replaceAll("\\", "/") || file;

function check(paths: readonly string[]): number {
  const files = findScripts(paths);
  let errors = 0;
  let warnings = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const { diagnostics } = parseAst(source, display(file));
    for (const d of diagnostics) {
      console.log(renderDiagnostic(d, display(file), source) + "\n");
      if (d.severity === "error") errors++;
      else if (d.severity === "warning") warnings++;
    }
  }
  const files_ = `${files.length} file${files.length === 1 ? "" : "s"}`;
  console.log(errors + warnings === 0 ? `✓ ${files_} checked, no problems` : `${files_} checked: ${errors} error(s), ${warnings} warning(s)`);
  return errors > 0 ? 1 : 0;
}

function fmt(args: readonly string[]): number {
  const checkOnly = args.includes("--check");
  const files = findScripts(args.filter((a) => a !== "--check"));

  // Line IDs must be unique across the project, so reserve every existing one first.
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const taken = new Set<string>();
  for (const source of sources.values()) {
    for (const t of lex(source).tokens) if (t.kind === "LineTag") taken.add(t.text.slice("#line:".length));
  }

  let changed = 0;
  let refused = 0;
  for (const [file, source] of sources) {
    const r = format(source, { takenIds: taken });
    if (r.refused) {
      refused++;
      console.log(`✗ ${display(file)}: not formatted, fix these first:\n`);
      for (const d of r.refused) console.log(renderDiagnostic(d, display(file), source) + "\n");
      continue;
    }
    for (const id of r.added) taken.add(id);
    for (const [, id] of r.reassigned) taken.add(id);
    if (!r.changed) continue;
    changed++;
    if (checkOnly) {
      console.log(`${display(file)}: needs formatting`);
    } else {
      writeFileSync(file, r.text, "utf8");
      const ids = r.added.length + r.reassigned.length;
      console.log(`${display(file)}: formatted${ids > 0 ? `, ${ids} line ID(s) assigned` : ""}`);
    }
  }
  const verb = checkOnly ? "need formatting" : "formatted";
  console.log(`${files.length} file(s): ${changed} ${verb}, ${refused} skipped because of errors`);
  return refused > 0 || (checkOnly && changed > 0) ? 1 : 0;
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    if (command === undefined || command === "--help" || command === "-h") {
      console.log(HELP);
      return 0;
    }
    if (command === "--version" || command === "-v") {
      console.log(`hwc ${CORE_VERSION}`);
      for (const [name, version] of Object.entries(SPEC_VERSIONS)) console.log(`  ${name.padEnd(10)} ${version}`);
      return 0;
    }
    if (command === "check") return check(rest);
    if (command === "fmt") return fmt(rest);
    if (PLANNED.includes(command)) {
      console.error(`hwc ${command}: not implemented yet (see DETAILED_PLAN.md §18).`);
      return 2;
    }
    console.error(`hwc: unknown command "${command}". Run "hwc --help".`);
    return 2;
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`hwc: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

process.exitCode = main(process.argv.slice(2));
