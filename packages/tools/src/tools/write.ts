/**
 * Write tools (plan §10.3). Every write is validated before it touches disk
 * (rule 3): a change that adds errors is refused and nothing is written, with
 * the diagnostics returned so the model can fix them in one round. `dry_run`
 * returns the result without writing. Scene edits check `base_revision`
 * (rule 4) and are anchored on line IDs, never line numbers (rule 2). Every
 * AI-written text is stamped in .himawari/provenance.json (rule 7).
 */
import {
  type EditOp,
  type ProjectInput,
  applyEdits,
  applyTranslations,
  collectLines,
  format,
  lex,
  parseAst,
  RenameError,
  parseTable,
  planRename,
  splitFrontmatter,
  stringifyTable,
  syncTable,
} from "@himawari/core";
import { parseDocument } from "yaml";
import { z } from "zod";
import {
  type Changes,
  type DiagnosticJson,
  check,
  checkInput,
  describeDiagnostics,
  diagnosticsJson,
  findScene,
  lineIdsOf,
  revisionOf,
  withChanges,
} from "../project.js";
import { stampAi } from "../provenance.js";
import { type ToolContext, ToolError, type ToolOk, defineTool } from "../registry.js";

const Ident = z.string().regex(/^[a-z_][a-z0-9_]*$/, "lowercase letters, digits, and _, starting with a letter or _");
const DryRun = z.boolean().default(false).describe("Validate and return the result without writing anything");
const Rationale = z
  .string()
  .max(300)
  .optional()
  .describe("One sentence for the developer: what this change does and why. Shown with the change when they review it in Studio");
const BaseRevision = z.string().optional().describe("The revision read_scene returned; the write is refused if the scene changed since");

interface CommitResult {
  ok: ToolOk;
  input: ProjectInput;
}

/** An error's identity across two checks: positions shift when text changes, messages don't. */
const errorKey = (d: DiagnosticJson) => `${d.code} ${d.file} ${d.message}`;

/**
 * Validates `changes` against the whole project and writes them unless they
 * add errors (or this is a dry run). Errors the project already had don't
 * block a write; only new ones do (and a write that fixes errors is welcome).
 */
async function commit(ctx: ToolContext, input: ProjectInput, changes: Changes, dryRun: boolean, summary: string): Promise<CommitResult> {
  const before = new Map<string, number>();
  for (const d of diagnosticsJson(checkInput(input))) {
    if (d.severity === "error") before.set(errorKey(d), (before.get(errorKey(d)) ?? 0) + 1);
  }
  const next = withChanges(input, changes);
  const all = diagnosticsJson(checkInput(next));
  const touched = new Set([...changes.keys()]);
  const added: DiagnosticJson[] = [];
  for (const d of all) {
    if (d.severity !== "error") continue;
    const left = before.get(errorKey(d)) ?? 0;
    if (left > 0) before.set(errorKey(d), left - 1);
    else added.push(d);
  }
  // Table-wide progress notes (lines left to translate, lines to review) aren't about this change.
  const progress = new Set(["HW0402", "HW0404"]);
  const here: DiagnosticJson[] = all.filter((d) => touched.has(d.file) && d.severity !== "error" && !progress.has(d.code)).concat(added);
  const rejected = added.length > 0;
  const files = [...changes.keys()];
  const data: Record<string, unknown> = { applied: !rejected && !dryRun, dryRun, files, diagnostics: here };
  if (rejected) {
    return {
      ok: { text: `Not written: the change would add errors. Fix these and try again:\n${describeDiagnostics(added)}`, data, isError: true },
      input,
    };
  }
  const notes = here.length ? `\n${describeDiagnostics(here)}` : "";
  if (!dryRun && ctx.propose) {
    // Studio is open and owns writes: a person accepts or rejects the change (plan §11.4).
    const outcome = await ctx.propose({ tool: ctx.tool ?? "write", summary: ctx.rationale?.trim() || summary, changes, diagnostics: here.map((d) => ({ file: d.file, code: d.code, severity: d.severity, message: d.message, line: d.line })) });
    if (outcome.status === "accepted") {
      return { ok: { text: `Accepted in Studio: ${summary}${notes}`, data: { ...data, applied: true, proposal: "accepted" } }, input: next };
    }
    const unapplied = { ...data, applied: false, proposal: outcome.status };
    if (outcome.status === "rejected") {
      const why = outcome.reason ? ` Their reason: ${outcome.reason}` : " They gave no reason.";
      return { ok: { text: `The user rejected this change in Studio.${why} Nothing was written.`, data: { ...unapplied, reason: outcome.reason } }, input };
    }
    if (outcome.status === "pending") {
      return {
        ok: {
          text: `Proposed in Studio as ${outcome.id}; the user hasn't decided yet, so nothing is written. Don't send it again. Carry on with other work, and read the scene later to see whether it landed.`,
          data: { ...unapplied, proposalId: outcome.id },
        },
        input,
      };
    }
    return { ok: { text: "The proposal was withdrawn (the project was closed in Studio). Nothing was written.", data: unapplied }, input };
  }
  if (!dryRun) {
    for (const [file, text] of changes) {
      if (text === null) ctx.fs.remove(file);
      else ctx.fs.write(file, text);
    }
  }
  return { ok: { text: `${dryRun ? "Dry run (nothing written): " : ""}${summary}${notes}`, data }, input: next };
}

/** Line texts by ID after a change, for provenance stamps. */
function lineTexts(input: ProjectInput, ids: Iterable<string>): Map<string, string> {
  const wanted = new Set(ids);
  const c = checkInput(input);
  const out = new Map<string, string>();
  for (const l of collectLines(c.parsed)) if (wanted.has(l.id)) out.set(l.id, l.text);
  return out;
}

function idsIn(text: string): Set<string> {
  const ids = new Set<string>();
  for (const t of lex(text).tokens) if (t.kind === "LineTag") ids.add(t.text.trim().slice(6));
  return ids;
}

const ensureNewline = (s: string) => (s.endsWith("\n") ? s : `${s}\n`);

export const createScene = defineTool({
  name: "create_scene",
  title: "Create scenes",
  description:
    "Add new scenes from .hws text: one `scene name:` block, or several that jump to each other (a branching chapter must be created together). Line IDs are assigned for you; don't write #line: tags. By default they go into script/<first scene>.hws; give file to append to an existing script. Validated before writing; use dry_run first for anything long.",
  kind: "write",
  input: z.object({ rationale: Rationale,
    hws: z.string().min(1).describe("The scene's .hws source, starting with `scene name:`"),
    file: z.string().regex(/^script\/[^\\]+\.hws$/).optional().describe("A script file under script/, e.g. script/ch2.hws"),
    dry_run: DryRun,
  }),
  output: z.looseObject({ applied: z.boolean(), scene: z.string().optional() }),
  annotations: { destructiveHint: false },
  async run(ctx, args) {
    const { input, check: c } = check(ctx.fs);
    const parsed = parseAst(args.hws);
    const names = parsed.ast.scenes.map((s) => s.id);
    if (names.length === 0) throw new ToolError("the text has no `scene name:` block");
    const name = names[0] as string;
    const taken = names.filter((n) => findScene(c, n));
    if (taken.length) throw new ToolError(`scene(s) ${taken.join(", ")} already exist; use update_scene or patch_scene to change them`);
    const formatted = format(args.hws, { takenIds: lineIdsOf(input), ...(ctx.random ? { random: ctx.random } : {}) });
    if (formatted.refused) {
      const ds = formatted.refused.map((d) => ({ code: d.code, severity: d.severity, message: d.message }));
      return { text: `Not written: the text has syntax errors:\n${ds.map((d) => `${d.code}: ${d.message}`).join("\n")}`, data: { applied: false, diagnostics: ds }, isError: true };
    }
    const file = args.file ?? `script/${name}.hws`;
    const existing = ctx.fs.exists(file) ? ctx.fs.read(file) : null;
    const text = existing === null ? formatted.text : `${ensureNewline(existing)}\n${formatted.text}`;
    const what = names.length > 1 ? `scenes ${names.join(", ")}` : `scene ${name}`;
    const r = await commit(ctx, input, new Map([[file, text]]), args.dry_run, `Created ${what} in ${file} with ${formatted.added.length} new line(s).`);
    if (r.ok.data["applied"]) stampAi(ctx.fs, "lines", lineTexts(r.input, formatted.added));
    r.ok.data["scene"] = name;
    r.ok.data["scenes"] = names;
    r.ok.data["lineIds"] = formatted.added;
    if (!r.ok.isError) r.ok.text += `\n${formatted.text}`;
    return r.ok;
  },
});

export const updateScene = defineTool({
  name: "update_scene",
  title: "Replace a scene",
  description:
    "Replace a whole scene with new .hws text (for drafts and small scenes; for targeted changes prefer patch_scene). Keep the #line: tags of lines you keep, so translations, voice, and saves stay attached; new lines get IDs automatically.",
  kind: "write",
  input: z.object({ rationale: Rationale, scene: Ident, hws: z.string().min(1), base_revision: BaseRevision, dry_run: DryRun }),
  output: z.looseObject({ applied: z.boolean(), revision: z.string().optional() }),
  annotations: { destructiveHint: true },
  async run(ctx, args) {
    const { input, check: c } = check(ctx.fs);
    const loc = findScene(c, args.scene);
    if (!loc) throw new ToolError(`there is no scene "${args.scene}"`);
    if (args.base_revision && args.base_revision !== revisionOf(loc.text)) {
      throw new ToolError(`scene ${args.scene} changed since revision ${args.base_revision} (now ${revisionOf(loc.text)}); read it again before writing`);
    }
    const names = parseAst(args.hws).ast.scenes.map((s) => s.id);
    if (names.length !== 1 || names[0] !== args.scene) throw new ToolError(`the text must be exactly one scene named ${args.scene} (found: ${names.join(", ") || "none"})`);
    // IDs this scene had may be reused; IDs used elsewhere must not be.
    const own = idsIn(loc.text);
    const taken = new Set([...lineIdsOf(input)].filter((id) => !own.has(id)));
    const formatted = format(args.hws, { takenIds: taken, ...(ctx.random ? { random: ctx.random } : {}) });
    if (formatted.refused) {
      return { text: `Not written: syntax errors:\n${formatted.refused.map((d) => `${d.code}: ${d.message}`).join("\n")}`, data: { applied: false }, isError: true };
    }
    const source = ctx.fs.read(loc.file);
    const text = source.slice(0, loc.start) + ensureNewline(formatted.text) + (loc.end < source.length ? `\n${source.slice(loc.end).replace(/^\n+/, "")}` : "");
    const r = await commit(ctx, input, new Map([[loc.file, text]]), args.dry_run, `Replaced scene ${args.scene}.`);
    if (r.ok.data["applied"]) {
      const before = new Map(collectLines(c.parsed).filter((l) => own.has(l.id)).map((l) => [l.id, l.text]));
      const after = lineTexts(r.input, idsIn(formatted.text));
      const added = new Map([...after].filter(([id]) => !before.has(id)));
      const changed = new Map([...after].filter(([id, t]) => before.has(id) && before.get(id) !== t));
      stampAi(ctx.fs, "lines", added);
      stampAi(ctx.fs, "lines", changed, true);
    }
    const now = findScene(checkInput(r.input), args.scene);
    if (now) r.ok.data["revision"] = revisionOf(now.text);
    return r.ok;
  },
});

const EditOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("insert_after"), lineId: z.string(), hws: z.string().describe("Statements to insert, written at the indentation of the anchor line") }),
  z.object({ op: z.literal("insert_before"), lineId: z.string(), hws: z.string() }),
  z.object({ op: z.literal("append_to_scene"), scene: Ident, hws: z.string() }),
  z.object({ op: z.literal("replace_text"), lineId: z.string(), text: z.string().describe("The new text between the quotes (markup allowed, quotes escaped as \\\")") }),
  z.object({ op: z.literal("set_attrs"), lineId: z.string(), add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }),
  z.object({ op: z.literal("delete"), lineIds: z.array(z.string()).min(1) }),
  z.object({ op: z.literal("move"), lineIds: z.array(z.string()).min(1), afterLineId: z.string() }),
]);

export const patchScene = defineTool({
  name: "patch_scene",
  title: "Edit a scene by line ID",
  description:
    "Targeted edits anchored on #line: IDs from read_scene: insert_after/insert_before (new statements; to add a menu option, insert it after another option's ID), append_to_scene, replace_text (just the quoted text), set_attrs (a speaker's expression), delete, move. Applied together, or not at all. Never use line numbers.",
  kind: "write",
  input: z.object({ rationale: Rationale, scene: Ident, ops: z.array(EditOpSchema).min(1), base_revision: BaseRevision, dry_run: DryRun }),
  output: z.looseObject({ applied: z.boolean(), revision: z.string().optional() }),
  annotations: { destructiveHint: true },
  async run(ctx, args) {
    const { input, check: c } = check(ctx.fs);
    const loc = findScene(c, args.scene);
    if (!loc) throw new ToolError(`there is no scene "${args.scene}"`);
    if (args.base_revision && args.base_revision !== revisionOf(loc.text)) {
      throw new ToolError(`scene ${args.scene} changed since revision ${args.base_revision} (now ${revisionOf(loc.text)}); read it again before writing`);
    }
    const own = idsIn(loc.text);
    for (const op of args.ops) {
      const refs = "lineIds" in op ? [...op.lineIds, ...("afterLineId" in op ? [op.afterLineId] : [])] : "lineId" in op ? [op.lineId] : [];
      const foreign = refs.filter((id) => !own.has(id));
      if (foreign.length) throw new ToolError(`line ID(s) ${foreign.join(", ")} aren't in scene ${args.scene}`);
      if (op.op === "append_to_scene" && op.scene !== args.scene) throw new ToolError(`append_to_scene must name scene ${args.scene}`);
    }
    const source = ctx.fs.read(loc.file);
    const result = applyEdits(source, args.ops as EditOp[], { takenIds: lineIdsOf(input), ...(ctx.random ? { random: ctx.random } : {}) });
    if (!result.ok) {
      return { text: `Not applied: ${result.error ?? "the edits don't fit"}`, data: { applied: false, error: result.error }, isError: true };
    }
    const r = await commit(ctx, input, new Map([[loc.file, result.text]]), args.dry_run, `Applied ${args.ops.length} edit(s) to ${args.scene}${result.addedIds.length ? `; new line IDs ${result.addedIds.join(", ")}` : ""}.`);
    if (r.ok.data["applied"]) {
      stampAi(ctx.fs, "lines", lineTexts(r.input, result.addedIds));
      const replaced = args.ops.filter((o) => o.op === "replace_text").map((o) => (o as { lineId: string }).lineId);
      stampAi(ctx.fs, "lines", lineTexts(r.input, replaced), true);
    }
    const now = findScene(checkInput(r.input), args.scene);
    if (now) {
      r.ok.data["revision"] = revisionOf(now.text);
      if (!r.ok.isError) r.ok.text += `\n${now.text}`;
    }
    r.ok.data["lineIds"] = result.addedIds;
    return r.ok;
  },
});


export const upsertCharacter = defineTool({
  name: "upsert_character",
  title: "Create or update a character",
  description:
    "Create characters/<id>.md or change it: display name (a string, or names per language like {en: \"Hana\", ja: \"花\"}), color (#rrggbb), the sprite definition (groups, presets, rules), and the prose bible (personality, speech style, \"Must never\"). Fields you leave out are kept. A character without art shows as a placeholder.",
  kind: "write",
  input: z.object({ rationale: Rationale,
    id: Ident,
    name: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    sprite: z.record(z.string(), z.unknown()).optional().describe("The `sprite:` frontmatter object (spec/character.schema.json)"),
    bible: z.string().optional().describe("Markdown after the frontmatter"),
    dry_run: DryRun,
  }),
  output: z.looseObject({ applied: z.boolean() }),
  async run(ctx, args) {
    const { input } = check(ctx.fs);
    const file = `characters/${args.id}.md`;
    const exists = ctx.fs.exists(file);
    const { yaml, bible } = exists ? splitFrontmatter(ctx.fs.read(file)) : { yaml: `id: ${args.id}\n`, bible: "\n## Personality\n\n## Speech style\n\n## Must never\n" };
    const doc = parseDocument(yaml);
    doc.set("id", args.id);
    if (args.name !== undefined) doc.set("name", args.name);
    if (args.color !== undefined) doc.set("color", args.color);
    if (args.sprite !== undefined) doc.set("sprite", args.sprite);
    const body = args.bible !== undefined ? `\n${args.bible.trim()}\n` : bible.startsWith("\n") ? bible : `\n${bible}`;
    const text = `---\n${doc.toString().trimEnd()}\n---\n${body.replace(/^\n+/, "\n")}`;
    const r = await commit(ctx, input, new Map([[file, text]]), args.dry_run, `${exists ? "Updated" : "Created"} ${file}.`);
    if (r.ok.data["applied"] && args.bible !== undefined) stampAi(ctx.fs, "characters", new Map([[args.id, args.bible.trim()]]));
    return r.ok;
  },
});

export const setPreset = defineTool({
  name: "set_preset",
  title: "Set an expression preset",
  description: "Define or change a character's expression preset: which attribute each sprite group shows, e.g. {eyes: \"smile\", mouth: \"smile\"}. Writers then type `hana happy`.",
  kind: "write",
  input: z.object({ rationale: Rationale, character: Ident, preset: Ident, layers: z.record(z.string(), z.string()), dry_run: DryRun }),
  output: z.looseObject({ applied: z.boolean() }),
  annotations: { idempotentHint: true },
  async run(ctx, args) {
    const { input } = check(ctx.fs);
    const file = `characters/${args.character}.md`;
    if (!ctx.fs.exists(file)) throw new ToolError(`there is no character "${args.character}"`);
    const { yaml, bible } = splitFrontmatter(ctx.fs.read(file));
    const doc = parseDocument(yaml);
    doc.setIn(["sprite", "presets", args.preset], args.layers);
    const text = `---\n${doc.toString().trimEnd()}\n---\n${bible.startsWith("\n") ? bible.slice(1) : bible}`;
    return (await commit(ctx, input, new Map([[file, text]]), args.dry_run, `Set preset ${args.preset} on ${args.character}.`)).ok;
  },
});

export const declareVariable = defineTool({
  name: "declare_variable",
  title: "Declare a variable",
  description:
    "Add or change a variable in himawari.json. Types: int, bool, str (string enums: give enum). Scope: save (per playthrough) or global (shared across saves, e.g. endings seen).",
  kind: "write",
  input: z.object({ rationale: Rationale,
    name: Ident,
    type: z.enum(["int", "bool", "str"]),
    default: z.union([z.number().int(), z.boolean(), z.string()]),
    scope: z.enum(["save", "global"]).default("save"),
    enum: z.array(z.string()).optional(),
    dry_run: DryRun,
  }),
  output: z.looseObject({ applied: z.boolean() }),
  annotations: { idempotentHint: true },
  async run(ctx, args) {
    const { input } = check(ctx.fs);
    const manifest = JSON.parse(ctx.fs.read("himawari.json")) as { variables?: Record<string, unknown> };
    const decl: Record<string, unknown> = { type: args.type, default: args.default, scope: args.scope };
    if (args.enum) decl["enum"] = args.enum;
    manifest.variables = { ...(manifest.variables ?? {}), [args.name]: decl };
    return (await commit(ctx, input, new Map([["himawari.json", `${JSON.stringify(manifest, null, 2)}\n`]]), args.dry_run, `Declared ${args.name}: ${args.type} = ${JSON.stringify(args.default)} (${args.scope}).`)).ok;
  },
});

export const rename = defineTool({
  name: "rename",
  title: "Rename a scene, character, or variable",
  description:
    "Refactor-safe rename across every script, himawari.json, and the character file. When it touches more than three files, the user is asked to confirm first.",
  kind: "write",
  input: z.object({ rationale: Rationale, kind: z.enum(["scene", "character", "variable"]), from: Ident, to: Ident, dry_run: DryRun }),
  output: z.looseObject({ applied: z.boolean(), files: z.array(z.string()) }),
  annotations: { destructiveHint: true },
  async run(ctx, args) {
    const { input, check: c } = check(ctx.fs);
    let plan;
    try {
      plan = planRename(c, args.kind, args.from, args.to, (f) => ctx.fs.read(f));
    } catch (e) {
      if (e instanceof RenameError) throw new ToolError(e.message);
      throw e;
    }
    const { changes, count } = plan;
    const files = [...changes.keys()];
    if (files.length > 3 && !ctx.confirmed && !args.dry_run) {
      return { confirm: { message: `Rename ${args.kind} "${args.from}" to "${args.to}"? This changes ${count} place(s) in ${files.length} files: ${files.join(", ")}.` } };
    }
    const r = await commit(ctx, input, changes, args.dry_run, `Renamed ${args.kind} ${args.from} → ${args.to}: ${count} reference(s) in ${files.length} file(s).`);
    r.ok.data["files"] = files;
    return r.ok;
  },
});

export const setTranslation = defineTool({
  name: "set_translation",
  title: "Set a translation",
  description:
    "Write the translation of one line (by line ID) into locales/<lang>.json. Use the same markup as the source: keep every [variable], {tag}, and {select} (ruby may differ). Lands as needs-review for a human translator. Refused if placeholders don't match.",
  kind: "write",
  input: z.object({ rationale: Rationale, lang: z.string().min(2), id: z.string().regex(/^[0-9a-hjkmnp-tv-z]{6}$/), text: z.string() }),
  output: z.looseObject({ applied: z.boolean() }),
  annotations: { idempotentHint: true },
  async run(ctx, args) {
    const { input, check: c } = check(ctx.fs);
    const m = c.manifest;
    if (!m) throw new ToolError("himawari.json is missing or unreadable");
    if (!m.languages.includes(args.lang) || args.lang === m.sourceLanguage) {
      throw new ToolError(`"${args.lang}" isn't a target language of this game (languages: ${m.languages.join(", ")}; source ${m.sourceLanguage})`);
    }
    const file = `locales/${args.lang}.json`;
    const existing = ctx.fs.exists(file) ? parseTable(ctx.fs.read(file)) : null;
    const table = syncTable(existing, collectLines(c.parsed), args.lang, m.sourceLanguage).table;
    const res = applyTranslations(table, new Map([[args.id, args.text]]), "ai");
    if (res.unknown.length) throw new ToolError(`there is no line #${args.id} in the scripts`);
    if (res.refused.length) {
      const problems = res.refused.flatMap((x) => x.problems);
      return { text: `Not written: the translation ${problems.join("; ")}.`, data: { applied: false, problems }, isError: true };
    }
    const r = await commit(ctx, input, new Map([[file, stringifyTable(res.table)]]), false, `Translated #${args.id} into ${args.lang} (needs review).`);
    if (r.ok.data["applied"]) stampAi(ctx.fs, "translations", new Map([[`${args.lang}:${args.id}`, args.text]]));
    return r.ok;
  },
});
