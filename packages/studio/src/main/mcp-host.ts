/**
 * Studio's MCP endpoint (plan §4.2, §10.7 Mode A live sync). While a project
 * is open, Studio serves the same himawari-mcp server over HTTP on
 * 127.0.0.1 with a random bearer token, and writes the address to
 * .himawari/session.json. A Claude app's stdio himawari-mcp finds it and sends
 * writes here, where they become proposals for the user.
 */
import { join, resolve } from "node:path";
import type { ProposalOutcome, ProposalRequest } from "@himawari/tools";
import { app } from "electron";
import { type HttpEndpoint, serveHttp } from "himawari-mcp/http";
import { SESSION_FILE } from "himawari-mcp/studio-link";
import type { McpStatus, Settings } from "../shared/api.js";
import type { Project } from "./project.js";
import type { Proposals } from "./proposals.js";
import { resources } from "./paths.js";

/** How long a tool call waits for the user before answering "pending" (MCP clients time out eventually). */
const DECISION_WAIT_MS = 90_000;

/** The stdio himawari-mcp script a Claude app runs. */
function mcpScript(): string {
  return app.isPackaged ? join(process.resourcesPath, "mcp", "himawari-mcp.mjs") : resolve(import.meta.dirname, "../../../mcp/dist/main.js");
}

function safeKey(root: string): string {
  return (root.split(/[\\/]/).filter(Boolean).pop() ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Bridges a tool's proposal to Studio's queue: auto-accept, or wait for the user (then "pending"). */
export async function proposeThrough(proposals: Proposals, project: Project, settings: Settings, source: string, p: ProposalRequest): Promise<ProposalOutcome> {
  const changes = [...p.changes].map(([file, text]) => ({ file, text }));
  const before: Record<string, string | null> = {};
  for (const c of changes) before[c.file] = project.fs.exists(c.file) ? project.fs.read(c.file) : null;
  const { proposal, outcome } = proposals.add({ source, tool: p.tool, rationale: p.summary, changes, before, diagnostics: p.diagnostics });
  if (settings.ai.autoAccept[p.tool] === true) {
    try {
      proposals.decide(proposal.id, { accept: true });
    } catch {
      /* a conflict: the AI is told to read the file again */
    }
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<ProposalOutcome>((done) => (timer = setTimeout(() => done({ status: "pending", id: proposal.id }), DECISION_WAIT_MS)));
  const result = await Promise.race([outcome, timeout]);
  clearTimeout(timer);
  return result;
}

export class McpHost {
  private endpoint: HttpEndpoint | null = null;
  private root = "";

  constructor(
    private project: () => Project | null,
    private proposals: Proposals,
    private settings: () => Settings,
    private runtime: () => string | null,
  ) {}

  async start(root: string): Promise<void> {
    await this.stop();
    this.root = root;
    this.endpoint = await serveHttp({
      project: root,
      runtime: this.runtime(),
      allowBuild: false,
      propose: (p) => {
        const project = this.project();
        if (!project) return Promise.resolve({ status: "withdrawn" });
        return proposeThrough(this.proposals, project, this.settings(), "mcp", p);
      },
    });
    this.project()?.fs.write(SESSION_FILE, `${JSON.stringify({ version: 1, url: this.endpoint.url, token: this.endpoint.token, pid: process.pid }, null, 2)}\n`);
  }

  async stop(): Promise<void> {
    const p = this.project();
    if (p && this.root === p.root && p.fs.exists(SESSION_FILE)) {
      try {
        p.fs.remove(SESSION_FILE);
      } catch {
        /* already gone */
      }
    }
    const e = this.endpoint;
    this.endpoint = null;
    await e?.close();
  }

  /** How a Claude app starts himawari-mcp: Studio's standalone tools program when installed, else Node (a checkout). */
  private serverEntry() {
    const tools = resources().tools;
    if (tools) return { command: tools, args: ["mcp", "--project", this.root] };
    return { command: "node", args: [mcpScript(), "--project", this.root] };
  }

  status(): McpStatus {
    if (!this.root) return { listening: false, claudeCodeCommand: "", desktopConfig: "" };
    const quote = (s: string) => (/[\s"]/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s);
    const e = this.serverEntry();
    return {
      listening: this.endpoint !== null,
      claudeCodeCommand: `claude mcp add himawari -- ${[e.command, ...e.args].map(quote).join(" ")}`,
      desktopConfig: JSON.stringify({ mcpServers: { [`himawari-${safeKey(this.root)}`]: e } }, null, 2),
    };
  }

  /** The project's .mcp.json for Claude Code (the user confirmed in Settings). */
  writeClaudeCodeConfig(): void {
    const p = this.project();
    if (!p) throw new Error("No project is open.");
    p.fs.write(".mcp.json", `${JSON.stringify({ mcpServers: { himawari: this.serverEntry() } }, null, 2)}\n`);
  }
}
