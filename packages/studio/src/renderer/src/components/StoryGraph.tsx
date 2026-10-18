import { storyGraph } from "@himawari/core";
import { Background, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useStudio } from "../store";

type SceneData = { scene: string; file: string; lines: number; entry: boolean; ending: boolean; reachable: boolean; playing: boolean };

const elk = new ELK();
const W = 200;
const H = 74;

/** The story graph (plan §11.3): scenes and the jumps and calls between them. Conditional edges are dashed. */
export function StoryGraph() {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const playingLine = useStudio((s) => s.preview.line);
  const playingScene = playingLine ? model?.lines.get(playingLine)?.scene : undefined;
  const graph = useMemo(() => (model ? storyGraph(model.check) : null), [model]);
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
    data: { ...n, playing: n.scene === playingScene },
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
      style: { strokeDasharray: e.when ? "6 4" : e.kind === "call" ? "2 4" : undefined, stroke: e.kind === "call" ? "#6fb3ff" : "#8a8fa6" },
      labelStyle: { fill: "#e6e7ee", fontSize: 11 },
      labelBgStyle: { fill: "#23252e" },
    };
  });

  return (
    <div className="graph-page">
      <div className="pane-head">
        <span className="pane-title">
          <FormattedMessage id="tool.graph" />
        </span>
        <span className="muted small">
          <FormattedMessage id="graph.summary" values={{ scenes: graph.nodes.length, endings: graph.nodes.filter((n) => n.ending).length, unreachable: graph.nodes.filter((n) => !n.reachable).length }} />
        </span>
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
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_e, n) => {
            const s = useStudio.getState();
            const scene = s.model?.scenes.find((x) => x.id === n.id);
            if (scene) s.revealAt(scene.file, scene.start);
          }}
        >
          <Background gap={24} color="#2a2c36" />
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
      <div className="graph-node-title">{data.scene}</div>
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
