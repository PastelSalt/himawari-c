import { useState } from "react";
import { FormattedMessage, FormattedTime, useIntl } from "react-intl";
import { applyFix, useDiagnosticText } from "../diagnostics";
import { positionOf } from "../model";
import { type BottomTab, type HistoryEntry, useStudio } from "../store";
import { Icon } from "./Icon";
import { Proposals } from "./Proposals";

/** Problems · AI Proposals · Output · History (plan §11.2). */
export function BottomPanel({ height }: { height: number | undefined }) {
  const tab = useStudio((s) => s.bottom);
  const open = useStudio((s) => s.bottomOpen);
  const model = useStudio((s) => s.model);
  const proposals = useStudio((s) => s.proposals.length);
  const count = (model?.errors ?? 0) + (model?.warnings ?? 0);
  const tabs: { id: BottomTab; label: React.ReactNode }[] = [
    { id: "problems", label: <FormattedMessage id="panel.problems" values={{ count }} /> },
    { id: "proposals", label: <FormattedMessage id="panel.proposals" values={{ count: proposals }} /> },
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
          {tab === "proposals" && <Proposals />}
          {tab === "output" && <Output />}
          {tab === "history" && <History />}
        </div>
      )}
    </section>
  );
}

function Problems() {
  const model = useStudio((s) => s.model);
  const files = useStudio((s) => s.files);
  const text = useDiagnosticText();
  const intl = useIntl();
  const rows = (model?.check.files ?? []).flatMap((f) => f.diagnostics.map((d) => ({ file: f.file, d })));
  const order = { error: 0, warning: 1, info: 2 } as const;
  rows.sort((a, b) => order[a.d.severity] - order[b.d.severity] || a.file.localeCompare(b.file) || a.d.span.start - b.d.span.start);
  if (rows.length === 0) {
    return (
      <p className="muted empty">
        <FormattedMessage id="problems.none" />
      </p>
    );
  }
  return (
    <ul className="problem-list">
      {rows.map(({ file, d }, i) => {
        const t = text(d);
        const source = files[file] ?? "";
        const pos = positionOf(source, d.span.start);
        const fix = d.fixes?.[0];
        return (
          <li key={i} className={`problem ${d.severity}`}>
            <button className="problem-main" onClick={() => useStudio.getState().revealAt(file, d.span.start)}>
              <Icon name={d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "info"} size={14} />
              <span className="problem-message">{t.message}</span>
              {t.help && <span className="muted">{t.help}</span>}
              <span className="problem-where muted">{intl.formatMessage({ id: "problems.where" }, { file, line: pos.line, col: pos.col, code: d.code })}</span>
            </button>
            {fix && (
              <button className="small-button" onClick={() => useStudio.getState().edit(file, applyFix(source, fix.edits), "fix", { id: "history.fixed", values: { code: d.code, file } })}>
                <FormattedMessage id="diagnostic.applyFix" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
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
  if (history.length === 0) {
    return (
      <p className="muted empty">
        <FormattedMessage id="history.empty" />
      </p>
    );
  }
  const undo = (h: HistoryEntry) => {
    const r = useStudio.getState().undoEntry(h.id);
    setFailed(r.ok ? null : h.id);
  };
  return (
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
  );
}
