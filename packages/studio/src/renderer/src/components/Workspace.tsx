import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_RIGHT, MIN_SIDE, fitPanes } from "../layout";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { isScript } from "../model";
import { type Tool, selectAiAllowed, useStudio } from "../store";
import { Assets } from "./Assets";
import { Designer } from "./Designer";
import { Assistant } from "./Assistant";
import { BottomPanel } from "./BottomPanel";
import { BuildPanel } from "./BuildPanel";
import { Characters } from "./Characters";
import { Explorer } from "./Explorer";
import { FileEditor } from "./FileEditor";
import { Icon } from "./Icon";
import { Localization } from "./Localization";
import { PreviewPane } from "./PreviewPane";
import { Search } from "./Search";
import { ConflictDialog } from "./Safety";
import { SettingsPage } from "./Settings";
import { StoryGraph } from "./StoryGraph";
import { Variables } from "./Variables";

/** A size remembered across sessions (per-user convenience only). */
function useSize(key: string, initial: number): [number, (n: number) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(`size.${key}`);
      return s ? Number(s) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (n: number) => {
      setV(n);
      try {
        localStorage.setItem(`size.${key}`, String(Math.round(n)));
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  );
  return [v, set];
}

/** The window's width, kept current as it's resized. */
function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

function Splitter({ dir, onDrag }: { dir: "col" | "row"; onDrag: (delta: number) => void }) {
  const last = useRef(0);
  return (
    <div
      className={`splitter ${dir}`}
      onPointerDown={(e) => {
        last.current = dir === "col" ? e.clientX : e.clientY;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
        const p = dir === "col" ? e.clientX : e.clientY;
        onDrag(p - last.current);
        last.current = p;
      }}
    />
  );
}

const TOOLS: { tool: Tool; icon: string; label: string }[] = [
  { tool: "characters", icon: "characters", label: "tool.characters" },
  { tool: "assets", icon: "assets", label: "tool.assets" },
  { tool: "variables", icon: "variables", label: "tool.variables" },
  { tool: "localization", icon: "translate", label: "tool.localization" },
  { tool: "graph", icon: "graph", label: "tool.graph" },
  { tool: "designer", icon: "palette", label: "tool.designer" },
  { tool: "build", icon: "build", label: "tool.build" },
];

export function Workspace() {
  const intl = useIntl();
  const center = useStudio((s) => s.center);
  const bottomOpen = useStudio((s) => s.bottomOpen);
  const searchOpen = useStudio((s) => s.searchOpen);
  const [sideW, setSideW] = useSize("side", 250);
  const [rightW, setRightW] = useSize("right", 560);
  const [bottomH, setBottomH] = useSize("bottom", 200);
  const [assistantH, setAssistantH] = useSize("assistant", 320);
  const windowWidth = useWindowWidth();
  const aiAllowed = useStudio(selectAiAllowed);
  const assistantOpen = useStudio((s) => s.settings?.assistantOpen === true) && aiAllowed;
  const setAssistantOpen = (open: boolean) => void useStudio.getState().setSettings({ assistantOpen: open });
  // Translation appears once the game has a second language (FINALIZATION.md T-2).
  const translating = useStudio((s) => (s.model?.check.manifest?.languages.length ?? 0) > 1);

  // Double-Shift opens search (P11); Ctrl+P too. The usual Windows keys (FINALIZATION.md D-9; listed in Settings).
  useEffect(() => {
    let lastShift = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = performance.now();
        if (now - lastShift < 400) {
          useStudio.getState().setSearch(true);
          lastShift = 0;
        } else lastShift = now;
      } else if (e.key !== "Shift") {
        lastShift = 0;
      }
      if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        useStudio.getState().setSearch(true);
      }
      const s = useStudio.getState();
      // Ctrl+S: there's nothing to save by hand, so say so instead of doing nothing.
      if (e.ctrlKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        s.notify({ id: "notice.savedAutomatically" });
      }
      // F5: play the game from the start in the preview.
      if (e.key === "F5" && !e.ctrlKey) {
        e.preventDefault();
        if (s.preview.ready) void studio.preview.command({ cmd: "restart" });
      }
      // Ctrl+Z outside a text box: undo the last change (text boxes keep their own undo).
      if (e.ctrlKey && !e.shiftKey && (e.key === "z" || e.key === "Z") && !inTextBox(e.target)) {
        const last = [...s.history].reverse().find((h) => !h.undone);
        if (last) {
          e.preventDefault();
          s.undoEntry(last.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (tool: Tool) => useStudio.getState().open({ kind: "tool", tool });
  const active = center?.kind === "tool" ? center.tool : null;
  const fitted = fitPanes(windowWidth, sideW, rightW, active !== "designer");
  // "Story" goes back to the script last open (or the first one) from any tool, the UI Designer included.
  const lastFile = useRef<string | null>(null);
  if (center?.kind === "file") lastFile.current = center.file;
  const openStory = () => {
    const s = useStudio.getState();
    const file = lastFile.current && s.files[lastFile.current] !== undefined ? lastFile.current : Object.keys(s.files).filter(isScript).sort()[0];
    if (file) s.open({ kind: "file", file });
  };

  return (
    <div className="workspace">
      <div className="ws-main">
        <nav className="activity-bar" aria-label={intl.formatMessage({ id: "workspace.tools" })}>
          <button className={center?.kind === "file" ? "activity active" : "activity"} title={intl.formatMessage({ id: "tool.story" })} aria-label={intl.formatMessage({ id: "tool.story" })} onClick={openStory}>
            <Icon name="scene" size={20} />
          </button>
          {TOOLS.filter((t) => t.tool !== "localization" || translating || active === "localization").map((t) => (
            <button key={t.tool} className={active === t.tool ? "activity active" : "activity"} title={intl.formatMessage({ id: t.label })} aria-label={intl.formatMessage({ id: t.label })} onClick={() => open(t.tool)}>
              <Icon name={t.icon} size={20} />
            </button>
          ))}
          <div className="grow" />
          <button className="activity" title={intl.formatMessage({ id: "search.open" })} aria-label={intl.formatMessage({ id: "search.open" })} onClick={() => useStudio.getState().setSearch(true)}>
            <Icon name="search" size={20} />
          </button>
          {aiAllowed && (
            <button className={assistantOpen ? "activity active" : "activity"} title={intl.formatMessage({ id: "tool.assistant" })} aria-label={intl.formatMessage({ id: "tool.assistant" })} onClick={() => setAssistantOpen(!assistantOpen)}>
              <Icon name="assistant" size={20} />
            </button>
          )}
          <button className={active === "settings" ? "activity active" : "activity"} title={intl.formatMessage({ id: "tool.settings" })} aria-label={intl.formatMessage({ id: "tool.settings" })} onClick={() => open("settings")}>
            <Icon name="settings" size={20} />
          </button>
        </nav>
        {/* The UI Designer needs the room more than the project tree does. */}

        {active !== "designer" && (
          <>
            <aside className="side" style={{ width: fitted.side }}>
              <Explorer />
            </aside>
            <Splitter dir="col" onDrag={(d) => setSideW(Math.min(480, Math.max(MIN_SIDE, fitted.side + d)))} />
          </>
        )}
        <div className="ws-center-col">
          <main className="center">
            {center?.kind === "file" && <FileEditor file={center.file} />}
            {center?.kind === "tool" && center.tool === "characters" && <Characters initial={center.arg} />}
            {center?.kind === "tool" && center.tool === "assets" && <Assets />}
            {center?.kind === "tool" && center.tool === "designer" && <Designer />}
            {center?.kind === "tool" && center.tool === "variables" && <Variables />}
            {center?.kind === "tool" && center.tool === "localization" && <Localization />}
            {center?.kind === "tool" && center.tool === "graph" && <StoryGraph />}
            {center?.kind === "tool" && center.tool === "build" && <BuildPanel />}
            {center?.kind === "tool" && center.tool === "settings" && <SettingsPage />}
            {center === null && (
              <div className="empty-center muted">
                <FormattedMessage id="workspace.empty" />
              </div>
            )}
          </main>
          {bottomOpen && <Splitter dir="row" onDrag={(d) => setBottomH(Math.min(600, Math.max(90, bottomH - d)))} />}
          <BottomPanel height={bottomOpen ? bottomH : undefined} />
        </div>
        <Splitter dir="col" onDrag={(d) => setRightW(Math.min(1200, Math.max(MIN_RIGHT, fitted.right - d)))} />
        <section className="right-col" style={{ width: fitted.right }}>
          <PreviewPane />
          {assistantOpen && (
            <>
              <Splitter dir="row" onDrag={(d) => setAssistantH(Math.min(900, Math.max(160, assistantH - d)))} />
              <div className="assistant-dock" style={{ height: assistantH }}>
                <Assistant />
              </div>
            </>
          )}
        </section>
      </div>
      <StatusBar />
      {searchOpen && <Search onClose={() => useStudio.getState().setSearch(false)} />}
      <ConflictDialog />
      <Notice />
    </div>
  );
}

function StatusBar() {
  const model = useStudio((s) => s.model);
  const built = useStudio((s) => s.preview.built);
  const proposals = useStudio((s) => s.proposals.length);
  const root = useStudio((s) => s.root);
  return (
    <footer className="status-bar">
      <button className="status-item" onClick={() => useStudio.getState().setBottom("problems")}>
        <Icon name="error" size={13} />
        {model?.errors ?? 0}
        <Icon name="warning" size={13} />
        {model?.warnings ?? 0}
      </button>
      {proposals > 0 && (
        <button className="status-item accent" onClick={() => useStudio.getState().setBottom("proposals")}>
          <Icon name="proposal" size={13} />
          <FormattedMessage id="status.proposals" values={{ count: proposals }} />
        </button>
      )}
      {!model && (
        <span className="status-item muted">
          <span className="spinner" />
          <FormattedMessage id="status.checking" />
        </span>
      )}
      <span className="status-item muted">{built && (built.ok ? <FormattedMessage id="status.built" values={{ ms: Math.round(built.ms) }} /> : <FormattedMessage id="status.notBuilt" />)}</span>
      <div className="grow" />
      <span className="status-item muted" title={root ?? ""}>
        <FormattedMessage id="status.autosave" />
      </span>
      <button className="status-item" onClick={() => void useStudio.getState().closeProject()}>
        <FormattedMessage id="status.closeProject" />
      </button>
    </footer>
  );
}

/** The undo notice (bottom left): disappears after a few seconds. */
function Notice() {
  const notice = useStudio((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => {
      if (useStudio.getState().notice?.seq === notice.seq) useStudio.setState({ notice: null });
    }, 8000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <div className="notice" role="status">
      <span>
        <FormattedMessage id={notice.label.id} values={notice.label.values ?? {}} />
      </span>
      {notice.undo !== null && (
        <button
          className="small-button"
          onClick={() => {
            useStudio.getState().undoEntry(notice.undo!);
            useStudio.setState({ notice: null });
          }}
        >
          <FormattedMessage id="history.undo" />
        </button>
      )}
      <button className="icon-button" aria-label={useIntlLabel()} onClick={() => useStudio.setState({ notice: null })}>
        <Icon name="close" size={11} />
      </button>
    </div>
  );
}

function useIntlLabel() {
  return useIntl().formatMessage({ id: "common.close" });
}

/** Typing somewhere that has its own undo: a field, a text area, or the script editor. */
function inTextBox(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest(".cm-editor") !== null;
}
