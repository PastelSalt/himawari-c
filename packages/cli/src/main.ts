#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  CORE_VERSION,
  type Diagnostic,
  SPEC_VERSIONS,
  HwbError,
  checkProject,
  compile,
  disassemble,
  format,
  lex,
  parseAst,
  readHwb,
  renderDiagnostic,
  writeHwb,
} from "@himawari/core";
import { TEMPLATES, type TemplateName, initProject } from "./init.js";
import { L10nUsageError, l10n } from "./l10n.js";
import { findProjectRoot, loadProject } from "./project.js";

// Commands from plan §9.2. `check` and `fmt` work; the rest land later in Phase 1+.
const PLANNED = ["run", "playtest", "sprites", "graph", "report", "migrate"]; // l10n: sync/export/import done

const HELP = `hwc ${CORE_VERSION}

Usage: hwc <command> [options] [files or folders]

Commands:
  check [paths]          Validate the project (scripts, himawari.json, characters,
                         assets); exit 1 on errors
  fmt [--check] [paths]  Format files in place and add missing #line: IDs
                         (--check: only report files that need formatting)
  init <folder> [--template adv|blank] [--name "Title"] [--lang en]
                         Create a new project (default template: adv)
  l10n sync              Update locales/<lang>.json for every target language
  l10n export --lang ja [--format csv|xliff]
                         Write locales/ja.csv (or .xlf) for translators
  l10n import <file> --lang ja [--ai]
                         Bring translations back (placeholders are checked)
  build [--release]      Compile the project to build/game.hwb
                         (--release: without debug info)
  disasm <file.hwb>      Validate a .hwb file and print its instructions
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
  const counts = { error: 0, warning: 0, info: 0 };
  const print = (file: string, source: string, diagnostics: Diagnostic[]) => {
    for (const d of diagnostics) {
      console.log(renderDiagnostic(d, file, source) + "\n");
      counts[d.severity]++;
    }
  };

  const root = findProjectRoot(paths[0] ?? ".");
  let checked: number;
  if (root) {
    // Cross-file checks (scenes, line IDs) need every script, even when only some are reported.
    const result = checkProject(loadProject(root));
    const wanted = paths.length > 0 ? new Set(findScripts(paths).map((f) => relative(root, resolve(f)).replaceAll("\\", "/"))) : undefined;
    const reports = result.files.filter((f) => !wanted || wanted.has(f.file));
    for (const f of reports) print(display(join(root, f.file)), f.source, f.diagnostics);
    checked = reports.length;
  } else {
    console.log("note: no himawari.json found here or above, so only syntax was checked\n");
    const files = findScripts(paths);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      print(display(file), source, parseAst(source, display(file)).diagnostics);
    }
    checked = files.length;
  }

  const files_ = `${checked} file${checked === 1 ? "" : "s"}`;
  const total = counts.error + counts.warning + counts.info;
  console.log(
    total === 0
      ? `✓ ${files_} checked, no problems`
      : `${files_} checked: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} note(s)`,
  );
  return counts.error > 0 ? 1 : 0;
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

/** Value after `--flag`, or undefined. */
function option(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function init(args: readonly string[]): number {
  const valued = new Set(["--template", "--name", "--lang", "--id"]);
  const folder = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1] ?? ""));
  if (!folder) throw new UsageError('usage: hwc init <folder> [--template adv|blank] [--name "Title"] [--lang en]');
  const template = (option(args, "--template") ?? "adv") as TemplateName;
  if (!TEMPLATES.includes(template)) throw new UsageError(`unknown template "${template}" (available: ${TEMPLATES.join(", ")})`);
  const name = option(args, "--name") ?? (folder.split(/[\\/]/).pop() || "My Novel");
  const lang = option(args, "--lang") ?? "en";
  const id = option(args, "--id");
  try {
    const files = initProject(folder, template, id ? { name, lang, id } : { name, lang });
    console.log(`✓ Created "${name}" in ${folder} from the ${template} template (${files.length} files).`);
    console.log(`  Next: cd ${folder}, then hwc check and hwc build.`);
    return 0;
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
}

function build(args: readonly string[]): number {
  const release = args.includes("--release");
  const root = findProjectRoot(".");
  if (!root) throw new UsageError("no himawari.json here or above; run hwc build inside a project");
  const result = compile(checkProject(loadProject(root)), { debug: !release });
  if (!result.module) {
    for (const e of result.errors) {
      if (e.diagnostic) {
        const source = readFileSync(join(root, e.file), "utf8");
        console.log(renderDiagnostic(e.diagnostic, e.file, source) + "\n");
      } else {
        console.log(`error: ${e.file}: ${e.message}\n`);
      }
    }
    console.log(`✗ build failed: ${result.errors.length} error(s)`);
    return 1;
  }
  const bytes = writeHwb(result.module);
  const outDir = join(root, "build");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "game.hwb");
  writeFileSync(out, bytes);
  const m = result.module;
  console.log(
    `✓ ${display(out)}: ${bytes.length} bytes, ${m.scenes.length} scene(s), ${m.lines.length} line(s)${release ? "" : ", with debug info"}`,
  );
  return 0;
}

function disasm(args: readonly string[]): number {
  const [file] = args;
  if (!file) throw new UsageError("usage: hwc disasm <file.hwb>");
  if (!existsSync(file)) throw new UsageError(`no such file: ${file}`);
  try {
    process.stdout.write(disassemble(readHwb(readFileSync(file))));
    return 0;
  } catch (e) {
    if (e instanceof HwbError) {
      console.error(`hwc disasm: ${file} isn't a valid .hwb file: ${e.message}`);
      return 1;
    }
    throw e;
  }
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
    if (command === "build") return build(rest);
    if (command === "init") return init(rest);
    if (command === "l10n") {
      const root = findProjectRoot(".");
      if (!root) throw new UsageError("no himawari.json here or above; run hwc l10n inside a project");
      try {
        return l10n(root, rest);
      } catch (e) {
        if (e instanceof L10nUsageError) throw new UsageError(e.message);
        throw e;
      }
    }
    if (command === "disasm") return disasm(rest);
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
