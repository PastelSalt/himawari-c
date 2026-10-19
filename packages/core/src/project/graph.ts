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
  const id = (s: string) => `s_${s.replace(/\W/g, "_")}`; // file paths too (fileGraph)
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

/**
 * A scene and the scenes within `depth` jumps of it, either way, plus the scenes it calls (a big story's graph,
 * one place at a time). Calls are only followed forward: a shared scene many others call doesn't pull them all in.
 */
export function focusGraph(g: StoryGraph, scene: string, depth = 2): StoryGraph {
  const keep = new Set([scene]);
  let frontier = new Set([scene]);
  for (let d = 0; d < depth && frontier.size; d++) {
    const next = new Set<string>();
    for (const e of g.edges) {
      const ways: (readonly [string, string])[] = e.kind === "call" ? [[e.from, e.to]] : [[e.from, e.to], [e.to, e.from]];
      for (const [a, b] of ways) {
        if (frontier.has(a) && !keep.has(b)) {
          keep.add(b);
          next.add(b);
        }
      }
    }
    frontier = next;
  }
  return subgraph(g, (n) => keep.has(n));
}

/** The scenes in files whose path starts with `prefix` ("script/route_03"), and the links between them. */
export function fileFilterGraph(g: StoryGraph, prefix: string): StoryGraph {
  const files = new Map(g.nodes.map((n) => [n.scene, n.file]));
  return subgraph(g, (n) => (files.get(n) ?? "").startsWith(prefix));
}

function subgraph(g: StoryGraph, keep: (scene: string) => boolean): StoryGraph {
  return { entry: g.entry && keep(g.entry) ? g.entry : null, nodes: g.nodes.filter((n) => keep(n.scene)), edges: g.edges.filter((e) => keep(e.from) && keep(e.to)) };
}

/**
 * One node per file (or per group of files: `groupOf` maps a file to its group, such as its folder) and one edge
 * per pair of linked groups, labeled with how many links: an overview of a big story.
 */
export function fileGraph(g: StoryGraph, groupOf: (file: string) => string = (f) => f): StoryGraph {
  const byFile = new Map<string, GraphNode>();
  const fileOf = new Map<string, string>();
  for (const n of g.nodes) {
    const group = groupOf(n.file);
    fileOf.set(n.scene, group);
    const f = byFile.get(group);
    if (!f) byFile.set(group, { scene: group, file: group, lines: n.lines, ending: n.ending, entry: n.entry, reachable: n.reachable });
    else {
      f.lines += n.lines;
      f.ending ||= n.ending;
      f.entry ||= n.entry;
      f.reachable ||= n.reachable;
    }
  }
  const links = new Map<string, { from: string; to: string; kind: GraphEdge["kind"]; count: number }>();
  for (const e of g.edges) {
    const from = fileOf.get(e.from);
    const to = fileOf.get(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from} ${to} ${e.kind}`;
    const l = links.get(key);
    if (l) l.count++;
    else links.set(key, { from, to, kind: e.kind, count: 1 });
  }
  return {
    entry: g.entry ? (fileOf.get(g.entry) ?? null) : null,
    nodes: [...byFile.values()],
    edges: [...links.values()].map((l) => ({ from: l.from, to: l.to, kind: l.kind, ...(l.count > 1 ? { choice: `${l.count} links` } : {}) })),
  };
}

/** One ending's route: what leads only there, what it shares with other routes, and the choices that commit to it. */
export interface RouteInfo {
  ending: string;
  /** Scenes and lines from which only this ending can be reached. */
  scenes: number;
  lines: number;
  /** Lines in scenes that lead here and to other endings too (the common part). */
  shared: number;
  /** Choices that commit the player to this route ("scene: choice text"). */
  choices: string[];
  /** The scenes that lead only here. */
  members: string[];
}

/**
 * Route balance (plan §18 Phase 7): each ending's own scenes and lines. A route much shorter than the
 * others (under half the median) is listed in `short`, as a hint for the writer, not a problem.
 */
export function routeBalance(g: StoryGraph): { routes: RouteInfo[]; median: number; short: string[] } {
  const endings = g.nodes.filter((n) => n.ending && n.reachable).map((n) => n.scene);
  const into = new Map<string, string[]>();
  for (const e of g.edges) {
    const list = into.get(e.to);
    if (list) list.push(e.from);
    else into.set(e.to, [e.from]);
  }
  // The endings each scene can lead to (following jumps and calls): a search backwards from each ending,
  // so loops (a hub scene the menus come back to) count fully.
  const reach = new Map<string, Set<string>>();
  for (const ending of endings) {
    const seen = new Set([ending]);
    const queue = [ending];
    while (queue.length > 0) {
      const s = queue.pop()!;
      for (const from of into.get(s) ?? []) {
        if (seen.has(from)) continue;
        seen.add(from);
        queue.push(from);
      }
    }
    for (const s of seen) {
      const set = reach.get(s);
      if (set) set.add(ending);
      else reach.set(s, new Set([ending]));
    }
  }
  const routes = endings.map((ending): RouteInfo => {
    let scenes = 0;
    let own = 0;
    let shared = 0;
    const members: string[] = [];
    for (const n of g.nodes) {
      const r = reach.get(n.scene);
      if (!r?.has(ending) || !n.reachable) continue;
      if (r.size === 1) {
        scenes++;
        own += n.lines;
        members.push(n.scene);
      } else shared += n.lines;
    }
    const exclusive = (s: string) => reach.get(s)?.size === 1 && reach.get(s)?.has(ending);
    const choices = g.edges.filter((e) => e.choice && exclusive(e.to) && !exclusive(e.from)).map((e) => `${e.from}: ${e.choice}`);
    return { ending, scenes, lines: own, shared, choices, members };
  });
  const sorted = routes.map((r) => r.lines).sort((a, b) => a - b);
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] ?? 0) : 0;
  const short = routes.length >= 3 ? routes.filter((r) => r.lines < median / 2).map((r) => r.ending) : [];
  return { routes, median, short };
}
