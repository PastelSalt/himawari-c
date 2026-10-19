/**
 * MCP Apps (experimental; the `io.modelcontextprotocol/ui` extension): small
 * HTML views that hosts which support MCP Apps show inline next to a tool's
 * result. get_story_graph → the story graph, render_line → the rendered
 * frame. Each view is one self-contained page (no network, no external
 * scripts) that talks to the host over postMessage JSON-RPC: it sends
 * `ui/initialize`, then draws each `ui/notifications/tool-result`. Hosts
 * without MCP Apps ignore the `_meta.ui` hint and show the text result as before.
 */

export const APP_MIME = "text/html;profile=mcp-app";

export interface McpApp {
  uri: string;
  name: string;
  title: string;
  /** The tool whose results this view shows. */
  tool: string;
  html: string;
}

/** The host bridge every view shares: initialize, results, sizing, and tool calls through the host. */
const BRIDGE = `
let nextId = 1;
const pending = new Map();
function rpc(method, params) {
  const id = nextId++;
  parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
function notify(method, params) {
  parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}
function sizeChanged() {
  notify("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
}
window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.jsonrpc !== "2.0") return;
  if (m.id !== undefined && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(m.error);
    else p.resolve(m.result);
    return;
  }
  if (m.method === "ui/notifications/tool-result") {
    show(m.params || {});
    sizeChanged();
  }
  if (m.method === "ui/notifications/host-context-changed" && m.params && m.params.theme) document.documentElement.dataset.theme = m.params.theme;
});
rpc("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "himawari", version: "1" }, appCapabilities: {} })
  .then((r) => {
    const theme = r && r.hostContext && r.hostContext.theme;
    if (theme) document.documentElement.dataset.theme = theme;
    notify("ui/notifications/initialized", {});
  })
  .catch(() => {});
`;

const STYLE = `
:root { --bg: #ffffff; --text: #2e2a33; --muted: #716a7a; --line: #e3dcd2; --node: #f8f6f2; --accent: #f5d57c; --end: #dcf1e4; --bad: #fbe3e4; --edge: #b9b0c2; }
:root[data-theme="dark"] { --bg: #1f1c24; --text: #ece7f2; --muted: #a69fb0; --line: #3a3542; --node: #2a2631; --accent: #8a7330; --end: #24412f; --bad: #4a2a2e; --edge: #6d6578; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1f1c24; --text: #ece7f2; --muted: #a69fb0; --line: #3a3542; --node: #2a2631; --accent: #8a7330; --end: #24412f; --bad: #4a2a2e; --edge: #6d6578; } }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 13px/1.4 "Segoe UI", system-ui, sans-serif; }
.wrap { padding: 12px; }
.muted { color: var(--muted); }
`;

const page = (title: string, body: string, script: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>${STYLE}${body.startsWith("<!--graph-->") ? GRAPH_STYLE : FRAME_STYLE}</style></head><body>${body}<script>${BRIDGE}${script}</script></body></html>`;

const GRAPH_STYLE = `
svg { display: block; }
.node rect { fill: var(--node); stroke: var(--line); }
.node.entry rect { fill: var(--accent); }
.node.ending rect { fill: var(--end); }
.node.unreachable rect { fill: var(--bad); }
.node { cursor: pointer; }
.node:hover rect { stroke: var(--text); }
.node text { fill: var(--text); font-size: 12px; }
.edge { fill: none; stroke: var(--edge); stroke-width: 1.5; }
.edge.call { stroke-dasharray: 4 3; }
.label { fill: var(--muted); font-size: 10px; paint-order: stroke; stroke: var(--bg); stroke-width: 3px; }
.legend { display: flex; gap: 12px; margin-top: 8px; }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; border: 1px solid var(--line); }
.legend .e::before { background: var(--accent); } .legend .n::before { background: var(--end); } .legend .u::before { background: var(--bad); }
`;

const GRAPH_SCRIPT = `
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function show(result) {
  const g = result.structuredContent || {};
  const root = document.getElementById("graph");
  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  if (!nodes.length) { root.innerHTML = '<p class="muted">' + esc((result.content && result.content[0] && result.content[0].text) || "No scenes.") + "</p>"; return; }
  const edges = Array.isArray(g.edges) ? g.edges : [];
  // Columns by distance from the entry (breadth first); the rest after them.
  const depth = new Map();
  const start = g.entry && nodes.some((n) => n.scene === g.entry) ? g.entry : nodes[0].scene;
  depth.set(start, 0);
  const queue = [start];
  while (queue.length) {
    const s = queue.shift();
    for (const e of edges) if (e.from === s && !depth.has(e.to)) { depth.set(e.to, depth.get(s) + 1); queue.push(e.to); }
  }
  let max = 0;
  for (const v of depth.values()) max = Math.max(max, v);
  for (const n of nodes) if (!depth.has(n.scene)) depth.set(n.scene, max + 1);
  const cols = new Map();
  for (const n of nodes) { const d = depth.get(n.scene); if (!cols.has(d)) cols.set(d, []); cols.get(d).push(n); }
  const W = 150, H = 34, GX = 130, GY = 18, pos = new Map();
  let width = 0, height = 0;
  for (const [d, list] of cols) list.forEach((n, i) => { const x = 10 + d * (W + GX), y = 10 + i * (H + GY); pos.set(n.scene, { x, y }); width = Math.max(width, x + W + 10); height = Math.max(height, y + H + 10); });
  let svg = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '">';
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
    const back = x2 <= x1;
    const d = back ? "M" + x1 + "," + y1 + " C" + (x1 + 40) + "," + (y1 - 60) + " " + (x2 - 40) + "," + (y2 - 60) + " " + x2 + "," + y2 : "M" + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2;
    svg += '<path class="edge' + (e.kind === "call" ? " call" : "") + '" d="' + d + '"><title>' + esc((e.choice ? '"' + e.choice + '"' : "") + (e.when ? " if " + e.when : "")) + "</title></path>";
    if (e.choice && !back) svg += '<text class="label" x="' + (x1 + 10) + '" y="' + ((y1 + y2) / 2 - 4) + '">' + esc(e.choice.length > 20 ? e.choice.slice(0, 19) + "…" : e.choice) + "</text>";
  }
  for (const n of nodes) {
    const p = pos.get(n.scene);
    const cls = "node" + (n.scene === g.entry ? " entry" : "") + (n.ending ? " ending" : "") + (n.reachable === false ? " unreachable" : "");
    const name = n.scene.length > 20 ? n.scene.slice(0, 19) + "…" : n.scene;
    svg += '<g class="' + cls + '" data-scene="' + esc(n.scene) + '"><rect x="' + p.x + '" y="' + p.y + '" width="' + W + '" height="' + H + '" rx="10"/><text x="' + (p.x + 12) + '" y="' + (p.y + 21) + '">' + esc(name) + "</text><title>" + esc(n.scene + (n.file ? " · " + n.file : "")) + "</title></g>";
  }
  root.innerHTML = svg + "</svg>";
  // A click focuses the graph on that scene (get_story_graph through the host).
  for (const el of root.querySelectorAll(".node")) el.addEventListener("click", () => rpc("tools/call", { name: "get_story_graph", arguments: { scene: el.dataset.scene, depth: 2 } }).then(show).then(sizeChanged).catch(() => {}));
}
`;

const FRAME_STYLE = `
img { display: block; max-width: 100%; border-radius: 12px; border: 1px solid var(--line); }
`;

const FRAME_SCRIPT = `
function show(result) {
  const root = document.getElementById("frame");
  const image = (result.content || []).find((c) => c.type === "image");
  const text = (result.content || []).find((c) => c.type === "text");
  root.innerHTML = "";
  if (image) {
    const img = document.createElement("img");
    img.alt = text ? text.text : "";
    img.src = "data:" + image.mimeType + ";base64," + image.data;
    img.onload = sizeChanged;
    root.appendChild(img);
  }
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text ? text.text : "";
  root.appendChild(p);
}
`;

export const APPS: readonly McpApp[] = [
  {
    uri: "ui://himawari/story-graph",
    name: "story-graph-app",
    title: "Story graph (view)",
    tool: "get_story_graph",
    html: page(
      "Story graph",
      '<!--graph--><div class="wrap"><div id="graph" class="muted">…</div><div class="legend muted"><span class="e">start</span><span class="n">can end</span><span class="u">unreachable</span></div></div>',
      GRAPH_SCRIPT,
    ),
  },
  {
    uri: "ui://himawari/scene-preview",
    name: "scene-preview-app",
    title: "Scene preview (view)",
    tool: "render_line",
    html: page("Scene preview", '<div class="wrap" id="frame"><p class="muted">…</p></div>', FRAME_SCRIPT),
  },
];

/** `_meta` for a tool that has a view. */
export function appMeta(tool: string): Record<string, unknown> | undefined {
  const app = APPS.find((a) => a.tool === tool);
  return app ? { ui: { resourceUri: app.uri } } : undefined;
}
