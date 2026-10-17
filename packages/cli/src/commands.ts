/** `hwc run`, `playtest`, `graph`, `report`, and `build --release` packaging (plan §9.2). */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, collectLines, graphToMermaid, storyGraph } from "@himawari/core";
import { ProjectFs, compileProject, findRuntime, packageGame, provenanceNow, readProvenance } from "@himawari/tools";
import { loadProject } from "./project.js";

export class CommandError extends Error {}

function option(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function runtimeOrFail(): string {
  const exe = findRuntime();
  if (!exe) throw new CommandError("himawari.exe wasn't found; build the runtime (runtime/, cmake --preset win64-release) or set HIMAWARI_RUNTIME");
  return exe;
}

/** Compiles into build/game.hwb (debug info on, for warp and error locations). */
function compileForRun(fs: ProjectFs): string {
  const c = compileProject(fs, { debug: true });
  if (!c.bytes) throw new CommandError(`the project doesn't compile:\n${c.errors}`);
  fs.write("build/game.hwb", c.bytes);
  return fs.path("build/game.hwb");
}

/** hwc run [--warp scene|file:line|#lineid] [--lang xx] [--no-gpu]: the game in dev mode. */
export function run(root: string, args: readonly string[]): number {
  const fs = new ProjectFs(root);
  const exe = runtimeOrFail();
  compileForRun(fs);
  const pass: string[] = ["--project", root];
  for (const flag of ["--warp", "--lang", "--text-speed"]) {
    const v = option(args, flag);
    if (v) pass.push(flag, v);
  }
  if (args.includes("--no-gpu")) pass.push("--no-gpu");
  const r = spawnSync(exe, pass, { stdio: "inherit", shell: false });
  return r.status ?? 1;
}

/** hwc playtest [--strategy all_paths] [--choices "0 1"] [--seed N] [--lang xx] [--max-steps N] [--out report.json] */
export function playtest(root: string, args: readonly string[]): number {
  const fs = new ProjectFs(root);
  const exe = runtimeOrFail();
  const strategy = option(args, "--strategy") ?? "all_paths";
  if (strategy !== "all_paths") throw new CommandError(`unknown strategy "${strategy}" (available: all_paths)`);
  const c = compileProject(fs, { debug: true });
  if (!c.bytes) throw new CommandError(`the project doesn't compile:\n${c.errors}`);
  fs.write(".himawari/cache/game.hwb", c.bytes);
  const pass = ["--headless", fs.path(".himawari/cache/game.hwb")];
  const choices = option(args, "--choices");
  if (choices !== undefined) pass.push("--transcript", choices);
  else pass.push("--playtest", `max_steps=${option(args, "--max-steps") ?? "50000"}`);
  pass.push(`seed=${option(args, "--seed") ?? "1"}`);
  const lang = option(args, "--lang");
  if (lang) pass.push(`lang=${lang}`);
  const out = option(args, "--out");
  if (out) pass.push("--out", out);
  const r = spawnSync(exe, pass, { stdio: "inherit", shell: false });
  return r.status ?? 1;
}

/** hwc graph [--format mermaid|json] */
export function graph(root: string, args: readonly string[]): number {
  const fmt = option(args, "--format") ?? "mermaid";
  if (fmt !== "mermaid" && fmt !== "json") throw new CommandError('--format must be "mermaid" or "json"');
  const g = storyGraph(checkProject(loadProject(root)));
  process.stdout.write(fmt === "mermaid" ? graphToMermaid(g) : `${JSON.stringify(g, null, 2)}\n`);
  return 0;
}

/**
 * hwc report ai-content (plan §16.4): AI-assisted text for store disclosure.
 * Counts from .himawari/provenance.json, checked against the current text.
 */
export function report(root: string, args: readonly string[]): number {
  if (args[0] !== "ai-content") throw new CommandError("usage: hwc report ai-content [--format markdown|json]");
  const fs = new ProjectFs(root);
  const prov = readProvenance(fs);
  const check = checkProject(loadProject(root));
  const lines = collectLines(check.parsed);
  const tally = { human: 0, ai: 0, "ai-edited": 0 };
  const byFile = new Map<string, { ai: number; edited: number; total: number }>();
  for (const l of lines) {
    const p = provenanceNow(prov.lines[l.id], l.text);
    tally[p]++;
    const f = byFile.get(l.file) ?? { ai: 0, edited: 0, total: 0 };
    f.total++;
    if (p === "ai") f.ai++;
    if (p === "ai-edited") f.edited++;
    byFile.set(l.file, f);
  }
  const translations = { ai: 0, "ai-edited": 0, human: 0 };
  for (const t of check.locales) {
    for (const e of t.lines) {
      if (!e.text) continue;
      const p = provenanceNow(prov.translations[`${t.language}:${e.id}`], e.text);
      translations[p]++;
    }
  }
  const bibles = Object.keys(prov.characters).length;
  const data = { lines: tally, totalLines: lines.length, translations, characterBibles: bibles, files: Object.fromEntries(byFile) };
  if (option(args, "--format") === "json") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }
  const pct = (n: number) => (lines.length ? `${Math.round((100 * n) / lines.length)}%` : "0%");
  const out = [
    `# AI-assisted content: ${check.manifest?.name ?? root}`,
    "",
    "This game was made with Himawari. AI was used only as a writing assistant for text; no images, music, sound, or voices were generated by AI, and the game runs no AI.",
    "",
    "| Text | Human | AI-written | AI-written, then edited by a person |",
    "|---|---|---|---|",
    `| Script lines (${lines.length}) | ${tally.human} (${pct(tally.human)}) | ${tally.ai} (${pct(tally.ai)}) | ${tally["ai-edited"]} (${pct(tally["ai-edited"])}) |`,
    `| Translations | ${translations.human} | ${translations.ai} | ${translations["ai-edited"]} |`,
    `| Character bibles (not shipped) | | ${bibles} | |`,
    "",
    "## By file",
    "",
    ...[...byFile].filter(([, f]) => f.ai + f.edited > 0).map(([file, f]) => `- ${file}: ${f.ai} AI-written, ${f.edited} edited, of ${f.total} lines`),
  ];
  if (tally.ai + tally["ai-edited"] === 0) out.push("No AI-written script lines are recorded.");
  out.push("", "_Counts come from .himawari/provenance.json, which records writes made through himawari-mcp and Studio's assistant._");
  process.stdout.write(`${out.join("\n")}\n`);
  return 0;
}

/** After `hwc build --release`: build/windows/<Game>/ with the runtime, when it can be found. */
export function packageRelease(root: string): string {
  const fs = new ProjectFs(root);
  const exe = findRuntime();
  if (!exe) return "note: himawari.exe wasn't found, so only build/game.hwb was written (set HIMAWARI_RUNTIME to package a playable folder)";
  const c = compileProject(fs, { debug: false });
  if (!c.bytes) return "";
  const p = packageGame(fs, c.bytes, c.title, exe);
  return `✓ ${p.exe}: a playable folder (${p.files} files) in ${p.dir}`;
}

/** himawari-mcp's entry point beside this package in a checkout (packages/mcp/dist/main.js). */
function mcpMain(): string | null {
  const p = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "mcp", "dist", "main.js");
  return existsSync(p) ? p : null;
}

/**
 * hwc ai setup [--write] (plan §10.7, Mode A): how to connect Claude Code and
 * the Claude desktop app to this project. --write creates the project's
 * .mcp.json for Claude Code; the desktop app's own config is never edited.
 */
export function aiSetup(root: string, args: readonly string[]): number {
  if (args[0] !== "setup") throw new CommandError("usage: hwc ai setup [--write]");
  const main = mcpMain();
  if (!main) throw new CommandError("himawari-mcp isn't built next to hwc (run corepack pnpm build in the Himawari checkout)");
  const node = process.execPath;
  const server = { command: node, args: [main, "--project", root] };
  const name = "himawari";
  const mcpJson = `${JSON.stringify({ mcpServers: { [name]: server } }, null, 2)}\n`;
  const fs = new ProjectFs(root);
  if (args.includes("--write")) {
    fs.write(".mcp.json", mcpJson);
    console.log("✓ Wrote .mcp.json: Claude Code started in this folder offers the himawari tools (it asks you to approve the server once).");
  }
  const quote = (s: string) => (/[\s"]/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s);
  const desktop = JSON.stringify({ mcpServers: { [`himawari-${safeKey(root)}`]: server } }, null, 2);
  console.log(
    [
      "Connect an AI app to this project (Mode A, your own Claude plan):",
      "",
      "Claude Code (in a terminal, from this folder):",
      `  claude mcp add ${name} -- ${[node, main, "--project", root].map(quote).join(" ")}`,
      `  or: hwc ai setup --write   (creates .mcp.json${fs.exists(".mcp.json") ? ", already present" : ""})`,
      "",
      "Claude desktop app: Settings > Developer > Edit Config, and add this inside \"mcpServers\" in claude_desktop_config.json, then restart the app:",
      desktop,
      "",
      "Optional flags: --allow-build lets the AI package the game; --runtime <himawari.exe> if it isn't found automatically.",
      "The AI follows Himawari's agent guide and this project's AGENTS.md. It can't create images, music, or voices.",
    ].join("\n"),
  );
  return 0;
}

function safeKey(root: string): string {
  return (root.split(/[\\/]/).filter(Boolean).pop() ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
