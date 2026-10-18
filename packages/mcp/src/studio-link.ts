/**
 * Mode A live sync (plan §4.2, §10.7). While Studio has a project open it owns
 * writes: it serves this same MCP server on 127.0.0.1 with a random token and
 * writes the address to .himawari/session.json. The stdio himawari-mcp that a
 * Claude app starts finds that file and sends write tools to Studio, where
 * they become proposals the user accepts or rejects. Reads stay local.
 */
import type { ProjectFs } from "@himawari/tools";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export const SESSION_FILE = ".himawari/session.json";

export interface StudioSession {
  version: 1;
  /** http://127.0.0.1:<port>/mcp */
  url: string;
  /** Bearer token; the endpoint refuses requests without it. */
  token: string;
  /** Studio's process, to tell a live session from a stale file. */
  pid: number;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The live Studio session for this project, or null (no file, a malformed file, or Studio has exited). */
export function readSession(fs: ProjectFs): StudioSession | null {
  if (!fs.exists(SESSION_FILE)) return null;
  try {
    const s = JSON.parse(fs.read(SESSION_FILE)) as Partial<StudioSession>;
    if (s.version !== 1 || typeof s.url !== "string" || typeof s.token !== "string" || typeof s.pid !== "number") return null;
    const u = new URL(s.url);
    if (u.protocol !== "http:" || (u.hostname !== "127.0.0.1" && u.hostname !== "localhost")) return null;
    return alive(s.pid) ? (s as StudioSession) : null;
  } catch {
    return null;
  }
}

export type ToolResultLike = { content: unknown[]; structuredContent?: unknown; isError?: boolean };

/** Calls a tool on Studio's endpoint. Throws when Studio can't be reached. */
export async function callThroughStudio(session: StudioSession, name: string, args: Record<string, unknown>): Promise<ToolResultLike> {
  const client = new Client({ name: "himawari-mcp-proxy", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(session.url), { requestInit: { headers: { Authorization: `Bearer ${session.token}` } } });
  await client.connect(transport);
  try {
    return (await client.callTool({ name, arguments: args })) as ToolResultLike;
  } finally {
    await client.close();
  }
}
