/**
 * Story graph (plan §9.1 `analyzer`, §10.3 `get_story_graph`): scenes as
 * nodes, `jump`/`call` as edges, each labeled with the menu choice and the
 * conditions on the way to it. Pure, like the validator.
 */
import type { Expr, Scene, Stmt } from "../syntax/ast.js";
import { plainText } from "../syntax/text.js";
import type { ProjectCheck } from "./check.js";

export interface GraphNode {
  scene: string;
  file: string;
  /** Dialogue and narration lines in the scene (not counting called scenes). */
  lines: number;
  /** The scene can end the story (`end`, or falling off its end). */
  ending: boolean;
  entry: boolean;
  reachable: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "jump" | "call";
  /** The menu choice that leads here, if any (plain text). */
  choice?: string;
  /** The choice's line ID. */
  choiceId?: string;
  /** Conditions on the way (an `if` branch, an option's `if`), as written. */
  when?: string;
}

export interface StoryGraph {
  entry: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const PRECEDENCE: Readonly<Record<string, number>> = {
  or: 1, and: 2, "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3, "+": 4, "-": 4, "*": 5, "/": 5, "%": 5,
};

/** An expression as .hws source. */
export function exprToString(e: Expr, parent = 0): string {
  switch (e.kind) {
    case "Int":
      return String(e.value);
    case "Bool":
      return e.value ? "true" : "false";
    case "Str":
      return JSON.stringify(e.value);
    case "Var":
      return e.name;
    case "Unary":
      return e.op === "not" ? `not ${exprToString(e.operand, 6)}` : `-${exprToString(e.operand, 6)}`;
    case "Binary": {
      const p = PRECEDENCE[e.op] ?? 0;
      const s = `${exprToString(e.left, p)} ${e.op} ${exprToString(e.right, p + 1)}`;
      return p < parent ? `(${s})` : s;
    }
    case "Call":
      return `${e.name}(${e.args.map((a) => exprToString(a)).join(", ")})`;
    case "Invalid":
      return "?";
  }
}

const join = (conds: readonly string[]) => (conds.length ? conds.join(" and ") : undefined);

export function storyGraph(check: ProjectCheck): StoryGraph {
  const entry = check.manifest?.entry ?? null;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const scenes: { scene: Scene; file: string }[] = [];
  for (const [file, ast] of check.expanded) for (const scene of ast.scenes) scenes.push({ scene, file });
  scenes.sort((a, b) => (a.scene.id < b.scene.id ? -1 : a.scene.id > b.scene.id ? 1 : 0));

  for (const { scene, file } of scenes) {
    let lines = 0;
    let ending = false;
    const visit = (body: readonly Stmt[], conds: readonly string[], choice?: { text: string; id: string | null }) => {
      for (const s of body) {
        if (s.kind === "Say" || s.kind === "Narration") lines++;
        if (s.kind === "End") ending = true;
        if (s.kind === "Jump" || s.kind === "Call") {
          const e: GraphEdge = { from: scene.id, to: s.target, kind: s.kind === "Jump" ? "jump" : "call" };
          if (choice) e.choice = choice.text;
          if (choice?.id) e.choiceId = choice.id;
          const w = join(conds);
          if (w) e.when = w;
          edges.push(e);
        }
        if (s.kind === "If") {
          const negated: string[] = [];
          for (const c of s.clauses) {
            const here = c.cond ? [...negated, exprToString(c.cond)] : negated.map((n) => n);
            visit(c.body, [...conds, ...here], choice);
            if (c.cond) negated.push(`not (${exprToString(c.cond)})`);
          }
        }
        if (s.kind === "Menu") {
          for (const o of s.options) {
            const oc = o.cond ? [...conds, exprToString(o.cond)] : conds;
            visit(o.body, oc, { text: plainText(o.text), id: o.lineId });
          }
        }
      }
    };
    visit(scene.body, []);
    const last = scene.body[scene.body.length - 1];
    if (!last || (last.kind !== "Jump" && last.kind !== "Return" && last.kind !== "End" && last.kind !== "Menu" && last.kind !== "If")) {
      ending = true; // falls off its end
    }
    nodes.push({ scene: scene.id, file, lines, ending, entry: scene.id === entry, reachable: false });
  }

  // Reachability from the entry scene.
  const byName = new Map(nodes.map((n) => [n.scene, n]));
  const queue = entry && byName.has(entry) ? [entry] : [];
  for (const name of queue) {
    const n = byName.get(name);
    if (!n || n.reachable) continue;
    n.reachable = true;
    for (const e of edges) if (e.from === name) queue.push(e.to);
  }
  return { entry, nodes, edges };
}

/** Mermaid flowchart source for a story graph. */
export function graphToMermaid(g: StoryGraph): string {
  const id = (s: string) => `s_${s}`;
  const esc = (s: string) => s.replaceAll('"', "'").replaceAll("\n", " ");
  const out = ["flowchart TD"];
  for (const n of g.nodes) {
    const label = `${n.scene}${n.lines ? ` (${n.lines})` : ""}`;
    out.push(`  ${id(n.scene)}${n.ending ? `(["${esc(label)}"])` : `["${esc(label)}"]`}`);
  }
  for (const e of g.edges) {
    const parts = [e.choice, e.when ? `if ${e.when}` : undefined].filter(Boolean) as string[];
    const arrow = e.kind === "call" ? "-.->" : "-->";
    out.push(`  ${id(e.from)} ${arrow}${parts.length ? `|"${esc(parts.join(" / "))}"|` : ""} ${id(e.to)}`);
  }
  for (const n of g.nodes) if (!n.reachable) out.push(`  style ${id(n.scene)} stroke-dasharray: 5 5`);
  if (g.entry) out.push(`  style ${id(g.entry)} stroke-width: 3px`);
  return `${out.join("\n")}\n`;
}
