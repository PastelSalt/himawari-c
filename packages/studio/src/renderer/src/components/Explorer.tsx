import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { isExtension, isLocale, isScript } from "../model";
import { useStudio } from "../store";
import { Icon } from "./Icon";

const NAME = /^[a-z_][a-z0-9_]*$/;
const localeFile = (lang: string) => `locales/${lang}.json`;
/** A script's folder under script/ ("" for script/ itself) and its name. */
const folderOf = (file: string) => file.slice("script/".length).split("/").slice(0, -1).join("/");
const nameOf = (file: string) => file.split("/").pop() ?? file;
/** Above this many scripts, folders start closed and files show their scenes only when opened. */
const BIG = 20;

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
  // A big project: filter by name, fold folders, and show scenes only for opened files (no long scrolling).
  const [filter, setFilter] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());

  const scripts = useMemo(() => Object.keys(files).filter(isScript).sort(), [files]);
  const big = scripts.length > BIG;
  const scenesByFile = useMemo(() => {
    const m = new Map<string, NonNullable<typeof model>["scenes"]>();
    for (const sc of model?.scenes ?? []) m.set(sc.file, [...(m.get(sc.file) ?? []), sc]);
    return m;
  }, [model]);
  const errorsByFile = useMemo(() => new Map((model?.check.files ?? []).map((f) => [f.file, f.diagnostics.filter((d) => d.severity === "error").length])), [model]);
  const q = filter.trim().toLowerCase();
  const matches = (file: string) => !q || file.toLowerCase().includes(q) || (scenesByFile.get(file) ?? []).some((sc) => sc.id.includes(q));
  const folders = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of scripts) m.set(folderOf(f), [...(m.get(folderOf(f)) ?? []), f]);
    return [...m].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [scripts]);
  const locales = useMemo(() => Object.keys(files).filter(isLocale).sort(), [files]);
  const characters = model ? [...model.check.characters.values()] : [];
  const errorsIn = (file: string) => errorsByFile.get(file) ?? 0;
  const openFile = (file: string) => useStudio.getState().open({ kind: "file", file });
  const current = center?.kind === "file" ? center.file : null;
  // The open file's folder is always shown, and its scenes too unless there are many (its Screenplay has "go to a scene").
  const currentScenes = current ? (scenesByFile.get(current)?.length ?? 0) : 0;
  useEffect(() => {
    if (!current || !isScript(current)) return;
    setOpenFolders((s) => (s.has(folderOf(current)) ? s : new Set(s).add(folderOf(current))));
    if (currentScenes <= 30) setOpenFiles((s) => (s.has(current) ? s : new Set(s).add(current)));
  }, [current, currentScenes]);
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const folderOpen = (folder: string) => folder === "" || !!q || !big || openFolders.has(folder);
  const scenesShown = (file: string) => !!q || (!big && folders.length < 3) || openFiles.has(file);

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
    const dir = folderOf(from);
    const to = `script/${dir ? `${dir}/` : ""}${name}.hws`; // stays in its folder
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
          <span className="row">
            {big && (
              <button
                className="icon-button"
                title={intl.formatMessage({ id: "explorer.collapseAll" })}
                aria-label={intl.formatMessage({ id: "explorer.collapseAll" })}
                onClick={() => {
                  setOpenFolders(new Set());
                  setOpenFiles(new Set());
                }}
              >
                <Icon name="collapse" size={14} />
              </button>
            )}
            <button className="icon-button" title={intl.formatMessage({ id: "explorer.newFile" })} aria-label={intl.formatMessage({ id: "explorer.newFile" })} onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} />
            </button>
          </span>
        </div>
        {scripts.length > 8 && (
          <div className="inline-form">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={intl.formatMessage({ id: "explorer.filter" })}
              aria-label={intl.formatMessage({ id: "explorer.filter" })}
            />
          </div>
        )}
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
        {folders.map(([folder, list]) => {
          const shown = list.filter(matches);
          if (shown.length === 0) return null;
          const open = folderOpen(folder);
          return (
            <div key={folder || "."}>
              {folder !== "" && (
                <button className="tree-row tree-label folder" aria-expanded={open} onClick={() => setOpenFolders((s) => toggle(s, folder))}>
                  <Icon name={open ? "down" : "chevron"} size={12} />
                  <Icon name="explorer" size={14} />
                  <span className="grow ellipsis">{folder}</span>
                  <span className="muted small">{shown.length}</span>
                </button>
              )}
              {open &&
                shown.map((file) => {
                  const scenes = (scenesByFile.get(file) ?? []).filter((sc) => !q || file.toLowerCase().includes(q) || sc.id.includes(q));
                  const expanded = scenesShown(file);
                  return (
                    <div key={file} className={folder ? "in-folder" : undefined}>
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
                          <button
                            className="tree-label"
                            onClick={() => {
                              openFile(file);
                              if ((scenesByFile.get(file)?.length ?? 0) <= 30) setOpenFiles((s) => new Set(s).add(file));
                            }}
                          >
                            {big && (
                              <span
                                className="twisty"
                                aria-hidden
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFiles((s) => toggle(s, file));
                                }}
                              >
                                <Icon name={expanded ? "down" : "chevron"} size={11} />
                              </span>
                            )}
                            <Icon name="file" size={14} />
                            <span className="grow ellipsis">{nameOf(file)}</span>
                            {big && !expanded && scenes.length > 0 && <span className="muted small">{scenes.length}</span>}
                            {errorsIn(file) > 0 && <span className="badge error">{errorsIn(file)}</span>}
                          </button>
                          <span className="row-actions">
                            <button
                              className="icon-button"
                              title={intl.formatMessage({ id: "explorer.rename" })}
                              aria-label={intl.formatMessage({ id: "explorer.rename" })}
                              onClick={() => {
                                setRenaming(file);
                                setRenameTo(nameOf(file).slice(0, -".hws".length));
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
                      {expanded &&
                        scenes.map((sc) => (
                          <button key={sc.id} className="tree-row tree-label nested" onClick={() => useStudio.getState().revealAt(file, sc.start)}>
                            <Icon name="scene" size={13} />
                            <span className="ellipsis">{sc.id}</span>
                            {model?.check.manifest?.entry === sc.id && (
                              <span className="badge">
                                <FormattedMessage id="explorer.entry" />
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {q && !scripts.some(matches) && (
          <p className="muted small empty">
            <FormattedMessage id="explorer.noMatch" />
          </p>
        )}
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
