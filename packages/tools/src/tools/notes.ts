/**
 * Review notes (rfcs/0011): the AI's continuity pass and the writer's to-dos,
 * anchored on line IDs, scenes, or files. Notes never change the game, so they
 * are written directly (no proposal); Studio shows them in its Notes panel.
 */
import { NOTES_FILE, NOTE_KINDS, type Note, collectLines, newNoteId, noteAnchor, readNotes, stringifyNotes } from "@himawari/core";
import { z } from "zod";
import { check } from "../project.js";
import { ToolError, defineTool } from "../registry.js";

const LineId = z.string().regex(/^[0-9a-hjkmnp-tv-z]{6}$/);

const read = (fs: { exists(f: string): boolean; read(f: string): string }) => (fs.exists(NOTES_FILE) ? readNotes(fs.read(NOTES_FILE)) : []);

export const addNote = defineTool({
  name: "add_note",
  title: "Leave a review note",
  description:
    "Leave a note for the writer on a line (by line ID), a scene, or a file, instead of editing: continuity problems (a fact, name, or event that contradicts an earlier one), character voice (against the bible's personality, speech style, or 'Must never'), style, translation, or a to-do. Say what's wrong and where it conflicts, in one or two sentences. Notes never change the game; the writer resolves them in Studio's Notes panel.",
  kind: "write",
  input: z.object({
    line_id: LineId.optional(),
    scene: z.string().optional(),
    file: z.string().optional(),
    kind: z.enum(NOTE_KINDS),
    text: z.string().min(1).max(600),
  }),
  output: z.looseObject({ id: z.string() }),
  annotations: { idempotentHint: false },
  async run(ctx, args) {
    if (!args.line_id && !args.scene && !args.file) throw new ToolError("say where the note goes: line_id, scene, or file");
    const { check: c } = check(ctx.fs);
    if (args.line_id && !collectLines(c.parsed).some((l) => l.id === args.line_id)) throw new ToolError(`there is no line #${args.line_id} in the scripts`);
    if (args.scene && ![...c.parsed.values()].some((r) => r.ast.scenes.some((s) => s.id === args.scene))) throw new ToolError(`there's no scene called "${args.scene}"`);
    if (args.file && !ctx.fs.exists(args.file)) throw new ToolError(`there's no file ${args.file}`);
    const notes = read(ctx.fs);
    const note: Note = {
      id: newNoteId(notes.map((n) => n.id), ctx.random),
      ...(args.line_id ? { line: args.line_id } : {}),
      ...(args.scene && !args.line_id ? { scene: args.scene } : {}),
      ...(args.file && !args.line_id && !args.scene ? { file: args.file } : {}),
      kind: args.kind,
      text: args.text,
      author: "ai",
      created: new Date().toISOString(),
    };
    ctx.fs.write(NOTES_FILE, stringifyNotes([...notes, note]));
    return { text: `Noted on ${noteAnchor(note)} (${note.id}).`, data: { id: note.id } };
  },
});

export const listNotes = defineTool({
  name: "list_notes",
  title: "List review notes",
  description: "Review notes on the project (open ones unless resolved: true), newest last, with where each applies. Check them before a continuity pass so you don't repeat a note.",
  kind: "read",
  input: z.object({ resolved: z.boolean().default(false), kind: z.enum(NOTE_KINDS).optional(), scene: z.string().optional() }),
  output: z.looseObject({ notes: z.array(z.looseObject({ id: z.string() })) }),
  async run(ctx, args) {
    let notes = read(ctx.fs).filter((n) => !!n.resolved === args.resolved && (!args.kind || n.kind === args.kind));
    if (args.scene) {
      const { check: c } = check(ctx.fs);
      const inScene = new Set(collectLines(c.parsed).filter((l) => l.scene === args.scene).map((l) => l.id));
      notes = notes.filter((n) => n.scene === args.scene || (n.line !== undefined && inScene.has(n.line)));
    }
    const text = notes.length ? notes.map((n) => `${n.id}  ${n.kind}  ${noteAnchor(n)}  (${n.author}): ${n.text}`).join("\n") : "No notes.";
    return { text, data: { notes } };
  },
});

export const resolveNote = defineTool({
  name: "resolve_note",
  title: "Resolve a review note",
  description: "Mark a note as resolved (after the problem was fixed, or when it no longer applies).",
  kind: "write",
  input: z.object({ id: z.string() }),
  output: z.looseObject({ resolved: z.boolean() }),
  annotations: { idempotentHint: true },
  async run(ctx, args) {
    const notes = read(ctx.fs);
    const n = notes.find((x) => x.id === args.id);
    if (!n) throw new ToolError(`there's no note ${args.id} (list_notes shows them)`);
    n.resolved = true;
    ctx.fs.write(NOTES_FILE, stringifyNotes(notes));
    return { text: `Resolved ${n.id}.`, data: { resolved: true } };
  },
});
