import { type StoryGraph as Graph, fileFilterGraph, fileGraph, focusGraph, routeBalance, storyGraph } from "@himawari/core";
import { Background, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { PlaytestSummary } from "../../../shared/api";
import { studio } from "../api";
import { type LinkKind, addScene, linkScenes } from "../graph-edit";
import { isScript } from "../model";
import { useStudio } from "../store";
import { token, useTheme } from "../theme";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

type SceneData = {
  scene: string;
  label: string;
  file: string;
  lines: number;
  entry: boolean;
  ending: boolean;
  reachable: boolean;
  playing: boolean;
  /** Its route's color (Color: routes). */
  color?: string;
  /** Share of its lines a playtest showed (Color: playtest); an ending's `reached`. */
  coverage?: number;
  reached?: boolean;
};
type ColorBy = "plain" | "routes" | "playtest";
/** Route colors: soft and distinct in both themes. */
const ROUTE_COLORS = ["#e58fb0", "#7fb0e6", "#86c99a", "#e3b46f", "#b49be6", "#6fcac6", "#e6957f", "#b8cc6f", "#d78fd6", "#8f9fe6"];
const NAME = /^[a-z_][a-z0-9_]*$/;

/** Above this many scenes the graph opens as an overview of files: laying out a thousand scenes takes seconds and shows nothing readable. */
const BIG = 150;
type View = { kind: "all" } | { kind: "overview" } | { kind: "file"; file: string } | { kind: "scene"; scene: string };
/** A script's folder with a trailing slash ("script/route_03/"), the group in a folder overview. */
const folderOf = (file: string) => `${file.split("/").slice(0, -1).join("/")}/`;

const elk = new ELK();
const W = 200;
const H = 74;

/** The story graph (plan §11.3): scenes and the jumps and calls between them. Conditional edges are dashed. */
export function StoryGraph() {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const playingLine = useStudio((s) => s.preview.line);
  const playingScene = playingLine ? model?.lines.get(playingLine)?.scene : undefined;
  const full = useMemo(() => (model ? storyGraph(model.check) : null), [model]);
  const big = (full?.nodes.length ?? 0) > BIG;
  // Many files: one box per folder (a route), and a folder opens to its scenes.
  const byFolder = new Set(full?.nodes.map((n) => n.file)).size > 40;
  const [view, setView] = useState<View | null>(null);
  const [find, setFind] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("plain");
  const [playtest, setPlaytest] = useState<PlaytestSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ from: string; to: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const balance = useMemo(() => (full ? routeBalance(full) : null), [full]);
  const routeOf = useMemo(() => {
    const m = new Map<string, string>();
    balance?.routes.forEach((r, i) => r.members.forEach((s) => m.set(s, ROUTE_COLORS[i % ROUTE_COLORS.length]!)));
    return m;
  }, [balance]);
  // Per scene: lines a playtest showed out of its lines (dialogue and narration).
  const coverage = useMemo(() => {
    if (!playtest || !model) return null;
    const unseen = new Set(playtest.unseen);
    const m = new Map<string, { seen: number; total: number }>();
    for (const [id, l] of model.lines) {
      if (l.kind !== "say" && l.kind !== "narration") continue;
      const c = m.get(l.scene) ?? { seen: 0, total: 0 };
      c.total++;
      if (!unseen.has(id)) c.seen++;
      m.set(l.scene, c);
    }
    return m;
  }, [playtest, model]);
  const runPlaytest = async () => {
    setRunning(true);
    setProblem(null);
    try {
      setPlaytest(await studio.project.playtest());
      setColorBy("playtest");
    } catch (e) {
      setProblem(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setRunning(false);
    }
  };
  const shownView: View = view ?? (big ? { kind: "overview" } : { kind: "all" });
  const graph: Graph | null = useMemo(() => {
    if (!full) return null;
    switch (shownView.kind) {
      case "overview":
        return fileGraph(full, byFolder ? folderOf : undefined);
      case "file":
        return fileFilterGraph(full, shownView.file);
      case "scene":
        return full.nodes.some((n) => n.scene === shownView.scene) ? focusGraph(full, shownView.scene, 2) : full;
      default:
        return full;
    }
  }, [full, JSON.stringify(shownView)]);
  const overview = shownView.kind === "overview";
  const playingFile = playingScene ? full?.nodes.find((n) => n.scene === playingScene)?.file : undefined;
  const theme = useTheme();
  // React Flow draws edges and the grid as SVG attributes, which can't use var(): read the tokens.
  const colors = useMemo(
    () => ({ edge: token("--hl-punct"), call: token("--info"), text: token("--text"), label: token("--bg-2"), grid: token("--border") }),
    [theme], // recomputed when the theme changes
  );
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  // Layout with ELK (layered, left to right) whenever the graph's shape changes.
  const shape = graph ? JSON.stringify([graph.nodes.map((n) => n.scene), graph.edges.map((e) => [e.from, e.to])]) : "";
  useEffect(() => {
    if (!graph) return;
    let cancelled = false;
    const seen = new Set<string>();
    void elk
      .layout({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.spacing.nodeNode": "36", "elk.layered.spacing.nodeNodeBetweenLayers": "150" },
        children: graph.nodes.map((n) => ({ id: n.scene, width: W, height: H })),
        edges: graph.edges
          .filter((e) => {
            const k = `${e.from}>${e.to}`;
            if (seen.has(k) || e.from === e.to) return false;
            seen.add(k);
            return true;
          })
          .map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
      })
      .then((r) => {
        if (!cancelled) setPositions(new Map((r.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])));
      });
    return () => {
      cancelled = true;
    };
  }, [shape]);

  // Wait for the layout: fitView runs once, when React Flow mounts.
  const laidOut = graph !== null && graph.nodes.every((n) => positions.has(n.scene));

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="tool-page">
        <h2>
          <FormattedMessage id="tool.graph" />
        </h2>
        <p className="muted">
          <FormattedMessage id="graph.empty" />
        </p>
      </div>
    );
  }

  // Overview boxes are files or folders: sum their scenes' coverage.
  const coverageOf = (id: string): number | undefined => {
    if (!coverage) return undefined;
    let seen = 0;
    let total = 0;
    for (const n of full!.nodes) {
      const mine = overview ? (byFolder ? folderOf(n.file) : n.file) === id : n.scene === id;
      if (!mine) continue;
      const c = coverage.get(n.scene);
      if (c) {
        seen += c.seen;
        total += c.total;
      }
    }
    return total ? seen / total : 1;
  };
  const nodes: Node<SceneData>[] = graph.nodes.map((n) => {
    const cov = colorBy === "playtest" ? coverageOf(n.scene) : undefined;
    const color = colorBy === "routes" && !overview ? routeOf.get(n.scene) : undefined;
    return {
      id: n.scene,
      type: "scene",
      position: positions.get(n.scene) ?? { x: 0, y: 0 },
      data: {
        ...n,
        label: overview ? n.scene.replace(/^script\//, "") || "script/" : n.scene,
        playing: overview ? playingFile !== undefined && (byFolder ? folderOf(playingFile) : playingFile) === n.scene : n.scene === playingScene,
        ...(color ? { color } : {}),
        ...(cov !== undefined ? { coverage: cov } : {}),
        ...(playtest && n.ending && !overview ? { reached: playtest.endings.reached.includes(n.scene) } : {}),
      },
    };
  });
  const edges: Edge[] = graph.edges.map((e, i) => {
    const label = [e.choice ? `“${e.choice}”` : null, e.when ? `if ${e.when}` : null, e.kind === "call" ? intl.formatMessage({ id: "graph.call" }) : null].filter(Boolean).join(" · ");
    return {
      id: `${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      label: label || undefined,
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeDasharray: e.when ? "6 4" : e.kind === "call" ? "2 4" : undefined, stroke: e.kind === "call" ? colors.call : colors.edge },
      labelStyle: { fill: colors.text, fontSize: 11 },
      labelBgStyle: { fill: colors.label },
    };
  });

  return (
    <div className="graph-page">
      <div className="pane-head">
        <span className="pane-title">
          <FormattedMessage id="tool.graph" />
        </span>
        <span className="muted small">
          <FormattedMessage id="graph.summary" values={{ scenes: full!.nodes.length, endings: full!.nodes.filter((n) => n.ending).length, unreachable: full!.nodes.filter((n) => !n.reachable).length }} />
        </span>
        {big && (
          <>
            <div className="segmented">
              <button className={overview ? "active" : ""} onClick={() => setView({ kind: "overview" })}>
                <FormattedMessage id="graph.view.overview" />
              </button>
              <button className={shownView.kind === "all" ? "active" : ""} onClick={() => setView({ kind: "all" })} title={intl.formatMessage({ id: "graph.view.allHint" })}>
                <FormattedMessage id="graph.view.all" />
              </button>
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const name = find.trim();
                if (full!.nodes.some((n) => n.scene === name)) setView({ kind: "scene", scene: name });
              }}
            >
              <input
                className="graph-find"
                list="graph-scenes"
                value={find}
                onChange={(e) => {
                  setFind(e.target.value);
                  if (full!.nodes.some((n) => n.scene === e.target.value)) setView({ kind: "scene", scene: e.target.value });
                }}
                placeholder={intl.formatMessage({ id: "graph.find" })}
                aria-label={intl.formatMessage({ id: "graph.find" })}
              />
              <datalist id="graph-scenes">
                {full!.nodes.map((n) => (
                  <option key={n.scene} value={n.scene} />
                ))}
              </datalist>
            </form>
            {(shownView.kind === "file" || shownView.kind === "scene") && (
              <span className="muted small">
                <FormattedMessage id={shownView.kind === "file" ? "graph.showingFile" : "graph.showingScene"} values={{ name: shownView.kind === "file" ? shownView.file : shownView.scene }} />
              </span>
            )}
          </>
        )}
        <div className="segmented" role="radiogroup" aria-label={intl.formatMessage({ id: "graph.colorBy" })}>
          {(["plain", "routes", "playtest"] as const).map((c) => (
            <button key={c} role="radio" aria-checked={colorBy === c} className={colorBy === c ? "active" : ""} onClick={() => (c === "playtest" && !playtest ? void runPlaytest() : setColorBy(c))}>
              <FormattedMessage id={`graph.color.${c}`} />
            </button>
          ))}
        </div>
        <button className="small-button" disabled={running} onClick={() => void runPlaytest()} title={intl.formatMessage({ id: "graph.playtestHint" })}>
          {running ? <span className="spinner" /> : <Icon name="play" size={12} />}
          <FormattedMessage id={running ? "graph.playtesting" : "graph.playtest"} />
        </button>
        {!overview && (
          <button className="small-button" onClick={() => setAdding("")}>
            <Icon name="plus" size={12} />
            <FormattedMessage id="graph.newScene" />
          </button>
        )}
        <div className="grow" />
        <span className="legend small muted">
          <span className="legend-line" /> <FormattedMessage id="graph.legend.jump" />
          <span className="legend-line dashed" /> <FormattedMessage id="graph.legend.conditional" />
          <span className="legend-line call" /> <FormattedMessage id="graph.legend.call" />
        </span>
      </div>
      {(problem || playtest || (colorBy === "routes" && balance && balance.routes.length > 1)) && (
        <div className="graph-info small">
          {problem && <span className="error-text">{problem}</span>}
          {playtest && colorBy === "playtest" && (
            <span>
              <FormattedMessage
                id="graph.playtestResult"
                values={{
                  reached: playtest.endings.reached.length,
                  endings: playtest.endings.reached.length + playtest.endings.unreached.length,
                  lines: Math.round((100 * playtest.lines.seen) / Math.max(1, playtest.lines.total)),
                  choices: Math.round((100 * playtest.options.chosen) / Math.max(1, playtest.options.total)),
                  time: playtest.ms < 1000 ? `${Math.round(playtest.ms)} ms` : `${(playtest.ms / 1000).toFixed(1)} s`,
                }}
              />
              {playtest.errors.length > 0 && <span className="error-text"> · {playtest.errors[0]}</span>}
            </span>
          )}
          {colorBy === "routes" &&
            balance?.routes.map((r, i) => (
              <button key={r.ending} className="route-chip" onClick={() => setView({ kind: "scene", scene: r.ending })} title={r.choices.join("\n")}>
                <span className="swatch" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                {r.ending}
                <span className="muted">
                  <FormattedMessage id="graph.routeLines" values={{ lines: r.lines, shared: r.shared }} />
                </span>
                {balance.short.includes(r.ending) && (
                  <span className="warning-text" title={intl.formatMessage({ id: "graph.shortRoute" })}>
                    <Icon name="warning" size={12} />
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
      <div className="graph-canvas">
        {laidOut && (
        <ReactFlow
          key={shape}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          colorMode={theme}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
          nodesDraggable={false}
          nodesConnectable={!overview}
          connectionRadius={90} // dropping anywhere on or near the other scene connects
          onConnect={(c) => c.source && c.target && c.source !== c.target && setLinking({ from: c.source, to: c.target })}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_e, n) => {
            if (overview) {
              setView({ kind: "file", file: n.id }); // a file: its scenes
              return;
            }
            const s = useStudio.getState();
            const scene = s.model?.scenes.find((x) => x.id === n.id);
            if (scene) s.revealAt(scene.file, scene.start);
          }}
        >
          <Background gap={24} color={colors.grid} />
          <Controls showInteractive={false} />
        </ReactFlow>
        )}
      </div>
      {linking && <LinkDialog from={linking.from} to={linking.to} onClose={() => setLinking(null)} />}
      {adding !== null && (
        <NewSceneDialog
          file={shownView.kind === "file" && isScript(shownView.file) ? shownView.file : (graph.nodes[0]?.file ?? null)}
          onClose={() => setAdding(null)}
          onAdded={(name) => setView({ kind: "scene", scene: name })}
        />
      )}
    </div>
  );
}

/** Dragging from one scene to another: a choice that leads there, or where the scene goes next. */
function LinkDialog({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  const intl = useIntl();
  const [kind, setKind] = useState<"choice" | "jump">("choice");
  const [label, setLabel] = useState(intl.formatMessage({ id: "graph.link.defaultChoice" }, { scene: to }));
  const apply = () => {
    const s = useStudio.getState();
    const file = s.model?.scenes.find((x) => x.id === from)?.file;
    const text = file ? s.files[file] : undefined;
    if (!file || text === undefined) return onClose();
    const how: LinkKind = kind === "jump" ? { kind: "jump" } : { kind: "choice", label: label.trim() || to, otherLabel: intl.formatMessage({ id: "graph.link.otherChoice" }) };
    const next = linkScenes(text, from, to, how);
    if (next !== null) s.edit(file, next, "you", { id: "history.linkedScenes", values: { from, to } });
    onClose();
  };
  return (
    <Modal title={<FormattedMessage id="graph.link.title" values={{ from, to }} />} onClose={onClose}>
      <div className="form">
        <label className="check">
          <input type="radio" checked={kind === "choice"} onChange={() => setKind("choice")} />
          <FormattedMessage id="graph.link.choice" />
        </label>
        {kind === "choice" && (
          <label className="field">
            <span>
              <FormattedMessage id="graph.link.choiceText" />
            </span>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        )}
        <label className="check">
          <input type="radio" checked={kind === "jump"} onChange={() => setKind("jump")} />
          <FormattedMessage id="graph.link.jump" values={{ from, to }} />
        </label>
        <p className="muted small">
          <FormattedMessage id="graph.link.hint" />
        </p>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>
          <FormattedMessage id="common.cancel" />
        </button>
        <button className="primary" onClick={apply}>
          <FormattedMessage id="graph.link.apply" />
        </button>
      </div>
    </Modal>
  );
}

/** A new scene at the end of a script file (link it to others by dragging). */
function NewSceneDialog({ file: initial, onClose, onAdded }: { file: string | null; onClose: () => void; onAdded: (name: string) => void }) {
  const intl = useIntl();
  const files = useStudio((s) => s.files);
  const model = useStudio((s) => s.model);
  const scripts = Object.keys(files).filter(isScript).sort();
  const [file, setFile] = useState(initial ?? scripts[0] ?? "");
  const [name, setName] = useState("");
  const taken = new Set(model?.scenes.map((s) => s.id));
  const valid = NAME.test(name) && !taken.has(name) && !!file;
  const add = () => {
    if (!valid) return;
    useStudio.getState().edit(file, addScene(files[file] ?? "", name, intl.formatMessage({ id: "graph.newScenePlaceholder" })), "you", { id: "history.addedScene", values: { scene: name } });
    onAdded(name);
    onClose();
  };
  return (
    <Modal title={<FormattedMessage id="graph.newScene" />} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="field">
          <span>
            <FormattedMessage id="graph.newSceneName" />
          </span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={name !== "" && !valid} />
        </label>
        {name !== "" && taken.has(name) && (
          <p className="error-text small">
            <FormattedMessage id="graph.sceneTaken" values={{ name }} />
          </p>
        )}
        <label className="field">
          <span>
            <FormattedMessage id="graph.newSceneFile" />
          </span>
          <select value={file} onChange={(e) => setFile(e.target.value)}>
            {scripts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            <FormattedMessage id="common.cancel" />
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            <FormattedMessage id="common.add" />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SceneNode({ data }: NodeProps<Node<SceneData>>) {
  const cov = data.coverage;
  return (
    <div
      className={`graph-node${data.entry ? " entry" : ""}${!data.reachable ? " unreachable" : ""}${data.playing ? " playing" : ""}${data.reached === false ? " not-reached" : ""}`}
      style={data.color ? { boxShadow: `inset 5px 0 ${data.color}` } : undefined}
    >
      <Handle type="target" position={Position.Left} />
      <div className="graph-node-title ellipsis" title={data.label}>
        {data.label}
      </div>
      <div className="graph-node-meta muted small">
        <FormattedMessage id="graph.lines" values={{ count: data.lines }} />
        {data.entry && (
          <span className="badge">
            <FormattedMessage id="explorer.entry" />
          </span>
        )}
        {data.ending && (
          <span className="badge">
            <FormattedMessage id="graph.ending" />
          </span>
        )}
        {!data.reachable && (
          <span className="badge error">
            <FormattedMessage id="graph.unreachable" />
          </span>
        )}
        {data.reached === false && (
          <span className="badge error">
            <FormattedMessage id="graph.notReached" />
          </span>
        )}
      </div>
      {cov !== undefined && (
        <div className="coverage-bar" title={`${Math.round(cov * 100)}%`}>
          <span className={cov >= 0.999 ? "full" : cov > 0 ? "part" : "none"} style={{ width: `${Math.max(4, cov * 100)}%` }} />
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const NODE_TYPES = { scene: SceneNode };
