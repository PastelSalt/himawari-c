/**
 * CodeMirror 6 support for .hws, built on Core's lexer (one parser; plan §9.1).
 *  - Highlighting by token kind.
 *  - Line IDs (`#line:xxxxxx`) are hidden and atomic (P7): the cursor skips
 *    them, Enter at the end of a line never splits a line from its ID, and
 *    copy/paste never carries an ID (a pasted copy gets a fresh one).
 *  - A ▶ gutter on every playable line (P4) and the preview's current line
 *    highlighted: green while playing, yellow while waiting for a click (P3).
 */
import { KEYWORDS, lex } from "@himawari/core";
import { EditorState, type Extension, RangeSetBuilder, StateEffect, StateField, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, GutterMarker, ViewPlugin, type ViewUpdate, gutter } from "@codemirror/view";

const LINE_TAG = /\s*#line:[0-9a-hjkmnp-tv-z]{6}/g;

interface Scan {
  marks: DecorationSet;
  hidden: DecorationSet;
  /** Lines (1-based) that carry a line ID, with the ID. */
  ids: Map<number, string>;
}

const hiddenTag = Decoration.replace({});

function classify(kind: string, text: string, nextKind: string | undefined, lineStart: boolean): string | null {
  switch (kind) {
    case "Comment":
      return "hw-comment";
    case "String":
      return "hw-string";
    case "Number":
      return "hw-number";
    case "Identifier":
      if (KEYWORDS.has(text)) return "hw-keyword";
      if (lineStart && (nextKind === "String" || nextKind === "Identifier" || nextKind === "Minus")) return "hw-speaker";
      return "hw-name";
    case "Dollar":
      return "hw-keyword";
    case "Colon":
    case "Comma":
    case "LParen":
    case "RParen":
      return "hw-punct";
    default:
      return kind.endsWith("Eq") || ["Plus", "Minus", "Star", "Slash", "Percent", "Lt", "Le", "Gt", "Ge"].includes(kind) ? "hw-operator" : null;
  }
}

function scan(state: EditorState): Scan {
  const text = state.doc.toString();
  const tokens = lex(text).tokens;
  const marks = new RangeSetBuilder<Decoration>();
  const hidden = new RangeSetBuilder<Decoration>();
  const ids = new Map<number, string>();
  const significant = tokens.filter((t) => !["Whitespace", "Indent", "Newline", "Bom"].includes(t.kind));
  let lineOfPrev = -1;
  significant.forEach((t, i) => {
    if (t.kind === "LineTag") return;
    const line = state.doc.lineAt(t.start).number;
    const lineStart = line !== lineOfPrev;
    lineOfPrev = line;
    const next = significant[i + 1];
    const cls = classify(t.kind, t.text, next && state.doc.lineAt(next.start).number === line ? next.kind : undefined, lineStart);
    if (cls && t.text.length > 0) marks.add(t.start, t.start + t.text.length, Decoration.mark({ class: cls }));
  });
  // Hide each line tag together with the spaces before it.
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    LINE_TAG.lastIndex = 0;
    const m = LINE_TAG.exec(line.text);
    if (m) {
      hidden.add(line.from + m.index, line.from + m.index + m[0].length, hiddenTag);
      ids.set(n, m[0].trim().slice(6));
    }
  }
  return { marks: marks.finish(), hidden: hidden.finish(), ids };
}

const scanField = StateField.define<Scan>({
  create: scan,
  update: (value, tr) => (tr.docChanged ? scan(tr.state) : value),
  provide: (f) => [EditorView.decorations.from(f, (s) => s.marks), EditorView.decorations.from(f, (s) => s.hidden)],
});

const atomicTags = EditorView.atomicRanges.of((view) => view.state.field(scanField).hidden);

/** The position after a line's hidden tag, when `pos` sits in front of (or inside) it. */
function afterTag(state: EditorState, pos: number): number | null {
  const line = state.doc.lineAt(pos);
  const ids = state.field(scanField).hidden;
  let result: number | null = null;
  ids.between(line.from, line.to, (from, to) => {
    if (pos >= from && pos <= to && to === line.to) result = line.to;
  });
  return result;
}

/** Enter in front of a hidden line tag goes to the end of the line, so the ID stays with its line. */
const keepTagsOnTheirLines = EditorState.transactionFilter.of((tr: Transaction) => {
  if (!tr.docChanged || !tr.isUserEvent("input")) return tr;
  let single: { from: number; to: number; insert: string } | null = null;
  let count = 0;
  tr.changes.iterChanges((from, to, _f, _t, inserted) => {
    count++;
    single = { from, to, insert: inserted.toString() };
  });
  const c = single as { from: number; to: number; insert: string } | null;
  if (count !== 1 || !c || c.from !== c.to || !c.insert.startsWith("\n")) return tr;
  const end = afterTag(tr.startState, c.from);
  if (end === null || end === c.from) return tr;
  return { changes: { from: end, insert: c.insert }, selection: { anchor: end + c.insert.length }, userEvent: "input", scrollIntoView: true };
});

const stripTags = (text: string) => text.replace(LINE_TAG, "");
const clipboard = [EditorView.clipboardOutputFilter.of(stripTags), EditorView.clipboardInputFilter.of(stripTags)];

/** The preview's current line: { id, waiting } or null. */
export const setPlayingLine = StateEffect.define<{ id: string; waiting: boolean } | null>();

const playingField = StateField.define<{ id: string; waiting: boolean } | null>({
  create: () => null,
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setPlayingLine)) return e.value;
    return v;
  },
});

const playingDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.startState.field(playingField) !== u.state.field(playingField)) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const playing = view.state.field(playingField);
      if (!playing) return Decoration.none;
      for (const [n, id] of view.state.field(scanField).ids) {
        if (id === playing.id) {
          const line = view.state.doc.line(n);
          return Decoration.set([Decoration.line({ class: playing.waiting ? "hw-line-waiting" : "hw-line-playing" }).range(line.from)]);
        }
      }
      return Decoration.none;
    }
  },
  { decorations: (v) => v.decorations },
);

class PlayMarker extends GutterMarker {
  constructor(readonly id: string) {
    super();
  }
  override eq(other: GutterMarker) {
    return other instanceof PlayMarker && other.id === this.id;
  }
  override toDOM() {
    const el = document.createElement("span");
    el.className = "hw-play";
    el.textContent = "▶";
    return el;
  }
}

/** ▶ on lines with an ID; clicking plays from that line (with a state reconstructed along a real path). */
function playGutter(onPlay: (lineId: string) => void): Extension {
  return gutter({
    class: "hw-play-gutter",
    lineMarker(view, line) {
      const n = view.state.doc.lineAt(line.from).number;
      const id = view.state.field(scanField).ids.get(n);
      return id ? new PlayMarker(id) : null;
    },
    lineMarkerChange: (u) => u.docChanged,
    domEventHandlers: {
      mousedown(view, line) {
        const id = view.state.field(scanField).ids.get(view.state.doc.lineAt(line.from).number);
        if (!id) return false;
        onPlay(id);
        return true;
      },
    },
    renderEmptyElements: false,
    initialSpacer: () => new PlayMarker("spacer"),
  });
}

/** The line ID on the cursor's line, if any. */
export function lineIdAtCursor(state: EditorState): string | null {
  const n = state.doc.lineAt(state.selection.main.head).number;
  return state.field(scanField).ids.get(n) ?? null;
}

export function hws(options: { onPlay: (lineId: string) => void }): Extension {
  return [scanField, atomicTags, keepTagsOnTheirLines, clipboard, playingField, playingDecorations, playGutter(options.onPlay)];
}
