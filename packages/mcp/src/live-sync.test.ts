/**
 * Mode A live sync (plan §4.2): with a live Studio session, the stdio server
 * sends writes to Studio's HTTP endpoint, where a person decides. Studio is
 * played here by `serveHttp` with a scripted decision.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProposalOutcome, ProposalRequest } from "@himawari/tools";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type HttpEndpoint, serveHttp } from "./http.js";
import { SESSION_FILE } from "./studio-link.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAIN = join(ROOT, "packages/mcp/dist/main.js");

let dir = "";
let client: Client;
let studio: HttpEndpoint;
const seen: ProposalRequest[] = [];
let decide: (p: ProposalRequest) => ProposalOutcome = () => ({ status: "accepted" });

type ToolResult = { content: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as ToolResult;
const textOf = (r: ToolResult) => r.content.map((c) => c.text ?? "").join("\n");
const script = () => readFileSync(join(dir, "script/ch1.hws"), "utf8");
const session = (on: boolean) => {
  const path = join(dir, SESSION_FILE);
  if (on) writeFileSync(path, JSON.stringify({ version: 1, url: studio.url, token: studio.token, pid: process.pid }));
  else rmSync(path, { force: true });
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "himawari-live-"));
  cpSync(join(ROOT, "tests/conformance/cases/basic"), dir, { recursive: true });
  rmSync(join(dir, "expected.hwb"));
  mkdirSync(join(dir, ".himawari"), { recursive: true });
  // "Studio": writes accepted proposals itself, like Studio's proposal queue does.
  studio = await serveHttp({
    project: dir,
    runtime: null,
    allowBuild: false,
    propose: async (p) => {
      seen.push(p);
      const outcome = decide(p);
      if (outcome.status === "accepted") for (const [file, text] of p.changes) if (text !== null) writeFileSync(join(dir, file), text);
      return outcome;
    },
  });
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MAIN, "--project", dir], stderr: "ignore" }));
}, 30000);

afterAll(async () => {
  await client?.close();
  await studio?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Mode A live sync through Studio", () => {
  test("a write becomes a proposal; accepted, it lands and is stamped", async () => {
    session(true);
    decide = () => ({ status: "accepted" });
    const r = await call("patch_scene", {
      scene: "talk_festival",
      rationale: "Hana answers more directly in talk_festival.",
      ops: [{ op: "replace_text", lineId: "z4a5b6", text: "Proposed text." }],
    });
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain("Accepted in Studio");
    expect(r.structuredContent?.["applied"]).toBe(true);
    expect(seen.at(-1)?.tool).toBe("patch_scene");
    // The AI's own one-line explanation is what the developer sees (P12).
    expect(seen.at(-1)?.summary).toBe("Hana answers more directly in talk_festival.");
    expect(script()).toContain('"Proposed text."   #line:z4a5b6');
    const prov = JSON.parse(readFileSync(join(dir, ".himawari/provenance.json"), "utf8")) as { lines: Record<string, { provenance: string }> };
    expect(prov.lines["z4a5b6"]?.provenance).toBe("ai-edited");
  });

  test("rejected: nothing is written and the AI gets the reason", async () => {
    session(true);
    decide = () => ({ status: "rejected", reason: "Too formal for Hana." });
    const before = script();
    const r = await call("patch_scene", { scene: "talk_festival", ops: [{ op: "replace_text", lineId: "z4a5b6", text: "Most esteemed festival." }] });
    expect(textOf(r)).toContain("Too formal for Hana.");
    expect(r.structuredContent?.["applied"]).toBe(false);
    expect(script()).toBe(before);
  });

  test("pending: the AI is told not to resend", async () => {
    session(true);
    decide = () => ({ status: "pending", id: "p9" });
    const r = await call("patch_scene", { scene: "talk_festival", ops: [{ op: "replace_text", lineId: "z4a5b6", text: "Later." }] });
    expect(textOf(r)).toContain("p9");
    expect(textOf(r)).toContain("Don't send it again");
  });

  test("dry runs and reads stay local; without a session, writes go to disk directly", async () => {
    session(true);
    const count = seen.length;
    const dry = await call("patch_scene", { scene: "talk_festival", dry_run: true, ops: [{ op: "replace_text", lineId: "z4a5b6", text: "Dry." }] });
    expect(textOf(dry)).toContain("Dry run");
    expect(seen.length).toBe(count);
    session(false);
    const direct = await call("patch_scene", { scene: "talk_festival", ops: [{ op: "replace_text", lineId: "z4a5b6", text: "Direct." }] });
    expect(direct.structuredContent?.["applied"]).toBe(true);
    expect(seen.length).toBe(count);
    expect(script()).toContain('"Direct."   #line:z4a5b6');
  });

  test("a stale session file (Studio gone) is ignored", async () => {
    writeFileSync(join(dir, SESSION_FILE), JSON.stringify({ version: 1, url: studio.url, token: studio.token, pid: 999999 }));
    const count = seen.length;
    const r = await call("patch_scene", { scene: "talk_festival", ops: [{ op: "replace_text", lineId: "z4a5b6", text: "Stale." }] });
    expect(r.structuredContent?.["applied"]).toBe(true);
    expect(seen.length).toBe(count);
  });

  test("the endpoint refuses requests without the token", async () => {
    const res = await fetch(studio.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });
});
