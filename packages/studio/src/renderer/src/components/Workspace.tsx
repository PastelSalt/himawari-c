import { useCallback, useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { type Tool, useStudio } from "../store";
import { Assets } from "./Assets";
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
  const [assistantOpen, setAssistantOpen] = useState(true);

  // Double-Shift opens search (P11); Ctrl+P too.
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (tool: Tool) => useStudio.getState().open({ kind: "tool", tool });
  const active = center?.kind === "tool" ? center.tool : null;

  return (
    <div className="workspace">
      <div className="ws-main">
        <nav className="activity-bar" aria-label={intl.formatMessage({ id: "workspace.tools" })}>
          {TOOLS.map((t) => (
            <button key={t.tool} className={active === t.tool ? "activity active" : "activity"} title={intl.formatMessage({ id: t.label })} aria-label={intl.formatMessage({ id: t.label })} onClick={() => open(t.tool)}>
              <Icon name={t.icon} size={20} />
            </button>
          ))}
          <div className="grow" />
          <button className="activity" title={intl.formatMessage({ id: "search.open" })} aria-label={intl.formatMessage({ id: "search.open" })} onClick={() => useStudio.getState().setSearch(true)}>
            <Icon name="search" size={20} />
          </button>
          <button className={assistantOpen ? "activity active" : "activity"} title={intl.formatMessage({ id: "tool.assistant" })} aria-label={intl.formatMessage({ id: "tool.assistant" })} onClick={() => setAssistantOpen(!assistantOpen)}>
            <Icon name="assistant" size={20} />
          </button>
          <button className={active === "settings" ? "activity active" : "activity"} title={intl.formatMessage({ id: "tool.settings" })} aria-label={intl.formatMessage({ id: "tool.settings" })} onClick={() => open("settings")}>
            <Icon name="settings" size={20} />
          </button>
        </nav>
        <aside className="side" style={{ width: sideW }}>
          <Explorer />
        </aside>
        <Splitter dir="col" onDrag={(d) => setSideW(Math.min(480, Math.max(170, sideW + d)))} />
        <div className="ws-center-col">
          <main className="center">
            {center?.kind === "file" && <FileEditor file={center.file} />}
            {center?.kind === "tool" && center.tool === "characters" && <Characters initial={center.arg} />}
            {center?.kind === "tool" && center.tool === "assets" && <Assets />}
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
        <Splitter dir="col" onDrag={(d) => setRightW(Math.min(1200, Math.max(320, rightW - d)))} />
        <section className="right-col" style={{ width: rightW }}>
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
