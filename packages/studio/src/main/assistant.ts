/**
 * The built-in assistant (Mode B, plan §10.9). Bring your own Anthropic API
 * key: encrypted with Windows (safeStorage) and used only here in main; the
 * renderer never sees it. Requests go straight to Anthropic; nothing else.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { check, expandCommand, findScene } from "@himawari/tools";
import { app, safeStorage } from "electron";
import { readSpecDoc } from "himawari-mcp";
import type { AssistantEvent, AssistantKeyStatus, AssistantRequest, Settings } from "../shared/api.js";
import { type StudioContext, runTurn, sdkTools, systemBlocks, userTurn } from "./assistant-core.js";
import { proposeThrough } from "./mcp-host.js";
import type { Project } from "./project.js";
import type { Proposals } from "./proposals.js";

const keyFile = () => join(app.getPath("userData"), "anthropic-key.bin");

const LANGUAGE: Record<string, string> = { en: "English", ja: "Japanese", "en-XA": "English" };

export class AssistantHost {
  private messages: Anthropic.Beta.BetaMessageParam[] = [];
  private system: ReturnType<typeof systemBlocks> | null = null;
  private abort: AbortController | null = null;
  private turns = 0;

  constructor(
    private project: () => Project | null,
    private proposals: Proposals,
    private settings: () => Settings,
    private emit: (event: AssistantEvent) => void,
    private runtime: () => string | null = () => null,
  ) {}

  keyStatus(): AssistantKeyStatus {
    return { hasKey: existsSync(keyFile()), canStore: safeStorage.isEncryptionAvailable() };
  }

  setKey(key: string | null): AssistantKeyStatus {
    if (key === null) {
      rmSync(keyFile(), { force: true });
    } else {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows can't encrypt the key on this machine.");
      if (!/^sk-ant-[\w-]{20,}$/.test(key.trim())) throw new Error("That doesn't look like an Anthropic API key (sk-ant-…).");
      writeFileSync(keyFile(), safeStorage.encryptString(key.trim()));
    }
    return this.keyStatus();
  }

  /** A client with the stored key (the assistant and "Translate with AI"). */
  apiClient(): Anthropic {
    if (!existsSync(keyFile())) throw new Error("Add your Anthropic API key in Settings first.");
    return new Anthropic({ apiKey: safeStorage.decryptString(readFileSync(keyFile())) });
  }

  /** @scene:name, @character:id, @line:id → their text, read from the project. */
  private expandMentions(mentions: string[]): StudioContext["mentions"] {
    const p = this.project();
    if (!p) return [];
    const { check: c } = check(p.fs);
    const out: StudioContext["mentions"] = [];
    for (const m of mentions.slice(0, 8)) {
      const [kind, name] = m.split(":", 2);
      if (!name) continue;
      if (kind === "scene") {
        const s = findScene(c, name);
        if (s) out.push({ label: `scene ${name} (${s.file})`, text: s.text });
      } else if (kind === "character") {
        const ch = c.characters.get(name);
        if (ch) out.push({ label: `character ${name}`, text: p.fs.read(ch.file) });
      } else if (kind === "line") {
        for (const [file, r] of c.parsed) {
          const src = c.files.find((f) => f.file === file)?.source ?? "";
          const i = src.indexOf(`#line:${name}`);
          if (i >= 0) {
            const start = src.lastIndexOf("\n", i) + 1;
            out.push({ label: `line ${name} (${file})`, text: src.slice(start, src.indexOf("\n", i) < 0 ? undefined : src.indexOf("\n", i)) });
            void r;
            break;
          }
        }
      }
    }
    return out;
  }

  send(request: unknown): string {
    const r = request as AssistantRequest;
    if (!r || typeof r.text !== "string" || !r.text.trim()) throw new Error("Type a message first.");
    const project = this.project();
    if (!project) throw new Error("No project is open.");
    if (this.abort) throw new Error("The assistant is still answering.");
    const client = this.apiClient();
    const settings = this.settings();
    const turn = `t${++this.turns}`;
    if (!this.system) {
      // Read once per conversation: a stable, cacheable prefix.
      const { check: c } = check(project.fs);
      this.system = systemBlocks({
        guide: readSpecDoc("agent-guide.md"),
        reference: readSpecDoc("llm-reference.md"),
        agents: project.fs.exists("AGENTS.md") ? project.fs.read("AGENTS.md") : null,
        characters: [...c.characters.values()].map((ch) => ({ file: ch.file, text: project.fs.read(ch.file) })),
      });
    }
    const ctx: StudioContext = {
      replyLanguage: settings.ai.replyLanguage || LANGUAGE[settings.language] || "English",
      ...(r.context?.openFile ? { openFile: r.context.openFile } : {}),
      ...(r.context?.selection ? { selection: r.context.selection.slice(0, 4000) } : {}),
      mentions: this.expandMentions(Array.isArray(r.context?.mentions) ? r.context.mentions.filter((m): m is string => typeof m === "string") : []),
    };
    // A slash command (/continuity ch1) becomes its recipe, the same instructions as the MCP prompt.
    const command = expandCommand(r.text);
    if (command && "missing" in command) throw new Error(`/${command.recipe.command} needs: ${command.missing.join(", ")}`);
    const messages = [...this.messages, userTurn(command ? command.prompt : r.text, ctx)];
    const tools = sdkTools(
      (def, args) => ({
        fs: project.fs,
        runtime: this.runtime(),
        allowBuild: false,
        // The proposal review is the confirmation for wide-impact writes.
        confirmed: true,
        tool: def.name,
        ...(typeof args["rationale"] === "string" ? { rationale: args["rationale"] } : {}),
        propose: (p) => proposeThrough(this.proposals, project, this.settings(), "assistant", p),
      }),
      (name, args) => this.emit({ kind: "tool", turn, name, summary: summarize(args) }),
    );
    const abort = new AbortController();
    this.abort = abort;
    void runTurn(client, { model: settings.ai.model, effort: settings.ai.effort, system: this.system, tools, messages, turn, emit: this.emit, signal: abort.signal })
      .then((next) => {
        this.messages = next;
      })
      .catch((e: unknown) => {
        this.messages = messages;
        this.emit({ kind: "error", turn, message: describeApiError(e) });
        this.emit({ kind: "done", turn, stop: "error" });
      })
      .finally(() => {
        if (this.abort === abort) this.abort = null;
      });
    return turn;
  }

  cancel(): void {
    this.abort?.abort();
  }

  /** A fresh conversation (also on project close): rereads AGENTS.md and the bibles next time. */
  reset(): void {
    this.abort?.abort();
    this.abort = null;
    this.messages = [];
    this.system = null;
  }
}

function summarize(args: Record<string, unknown>): string {
  const pick = ["scene", "character", "lang", "id", "name", "from", "to", "query"].map((k) => (typeof args[k] === "string" ? `${k}: ${args[k] as string}` : null)).filter(Boolean);
  return pick.join(", ");
}

/** Errors in plain words (the API's typed errors, most specific first). */
export function describeApiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (e instanceof Anthropic.RateLimitError) return "Anthropic's rate limit was reached. Wait a moment and try again.";
  if (e instanceof Anthropic.BadRequestError) return `The request was refused: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Anthropic returned an error (${e.status ?? "?"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
