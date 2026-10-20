import { LineIndex, NOTES_FILE, type Note, noteAnchor, readNotes, stringifyNotes } from "@himawari/core";
import { Fragment, useMemo, useState } from "react";
import { FormattedMessage, FormattedTime, useIntl } from "react-intl";
import { applyFix, useDiagnosticText } from "../diagnostics";
import { type BottomTab, type HistoryEntry, useStudio } from "../store";
import { Icon } from "./Icon";
import { DeletedFilesDialog, RestorePointsDialog } from "./Safety";
import { PAGE_SIZE, Pager } from "./Pager";
import { Proposals } from "./Proposals";

/** Problems · AI Proposals · Output · History (plan §11.2). */
export function BottomPanel({ height }: { height: number | undefined }) {
  const tab = useStudio((s) => s.bottom);
  const open = useStudio((s) => s.bottomOpen);
  const model = useStudio((s) => s.model);
  const proposals = useStudio((s) => s.proposals.length);
  const count = (model?.errors ?? 0) + (model?.warnings ?? 0);
  const notes = useStudio((s) => s.files[NOTES_FILE]);
  const openNotes = useMemo(() => readNotes(notes).filter((n) => !n.resolved).length, [notes]);
  const tabs: { id: BottomTab; label: React.ReactNode }[] = [
    { id: "problems", label: <FormattedMessage id="panel.problems" values={{ count }} /> },
    { id: "notes", label: <FormattedMessage id="panel.notes" values={{ count: openNotes }} /> },
    // AI Proposals appear only once there is one (FINALIZATION.md AI-2).
    ...(proposals > 0 || tab === "proposals" ? [{ id: "proposals" as const, label: <FormattedMessage id="panel.proposals" values={{ count: proposals }} /> }] : []),
    { id: "output", label: <FormattedMessage id="panel.output" /> },
    { id: "history", label: <FormattedMessage id="panel.history" /> },
  ];
  return (
    <section className="bottom-panel" style={height ? { height } : undefined}>
      <div className="tab-strip" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={open && tab === t.id} className={open && tab === t.id ? "tab active" : "tab"} onClick={() => useStudio.getState().setBottom(open && tab === t.id ? null : t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {open && (
        <div className="panel-body">
          {tab === "problems" && <Problems />}
          {tab === "notes" && <Notes />}
          {tab === "proposals" && <Proposals />}
          {tab === "output" && <Output />}
          {tab === "history" && <History />}
        </div>
      )}
    </section>
  );
}

/** A script by its name ("start"), other files by their path: what the writer sees in the Explorer. */
const plainName = (file: string) => file.replace(/^script\//, "").replace(/\.hws$/, "");

/** "Don't point this out again": the hint's kind joins himawari.json "quietHints" (undo brings it back). */
function muteHint(code: string) {
  const s = useStudio.getState();
  const text = s.files["himawari.json"];
  if (!text) return;
  try {
    const m = JSON.parse(text) as { quietHints?: string[] };
    m.quietHints = [...new Set([...(m.quietHints ?? []), code])].sort();
    s.edit("himawari.json", `${JSON.stringify(m, null, 2)}\n`, "you", { id: "history.mutedHint", values: { code } });
    s.notify({ id: "notice.mutedHint", values: { code } }, true);
  } catch {
    /* himawari.json has errors: they're listed above */
  }
}

function Problems() {
  const model = useStudio((s) => s.model);
  const files = useStudio((s) => s.files);
  const text = useDiagnosticText();
  const intl = useIntl();
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const all = (model?.check.files ?? []).flatMap((f) => f.diagnostics.map((d) => ({ file: f.file, d })));
    const order = { error: 0, warning: 1, info: 2 } as const;
    return all.sort((a, b) => order[a.d.severity] - order[b.d.severity] || a.file.localeCompare(b.file) || a.d.span.start - b.d.span.start);
  }, [model]);
  // One line index per file: a big translation table can have thousands of problems.
  const indexes = useMemo(() => new Map<string, LineIndex>(), [files]);
  const indexOf = (file: string) => {
    let i = indexes.get(file);
    if (!i) {
      i = new LineIndex(files[file] ?? "");
      indexes.set(file, i);
    }
    return i;
  };
  if (rows.length === 0) {
    return (
      <p className="muted empty">
        <FormattedMessage id="problems.none" />
      </p>
    );
  }
  return (
    <>
    <ul className="problem-list">
      {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ file, d }, i, shown) => {
        const t = text(d);
        // Hints come after real problems, under their own heading, and each kind can be muted (FINALIZATION.md §8.2).
        const firstHint = d.severity === "info" && (i === 0 || shown[i - 1]!.d.severity !== "info");
        const mutable = d.severity === "info" && /^HW03[45]\d$/.test(d.code);
        const source = files[file] ?? "";
        const pos = indexOf(file).at(d.span.start);
        const fix = d.fixes?.[0];
        return (
          <Fragment key={i}>
          {firstHint && (
            <li className="problem-group muted small">
              <FormattedMessage id="problems.suggestions" />
            </li>
          )}
          <li className={`problem ${d.severity}`}>
            <button className="problem-main" onClick={() => useStudio.getState().revealAt(file, d.span.start)}>
              <Icon name={d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "info"} size={14} />
              <span className="problem-message">{t.message}</span>
              {t.help && <span className="muted">{t.help}</span>}
              <span className="problem-where muted" title={intl.formatMessage({ id: "problems.whereCode" }, { file, line: pos.line, col: pos.col, code: d.code })}>
                {intl.formatMessage({ id: "problems.where" }, { file: plainName(file), line: pos.line })}
              </span>
            </button>
            {fix && (
              <button className="small-button" onClick={() => useStudio.getState().edit(file, applyFix(source, fix.edits), "fix", { id: "history.fixed", values: { code: d.code, file } })}>
                <FormattedMessage id="diagnostic.applyFix" />
              </button>
            )}
            {mutable && (
              <button className="small-button" title={intl.formatMessage({ id: "problems.muteHint" })} onClick={() => muteHint(d.code)}>
                <FormattedMessage id="problems.mute" />
              </button>
            )}
          </li>
          </Fragment>
        );
      })}
    </ul>
    <Pager page={page} total={rows.length} onPage={setPage} />
    </>
  );
}

/** Review notes (rfcs/0011): the AI's continuity pass and the writer's own to-dos. */
function Notes() {
  const text = useStudio((s) => s.files[NOTES_FILE]);
  const model = useStudio((s) => s.model);
  const [showResolved, setShowResolved] = useState(false);
  const notes = useMemo(() => readNotes(text), [text]);
  const shown = notes.filter((n) => !!n.resolved === showResolved).reverse();
  const save = (next: Note[], label: string) => useStudio.getState().edit(NOTES_FILE, stringifyNotes(next), "you", { id: label });
  const go = (n: Note) => {
    const s = useStudio.getState();
    const line = n.line ? model?.lines.get(n.line) : undefined;
    const scene = n.scene ? model?.scenes.find((x) => x.id === n.scene) : undefined;
    if (line) s.revealAt(line.file, line.start);
    else if (scene) s.revealAt(scene.file, scene.start);
    else if (n.file) s.open({ kind: "file", file: n.file });
  };
  return (
    <div className="notes-panel">
      <div className="row small notes-head">
        <label className="check">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          <FormattedMessage id="notes.showResolved" />
        </label>
        <span className="muted">
          <FormattedMessage id="notes.hint" />
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="muted empty">
          <FormattedMessage id={showResolved ? "notes.noneResolved" : "notes.none"} />
        </p>
      ) : (
        <ul className="problem-list">
          {shown.map((n) => {
            const where = n.line ? model?.lines.get(n.line) : undefined;
            return (
              <li key={n.id} className="problem note">
                <button className="problem-main" onClick={() => go(n)}>
                  <span className={`note-kind ${n.kind}`}>
                    <FormattedMessage id={`notes.kind.${n.kind}`} />
                  </span>
                  <span className="problem-message">{n.text}</span>
                  <span className="problem-where muted">
                    {where ? `${where.scene} · ` : ""}
                    {noteAnchor(n)}
                    {n.author === "ai" && (
                      <span className="source-badge ai">
                        <FormattedMessage id="history.source.ai" />
                      </span>
                    )}
                  </span>
                </button>
                <button
                  className="small-button"
                  onClick={() => save(notes.map((x) => (x.id === n.id ? { ...x, resolved: !n.resolved } : x)), n.resolved ? "history.noteReopened" : "history.noteResolved")}
                >
                  <FormattedMessage id={n.resolved ? "notes.reopen" : "notes.resolve"} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Output() {
  const output = useStudio((s) => s.output);
  const built = useStudio((s) => s.preview.built);
  return (
    <div className="output">
      {built && !built.ok && <pre className="error-text">{built.errors}</pre>}
      {output.length === 0 && !built?.errors && (
        <p className="muted empty">
          <FormattedMessage id="output.empty" />
        </p>
      )}
      {[...output].reverse().map((o, i) => (
        <div key={i} className={o.level === "error" ? "output-line error-text" : "output-line"}>
          <span className="muted">
            <FormattedTime value={o.time} hour="2-digit" minute="2-digit" second="2-digit" />
          </span>{" "}
          <FormattedMessage id={o.id} values={o.values ?? {}} />
        </div>
      ))}
    </div>
  );
}

function History() {
  const history = useStudio((s) => s.history);
  const [failed, setFailed] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | "deleted" | "points">(null);
  const head = (
    <div className="row small history-head">
      <span className="muted grow">
        <FormattedMessage id="safety.historyHint" />
      </span>
      <button className="small-button" onClick={() => setDialog("deleted")}>
        <FormattedMessage id="safety.deletedButton" />
      </button>
      <button className="small-button" onClick={() => setDialog("points")}>
        <FormattedMessage id="safety.pointsButton" />
      </button>
      {dialog === "deleted" && <DeletedFilesDialog onClose={() => setDialog(null)} />}
      {dialog === "points" && <RestorePointsDialog onClose={() => setDialog(null)} />}
    </div>
  );
  if (history.length === 0) {
    return (
      <>
        {head}
        <p className="muted empty">
          <FormattedMessage id="history.empty" />
        </p>
      </>
    );
  }
  const undo = (h: HistoryEntry) => {
    const r = useStudio.getState().undoEntry(h.id);
    setFailed(r.ok ? null : h.id);
  };
  return (
    <>
    {head}
    <ul className="history-list">
      {[...history].reverse().map((h) => (
        <li key={h.id} className={h.undone ? "history-row undone" : "history-row"}>
          <span className="muted">
            <FormattedTime value={h.time} hour="2-digit" minute="2-digit" />
          </span>
          <span className={`source-badge ${h.source}`}>
            <FormattedMessage id={`history.source.${h.source}`} />
          </span>
          <span className="grow">
            <FormattedMessage id={h.label.id} values={h.label.values ?? {}} />
          </span>
          {failed === h.id && (
            <span className="error-text small">
              <FormattedMessage id="history.cantUndo" />
            </span>
          )}
          {!h.undone && (
            <button className="small-button" onClick={() => undo(h)}>
              <Icon name="undo" size={12} />
              <FormattedMessage id="history.undo" />
            </button>
          )}
        </li>
      ))}
    </ul>
    </>
  );
}
