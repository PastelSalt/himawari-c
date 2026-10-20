/**
 * Exec tools (plan §10.3): they run the bundled runtime with fixed arguments
 * (never a shell) on a compiled copy of the project in .himawari/cache/.
 */
import { z } from "zod";
import { compileProject, packageGame } from "../package.js";
import { type ToolContext, ToolError, defineTool } from "../registry.js";
import { runRuntime } from "../runtime.js";

const CACHE = ".himawari/cache";

function needRuntime(ctx: ToolContext): string {
  if (!ctx.runtime) throw new ToolError("himawari.exe wasn't found. Build the runtime, or set HIMAWARI_RUNTIME to its path.");
  return ctx.runtime;
}

/** Compiles into .himawari/cache/game.hwb; returns its absolute path. */
function compileToCache(ctx: ToolContext): string {
  const c = compileProject(ctx.fs);
  if (!c.bytes) throw new ToolError(`The project doesn't compile yet; fix these first:\n${c.errors}`);
  ctx.fs.write(`${CACHE}/game.hwb`, c.bytes);
  return ctx.fs.path(`${CACHE}/game.hwb`);
}

interface PlaytestReport {
  paths: number;
  steps: number;
  stepLimit: boolean;
  covered?: boolean;
  menus: number;
  endings: { reached: number; total: number; list: { scene: string; file?: string; line?: number; hits: number }[]; unreached: { scene: string; file?: string; line?: number }[] };
  errors: { message: string; hits: number }[];
  coverage: { lines: { seen: number; total: number }; options: { chosen: number; total: number }; unseen: string[] };
  divisionByZero: number;
}

export const playtest = defineTool({
  name: "playtest",
  title: "Playtest",
  description:
    "Play the story headlessly in the real runtime. Without choices: explore every path (strategy all_paths) and report endings reached and unreached, errors, and line/choice coverage. With choices (option index among those shown at each menu): one playthrough, returned as a transcript of everything shown. Run it after changing branches.",
  kind: "exec",
  input: z.object({
    choices: z.array(z.number().int().min(0)).optional(),
    seed: z.number().int().min(0).default(1),
    lang: z.string().optional(),
    max_steps: z.number().int().min(100).max(20000000).optional().describe("Events to play across all paths; by default about 40 per line of the story"),
  }),
  output: z.looseObject({ ok: z.boolean() }),
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(ctx, args) {
    const exe = needRuntime(ctx);
    const hwb = compileToCache(ctx);
    const extra = [`seed=${args.seed}`, ...(args.lang ? [`lang=${args.lang}`] : [])];
    if (args.choices) {
      const r = await runRuntime(exe, ["--headless", hwb, "--transcript", args.choices.join(" "), ...extra]);
      if (r.code !== 0) throw new ToolError(`the runtime failed: ${r.stderr.trim() || r.stdout.trim()}`);
      return { text: r.stdout, data: { ok: !/^error:/m.test(r.stdout), transcript: r.stdout } };
    }
    const out = ctx.fs.path(`${CACHE}/playtest.json`);
    const r = await runRuntime(exe, ["--headless", hwb, "--playtest", ...(args.max_steps ? [`max_steps=${args.max_steps}`] : []), ...extra, "--out", out], 300000);
    if (r.code === 2) throw new ToolError(`the runtime failed: ${r.stderr.trim() || r.stdout.trim()}`);
    const report = JSON.parse(ctx.fs.read(`${CACHE}/playtest.json`)) as PlaytestReport;
    const unreached = report.endings.unreached.map((e) => `${e.scene}${e.file ? ` (${e.file}:${e.line})` : ""}`);
    const lines = [
      `${report.paths} path(s), ${report.menus} menu state(s), ${report.steps} event(s)${!report.stepLimit ? "" : report.covered ? "; every menu and choice was tried, not every combination (raise max_steps for more)" : "; stopped at the step limit before trying every choice (raise max_steps)"}`,
      `Endings: ${report.endings.reached} of ${report.endings.total} reached${unreached.length ? `; never reached: ${unreached.join(", ")}` : ""}`,
      `Coverage: ${report.coverage.lines.seen}/${report.coverage.lines.total} lines, ${report.coverage.options.chosen}/${report.coverage.options.total} choices${report.coverage.unseen.length ? `; never shown: ${report.coverage.unseen.slice(0, 20).map((id) => `#${id}`).join(" ")}` : ""}`,
      ...report.errors.map((e) => `ERROR on ${e.hits} path(s): ${e.message}`),
      report.divisionByZero ? `Note: ${report.divisionByZero} division(s) by zero (the result was 0)` : "",
    ].filter(Boolean);
    return { text: lines.join("\n"), data: { ok: r.code === 0, ...report } };
  },
});

export const renderLine = defineTool({
  name: "render_line",
  title: "Render a line",
  description:
    "A screenshot (PNG) of the game at a line, as the player would see it: background, sprites with their expressions, the textbox. The state is reconstructed along a real path to that line. Use it to check sprite choices and composition. Opens the runtime's window for about a second.",
  kind: "exec",
  input: z.object({
    line_id: z.string().regex(/^[0-9a-hjkmnp-tv-z]{6}$/).optional().describe("A #line: ID"),
    scene: z.string().optional().describe("Or a scene: its first line"),
    lang: z.string().optional().describe("Default: the source language"),
  }),
  output: z.looseObject({ target: z.string() }),
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(ctx, args) {
    const exe = needRuntime(ctx);
    const target = args.line_id ? `#${args.line_id}` : args.scene;
    if (!target) throw new ToolError("give line_id or scene");
    const hwb = compileToCache(ctx);
    const lang = args.lang ?? (JSON.parse(ctx.fs.read("himawari.json")) as { sourceLanguage?: string }).sourceLanguage ?? "en";
    const png = ctx.fs.path(`${CACHE}/render.png`);
    ctx.fs.remove(`${CACHE}/render.png`);
    const r = await runRuntime(
      exe,
      [hwb, "--project", ctx.fs.root, "--warp", target, "--text-speed", "1000", "--frames", "40", "--screenshot", png, "--lang", lang],
      60000,
      { SDL_AUDIO_DRIVER: "dummy" },
    );
    if (r.code === 3 || !ctx.fs.exists(`${CACHE}/render.png`)) {
      const why = /warp: [^\n]+/.exec(r.stderr + r.stdout)?.[0] ?? (r.stderr.trim() || "no screenshot was written");
      throw new ToolError(`couldn't render ${target}: ${why}`);
    }
    const data = ctx.fs.readBytes(`${CACHE}/render.png`).toString("base64");
    return { text: `Rendered ${target}.`, data: { target }, image: { mimeType: "image/png", data } };
  },
});

export const build = defineTool({
  name: "build",
  title: "Build the game",
  description:
    "Compile the project and package a playable Windows folder: build/windows/<Game>/<Game>.exe with data.hwp (the story and every asset). Only available when the user started the server with --allow-build.",
  kind: "exec",
  input: z.object({}),
  output: z.looseObject({ dir: z.string(), exe: z.string() }),
  annotations: { readOnlyHint: false, idempotentHint: true },
  async run(ctx) {
    if (!ctx.allowBuild) throw new ToolError("building is turned off for this server; the user can allow it with --allow-build");
    const exe = needRuntime(ctx);
    const c = compileProject(ctx.fs, { debug: false });
    if (!c.bytes) throw new ToolError(`The project doesn't compile yet; fix these first:\n${c.errors}`);
    ctx.fs.write("build/game.hwb", c.bytes);
    const p = packageGame(ctx.fs, c.bytes, c.title, c.gameId, exe, { version: c.version });
    return { text: `Built ${p.exe} with ${p.pack} (${p.entries} files packed) in ${p.dir}.`, data: { dir: p.dir, exe: p.exe, files: p.files } };
  },
});
