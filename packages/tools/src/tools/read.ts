/** Read tools (plan §10.3): nothing here writes. Scenes come back as .hws text. */
import { CORE_VERSION, SPEC_VERSIONS, collectLines, graphToMermaid, storyGraph } from "@himawari/core";
import { z } from "zod";
import { check, describeDiagnostics, diagnosticsJson, findScene, revisionOf } from "../project.js";
import { ToolError, defineTool } from "../registry.js";

const SceneName = z.string().regex(/^[a-z_][a-z0-9_]*$/).describe("A scene name, like ch1_intro");

export const projectInfo = defineTool({
  name: "project_info",
  title: "Project info",
  description:
    "The project's manifest (name, entry scene, languages, resolution), counts of scenes, lines, characters, variables, and assets, the number of problems, and the spec versions. Call this first.",
  kind: "read",
  input: z.object({}),
  output: z.looseObject({ name: z.string(), entry: z.string(), languages: z.array(z.string()) }),
  async run(ctx) {
    const { input, check: c } = check(ctx.fs);
    const m = c.manifest;
    const counts = {
      scenes: [...c.parsed.values()].reduce((n, r) => n + r.ast.scenes.length, 0),
      lines: collectLines(c.parsed).length,
      characters: c.characters.size,
      variables: m ? Object.keys(m.variables).length : 0,
      assets: input.assets?.length ?? 0,
      scripts: input.scripts.length,
    };
    const ds = diagnosticsJson(c);
    const problems = { errors: ds.filter((d) => d.severity === "error").length, warnings: ds.filter((d) => d.severity === "warning").length };
    const data = {
      name: m?.name ?? "", id: m?.id ?? "", entry: m?.entry ?? "", sourceLanguage: m?.sourceLanguage ?? "", languages: m?.languages ?? [],
      resolution: m?.resolution ?? [1920, 1080], counts, problems, core: CORE_VERSION, specs: SPEC_VERSIONS, runtime: ctx.runtime !== null,
    };
    const text = [
      `${data.name} (${data.id}), entry scene ${data.entry}, languages ${data.languages.join(", ")} (source ${data.sourceLanguage})`,
      `${counts.scenes} scenes in ${counts.scripts} files, ${counts.lines} lines, ${counts.characters} characters, ${counts.variables} variables, ${counts.assets} assets`,
      `${problems.errors} errors, ${problems.warnings} warnings${ctx.runtime ? "" : "; playtest and render_line are unavailable (no himawari.exe found)"}`,
    ].join("\n");
    return { text, data };
  },
});

export const listScenes = defineTool({
  name: "list_scenes",
  title: "List scenes",
  description: "Every scene with its file, line count, revision, and whether it is reachable from the entry scene or can end the story.",
  kind: "read",
  input: z.object({}),
  output: z.object({ scenes: z.array(z.looseObject({ scene: z.string(), file: z.string(), revision: z.string() })) }),
  async run(ctx) {
    const { check: c } = check(ctx.fs);
    const g = storyGraph(c);
    const scenes = g.nodes.map((n) => {
      const loc = findScene(c, n.scene);
      return { scene: n.scene, file: n.file, lines: n.lines, revision: loc ? revisionOf(loc.text) : "", reachable: n.reachable, ending: n.ending, entry: n.entry };
    });
    const text = scenes
      .map((s) => `${s.scene}  ${s.file}  ${s.lines} lines${s.entry ? "  (entry)" : ""}${s.ending ? "  (can end)" : ""}${s.reachable ? "" : "  (unreachable)"}`)
      .join("\n");
    return { text, data: { scenes } };
  },
});

export const readScene = defineTool({
  name: "read_scene",
  title: "Read a scene",
  description:
    "A scene's .hws source with its #line: IDs (use them to anchor patch_scene edits), and its revision (pass it back as base_revision when writing). format: ast returns the parsed AST instead (spec/ast.schema.json).",
  kind: "read",
  input: z.object({ scene: SceneName, format: z.enum(["hws", "ast"]).default("hws") }),
  output: z.looseObject({ scene: z.string(), file: z.string(), revision: z.string() }),
  async run(ctx, args) {
    const { check: c } = check(ctx.fs);
    const loc = findScene(c, args.scene);
    if (!loc) throw new ToolError(`there is no scene "${args.scene}" (list_scenes shows them all)`);
    const revision = revisionOf(loc.text);
    if (args.format === "ast") {
      return { text: JSON.stringify(loc.scene), data: { scene: args.scene, file: loc.file, revision, ast: loc.scene } };
    }
    return { text: `# ${loc.file}, revision ${revision}\n${loc.text}`, data: { scene: args.scene, file: loc.file, revision, hws: loc.text } };
  },
});

export const searchDialogue = defineTool({
  name: "search_dialogue",
  title: "Search dialogue",
  description:
    "Find dialogue, narration, menu options, and prompts by text, speaker, or scene. With lang, also returns each line's translation and its status from locales/<lang>.json.",
  kind: "read",
  input: z.object({
    query: z.string().optional().describe("Case-insensitive text to look for"),
    speaker: z.string().optional().describe("A character id, or \"\" for narration"),
    scene: z.string().optional(),
    lang: z.string().optional().describe("A target language, e.g. ja"),
    limit: z.number().int().min(1).max(500).default(50),
  }),
  output: z.object({ total: z.number(), lines: z.array(z.looseObject({ id: z.string(), text: z.string() })) }),
  async run(ctx, args) {
    const { check: c } = check(ctx.fs);
    const table = args.lang ? c.locales.find((t) => t.language === args.lang) : undefined;
    const tr = new Map((table?.lines ?? []).map((e) => [e.id, e]));
    const q = args.query?.toLowerCase();
    const hits = collectLines(c.parsed).filter(
      (l) =>
        (q === undefined || l.text.toLowerCase().includes(q) || (tr.get(l.id)?.text.toLowerCase().includes(q) ?? false)) &&
        (args.speaker === undefined || l.speaker === args.speaker) &&
        (args.scene === undefined || l.scene === args.scene),
    );
    const lines = hits.slice(0, args.limit).map((l) => {
      const t = tr.get(l.id);
      return { id: l.id, scene: l.scene, file: l.file, speaker: l.speaker, kind: l.kind, text: l.text, ...(args.lang ? { translation: t?.text ?? "", status: t?.status ?? "missing" } : {}) };
    });
    const text = lines
      .map((l) => `#${l.id} [${l.scene}] ${l.speaker ? `${l.speaker}: ` : ""}"${l.text}"${"translation" in l ? `  →  "${l.translation}" (${l.status})` : ""}`)
      .join("\n");
    return { text: `${hits.length} match(es)${hits.length > lines.length ? `, showing ${lines.length}` : ""}\n${text}`, data: { total: hits.length, lines } };
  },
});

export const getStoryGraph = defineTool({
  name: "get_story_graph",
  title: "Story graph",
  description:
    "Scenes and the jumps and calls between them, each labeled with the menu choice and conditions that lead there; unreachable scenes and endings are marked. format: mermaid returns a flowchart.",
  kind: "read",
  input: z.object({ format: z.enum(["json", "mermaid"]).default("json") }),
  output: z.looseObject({ entry: z.string().nullable() }),
  async run(ctx, args) {
    const { check: c } = check(ctx.fs);
    const g = storyGraph(c);
    if (args.format === "mermaid") {
      const mermaid = graphToMermaid(g);
      return { text: mermaid, data: { entry: g.entry, mermaid } };
    }
    const text = g.edges
      .map((e) => `${e.from} ${e.kind === "call" ? "calls" : "→"} ${e.to}${e.choice ? ` via "${e.choice}"` : ""}${e.when ? ` if ${e.when}` : ""}`)
      .join("\n");
    return { text, data: { entry: g.entry, nodes: g.nodes, edges: g.edges } };
  },
});

function frontmatter(text: string): { yaml: string; bible: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  return m ? { yaml: m[1] ?? "", bible: (m[2] ?? "").trim() } : { yaml: "", bible: text.trim() };
}

export const listCharacters = defineTool({
  name: "list_characters",
  title: "List characters",
  description: "Every character: id, display names per language, color, expression presets, and the sprite attributes per layer group.",
  kind: "read",
  input: z.object({}),
  output: z.object({ characters: z.array(z.looseObject({ id: z.string(), name: z.string() })) }),
  async run(ctx) {
    const { check: c } = check(ctx.fs);
    const characters = [...c.characters.values()]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((ch) => ({
        id: ch.id, name: ch.displayName, names: ch.names, color: ch.color, file: ch.file, hasSprite: ch.hasSprite,
        presets: [...ch.presets].sort(), groups: Object.fromEntries([...ch.groups].map(([g, attrs]) => [g, [...attrs].sort()])),
      }));
    const text = characters
      .map((ch) => `${ch.id} "${ch.name}"${ch.presets.length ? `  presets: ${ch.presets.join(" ")}` : ""}${ch.hasSprite ? "" : "  (no sprite: placeholder)"}`)
      .join("\n");
    return { text, data: { characters } };
  },
});

export const getCharacter = defineTool({
  name: "get_character",
  title: "Get a character",
  description:
    "A character's file: frontmatter (names, color, sprite groups, presets, rules) and the prose bible (personality, speech style, and the \"Must never\" rules you must respect), plus the words valid after their name in a script.",
  kind: "read",
  input: z.object({ id: z.string() }),
  output: z.looseObject({ id: z.string(), bible: z.string() }),
  async run(ctx, args) {
    const { check: c } = check(ctx.fs);
    const ch = c.characters.get(args.id);
    if (!ch) throw new ToolError(`there is no character "${args.id}" (list_characters shows them all)`);
    const { yaml, bible } = frontmatter(ctx.fs.read(ch.file));
    const lines = collectLines(c.parsed).filter((l) => l.speaker === ch.id).length;
    const groups = Object.fromEntries([...ch.groups].map(([g, attrs]) => [g, [...attrs].sort()]));
    const data = { id: ch.id, file: ch.file, name: ch.displayName, names: ch.names, color: ch.color, presets: [...ch.presets].sort(), groups, frontmatter: yaml, bible, lines };
    const text = `# ${ch.file} (${lines} lines of dialogue)\n---\n${yaml}\n---\n${bible}\n\nWords after "${ch.id}": presets ${data.presets.join(" ") || "(none)"}; attributes ${Object.entries(groups).map(([g, a]) => `${g}: ${a.join(" ")}`).join("; ") || "(none)"}`;
    return { text, data };
  },
});

export const listVariables = defineTool({
  name: "list_variables",
  title: "List variables",
  description: "Variables declared in himawari.json with type, default, scope, and how many places read and write each one; unused ones are flagged.",
  kind: "read",
  input: z.object({}),
  output: z.object({ variables: z.array(z.looseObject({ name: z.string(), type: z.string() })) }),
  async run(ctx) {
    const { check: c } = check(ctx.fs);
    const reads = new Map<string, number>();
    const writes = new Map<string, number>();
    for (const r of c.parsed.values()) {
      for (const ref of r.refs) {
        if (ref.kind !== "variable") continue;
        const m = ref.assign ? writes : reads;
        m.set(ref.name, (m.get(ref.name) ?? 0) + 1);
      }
    }
    const variables = Object.entries(c.manifest?.variables ?? {}).map(([name, v]) => ({
      name, type: v.type, default: v.default, scope: v.scope, ...(v.enum ? { enum: v.enum } : {}),
      reads: reads.get(name) ?? 0, writes: writes.get(name) ?? 0, unused: !reads.get(name) && !writes.get(name),
    }));
    const text = variables
      .map((v) => `${v.name}: ${v.type}${"enum" in v ? ` (${(v.enum as string[]).join(" | ")})` : ""} = ${JSON.stringify(v.default)}, ${v.scope}; read ${v.reads}×, written ${v.writes}×${v.unused ? "  UNUSED" : ""}`)
      .join("\n");
    return { text, data: { variables } };
  },
});

export const listAssets = defineTool({
  name: "list_assets",
  title: "List assets",
  description:
    "Files under assets/ by folder, assets the scripts use but that don't exist yet (they show as placeholders, which is fine while writing), and files nothing uses. Never invent an asset name that isn't here unless you mean a placeholder.",
  kind: "read",
  input: z.object({}),
  output: z.looseObject({ missing: z.array(z.looseObject({ name: z.string() })), unused: z.array(z.string()) }),
  async run(ctx) {
    const { input, check: c } = check(ctx.fs);
    const folders: Record<string, string[]> = {};
    for (const a of input.assets ?? []) {
      const [folder = "", ...rest] = a.split("/");
      (folders[folder] ??= []).push(rest.join("/"));
    }
    const missing = diagnosticsJson(c)
      .filter((d) => d.code === "HW0213")
      .map((d) => ({ name: /"([^"]+)"/.exec(d.message)?.[1] ?? "", file: d.file, line: d.line, message: d.message }));
    const used = new Set<string>();
    const FOLDER: Record<string, string> = { bg: "bg", cg: "cg", music: "music", sfx: "sfx", ambient: "ambient", voice: "voice", rule: "rules" };
    for (const r of c.parsed.values()) for (const ref of r.refs) if (ref.kind === "asset") used.add(`${FOLDER[ref.channel ?? ""] ?? ref.channel}/${ref.name}`);
    const roots = [...c.characters.values()].map((ch) => `${ch.spriteRoot}/`);
    const unused = (input.assets ?? []).filter((a) => {
      const base = a.replace(/\.[^./]+$/, "");
      return !used.has(base) && !roots.some((r) => a.startsWith(r)) && !a.startsWith("fonts/") && !a.startsWith("voice/") && base !== "bg/title";
    });
    const text = [
      ...Object.entries(folders).map(([f, names]) => `${f}/: ${names.join(", ")}`),
      missing.length ? `Not drawn yet (placeholders): ${missing.map((m) => `${m.name} (${m.file}:${m.line})`).join(", ")}` : "",
      unused.length ? `Unused: ${unused.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    return { text: text || "No assets yet. Everything shows as placeholders.", data: { folders, missing, unused } };
  },
});

export const validate = defineTool({
  name: "validate",
  title: "Validate",
  description:
    "Check the whole project (scripts, himawari.json, characters, string tables): diagnostics with codes, positions, and fix suggestions. Errors block building; warnings and notes don't.",
  kind: "read",
  input: z.object({ files: z.array(z.string()).optional().describe("Only report these project-relative files (the check always covers everything)") }),
  output: z.looseObject({ errors: z.number(), warnings: z.number(), diagnostics: z.array(z.looseObject({ code: z.string() })) }),
  async run(ctx, args) {
    const { check: c } = check(ctx.fs);
    const ds = diagnosticsJson(c, args.files ? new Set(args.files) : undefined);
    const errors = ds.filter((d) => d.severity === "error").length;
    const warnings = ds.filter((d) => d.severity === "warning").length;
    const text = ds.length ? `${errors} error(s), ${warnings} warning(s), ${ds.length - errors - warnings} note(s)\n${describeDiagnostics(ds, 50)}` : "No problems.";
    return { text, data: { errors, warnings, notes: ds.length - errors - warnings, diagnostics: ds } };
  },
});

export const analyze = defineTool({
  name: "analyze",
  title: "Analyze the story",
  description: "Static analysis: reachable and unreachable scenes, scenes that can end the story, choices, and dialogue lines per character. For dynamic coverage (every path actually played), use playtest.",
  kind: "read",
  input: z.object({}),
  output: z.looseObject({ unreachable: z.array(z.string()), endings: z.array(z.string()) }),
  async run(ctx) {
    const { check: c } = check(ctx.fs);
    const g = storyGraph(c);
    const lines = collectLines(c.parsed);
    const perCharacter: Record<string, number> = {};
    for (const l of lines) if (l.kind === "say") perCharacter[l.speaker] = (perCharacter[l.speaker] ?? 0) + 1;
    const data = {
      scenes: g.nodes.length,
      unreachable: g.nodes.filter((n) => !n.reachable).map((n) => n.scene),
      endings: g.nodes.filter((n) => n.ending).map((n) => n.scene),
      choices: lines.filter((l) => l.kind === "option").length,
      narration: lines.filter((l) => l.kind === "narration").length,
      linesPerCharacter: perCharacter,
      flowWarnings: diagnosticsJson(c).filter((d) => d.code.startsWith("HW03")),
    };
    const text = [
      `${data.scenes} scenes; can end in: ${data.endings.join(", ") || "(none)"}`,
      data.unreachable.length ? `Unreachable from the entry scene: ${data.unreachable.join(", ")}` : "Every scene is reachable.",
      `${data.choices} choices, ${data.narration} narration lines; dialogue: ${Object.entries(perCharacter).map(([k, v]) => `${k} ${v}`).join(", ") || "(none)"}`,
      data.flowWarnings.length ? `Flow problems:\n${describeDiagnostics(data.flowWarnings)}` : "",
    ].filter(Boolean).join("\n");
    return { text, data };
  },
});
