/**
 * The line editor's style toolbar and a styled preview (FINALIZATION.md NC-8):
 * bold, italic, color, size, pauses, shaking, furigana, and remembered values
 * without typing a single tag.
 */
import { type TextPart, parseText } from "@himawari/core";
import { type ReactNode, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { displayToRaw } from "../screenplay-edit";
import { type Edited, insertAt, wrapSelection } from "../text-style";
import { useStudio } from "../store";

const COLORS = ["#e86a5a", "#f2a65a", "#e8c547", "#6ab47c", "#4a7fc1", "#9b6ac1", "#888888"];

/** Buttons that act on a textarea's selection. `apply` receives the new text and selection. */
export function TextToolbar({ target, value, apply }: { target: () => HTMLTextAreaElement | null; value: string; apply: (e: Edited) => void }) {
  const intl = useIntl();
  const variables = useStudio((s) => s.model?.check.manifest?.variables);
  const [panel, setPanel] = useState<null | "color" | "ruby" | "value">(null);
  const [reading, setReading] = useState("");
  const sel = () => {
    const el = target();
    return el ? [el.selectionStart, el.selectionEnd] as const : ([value.length, value.length] as const);
  };
  const wrap = (tag: string, v?: string) => {
    const [a, b] = sel();
    apply(wrapSelection(value, a, b, tag, v));
    setPanel(null);
  };
  const insert = (piece: string) => {
    const [a, b] = sel();
    apply(insertAt(value, a, b, piece));
    setPanel(null);
  };
  // Buttons keep the text's focus and selection (mousedown would steal it).
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const button = (label: string, title: string, onClick: () => void, cls = "") => (
    <button className={`tt-button ${cls}`} title={title} aria-label={title} onMouseDown={keep} onClick={onClick}>
      {label}
    </button>
  );
  const t = (id: string) => intl.formatMessage({ id });
  return (
    <div className="text-toolbar" role="toolbar" aria-label={t("text.toolbar")}>
      {button(t("text.btn.bold"), t("text.bold"), () => wrap("b"), "bold")}
      {button(t("text.btn.italic"), t("text.italic"), () => wrap("i"), "italic")}
      {button(t("text.btn.color"), t("text.color"), () => setPanel(panel === "color" ? null : "color"), "color")}
      {button(t("text.btn.bigger"), t("text.bigger"), () => wrap("size", "48"))}
      {button(t("text.btn.smaller"), t("text.smaller"), () => wrap("size", "28"))}
      {button(t("text.btn.shake"), t("text.shake"), () => wrap("shake"))}
      {button(t("text.btn.pause"), t("text.pause"), () => insert("{w=500}"))}
      {button(t("text.btn.slow"), t("text.slow"), () => wrap("speed", "20"))}
      {button(t("text.btn.ruby"), t("text.ruby"), () => setPanel(panel === "ruby" ? null : "ruby"))}
      {variables && Object.keys(variables).length > 0 && button(t("text.btn.value"), t("text.value"), () => setPanel(panel === "value" ? null : "value"))}
      {panel === "color" && (
        <span className="tt-panel">
          {COLORS.map((c) => (
            <button key={c} className="tt-swatch" style={{ background: c }} title={c} aria-label={c} onMouseDown={keep} onClick={() => wrap("color", c)} />
          ))}
        </span>
      )}
      {panel === "ruby" && (
        <span className="tt-panel">
          <input
            autoFocus
            value={reading}
            placeholder={t("text.rubyReading")}
            aria-label={t("text.rubyReading")}
            onChange={(e) => setReading(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reading.trim()) {
                e.preventDefault();
                wrap("rb", reading.trim());
                setReading("");
              }
              if (e.key === "Escape") setPanel(null);
            }}
          />
          <span className="muted small">
            <FormattedMessage id="text.rubyHint" />
          </span>
        </span>
      )}
      {panel === "value" && variables && (
        <span className="tt-panel">
          {Object.keys(variables)
            .sort()
            .map((n) => (
              <button key={n} className="small-button" onMouseDown={keep} onClick={() => insert(`[${n}]`)}>
                {n}
              </button>
            ))}
        </span>
      )}
    </div>
  );
}

function render(parts: readonly TextPart[]): ReactNode[] {
  return parts.map((p, i) => {
    if ("t" in p) return <span key={i}>{p.t}</span>;
    if ("var" in p) return <span key={i} className="tp-var">{p.var}</span>;
    if ("select" in p) return <span key={i} className="tp-var">{p.select}…</span>;
    const kids = "children" in p ? render(p.children) : null;
    switch (p.tag) {
      case "b":
        return <b key={i}>{kids}</b>;
      case "i":
        return <i key={i}>{kids}</i>;
      case "color":
        return (
          <span key={i} style={{ color: p.value }}>
            {kids}
          </span>
        );
      case "size":
        return (
          <span key={i} style={{ fontSize: `${Math.max(0.6, Math.min(1.8, Number(p.value ?? 36) / 36))}em` }}>
            {kids}
          </span>
        );
      case "rb":
        return (
          <ruby key={i}>
            {kids}
            <rt>{p.value}</rt>
          </ruby>
        );
      case "shake":
        return <span key={i} className="tp-shake">{kids}</span>;
      case "speed":
        return <span key={i} className="tp-slow">{kids}</span>;
      case "w":
        return <span key={i} className="tp-pause">⏸</span>;
      default:
        return <span key={i}>{kids}</span>;
    }
  });
}

/** The line as it will look (styles, furigana, values), under the editor when it has markup. */
export function StyledPreview({ display }: { display: string }) {
  const r = parseText(`"${displayToRaw(display)}"`, 0);
  if (r.diagnostics.length > 0) return null;
  return <div className="text-preview">{render(r.parts)}</div>;
}
