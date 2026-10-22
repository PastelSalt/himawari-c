/**
 * Reads `himawari.json` (plan §5.5, spec/manifest.schema.json). The JSON Schema
 * is the published contract for external tools; this reader checks the fields
 * Core relies on and reports them in plain language (P6).
 */
import { type Diagnostic, diagnostic } from "../syntax/diagnostics.js";

export type VarType = "int" | "bool" | "str";

export interface VariableDecl {
  type: VarType;
  default: number | boolean | string;
  scope: "save" | "global";
  /** For str variables: the allowed values, if it is an enum. */
  enum?: string[];
}

export interface Manifest {
  name: string;
  id: string;
  entry: string;
  sourceLanguage: string;
  languages: string[];
  resolution: [number, number];
  positions: Record<string, [number, number]>;
  variables: Record<string, VariableDecl>;
  /** How the game credits Himawari (OC-10): nothing visible (the default), a line on the title screen, or the window title. */
  credit?: "none" | "title" | "window";
}

/** Positions used when the manifest declares none. */
export const DEFAULT_POSITIONS: Record<string, [number, number]> = {
  left: [0.25, 1],
  center: [0.5, 1],
  right: [0.75, 1],
};

const NOWHERE = { start: 0, end: 0 };
const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Reports one field's problem (HW0102). */
type Problem = (field: string, what: string) => void;

export function readManifest(text: string): { manifest: Manifest | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const problem: Problem = (field, what) => {
    diagnostics.push(diagnostic("HW0102", NOWHERE, { field: `"${field}"`, problem: what }));
  };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    diagnostics.push(diagnostic("HW0101", NOWHERE, { reason: (e as Error).message }));
    return { manifest: null, diagnostics };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    diagnostics.push(diagnostic("HW0101", NOWHERE, { reason: "the top level must be an object" }));
    return { manifest: null, diagnostics };
  }
  const m = raw as Record<string, unknown>;

  const str = (field: string): string => {
    const v = m[field];
    if (typeof v === "string" && v.length > 0) return v;
    problem(field, v === undefined ? "is missing" : "must be a non-empty string");
    return "";
  };

  const name = str("name");
  const id = str("id");
  const entry = str("entry");
  const sourceLanguage = str("sourceLanguage");
  const languages = readLanguages(m["languages"], sourceLanguage, problem);
  const resolution = readResolution(m["resolution"], problem);
  const positions = readPositions(m["positions"], problem);
  const variables = readVariables(m["variables"], problem);
  const credit = readCredit(m["credit"], problem);
  return { manifest: { name, id, entry, sourceLanguage, languages, resolution, positions, variables, credit }, diagnostics };
}

function readLanguages(v: unknown, sourceLanguage: string, problem: Problem): string[] {
  if (!Array.isArray(v) || !v.every((l) => typeof l === "string")) {
    problem("languages", "must be a list of language tags, like [\"en\", \"ja\"]");
    return [];
  }
  if (sourceLanguage && !v.includes(sourceLanguage)) {
    problem("languages", `must include the source language "${sourceLanguage}"`);
  }
  return v as string[];
}

function readResolution(r: unknown, problem: Problem): [number, number] {
  if (r === undefined) return [1920, 1080];
  if (Array.isArray(r) && r.length === 2 && r.every((n) => Number.isInteger(n) && (n as number) > 0)) return r as [number, number];
  problem("resolution", "must be [width, height] in whole pixels");
  return [1920, 1080];
}

function readPositions(p: unknown, problem: Problem): Record<string, [number, number]> {
  if (p === undefined) return DEFAULT_POSITIONS;
  const positions: Record<string, [number, number]> = {};
  if (typeof p !== "object" || p === null || Array.isArray(p)) {
    problem("positions", "must be an object of name: [x, y]");
    return positions;
  }
  for (const [k, v] of Object.entries(p)) {
    if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number")) positions[k] = v as [number, number];
    else problem(`positions.${k}`, "must be [x, y] as fractions of the screen");
  }
  return positions;
}

function readVariables(vars: unknown, problem: Problem): Record<string, VariableDecl> {
  const variables: Record<string, VariableDecl> = {};
  if (vars !== undefined && (typeof vars !== "object" || vars === null || Array.isArray(vars))) {
    problem("variables", "must be an object of name: { type, default, scope }");
  } else if (vars) {
    for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
      const decl = readVariable(`variables.${k}`, k, v, problem);
      if (decl) variables[k] = decl;
    }
  }
  return variables;
}

/** One variable's declaration, or null when its type is unusable. */
function readVariable(where: string, name: string, v: unknown, problem: Problem): VariableDecl | null {
  if (!IDENT.test(name)) problem(where, "has an invalid name (use lowercase letters, digits, and _)");
  const d = v as Record<string, unknown>;
  const type = d?.["type"];
  if (type !== "int" && type !== "bool" && type !== "str") {
    problem(`${where}.type`, "must be \"int\", \"bool\", or \"str\"");
    return null;
  }
  const scope = d["scope"];
  if (scope !== "save" && scope !== "global") problem(`${where}.scope`, "must be \"save\" or \"global\"");
  const def = d["default"];
  const okDefault =
    (type === "int" && Number.isInteger(def)) || (type === "bool" && typeof def === "boolean") || (type === "str" && typeof def === "string");
  if (!okDefault) problem(`${where}.default`, `must be a${type === "int" ? "n integer" : type === "bool" ? " boolean" : " string"}`);
  const decl: VariableDecl = { type, default: def as number | boolean | string, scope: scope === "global" ? "global" : "save" };
  if (d["enum"] !== undefined) {
    if (type !== "str" || !Array.isArray(d["enum"]) || !d["enum"].every((e) => typeof e === "string")) {
      problem(`${where}.enum`, "is only allowed on str variables, as a list of strings");
    } else {
      decl.enum = d["enum"] as string[];
      if (typeof def === "string" && !decl.enum.includes(def)) problem(`${where}.default`, `must be one of ${decl.enum.join(", ")}`);
    }
  }
  return decl;
}

function readCredit(c: unknown, problem: Problem): NonNullable<Manifest["credit"]> {
  if (c === undefined) return "none";
  if (c === "none" || c === "title" || c === "window") return c;
  problem("credit", "must be \"none\", \"title\" (a small line on the title screen), or \"window\" (in the window title)");
  return "none";
}
