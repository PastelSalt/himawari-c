/**
 * Text styling without typing markup (FINALIZATION.md NC-8): the toolbar on a
 * line wraps the selected words in a tag, or inserts a pause or a value at the
 * cursor. Pure, on the text as the writer sees it (the Screenplay's display form).
 */

export interface Edited {
  text: string;
  /** Where the selection should be afterwards. */
  selStart: number;
  selEnd: number;
}

/** Wraps [start, end) in `{tag[=value]}…{/tag}`; with nothing selected, inserts an empty pair with the cursor inside. */
export function wrapSelection(text: string, start: number, end: number, tag: string, value?: string): Edited {
  const open = `{${tag}${value !== undefined ? `=${value}` : ""}}`;
  const close = `{/${tag}}`;
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  const inner = text.slice(a, b);
  return { text: text.slice(0, a) + open + inner + close + text.slice(b), selStart: a + open.length, selEnd: a + open.length + inner.length };
}

/** Inserts `piece` at the cursor (replacing a selection). */
export function insertAt(text: string, start: number, end: number, piece: string): Edited {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  return { text: text.slice(0, a) + piece + text.slice(b), selStart: a + piece.length, selEnd: a + piece.length };
}

/** True when the text has any markup (so a styled preview helps). */
export const hasMarkup = (text: string) => /[{[]/.test(text);
