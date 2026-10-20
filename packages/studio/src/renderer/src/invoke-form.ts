/**
 * Macro and extension calls as forms (FINALIZATION.md NC-9, NC-10): the
 * statement's signature (a macro's parameters, or an extension's schema) gives
 * the fields; the form writes the call back as one line. Pure.
 */
import type { ArgValue, ProjectCheck, Stmt } from "@himawari/core";
import { displayToRaw, rawToDisplay } from "./screenplay-edit";

export interface InvokeParam {
  name: string;
  type: string;
  required: boolean;
  /** For `word` parameters with a fixed list. */
  enum?: string[];
  description?: string;
}

/** A field's value: a name (character, scene, asset, word, true/false), a number, or text as the writer sees it. */
export type InvokeValue = { kind: "name"; value: string } | { kind: "int"; value: number } | { kind: "text"; value: string };

export interface InvokeForm {
  name: string;
  /** "macro" (saved steps) or "extension". */
  of: "macro" | "extension";
  params: InvokeParam[];
  values: Record<string, InvokeValue | null>;
}

const valueOf = (v: ArgValue): InvokeValue => (v.kind === "int" ? { kind: "int", value: v.value } : v.kind === "name" ? { kind: "name", value: v.value } : { kind: "text", value: rawToDisplay(v.raw) });

/** The form for an Invoke statement, or null when its signature is unknown (it stays editable as script). */
export function invokeFormOf(s: Stmt, check: Pick<ProjectCheck, "macros" | "extensions">): InvokeForm | null {
  if (s.kind !== "Invoke") return null;
  const macro = check.macros.get(s.name);
  const ext = check.extensions.get(s.name);
  let params: InvokeParam[];
  let of: InvokeForm["of"];
  if (macro) {
    of = "macro";
    params = macro.def.params.map((p) => ({ name: p.name, type: p.type, required: p.default === null }));
  } else if (ext) {
    of = "extension";
    params = ext.params.map((p) => ({ name: p.name, type: p.type, required: p.default === undefined, ...(p.enum ? { enum: p.enum } : {}), ...(p.description ? { description: p.description } : {}) }));
  } else return null;
  const values: Record<string, InvokeValue | null> = Object.fromEntries(params.map((p) => [p.name, null]));
  let position = 0;
  for (const a of s.args) {
    const name = a.name ?? params[position++]?.name;
    if (!name || !(name in values)) return null; // an argument the signature doesn't know: leave it to the script
    values[name] = valueOf(a.value);
  }
  return { name: s.name, of, params, values };
}

function valueSource(v: InvokeValue): string {
  if (v.kind === "int") return String(Math.trunc(v.value));
  if (v.kind === "text") return `"${displayToRaw(v.value)}"`;
  return v.value;
}

/** The call as one line: positional while every earlier parameter is given, then key=value. */
export function invokeSource(f: InvokeForm): string {
  const out: string[] = [];
  let named = false;
  for (const p of f.params) {
    const v = f.values[p.name];
    if (!v) {
      named = true;
      continue;
    }
    out.push(named ? `${p.name}=${valueSource(v)}` : valueSource(v));
  }
  return `${f.name}(${out.join(", ")})`;
}
