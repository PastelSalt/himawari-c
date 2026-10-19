import {
  GLOSSARY_FILE,
  type GlossaryTerm,
  type L10nTable,
  type SourceLine,
  applyTranslations,
  collectLines,
  glossaryMisses,
  parseTable,
  readGlossary,
  stringifyGlossary,
  stringifyTable,
  syncTable,
  toCsv,
  toXliff,
  translationsFromCsv,
  translationsFromXliff,
} from "@himawari/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { LANGUAGE_NAMES } from "../i18n";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { PAGE_SIZE, Pager, pathChoices } from "./Pager";
import { playFrom } from "./ScriptEditor";

type Filter = "all" | "missing" | "needs-review" | "changed";

/** Localization (plan §7, §11.3): a table of lines × language, status filters, CSV/XLIFF exchange. */
export function Localization({ initial }: { initial?: string | undefined }) {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const files = useStudio((s) => s.files);
  const manifest = model?.check.manifest;
  const targets = (manifest?.languages ?? []).filter((l) => l !== manifest?.sourceLanguage);
  const [lang, setLang] = useState<string | null>(initial && initial !== manifest?.sourceLanguage ? initial : (targets[0] ?? null));
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState("");
  // A big game has tens of thousands of lines: narrow by route (a folder or file) and words, a page at a time.
  const [where, setWhere] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (initial && initial !== manifest?.sourceLanguage) setLang(initial);
  }, [initial, manifest?.sourceLanguage]);

  const lines: SourceLine[] = useMemo(() => (model ? collectLines(model.check.parsed) : []), [model]);
  const file = lang ? `locales/${lang}.json` : null;
  const existing: L10nTable | null = useMemo(() => {
    const t = file ? files[file] : undefined;
    if (!t) return null;
    try {
      return parseTable(t);
    } catch {
      return null;
    }
  }, [file, files]);
  const synced = useMemo(() => (lang && manifest ? syncTable(existing, lines, lang, manifest.sourceLanguage) : null), [existing, lines, lang, manifest]);
  const stored = useMemo(() => new Map((existing?.lines ?? []).map((e) => [e.id, e])), [existing]);
  const entries = useMemo(() => new Map((synced?.table.lines ?? []).map((e) => [e.id, e])), [synced]);
  const places = useMemo(() => pathChoices(new Set(lines.map((l) => l.file))), [lines]);
  const glossaryText = files[GLOSSARY_FILE];
  const glossary = useMemo(() => readGlossary(glossaryText), [glossaryText]);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const run = useStudio((s) => s.translation);

  const write = (table: L10nTable, label: string, values: Record<string, string> = {}) => {
    if (!file || !lang) return;
    useStudio.getState().edit(file, stringifyTable(table), "you", { id: label, values: { lang, ...values } });
  };

  const setText = (id: string, text: string) => {
    if (!synced) return;
    const r = applyTranslations(synced.table, new Map([[id, text]]), "human");
    if (r.refused.length > 0) {
      setProblems((p) => ({ ...p, [id]: r.refused[0]!.problems }));
      return;
    }
    setProblems((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
    if (r.updated > 0) write(r.table, "history.translated", { id });
  };

  const markReviewed = (id: string) => {
    if (!synced) return;
    write({ ...synced.table, lines: synced.table.lines.map((e) => (e.id === id && e.status === "needs-review" ? { ...e, status: "ok" as const } : e)) }, "history.reviewed", { id });
  };

  const exportAs = (format: "csv" | "xliff") => {
    if (!synced || !lang) return;
    const out = format === "csv" ? `locales/${lang}.csv` : `locales/${lang}.xlf`;
    void studio.project.write(out, format === "csv" ? toCsv(synced.table, lines) : toXliff(synced.table, lines)).then(() => {
      setMessage(intl.formatMessage({ id: "l10n.exported" }, { file: out }));
      void studio.app.reveal(out);
    });
  };

  const importFile = async () => {
    if (!synced) return;
    const path = await studio.dialog.pickFile("translation");
    if (!path) return;
    const text = new TextDecoder().decode(await studio.project.readExternal(path));
    const map = /\.xlf|\.xliff$/i.test(path) ? translationsFromXliff(text) : translationsFromCsv(text);
    const r = applyTranslations(synced.table, map, "human");
    write(r.table, "history.importedTranslations", { count: String(r.updated) });
    setMessage(intl.formatMessage({ id: "l10n.imported" }, { updated: r.updated, refused: r.refused.length, unknown: r.unknown.length }));
    setProblems(Object.fromEntries(r.refused.map((x) => [x.id, x.problems])));
  };

  const addLanguage = () => {
    const tag = adding.trim();
    const text = files["himawari.json"];
    if (!tag || !text || manifest?.languages.includes(tag)) return;
    try {
      const m = JSON.parse(text) as { languages?: string[] };
      m.languages = [...(m.languages ?? []), tag];
      useStudio.getState().edit("himawari.json", `${JSON.stringify(m, null, 2)}\n`, "you", { id: "history.addedLanguage", values: { lang: tag } });
      setLang(tag);
      setAdding("");
    } catch {
      /* himawari.json has errors: Problems shows them */
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (where && !(where.endsWith("/") ? l.file.startsWith(where) : l.file === where)) return false;
      const e = entries.get(l.id);
      const s = stored.get(l.id);
      if (filter === "missing" && !(!e || e.status === "missing")) return false;
      if (filter === "needs-review" && e?.status !== "needs-review") return false;
      if (filter === "changed" && !(s !== undefined && s.source !== l.text)) return false;
      return !q || l.text.toLowerCase().includes(q) || (e?.text ?? "").toLowerCase().includes(q) || l.scene.includes(q) || l.id === q.replace(/^#/, "");
    });
  }, [lines, where, query, filter, entries, stored]);
  useEffect(() => setPage(0), [where, query, filter, lang]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of synced?.table.lines ?? []) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [synced]);
  const count = (st: string) => counts[st] ?? 0;
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pending = synced && (synced.added > 0 || synced.changed > 0 || synced.removed > 0 || !existing);
  // "Translate with AI" takes the untranslated lines among those shown (narrow by route or words first).
  const untranslated = useMemo(() => rows.filter((l) => !entries.get(l.id)?.text), [rows, entries]);
  const running = !!run?.job;

  return (
    <div className="tool-page l10n-page">
      <div className="row wrap">
        <h2 className="grow">
          <FormattedMessage id="tool.localization" />
        </h2>
        {targets.length > 0 && (
          <select value={lang ?? ""} onChange={(e) => setLang(e.target.value)} aria-label={intl.formatMessage({ id: "l10n.language" })}>
            {targets.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l] ?? l}
              </option>
            ))}
          </select>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            addLanguage();
          }}
        >
          <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={intl.formatMessage({ id: "l10n.addLanguage" })}>
            <option value="">{intl.formatMessage({ id: "l10n.addLanguage" })}</option>
            {Object.entries(LANGUAGE_NAMES)
              .filter(([t]) => !manifest?.languages.includes(t))
              .map(([t, n]) => (
                <option key={t} value={t}>
                  {n}
                </option>
              ))}
          </select>
          <button type="submit" disabled={!adding}>
            <FormattedMessage id="common.add" />
          </button>
        </form>
      </div>
      {!lang || !synced ? (
        <p className="muted">
          <FormattedMessage id="l10n.noTargets" />
        </p>
      ) : (
        <>
          <div className="row wrap l10n-bar">
            <div className="segmented">
              {(["all", "missing", "needs-review", "changed"] as const).map((f) => (
                <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                  <FormattedMessage id={`l10n.filter.${f}`} />
                </button>
              ))}
            </div>
            <span className="muted small">
              <FormattedMessage id="l10n.summary" values={{ total: lines.length, ok: count("ok"), review: count("needs-review"), missing: lines.length - count("ok") - count("needs-review") }} />
            </span>
          </div>
          <div className="row wrap l10n-bar">
            <select className="small-select" value={where} onChange={(e) => setWhere(e.target.value)} aria-label={intl.formatMessage({ id: "l10n.where" })}>
              <option value="">{intl.formatMessage({ id: "l10n.everywhere" })}</option>
              {places.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="l10n-search"
              value={query}
              placeholder={intl.formatMessage({ id: "l10n.search" })}
              aria-label={intl.formatMessage({ id: "l10n.search" })}
              onChange={(e) => setQuery(e.target.value)}
            />
            {(where || query.trim()) && (
              <span className="muted small">
                <FormattedMessage id="l10n.matching" values={{ count: rows.length }} />
              </span>
            )}
            <div className="grow" />
            {pending && (
              <button className="primary" onClick={() => write(synced.table, "history.synced")}>
                <FormattedMessage id="l10n.sync" values={{ added: synced.added, changed: synced.changed, removed: synced.removed }} />
              </button>
            )}
            <button onClick={() => setGlossaryOpen((o) => !o)} aria-expanded={glossaryOpen}>
              <FormattedMessage id="l10n.glossary" values={{ count: glossary.length }} />
            </button>
            <button className="ai-button" disabled={untranslated.length === 0 || running} onClick={() => setAsking(true)}>
              <Icon name="assistant" size={13} />
              <FormattedMessage id="l10n.ai.button" values={{ count: untranslated.length }} />
            </button>
            <button onClick={() => exportAs("csv")}>
              <FormattedMessage id="l10n.exportCsv" />
            </button>
            <button onClick={() => exportAs("xliff")}>
              <FormattedMessage id="l10n.exportXliff" />
            </button>
            <button onClick={() => void importFile()}>
              <FormattedMessage id="l10n.import" />
            </button>
          </div>
          {message && <p className="muted small">{message}</p>}
          {run && run.lang === lang && <TranslationProgress />}
          {glossaryOpen && <GlossaryEditor terms={glossary} lang={lang} />}
          {asking && <TranslateDialog lang={lang} lines={untranslated} onClose={() => setAsking(false)} />}
          <table className="data-table l10n-table">
            <thead>
              <tr>
                <th />
                <th>
                  <FormattedMessage id="l10n.source" values={{ language: LANGUAGE_NAMES[manifest!.sourceLanguage] ?? manifest!.sourceLanguage }} />
                </th>
                <th>
                  <FormattedMessage id="l10n.translation" values={{ language: LANGUAGE_NAMES[lang] ?? lang }} />
                </th>
                <th>
                  <FormattedMessage id="l10n.status" />
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const e = entries.get(l.id);
                const s = stored.get(l.id);
                const changed = s !== undefined && s.source !== l.text;
                return (
                  <tr key={l.id}>
                    <td className="l10n-play">
                      <button
                        className="sp-play"
                        title={intl.formatMessage({ id: "l10n.playIn" })}
                        aria-label={intl.formatMessage({ id: "l10n.playIn" })}
                        onClick={() => {
                          void studio.preview.command({ cmd: "lang", lang });
                          playFrom(l.id);
                        }}
                      >
                        ▶
                      </button>
                    </td>
                    <td>
                      <div className="muted small">
                        {l.speaker || intl.formatMessage({ id: "screenplay.narration" })} · {l.scene}
                      </div>
                      <div>{l.text}</div>
                    </td>
                    <td>
                      <TranslationCell id={l.id} value={e?.text ?? ""} onCommit={(t) => setText(l.id, t)} />
                      {glossary.length > 0 &&
                        glossaryMisses(glossary, lang, l.text, e?.text ?? "").map((t) => (
                          <div key={t.source} className="glossary-hint small">
                            <FormattedMessage id="l10n.glossaryHint" values={{ term: t.source, want: t.translations[lang] }} />
                          </div>
                        ))}
                      {problems[l.id] && (
                        <div className="error-text small">
                          <FormattedMessage id="l10n.refused" values={{ problems: problems[l.id]!.join("; ") }} />
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-chip ${changed ? "changed" : (e?.status ?? "missing")}`}>
                        <FormattedMessage id={`l10n.st.${changed ? "changed" : (e?.status ?? "missing")}`} />
                      </span>
                      {e?.provenance && e.provenance !== "human" && (
                        <span className="badge" title={intl.formatMessage({ id: "l10n.aiHint" })}>
                          <Icon name="assistant" size={11} />
                          <FormattedMessage id="history.source.ai" />
                        </span>
                      )}
                      {e?.status === "needs-review" && (
                        <button className="small-button" onClick={() => markReviewed(l.id)}>
                          <FormattedMessage id="l10n.markReviewed" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={page} total={rows.length} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function TranslationCell({ id, value, onCommit }: { id: string; value: string; onCommit: (t: string) => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    }
  }, [draft]);
  return (
    <textarea
      ref={ref}
      className="l10n-input"
      rows={1}
      value={draft}
      data-line={id}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

const MODELS = [
  { id: "claude-haiku-5-5", label: "l10n.ai.model.haiku" },
  { id: "claude-sonnet-5-5", label: "l10n.ai.model.sonnet" },
] as const;

/** Before a run: how many lines, which model, about what it costs. Nothing is sent until "Translate". */
function TranslateDialog({ lang, lines, onClose }: { lang: string; lines: SourceLine[]; onClose: () => void }) {
  const intl = useIntl();
  const characters = useStudio((s) => s.model?.check.characters);
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [estimate, setEstimate] = useState<{ cost: number; hasKey: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useMemo(
    () => ({
      lang,
      model,
      lines: lines.map((l) => ({ id: l.id, speaker: l.speaker ? (characters?.get(l.speaker)?.displayName ?? l.speaker) : "", kind: l.kind, text: l.text })),
    }),
    [lang, model, lines, characters],
  );
  useEffect(() => {
    let live = true;
    studio.translate
      .estimate(request)
      .then((e) => live && setEstimate(e))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [request]);
  const start = async () => {
    try {
      const job = await studio.translate.start(request);
      useStudio.setState({ translation: { job, lang, done: 0, total: request.lines.length, cost: 0, written: 0, refused: 0, finished: null, error: null } });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal title={<FormattedMessage id="l10n.ai.title" values={{ language: LANGUAGE_NAMES[lang] ?? lang }} />} onClose={onClose}>
      <p>
        <FormattedMessage id="l10n.ai.what" values={{ count: lines.length, language: LANGUAGE_NAMES[lang] ?? lang }} />
      </p>
      <label className="field">
        <span>
          <FormattedMessage id="l10n.ai.model" />
        </span>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {intl.formatMessage({ id: m.label })}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        <FormattedMessage id="l10n.ai.review" />
      </p>
      {estimate && (
        <p className="muted small">
          <FormattedMessage id="l10n.ai.cost" values={{ cost: estimate.cost < 0.01 ? "< $0.01" : `≈ $${estimate.cost.toFixed(2)}` }} />
        </p>
      )}
      {estimate && !estimate.hasKey && (
        <div className="row wrap">
          <span className="error-text small grow">
            <FormattedMessage id="l10n.ai.noKey" />
          </span>
          <button
            className="small-button"
            onClick={() => {
              onClose();
              useStudio.getState().open({ kind: "tool", tool: "settings" });
            }}
          >
            <FormattedMessage id="assistant.openSettings" />
          </button>
        </div>
      )}
      {error && <p className="error-text small">{error}</p>}
      <div className="row modal-actions">
        <div className="grow" />
        <button onClick={onClose}>
          <FormattedMessage id="common.cancel" />
        </button>
        <button className="primary" disabled={!estimate?.hasKey || lines.length === 0} onClick={() => void start()}>
          <FormattedMessage id="l10n.ai.start" />
        </button>
      </div>
    </Modal>
  );
}

/** The run in progress (a bar and Cancel), then how it went. */
function TranslationProgress() {
  const run = useStudio((s) => s.translation)!;
  const cost = run.cost < 0.01 ? "< $0.01" : `$${run.cost.toFixed(2)}`;
  return (
    <div className="translate-progress row wrap small">
      {run.job ? (
        <>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done}>
            <div className="progress-fill" style={{ width: `${run.total ? (100 * run.done) / run.total : 0}%` }} />
          </div>
          <span>
            <FormattedMessage id="l10n.ai.running" values={{ done: run.done, total: run.total, cost }} />
          </span>
          <button className="small-button" onClick={() => void studio.translate.cancel()}>
            <FormattedMessage id="common.cancel" />
          </button>
        </>
      ) : run.error ? (
        <span className="error-text">
          <FormattedMessage id="l10n.ai.failed" values={{ reason: run.error, written: run.written }} />
        </span>
      ) : (
        <span>
          <FormattedMessage
            id={run.finished?.cancelled ? "l10n.ai.cancelled" : "l10n.ai.finished"}
            values={{ written: run.written, refused: run.refused, missed: run.finished?.missed ?? 0, cost }}
          />
        </span>
      )}
      {!run.job && (
        <button className="small-button" onClick={() => useStudio.setState({ translation: null })}>
          <FormattedMessage id="common.close" />
        </button>
      )}
    </div>
  );
}

/** glossary.json: the game's own words and how they're translated. The checker and the AI translator both follow it. */
function GlossaryEditor({ terms, lang }: { terms: GlossaryTerm[]; lang: string }) {
  const intl = useIntl();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const save = (next: GlossaryTerm[], label: string, term: string) =>
    useStudio.getState().edit(GLOSSARY_FILE, stringifyGlossary(next), "you", { id: label, values: { term } });
  const setTerm = (i: number, patch: Partial<GlossaryTerm>) => {
    const t = terms[i]!;
    save(
      terms.map((x, j) => (j === i ? { ...t, ...patch } : x)),
      "history.glossaryEdited",
      t.source,
    );
  };
  const add = () => {
    const s = source.trim();
    if (!s) return;
    const i = terms.findIndex((t) => t.source.toLowerCase() === s.toLowerCase());
    const next =
      i >= 0
        ? terms.map((t, j) => (j === i ? { ...t, translations: { ...t.translations, [lang]: target.trim() } } : t))
        : [...terms, { source: s, translations: target.trim() ? { [lang]: target.trim() } : {} }];
    save(next, "history.glossaryEdited", s);
    setSource("");
    setTarget("");
  };
  return (
    <div className="card glossary">
      <p className="muted small">
        <FormattedMessage id="l10n.glossaryAbout" />
      </p>
      {terms.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <FormattedMessage id="l10n.glossaryTerm" />
              </th>
              <th>{LANGUAGE_NAMES[lang] ?? lang}</th>
              <th>
                <FormattedMessage id="l10n.glossaryNote" />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {terms.map((t, i) => (
              <tr key={`${t.source}-${i}`}>
                <td>{t.source}</td>
                <td>
                  <input
                    key={t.translations[lang] ?? ""}
                    defaultValue={t.translations[lang] ?? ""}
                    aria-label={intl.formatMessage({ id: "l10n.glossaryTranslation" }, { term: t.source })}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === (t.translations[lang] ?? "")) return;
                      const { [lang]: _drop, ...rest } = t.translations;
                      setTerm(i, { translations: v ? { ...rest, [lang]: v } : rest });
                    }}
                  />
                </td>
                <td>
                  <input
                    key={t.note ?? ""}
                    defaultValue={t.note ?? ""}
                    aria-label={intl.formatMessage({ id: "l10n.glossaryNote" })}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === (t.note ?? "")) return;
                      const { note: _n, ...rest } = t;
                      save(
                        terms.map((x, j) => (j === i ? (v ? { ...rest, note: v } : rest) : x)),
                        "history.glossaryEdited",
                        t.source,
                      );
                    }}
                  />
                </td>
                <td>
                  <button
                    className="small-button"
                    title={intl.formatMessage({ id: "common.delete" })}
                    aria-label={intl.formatMessage({ id: "common.delete" })}
                    onClick={() =>
                      save(
                        terms.filter((_, j) => j !== i),
                        "history.glossaryRemoved",
                        t.source,
                      )
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={intl.formatMessage({ id: "l10n.glossaryTerm" })} />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={LANGUAGE_NAMES[lang] ?? lang} />
        <button type="submit" disabled={!source.trim()}>
          <FormattedMessage id="common.add" />
        </button>
      </form>
    </div>
  );
}
