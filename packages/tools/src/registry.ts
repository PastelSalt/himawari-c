/**
 * The tool registry (plan §10.9): every tool is defined once, with a Zod input
 * schema, an output schema, annotations, and a handler. himawari-mcp exports
 * them as MCP tools; Studio's assistant panel will export the same definitions
 * as SDK tools. Order is deterministic (plan §10.1).
 */
import type { RandomSource } from "@himawari/core";
import type { z } from "zod";
import type { ProjectFs } from "./fs.js";

export type ToolKind = "read" | "write" | "exec";

export interface ToolContext {
  fs: ProjectFs;
  /** himawari.exe, for playtest and render_line; null when not available. */
  runtime: string | null;
  /** `build` writes a playable folder only when the user allowed it in config. */
  allowBuild: boolean;
  /** The user confirmed a wide-impact operation (an MCP `input_required` round trip). */
  confirmed?: boolean;
  /** Line IDs for new lines (tests pass a deterministic source). */
  random?: RandomSource;
  /** The tool being run (set by the host; names the proposal). */
  tool?: string;
  /** The AI's one-line explanation of a write (the `rationale` argument), shown with the proposal (P12). */
  rationale?: string;
  /**
   * When set, validated writes become proposals for a human (plan §4.2, §11.4):
   * Studio is running and owns writes. Called instead of writing; resolves with
   * the decision, or "pending" when nobody has decided yet.
   */
  propose?: (p: ProposalRequest) => Promise<ProposalOutcome>;
}

export interface ProposalRequest {
  tool: string;
  /** The one-line rationale shown with the diff (P12). */
  summary: string;
  /** New text per file; null deletes it. */
  changes: ReadonlyMap<string, string | null>;
  /** Warnings and notes the change brings (errors are refused before this). */
  diagnostics: { file: string; code: string; severity: string; message: string; line: number }[];
}

export type ProposalOutcome = { status: "accepted" } | { status: "rejected"; reason: string } | { status: "pending"; id: string } | { status: "withdrawn" };

export interface ToolOk {
  /** A short, readable summary (or .hws text) for the model. */
  text: string;
  /** Structured result, matching the tool's output schema. */
  data: Record<string, unknown>;
  /** A rendered image (render_line). */
  image?: { mimeType: string; data: string };
  /** The call didn't do what was asked (validation failed, nothing written). */
  isError?: boolean;
}

/** The tool needs the user's go-ahead first (MRTR `input_required` in MCP). */
export interface ToolConfirm {
  confirm: { message: string };
}

export type ToolOutcome = ToolOk | ToolConfirm;

/** A failure the model can act on (bad arguments, a stale revision); reported as an error result. */
export class ToolError extends Error {}

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDef<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  input: S;
  output: z.ZodObject;
  annotations: ToolAnnotations;
  run(ctx: ToolContext, args: z.output<S>): Promise<ToolOutcome>;
}

export function defineTool<S extends z.ZodObject>(def: Omit<ToolDef<S>, "annotations"> & { annotations?: Partial<ToolAnnotations> }): ToolDef<S> {
  const read = def.kind === "read";
  return {
    ...def,
    annotations: {
      readOnlyHint: read,
      destructiveHint: false,
      idempotentHint: read,
      openWorldHint: false,
      ...def.annotations,
    },
  };
}

export const isConfirm = (o: ToolOutcome): o is ToolConfirm => "confirm" in o;
