/**
 * Review notes (rfcs/0011): remarks anchored on a line ID, a scene, or a file,
 * kept in `.himawari/notes.json` and committed with the project. The AI's
 * continuity pass leaves notes instead of editing; writers leave themselves
 * to-dos. Notes never change the game.
 */

export const NOTES_FILE = ".himawari/notes.json";
export const NOTE_KINDS = ["continuity", "character", "style", "translation", "todo"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  id: string;
  /** Where it applies: a line ID, else a scene, else a file. */
  line?: string;
  scene?: string;
  file?: string;
  kind: NoteKind;
  text: string;
  author: "ai" | "human";
  /** ISO time. */
  created: string;
  resolved?: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Notes from the file's text; anything malformed is skipped (a hand-edited file never breaks the project). */
export function readNotes(text: string | undefined | null): Note[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const list = isObject(raw) && Array.isArray(raw["notes"]) ? raw["notes"] : [];
  const out: Note[] = [];
  for (const n of list) {
    if (!isObject(n) || typeof n["id"] !== "string" || typeof n["text"] !== "string") continue;
    const kind = NOTE_KINDS.includes(n["kind"] as NoteKind) ? (n["kind"] as NoteKind) : "todo";
    out.push({
      id: n["id"],
      ...(typeof n["line"] === "string" ? { line: n["line"] } : {}),
      ...(typeof n["scene"] === "string" ? { scene: n["scene"] } : {}),
      ...(typeof n["file"] === "string" ? { file: n["file"] } : {}),
      kind,
      text: n["text"],
      author: n["author"] === "ai" ? "ai" : "human",
      created: typeof n["created"] === "string" ? n["created"] : "",
      ...(n["resolved"] === true ? { resolved: true } : {}),
    });
  }
  return out;
}

export function stringifyNotes(notes: readonly Note[]): string {
  return `${JSON.stringify({ notes }, null, 2)}\n`;
}

/** A new note ID: "n" and 7 base-36 characters, not already in `taken`. */
export function newNoteId(taken: Iterable<string>, random: () => number = Math.random): string {
  const used = new Set(taken);
  for (;;) {
    const id = `n${Math.floor(random() * 36 ** 7).toString(36).padStart(7, "0")}`;
    if (!used.has(id)) return id;
  }
}

/** Where a note points, for lists: "#k3f9a1", "scene ch1", or a file path. */
export function noteAnchor(n: Note): string {
  return n.line ? `#${n.line}` : n.scene ? `scene ${n.scene}` : (n.file ?? "the project");
}
