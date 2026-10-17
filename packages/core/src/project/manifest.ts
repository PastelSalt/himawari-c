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
}

/** Positions used when the manifest declares none. */
export const DEFAULT_POSITIONS: Record<string, [number, number]> = {
  left: [0.25, 1],
  center: [0.5, 1],
  right: [0.75, 1],
};

const NOWHERE = { start: 0, end: 0 };
const IDENT = /^[a-z_][a-z0-9_]*$/;

export function readManifest(text: string): { manifest: Manifest | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const problem = (field: string, what: string) =>
    diagnostics.push(diagnostic("HW0102", NOWHERE, { field: `"${field}"`, problem: what }));

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

  let languages: string[] = [];
  if (Array.isArray(m["languages"]) && m["languages"].every((l) => typeof l === "string")) {
    languages = m["languages"] as string[];
    if (sourceLanguage && !languages.includes(sourceLanguage)) {
      problem("languages", `must include the source language "${sourceLanguage}"`);
    }
  } else {
    problem("languages", "must be a list of language tags, like [\"en\", \"ja\"]");
  }

  let resolution: [number, number] = [1920, 1080];
  if (m["resolution"] !== undefined) {
    const r = m["resolution"];
    if (Array.isArray(r) && r.length === 2 && r.every((n) => Number.isInteger(n) && (n as number) > 0)) {
      resolution = r as [number, number];
    } else {
      problem("resolution", "must be [width, height] in whole pixels");
    }
  }

  let positions: Record<string, [number, number]> = DEFAULT_POSITIONS;
  if (m["positions"] !== undefined) {
    positions = {};
    const p = m["positions"];
    if (typeof p === "object" && p !== null && !Array.isArray(p)) {
      for (const [k, v] of Object.entries(p)) {
        if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number")) positions[k] = v as [number, number];
        else problem(`positions.${k}`, "must be [x, y] as fractions of the screen");
      }
    } else {
      problem("positions", "must be an object of name: [x, y]");
    }
  }

  const variables: Record<string, VariableDecl> = {};
  const vars = m["variables"];
  if (vars !== undefined && (typeof vars !== "object" || vars === null || Array.isArray(vars))) {
    problem("variables", "must be an object of name: { type, default, scope }");
  } else if (vars) {
    for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
      const where = `variables.${k}`;
      if (!IDENT.test(k)) problem(where, "has an invalid name (use lowercase letters, digits, and _)");
      const d = v as Record<string, unknown>;
      const type = d?.["type"];
      if (type !== "int" && type !== "bool" && type !== "str") {
        problem(`${where}.type`, "must be \"int\", \"bool\", or \"str\"");
        continue;
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
      variables[k] = decl;
    }
  }

  return { manifest: { name, id, entry, sourceLanguage, languages, resolution, positions, variables }, diagnostics };
}
