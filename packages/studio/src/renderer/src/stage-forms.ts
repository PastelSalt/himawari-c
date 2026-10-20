/**
 * Stage directions, flow, variables, and conditions as forms (FINALIZATION.md
 * §3.1, NC-1 to NC-7): every statement the Screenplay shows can be read into
 * a plain form and written back as one line of .hws, so nobody has to type
 * script syntax. Pure functions; the Screenplay's form UI uses them.
 *
 * What a form can't represent (an arithmetic expression, a mixed and/or) is
 * left as text: `formOf` and `conditionOf` return null and the row keeps its
 * "edit as script" box, so nothing a coder wrote is ever lost or rewritten.
 */
import { type Expr, type Stmt, type Transition, exprToString } from "@himawari/core";

export const TRANSITION_TYPES = ["fade", "dissolve", "slide_left", "slide_right", "slide_up", "slide_down", "wipe", "rule"] as const;

/** A transition as a form: its type, duration in ms (null = the default), and a rule wipe's mask. */
export interface TransitionForm {
  type: string;
  ms: number | null;
  mask?: string;
}

export type StageForm =
  | { kind: "bg" | "cg"; asset: string; transition: TransitionForm | null }
  | { kind: "show"; char: string; add: string[]; remove: string[]; at: string | null; transition: TransitionForm | null }
  | { kind: "hide"; char: string; transition: TransitionForm | null }
  | { kind: "move"; char: string; at: string | null; transition: TransitionForm | null }
  | { kind: "audio"; channel: "music" | "ambient" | "sfx" | "voice"; asset: string; fadeMs: number | null }
  | { kind: "stop"; channel: "music" | "ambient" | "voice"; fadeMs: number | null }
  | { kind: "wait"; ms: number }
  | { kind: "effect"; effect: "shake" | "flash"; ms: number | null }
  | { kind: "jump" | "call"; target: string }
  | { kind: "return" }
  | { kind: "end" }
  | { kind: "textbox"; mode: "adv" | "nvl" | "clear" | "hide" | "show" }
  | { kind: "assign"; name: string; op: "=" | "+=" | "-=" | "*="; value: Literal };

/** A value a form can hold: a number, yes/no, or text (an enum value or a string). */
export type Literal = { type: "int"; value: number } | { type: "bool"; value: boolean } | { type: "str"; value: string };

function transitionForm(t: Transition | null): TransitionForm | null | undefined {
  if (!t) return null;
  if (t.type === "rule") {
    const [mask, ms] = t.args;
    if (typeof mask !== "string") return undefined;
    return { type: "rule", mask, ms: typeof ms === "number" ? ms : null };
  }
  const [ms] = t.args;
  if (t.args.length > 1 || (ms !== undefined && typeof ms !== "number")) return undefined;
  return { type: t.type, ms: typeof ms === "number" ? ms : null };
}

function literalOf(e: Expr): Literal | null {
  if (e.kind === "Int") return { type: "int", value: e.value };
  if (e.kind === "Unary" && e.op === "-" && e.operand.kind === "Int") return { type: "int", value: -e.operand.value };
  if (e.kind === "Bool") return { type: "bool", value: e.value };
  if (e.kind === "Str") return { type: "str", value: e.value };
  return null;
}

/** A statement as a form, or null when it isn't one of these or has parts a form can't show. */
export function formOf(s: Stmt): StageForm | null {
  switch (s.kind) {
    case "Bg":
    case "Cg": {
      const t = transitionForm(s.transition);
      return t === undefined ? null : { kind: s.kind === "Bg" ? "bg" : "cg", asset: s.asset, transition: t };
    }
    case "Show": {
      const t = transitionForm(s.transition);
      return t === undefined ? null : { kind: "show", char: s.char, add: [...s.add], remove: [...s.remove], at: s.at, transition: t };
    }
    case "Hide": {
      const t = transitionForm(s.transition);
      return t === undefined ? null : { kind: "hide", char: s.char, transition: t };
    }
    case "Move": {
      const t = transitionForm(s.transition);
      return t === undefined ? null : { kind: "move", char: s.char, at: s.at, transition: t };
    }
    case "Audio":
      return { kind: "audio", channel: s.channel, asset: s.asset, fadeMs: s.fadeMs };
    case "Stop":
      return s.channel === "music" || s.channel === "ambient" || s.channel === "voice" ? { kind: "stop", channel: s.channel, fadeMs: s.fadeMs } : null;
    case "Wait":
      return { kind: "wait", ms: s.ms ?? 500 };
    case "Effect":
      return { kind: "effect", effect: s.effect, ms: s.ms };
    case "Jump":
      return { kind: "jump", target: s.target };
    case "Call":
      return { kind: "call", target: s.target };
    case "Return":
      return { kind: "return" };
    case "End":
      return { kind: "end" };
    case "Textbox":
      return { kind: "textbox", mode: s.mode };
    case "Assign": {
      const v = literalOf(s.value);
      return v ? { kind: "assign", name: s.name, op: s.op, value: v } : null;
    }
    default:
      return null;
  }
}

function transitionSource(t: TransitionForm | null): string {
  if (!t) return "";
  if (t.type === "rule") return ` with rule(${t.mask ?? "wipe_left"}${t.ms !== null ? `, ${t.ms}` : ""})`;
  return ` with ${t.type}${t.ms !== null ? `(${t.ms})` : ""}`;
}

export function literalSource(v: Literal): string {
  if (v.type === "int") return String(Math.trunc(v.value));
  if (v.type === "bool") return v.value ? "true" : "false";
  return JSON.stringify(v.value);
}

/** The form as one line of .hws (without indentation or line tag). */
export function formSource(f: StageForm): string {
  switch (f.kind) {
    case "bg":
    case "cg":
      return `${f.kind} ${f.asset}${transitionSource(f.transition)}`;
    case "show": {
      const attrs = [...f.add, ...f.remove.map((a) => `-${a}`)];
      return `show ${f.char}${attrs.length ? ` ${attrs.join(" ")}` : ""}${f.at ? ` at ${f.at}` : ""}${transitionSource(f.transition)}`;
    }
    case "hide":
      return `hide ${f.char}${transitionSource(f.transition)}`;
    case "move":
      return `move ${f.char}${f.at ? ` at ${f.at}` : ""}${transitionSource(f.transition)}`;
    case "audio":
      return `${f.channel} ${f.asset}${f.fadeMs !== null && (f.channel === "music" || f.channel === "ambient") ? ` fade(${f.fadeMs})` : ""}`;
    case "stop":
      return `stop ${f.channel}${f.fadeMs !== null ? ` fade(${f.fadeMs})` : ""}`;
    case "wait":
      return `wait(${Math.max(0, Math.round(f.ms))})`;
    case "effect":
      return `${f.effect}${f.ms !== null ? `(${f.ms})` : ""}`;
    case "jump":
    case "call":
      return `${f.kind} ${f.target}`;
    case "return":
    case "end":
      return f.kind;
    case "textbox":
      return `textbox ${f.mode}`;
    case "assign":
      return `$ ${f.name} ${f.op} ${literalSource(f.value)}`;
  }
}

// ---- Conditions ("Only if…") ----

export const COMPARE_OPS = ["==", "!=", ">=", "<=", ">", "<"] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

/** One part of a condition: "<variable> <op> <value>", or a yes/no flag ("met" / "not met"). */
export type CondPart = { kind: "compare"; name: string; op: CompareOp; value: Literal } | { kind: "flag"; name: string; negate: boolean };

/** A condition as a form: parts joined by one kind of "and"/"or". */
export interface CondForm {
  join: "and" | "or";
  parts: CondPart[];
}

function partOf(e: Expr): CondPart | null {
  if (e.kind === "Var") return { kind: "flag", name: e.name, negate: false };
  if (e.kind === "Unary" && e.op === "not" && e.operand.kind === "Var") return { kind: "flag", name: e.operand.name, negate: true };
  if (e.kind === "Binary" && (COMPARE_OPS as readonly string[]).includes(e.op) && e.left.kind === "Var") {
    const v = literalOf(e.right);
    if (v) return { kind: "compare", name: e.left.name, op: e.op as CompareOp, value: v };
  }
  return null;
}

/** A condition expression as a form, or null when it's too complex for one (it stays editable as text). */
export function conditionOf(e: Expr): CondForm | null {
  const single = partOf(e);
  if (single) return { join: "and", parts: [single] };
  if (e.kind !== "Binary" || (e.op !== "and" && e.op !== "or")) return null;
  const join = e.op;
  const parts: CondPart[] = [];
  const walk = (x: Expr): boolean => {
    if (x.kind === "Binary" && x.op === join) return walk(x.left) && walk(x.right);
    const p = partOf(x);
    if (!p) return false;
    parts.push(p);
    return true;
  };
  return walk(e) ? { join, parts } : null;
}

export function conditionSource(c: CondForm): string {
  return c.parts
    .map((p) => (p.kind === "flag" ? `${p.negate ? "not " : ""}${p.name}` : `${p.name} ${p.op} ${literalSource(p.value)}`))
    .join(` ${c.join} `);
}

/** An expression as source (for the "as script" view of anything a form can't show). */
export const exprSource = (e: Expr) => exprToString(e);
