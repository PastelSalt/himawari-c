import { type StoryGraph as Graph, fileFilterGraph, fileGraph, focusGraph, storyGraph } from "@himawari/core";
import { Background, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useStudio } from "../store";
import { token, useTheme } from "../theme";

type SceneData = { scene: string; label: string; file: string; lines: number; entry: boolean; ending: boolean; reachable: boolean; playing: boolean };

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

  const nodes: Node<SceneData>[] = graph.nodes.map((n) => ({
    id: n.scene,
    type: "scene",
    position: positions.get(n.scene) ?? { x: 0, y: 0 },
    data: {
      ...n,
      label: overview ? n.scene.replace(/^script\//, "") || "script/" : n.scene,
      playing: overview ? playingFile !== undefined && (byFolder ? folderOf(playingFile) : playingFile) === n.scene : n.scene === playingScene,
    },
  }));
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
        <div className="grow" />
        <span className="legend small muted">
          <span className="legend-line" /> <FormattedMessage id="graph.legend.jump" />
          <span className="legend-line dashed" /> <FormattedMessage id="graph.legend.conditional" />
          <span className="legend-line call" /> <FormattedMessage id="graph.legend.call" />
        </span>
      </div>
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
          nodesConnectable={false}
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
    </div>
  );
}

function SceneNode({ data }: NodeProps<Node<SceneData>>) {
  return (
    <div className={`graph-node${data.entry ? " entry" : ""}${!data.reachable ? " unreachable" : ""}${data.playing ? " playing" : ""}`}>
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
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const NODE_TYPES = { scene: SceneNode };
