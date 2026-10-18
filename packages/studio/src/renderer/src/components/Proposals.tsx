import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { Proposal } from "../../../shared/api";
import { studio } from "../api";
import { diffLines } from "../../../shared/patch";
import { useStudio } from "../store";
import { Icon } from "./Icon";

/** AI proposals (plan §11.4, P12): one-line rationale, diff, validation results, accept or reject. */
export function Proposals() {
  const proposals = useStudio((s) => s.proposals);
  if (proposals.length === 0) {
    return (
      <p className="muted empty">
        <FormattedMessage id="proposals.none" />
      </p>
    );
  }
  return (
    <div className="proposal-list">
      {proposals.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
    </div>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const intl = useIntl();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (accept: boolean) => {
    try {
      await studio.proposals.decide(p.id, accept ? { accept: true } : { accept: false, reason: reason.trim() });
      if (accept) {
        useStudio.getState().log("output.proposalAccepted", { tool: p.tool });
      }
    } catch (e) {
      setError(/ProposalConflict|changed in Studio/.test(String(e)) ? intl.formatMessage({ id: "proposals.conflict" }) : String(e));
    }
  };
  return (
    <article className="proposal">
      <header className="proposal-head">
        <Icon name="assistant" />
        <strong>{p.rationale || p.tool}</strong>
        <span className="muted small">
          <FormattedMessage id="proposals.from" values={{ source: intl.formatMessage({ id: p.source === "assistant" ? "proposals.source.assistant" : "proposals.source.mcp" }), tool: p.tool }} />
        </span>
      </header>
      {p.changes.map((c) => (
        <div key={c.file} className="diff">
          <div className="diff-file">
            {c.text === null ? <FormattedMessage id="proposals.deletes" values={{ file: c.file }} /> : p.before[c.file] == null ? <FormattedMessage id="proposals.creates" values={{ file: c.file }} /> : c.file}
          </div>
          <DiffView before={p.before[c.file] ?? ""} after={c.text ?? ""} />
        </div>
      ))}
      {p.diagnostics.length > 0 && (
        <ul className="proposal-diags">
          {p.diagnostics.map((d, i) => (
            <li key={i} className={d.severity}>
              {intl.formatMessage({ id: "problems.where" }, { file: d.file, line: d.line, col: 1, code: d.code })} {d.message}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="proposal-actions">
        {rejecting ? (
          <form
            className="row grow"
            onSubmit={(e) => {
              e.preventDefault();
              void decide(false);
            }}
          >
            <input className="grow" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={intl.formatMessage({ id: "proposals.reason" })} />
            <button type="submit">
              <FormattedMessage id="proposals.reject" />
            </button>
          </form>
        ) : (
          <>
            <button className="primary" onClick={() => void decide(true)}>
              <Icon name="check" />
              <FormattedMessage id="proposals.accept" />
            </button>
            <button onClick={() => setRejecting(true)}>
              <FormattedMessage id="proposals.reject" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/** A compact line diff: changed lines with two lines of context, line IDs hidden (P7). */
export function DiffView({ before, after }: { before: string; after: string }) {
  const ops = diffLines(before, after);
  const keep = ops.map((o, i) => o.type !== "same" || ops.slice(Math.max(0, i - 2), i + 3).some((x) => x.type !== "same"));
  const strip = (s: string) => s.replace(/\s*#line:[0-9a-hjkmnp-tv-z]{6}\s*$/, "");
  const rows: React.ReactNode[] = [];
  let skipped = false;
  ops.forEach((o, i) => {
    if (!keep[i]) {
      if (!skipped) rows.push(<div key={`s${i}`} className="diff-skip">⋯</div>);
      skipped = true;
      return;
    }
    skipped = false;
    rows.push(
      <div key={i} className={`diff-line ${o.type}`}>
        <span className="diff-sign">{o.type === "add" ? "+" : o.type === "del" ? "−" : " "}</span>
        {strip(o.text) || " "}
      </div>,
    );
  });
  return <pre className="diff-view">{rows}</pre>;
}
