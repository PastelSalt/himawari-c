#!/usr/bin/env node
/**
 * himawari-mcp over stdio (Claude Code, the Claude desktop app, other local
 * clients). Usage:
 *   himawari-mcp [--project DIR] [--runtime path/to/himawari.exe] [--allow-build]
 * The project defaults to the nearest folder at or above the working
 * directory that has himawari.json. Logs go to stderr (stdout is the protocol).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ProjectFs, findRuntime } from "@himawari/tools";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { callThroughStudio, readSession } from "./studio-link.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function findProject(from: string): string | undefined {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "himawari.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const project = arg("--project") ? resolve(arg("--project") as string) : findProject(process.cwd());
if (!project || !existsSync(join(project, "himawari.json"))) {
  process.stderr.write("himawari-mcp: no Himawari project found. Pass --project <folder with himawari.json>.\n");
  process.exit(2);
}
const runtime = arg("--runtime") ? resolve(arg("--runtime") as string) : findRuntime();
const fs = new ProjectFs(project);
const server = createServer({
  project,
  runtime,
  allowBuild: process.argv.includes("--allow-build"),
  // Mode A live sync: while Studio has this project open, writes go there as proposals (plan §4.2).
  async forwardWrite(name, args) {
    const session = readSession(fs);
    if (!session) return null;
    try {
      return await callThroughStudio(session, name, args);
    } catch (e) {
      process.stderr.write(`himawari-mcp: Studio didn't answer (${String(e)}); writing directly
`);
      return null;
    }
  },
});
await server.connect(new StdioServerTransport());
process.stderr.write(`himawari-mcp: serving ${project}${runtime ? ` (runtime ${runtime})` : " (no runtime: playtest and render_line unavailable)"}\n`);
