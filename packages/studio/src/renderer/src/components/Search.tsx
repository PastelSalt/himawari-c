import { plainText } from "@himawari/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { type Tool, useStudio } from "../store";
import { Icon } from "./Icon";

interface Item {
  kind: "scene" | "line" | "character" | "asset" | "command";
  label: string;
  detail: string;
  run: () => void;
}

/** A fuzzy score: every query character in order; earlier, adjacent, and word-start matches score higher. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 || /[\s_/.-]/.test(t[direct - 1] ?? "") ? 200 : 0);
  let score = 0;
  let last = -1;
  for (const ch of q) {
    const i = t.indexOf(ch, last + 1);
    if (i < 0) return 0;
    score += i === last + 1 ? 8 : 1;
    if (i === 0 || /[\s_/.-]/.test(t[i - 1] ?? "")) score += 5;
    last = i;
  }
  return score;
}

/** Double-Shift search (P11): scenes, lines, characters, assets, and commands. */
export function Search({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const assets = useStudio((s) => s.assets);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const { pushOverlay, popOverlay } = useStudio.getState();
    pushOverlay();
    input.current?.focus();
    return () => popOverlay();
  }, []);

  const items = useMemo<Item[]>(() => {
    const s = useStudio.getState();
    const out: Item[] = [];
    const tools: [Tool, string][] = [
      ["characters", "tool.characters"],
      ["assets", "tool.assets"],
      ["variables", "tool.variables"],
      ["localization", "tool.localization"],
      ["graph", "tool.graph"],
      ["build", "tool.build"],
      ["settings", "tool.settings"],
    ];
    for (const [tool, label] of tools) out.push({ kind: "command", label: intl.formatMessage({ id: label }), detail: intl.formatMessage({ id: "search.command" }), run: () => s.open({ kind: "tool", tool }) });
    out.push({ kind: "command", label: intl.formatMessage({ id: "preview.restart" }), detail: intl.formatMessage({ id: "search.command" }), run: () => void studio.preview.command({ cmd: "restart" }) });
    out.push({ kind: "command", label: intl.formatMessage({ id: "preview.nextChoice" }), detail: intl.formatMessage({ id: "search.command" }), run: () => void studio.preview.command({ cmd: "next_menu" }) });
    for (const sc of model?.scenes ?? []) out.push({ kind: "scene", label: sc.id, detail: sc.file, run: () => s.revealAt(sc.file, sc.start) });
    for (const c of model?.check.characters.values() ?? []) out.push({ kind: "character", label: c.displayName, detail: c.id, run: () => s.open({ kind: "tool", tool: "characters", arg: c.id }) });
    for (const a of assets) out.push({ kind: "asset", label: a.split("/").pop() ?? a, detail: a, run: () => s.open({ kind: "tool", tool: "assets" }) });
    for (const [file, r] of model?.check.parsed ?? []) {
      const visit = (stmts: typeof r.ast.scenes[number]["body"], scene: string) => {
        for (const st of stmts) {
          if (st.kind === "Say" || st.kind === "Narration") {
            out.push({ kind: "line", label: plainText(st.text), detail: `${st.kind === "Say" ? st.speaker : "…"} · ${scene}`, run: () => s.revealAt(file, st.span.start) });
          } else if (st.kind === "Menu") {
            for (const o of st.options) {
              out.push({ kind: "line", label: plainText(o.text), detail: `◆ ${scene}`, run: () => s.revealAt(file, o.span.start) });
              visit(o.body, scene);
            }
          } else if (st.kind === "If") {
            for (const c of st.clauses) visit(c.body, scene);
          }
        }
      };
      for (const sc of r.ast.scenes) visit(sc.body, sc.id);
    }
    return out;
  }, [model, assets, intl]);

  const results = useMemo(() => {
    if (!query.trim()) return items.filter((i) => i.kind !== "line" && i.kind !== "asset").slice(0, 40);
    return items
      .map((i) => ({ i, score: Math.max(fuzzy(query, i.label), fuzzy(query, i.detail) * 0.5) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((x) => x.i);
  }, [items, query]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };

  return (
    <div className="modal-backdrop search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search" role="dialog" aria-modal="true" aria-label={intl.formatMessage({ id: "search.open" })}>
        <div className="search-input">
          <Icon name="search" />
          <input
            ref={input}
            value={query}
            placeholder={intl.formatMessage({ id: "search.placeholder" })}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((n) => Math.min(results.length - 1, n + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((n) => Math.max(0, n - 1));
              } else if (e.key === "Enter") choose(results[index]);
            }}
          />
        </div>
        <ul className="search-results" role="listbox">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.detail}:${r.label}:${i}`} role="option" aria-selected={i === index} className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onMouseDown={() => choose(r)}>
              <span className={`search-kind ${r.kind}`}>
                <FormattedMessage id={`search.kind.${r.kind}`} />
              </span>
              <span className="search-label ellipsis">{r.label}</span>
              <span className="muted small ellipsis">{r.detail}</span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="muted">
              <FormattedMessage id="search.none" />
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
