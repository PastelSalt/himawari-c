import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { isExtension, isLocale, isScript } from "../model";
import { useStudio } from "../store";
import { Icon } from "./Icon";

const NAME = /^[a-z_][a-z0-9_]*$/;
const localeFile = (lang: string) => `locales/${lang}.json`;

/** Scenes, characters, languages, and project files (plan §11.2). */
export function Explorer() {
  const intl = useIntl();
  const files = useStudio((s) => s.files);
  const model = useStudio((s) => s.model);
  const center = useStudio((s) => s.center);
  const root = useStudio((s) => s.root);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");

  const scripts = useMemo(() => Object.keys(files).filter(isScript).sort(), [files]);
  const locales = useMemo(() => Object.keys(files).filter(isLocale).sort(), [files]);
  const characters = model ? [...model.check.characters.values()] : [];
  const errorsIn = (file: string) => model?.check.files.find((f) => f.file === file)?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  const openFile = (file: string) => useStudio.getState().open({ kind: "file", file });
  const current = center?.kind === "file" ? center.file : null;

  const addFile = () => {
    const name = newName.trim();
    if (!NAME.test(name)) return;
    const file = `script/${name}.hws`;
    if (files[file] !== undefined) return;
    useStudio.getState().edit(file, `scene ${name}:\n    "…"\n`, "you", { id: "history.newFile", values: { file } });
    setAdding(false);
    setNewName("");
    openFile(file);
  };

  const rename = (from: string) => {
    const name = renameTo.trim();
    setRenaming(null);
    if (!NAME.test(name)) return;
    const to = `script/${name}.hws`;
    if (to === from || files[to] !== undefined) return;
    const text = files[from]!;
    useStudio.getState().editMany(
      [
        { file: to, text },
        { file: from, text: null },
      ],
      "you",
      { id: "history.renamedFile", values: { file: from, to } },
    );
    if (current === from) openFile(to);
  };

  const remove = (file: string) => {
    if (!window.confirm(intl.formatMessage({ id: "explorer.deleteConfirm" }, { file }))) return;
    useStudio.getState().edit(file, null, "you", { id: "history.deletedFile", values: { file } });
    if (current === file) useStudio.getState().open(null);
  };

  return (
    <div className="explorer">
      <div className="explorer-project" title={root ?? ""}>
        {root?.split(/[\\/]/).pop()}
      </div>

      <div className="explorer-section">
        <div className="section-head">
          <span>
            <FormattedMessage id="explorer.scripts" />
          </span>
          <button className="icon-button" title={intl.formatMessage({ id: "explorer.newFile" })} aria-label={intl.formatMessage({ id: "explorer.newFile" })} onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        {adding && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              addFile();
            }}
          >
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} onBlur={() => !newName && setAdding(false)} placeholder={intl.formatMessage({ id: "explorer.newFile.placeholder" })} aria-invalid={newName !== "" && !NAME.test(newName)} />
          </form>
        )}
        {scripts.map((file) => (
          <div key={file}>
            {renaming === file ? (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename(file);
                }}
              >
                <input autoFocus value={renameTo} onChange={(e) => setRenameTo(e.target.value.toLowerCase())} onBlur={() => setRenaming(null)} aria-label={intl.formatMessage({ id: "explorer.rename" })} />
              </form>
            ) : (
              <div className={current === file ? "tree-row selected" : "tree-row"}>
                <button className="tree-label" onClick={() => openFile(file)}>
                  <Icon name="file" size={14} />
                  <span className="grow ellipsis">{file.slice("script/".length)}</span>
                  {errorsIn(file) > 0 && <span className="badge error">{errorsIn(file)}</span>}
                </button>
                <span className="row-actions">
                  <button
                    className="icon-button"
                    title={intl.formatMessage({ id: "explorer.rename" })}
                    aria-label={intl.formatMessage({ id: "explorer.rename" })}
                    onClick={() => {
                      setRenaming(file);
                      setRenameTo(file.slice("script/".length, -".hws".length));
                    }}
                  >
                    <Icon name="file" size={12} />
                  </button>
                  <button className="icon-button" title={intl.formatMessage({ id: "explorer.delete" })} aria-label={intl.formatMessage({ id: "explorer.delete" })} onClick={() => remove(file)}>
                    <Icon name="trash" size={12} />
                  </button>
                </span>
              </div>
            )}
            {(model?.scenes ?? [])
              .filter((s) => s.file === file)
              .map((s) => (
                <button key={s.id} className="tree-row tree-label nested" onClick={() => useStudio.getState().revealAt(file, s.start)}>
                  <Icon name="scene" size={13} />
                  <span className="ellipsis">{s.id}</span>
                  {model?.check.manifest?.entry === s.id && (
                    <span className="badge">
                      <FormattedMessage id="explorer.entry" />
                    </span>
                  )}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="explorer-section">
        <div className="section-head">
          <span>
            <FormattedMessage id="explorer.characters" />
          </span>
          <button className="icon-button" title={intl.formatMessage({ id: "characters.new" })} aria-label={intl.formatMessage({ id: "characters.new" })} onClick={() => useStudio.getState().open({ kind: "tool", tool: "characters", arg: "+new" })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        {characters.map((c) => (
          <button key={c.id} className="tree-row tree-label" onClick={() => useStudio.getState().open({ kind: "tool", tool: "characters", arg: c.id })}>
            <span className="swatch" style={{ background: c.color ?? "var(--muted)" }} />
            <span className="ellipsis">{c.displayName}</span>
          </button>
        ))}
      </div>

      <div className="explorer-section">
        <div className="section-head">
          <span>
            <FormattedMessage id="explorer.languages" />
          </span>
        </div>
        {(model?.check.manifest?.languages ?? []).map((l) => (
          <button key={l} className="tree-row tree-label" onClick={() => useStudio.getState().open({ kind: "tool", tool: "localization", arg: l })}>
            <Icon name="translate" size={13} />
            <span>{l}</span>
            {l === model?.check.manifest?.sourceLanguage && (
              <span className="badge">
                <FormattedMessage id="explorer.source" />
              </span>
            )}
            {locales.includes(localeFile(l)) && <span className="muted small">{localeFile(l)}</span>}
          </button>
        ))}
      </div>

      <div className="explorer-section">
        <div className="section-head">
          <span>
            <FormattedMessage id="explorer.project" />
          </span>
        </div>
        {["himawari.json", "AGENTS.md", "theme/theme.json", ...Object.keys(files).filter(isExtension).sort()]
          .filter((f) => files[f] !== undefined)
          .map((f) => (
            <button key={f} className={current === f ? "tree-row tree-label selected" : "tree-row tree-label"} onClick={() => openFile(f)}>
              <Icon name="file" size={14} />
              <span>{f}</span>
              {errorsIn(f) > 0 && <span className="badge error">{errorsIn(f)}</span>}
            </button>
          ))}
      </div>
    </div>
  );
}
