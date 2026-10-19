/**
 * himawari-mcp (plan §10): Himawari's tool registry over MCP, spec
 * 2026-07-28 (SDK v2). Stateless: the project comes from the server's
 * arguments, not Roots; concurrency uses `base_revision` arguments; logs go to
 * stderr. Wide-impact writes ask the user through MRTR `input_required`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_VERSION, graphToMermaid, storyGraph } from "@himawari/core";
import { ProjectFs, RECIPES, SandboxError, TOOLS, type ToolContext, ToolError, check, findScene, isConfirm } from "@himawari/tools";
import { McpServer, ResourceTemplate, acceptedContent, inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APPS, APP_MIME, appMeta } from "./apps.js";
import type { ToolResultLike } from "./studio-link.js";

export interface ServerOptions {
  /** The project folder (contains himawari.json). */
  project: string;
  /** himawari.exe, or null when there is none. */
  runtime: string | null;
  allowBuild: boolean;
  /** Set when Studio hosts this server: writes become proposals for the user (plan §4.2). */
  propose?: ToolContext["propose"];
  /**
   * Set for the stdio server: a write tool is sent to Studio when it has the
   * project open (resolves null when it hasn't, and the write happens here).
   */
  forwardWrite?: (name: string, args: Record<string, unknown>) => Promise<ToolResultLike | null>;
}

/** $HIMAWARI_SPEC_DIR, else spec/ in a checkout (packages/mcp/dist → spec), else beside an installed Studio's resources/mcp. */
function specDir(): string {
  const env = process.env["HIMAWARI_SPEC_DIR"];
  if (env && existsSync(env)) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const checkout = join(here, "..", "..", "..", "spec");
  const installed = join(here, "..", "spec");
  return existsSync(checkout) ? checkout : installed;
}

export function readSpecDoc(name: "agent-guide.md" | "llm-reference.md"): string {
  const p = join(specDir(), name);
  return existsSync(p) ? readFileSync(p, "utf8") : `(${name} isn't installed next to himawari-mcp; see https://pastelsalt.github.io/himawari-c/spec/${name})`;
}

const ConfirmSchema = z.object({ confirm: z.boolean().describe("Go ahead") });

export function createServer(options: ServerOptions): McpServer {
  const fs = new ProjectFs(options.project);
  const guide = readSpecDoc("agent-guide.md");
  const server = new McpServer(
    { name: "himawari-mcp", title: "Himawari", version: CORE_VERSION },
    {
      instructions: `${guide}\n\nProject: ${fs.root}. Read its AGENTS.md at himawari://project/agents-md before writing.`,
    },
  );

  // Tools, in the registry's fixed order (plan §10.1).
  for (const def of TOOLS) {
    const meta = appMeta(def.name);
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        outputSchema: def.output,
        annotations: { title: def.title, ...def.annotations },
        // MCP Apps (experimental): a view for this tool's result, for hosts that show them.
        ...(meta ? { _meta: meta } : {}),
      },
      async (args: Record<string, unknown>, ctx) => {
        if (def.kind === "write" && options.forwardWrite && args["dry_run"] !== true) {
          const forwarded = await options.forwardWrite(def.name, args);
          if (forwarded) return forwarded as never;
        }
        // In Studio the proposal review is the confirmation, so wide-impact writes don't ask twice.
        const confirmed = options.propose !== undefined || acceptedContent(ctx.mcpReq.inputResponses, "confirm", ConfirmSchema)?.confirm === true;
        const tctx: ToolContext = {
          fs,
          runtime: options.runtime,
          allowBuild: options.allowBuild,
          confirmed,
          tool: def.name,
          ...(typeof args["rationale"] === "string" ? { rationale: args["rationale"] } : {}),
          ...(options.propose ? { propose: options.propose } : {}),
        };
        try {
          const out = await def.run(tctx, args as never);
          if (isConfirm(out)) {
            return inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message: out.confirm.message, requestedSchema: ConfirmSchema }) } });
          }
          const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [{ type: "text", text: out.text }];
          if (out.image) content.push({ type: "image", data: out.image.data, mimeType: out.image.mimeType });
          return { content, structuredContent: out.data, ...(out.isError ? { isError: true } : {}) };
        } catch (e) {
          if (e instanceof ToolError || e instanceof SandboxError) return { content: [{ type: "text", text: e.message }], isError: true };
          throw e;
        }
      },
    );
  }

  // Resources (plan §10.4).
  const text = (uri: URL, body: string, mimeType = "text/plain") => ({ contents: [{ uri: uri.href, mimeType, text: body }] });
  server.registerResource("manifest", "himawari://project/manifest", { title: "himawari.json", mimeType: "application/json" }, (uri) =>
    text(uri, fs.read("himawari.json"), "application/json"),
  );
  server.registerResource("agents-md", "himawari://project/agents-md", { title: "The project's AGENTS.md (layer 2 instructions)", mimeType: "text/markdown" }, (uri) =>
    text(uri, fs.exists("AGENTS.md") ? fs.read("AGENTS.md") : "This project has no AGENTS.md.", "text/markdown"),
  );
  server.registerResource("glossary", "himawari://project/glossary", { title: "The glossary: agreed translations of the game's own words", mimeType: "application/json" }, (uri) =>
    text(uri, fs.exists("glossary.json") ? fs.read("glossary.json") : '{ "terms": [] }', "application/json"),
  );
  server.registerResource("agent-guide", "himawari://agent-guide", { title: "Himawari agent guide (layer 1)", mimeType: "text/markdown" }, (uri) =>
    text(uri, guide, "text/markdown"),
  );
  server.registerResource("llm-reference", "himawari://spec/llm-reference", { title: "Himawari Script reference for models", mimeType: "text/markdown" }, (uri) =>
    text(uri, readSpecDoc("llm-reference.md"), "text/markdown"),
  );
  server.registerResource("graph", "himawari://graph", { title: "Story graph (Mermaid)", mimeType: "text/plain" }, (uri) =>
    text(uri, graphToMermaid(storyGraph(check(fs).check))),
  );
  server.registerResource(
    "scene",
    new ResourceTemplate("himawari://scene/{id}", {
      list: () => {
        const c = check(fs).check;
        return { resources: storyGraph(c).nodes.map((n) => ({ uri: `himawari://scene/${n.scene}`, name: n.scene, mimeType: "text/plain" })) };
      },
    }),
    { title: "A scene's .hws source", mimeType: "text/plain" },
    (uri, vars) => {
      const loc = findScene(check(fs).check, String(vars["id"]));
      if (!loc) throw new ToolError(`no scene ${String(vars["id"])}`);
      return text(uri, loc.text);
    },
  );
  server.registerResource(
    "character",
    new ResourceTemplate("himawari://character/{id}", {
      list: () => ({ resources: fs.list("characters", (n) => n.endsWith(".md")).map((f) => ({ uri: `himawari://character/${f.slice(11, -3)}`, name: f.slice(11, -3), mimeType: "text/markdown" })) }),
    }),
    { title: "A character file (frontmatter + bible)", mimeType: "text/markdown" },
    (uri, vars) => text(uri, fs.read(`characters/${String(vars["id"]).replace(/[^a-z0-9_]/g, "")}.md`), "text/markdown"),
  );

  // MCP Apps views (experimental, apps.ts).
  for (const app of APPS) server.registerResource(app.name, app.uri, { title: app.title, mimeType: APP_MIME }, (uri) => text(uri, app.html, APP_MIME));

  // Prompts (plan §10.4): the same recipes as the Studio assistant's slash commands.
  for (const r of RECIPES) {
    const shape = Object.fromEntries(r.args.map((a) => [a.name, a.required ? z.string().describe(a.description) : z.string().describe(a.description).optional()]));
    server.registerPrompt(r.name, { title: r.title, description: r.description, argsSchema: z.object(shape) }, (a) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: r.prompt(a as Record<string, string | undefined>) } }],
    }));
  }
  return server;
}
