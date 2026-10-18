import { autocompletion, closeBrackets, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { type Diagnostic as CmDiagnostic, lintGutter, lintKeymap, setDiagnostics } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { useIntl } from "react-intl";
import { studio } from "../api";
import { applyFix, useDiagnosticText } from "../diagnostics";
import { completions, hover } from "../editor/assist";
import { hws, lineIdAtCursor, setPlayingLine } from "../editor/hws";
import { diagnosticsOf } from "../model";
import { useStudio } from "../store";

/** Changes that came from the store (autosave IDs, undo, AI, other editors), not from typing here. */
const External = Annotation.define<boolean>();

export interface EditorActions {
  goToDefinition(pos: number): void;
  rename(pos: number): void;
}

export function playFrom(lineId: string): void {
  void studio.preview.command({ cmd: "warp", to: `#${lineId}` });
}

/** The Script view (plan §11.3): the file as text, with Core's diagnostics and Studio's assistance. */
export function ScriptEditor({ file, actions }: { file: string; actions: EditorActions }) {
  const intl = useIntl();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const diagText = useDiagnosticText();
  const model = useStudio((s) => s.model);
  const text = useStudio((s) => s.files[file]);
  const reveal = useStudio((s) => s.reveal);
  const preview = useStudio((s) => s.preview);
  const isHws = file.endsWith(".hws");
  const latest = useRef({ intl, actions });
  latest.current = { intl, actions };

  // Create the editor once per file.
  useEffect(() => {
    if (!host.current) return;
    const get = () => {
      const s = useStudio.getState();
      return { model: s.model, assets: s.assets, file, t: (id: string, values?: Record<string, string>) => latest.current.intl.formatMessage({ id }, values) };
    };
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      closeBrackets(),
      highlightSelectionMatches(),
      indentUnit.of("    "),
      EditorState.tabSize.of(4),
      lintGutter(),
      keymap.of([
        { key: "F12", run: (v) => (latest.current.actions.goToDefinition(v.state.selection.main.head), true) },
        { key: "F2", run: (v) => (latest.current.actions.rename(v.state.selection.main.head), true) },
        {
          key: "Mod-Enter",
          run: (v) => {
            const id = lineIdAtCursor(v.state);
            if (id) playFrom(id);
            return true;
          },
        },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.selectionSet) {
          // For "Ask AI about this selection" (plan §10.9).
          const r = u.state.selection.main;
          const text = r.empty ? "" : u.state.sliceDoc(r.from, r.to).replace(/\s*#line:[0-9a-hjkmnp-tv-z]{6}/g, "");
          useStudio.getState().setSelection(text.trim() ? { file, text } : null);
        }
        if (!u.docChanged || u.transactions.every((t) => t.annotation(External))) return;
        useStudio.getState().edit(file, u.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        mousedown(e, v) {
          if (!e.ctrlKey) return false;
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos === null) return false;
          e.preventDefault();
          latest.current.actions.goToDefinition(pos);
          return true;
        },
      }),
      ...(isHws ? [hws({ onPlay: playFrom }), autocompletion({ override: [completions(get)] }), hover(get)] : []),
    ];
    const v = new EditorView({
      state: EditorState.create({ doc: useStudio.getState().files[file] ?? "", extensions }),
      parent: host.current,
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [file, isHws]);

  // Text changed in the store (not by typing here): apply the smallest change, keep the cursor.
  useEffect(() => {
    const v = view.current;
    if (!v || text === undefined) return;
    const cur = v.state.doc.toString();
    if (cur === text) return;
    let start = 0;
    while (start < cur.length && start < text.length && cur[start] === text[start]) start++;
    let endA = cur.length;
    let endB = text.length;
    while (endA > start && endB > start && cur[endA - 1] === text[endB - 1]) {
      endA--;
      endB--;
    }
    v.dispatch({ changes: { from: start, to: endA, insert: text.slice(start, endB) }, annotations: [External.of(true)] });
  }, [text]);

  // Diagnostics, when the model matches what's in the editor.
  useEffect(() => {
    const v = view.current;
    if (!v || !model) return;
    const report = model.check.files.find((f) => f.file === file);
    if (!report || report.source !== v.state.doc.toString()) return;
    const len = v.state.doc.length;
    const diags: CmDiagnostic[] = diagnosticsOf(model, file).map((d) => {
      const t = diagText(d);
      const from = Math.min(d.span.start, len);
      const to = Math.min(Math.max(d.span.end, from), len);
      return {
        from,
        to,
        severity: d.severity,
        message: [t.message, t.help, t.note].filter(Boolean).join("\n"),
        source: d.code,
        actions: (d.fixes ?? []).map((f) => ({
          name: intl.formatMessage({ id: "diagnostic.applyFix" }),
          apply: (ev: EditorView) => {
            const next = applyFix(ev.state.doc.toString(), f.edits);
            useStudio.getState().edit(file, next, "fix", { id: "history.fixed", values: { code: d.code, file } });
          },
        })),
      };
    });
    v.dispatch(setDiagnostics(v.state, diags));
  }, [model, file, diagText, intl]);

  // Go to a position (Problems, search, the preview's current line).
  useEffect(() => {
    const v = view.current;
    if (!v || !reveal || reveal.file !== file) return;
    const pos = Math.min(reveal.offset, v.state.doc.length);
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    v.focus();
  }, [reveal, file]);

  // The preview's current line (P3), and follow it when it moves.
  const playing = preview.line;
  const waiting = preview.waiting;
  useEffect(() => {
    const v = view.current;
    if (!v || !isHws) return;
    v.dispatch({ effects: setPlayingLine.of(playing ? { id: playing, waiting } : null) });
  }, [playing, waiting, isHws]);

  return <div className="script-editor" ref={host} />;
}

