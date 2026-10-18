/**
 * Himawari Studio, main process (plan §11). Security (plan §11.1, Electron's
 * checklist): contextIsolation, sandbox, no nodeIntegration, a strict CSP,
 * permissions denied, navigation and new windows blocked, the renderer served
 * from a custom app:// protocol (not file://), every IPC call checked for its
 * sender and arguments. Fuses are set at packaging (electron-builder.yml).
 */
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { BrowserWindow, Menu, app, dialog, ipcMain, nativeTheme, protocol, session, shell } from "electron";
import { type BundledProject, CHANNELS, type MethodName, type PreviewEvent, type ProjectSnapshot, type Settings } from "../shared/api.js";
import { AssistantHost } from "./assistant.js";
import { McpHost } from "./mcp-host.js";
import { preloadPath, rendererDir, resources } from "./paths.js";
import { Preview } from "./preview.js";
import { Project, copyBundled, createProject } from "./project.js";
import { Proposals } from "./proposals.js";
import { addRecent, getSettings, setSettings } from "./settings.js";

const DEV_URL = process.env["ELECTRON_RENDERER_URL"];

// Automated tests run in a throwaway folder: settings there, and bundled projects copied there, never the user's own.
const TEST_HOME = process.env["HIMAWARI_STUDIO_TEST_HOME"];
if (TEST_HOME) app.setPath("userData", join(TEST_HOME, "userData"));
const documentsDir = () => (TEST_HOME ? join(TEST_HOME, "Documents") : app.getPath("documents"));
// The agent guide and llm-reference that the MCP server and the assistant read (bundled code can't find them relative to itself).
process.env["HIMAWARI_SPEC_DIR"] = resources().spec;
const APP_ORIGIN = "app://studio";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: "himawari-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // CodeMirror and React Flow set inline styles
  "img-src 'self' himawari-asset: data: blob:",
  "media-src 'self' himawari-asset: blob:",
  "font-src 'self' data:",
  "connect-src 'self' himawari-asset:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
};

/** Serves a file from `base` for a URL path, refusing anything outside it. */
async function serveFrom(base: string, urlPath: string, headers: Record<string, string> = {}): Promise<Response> {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const full = normalize(join(base, rel));
  if (full !== base && !full.startsWith(base + sep)) return new Response("forbidden", { status: 403 });
  try {
    if (!(await stat(full)).isFile()) return new Response("not found", { status: 404 });
    const body = await readFile(full);
    return new Response(body, { headers: { "content-type": MIME[extname(full).toLowerCase()] ?? "application/octet-stream", ...headers } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

let win: BrowserWindow | null = null;
let project: Project | null = null;
let preview: Preview | null = null;
/** The language the preview plays in: the source language unless the user picks another. */
let previewLang: string | undefined;
const proposals = new Proposals(() => project, (list) => send(CHANNELS.proposalsChanged, list));
const mcp = new McpHost(() => project, proposals, getSettings, () => resources().runtime);
proposals.onApplied = (changes, proposal) => {
  if (project) send(CHANNELS.projectChanged, changes, null, { source: "ai", tool: proposal.tool, rationale: proposal.rationale });
};
const assistant = new AssistantHost(() => project, proposals, getSettings, (e) => send(CHANNELS.assistantEvent, e), () => resources().runtime);

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

const emitPreview = (event: PreviewEvent) => send(CHANNELS.previewEvent, event);

async function openProject(root: string): Promise<ProjectSnapshot> {
  await closeProject();
  const p = new Project(root, {
    changed: (changes, assets) => send(CHANNELS.projectChanged, changes, assets),
    built: (report) => {
      emitPreview({ ev: "built", ok: report.ok, errors: report.errors, ms: report.ms });
      if (!report.ok || !project) return;
      if (preview?.running) preview.send({ cmd: "reload" });
      else preview?.start(project.root, previewOptions());
    },
  });
  project = p;
  previewLang = p.sourceLanguage();
  const snapshot = p.snapshot();
  p.watch();
  addRecent(p.root);
  await mcp.start(p.root);
  win?.setTitle(`${snapshot.root.split(/[\\/]/).pop() ?? ""} · Himawari Studio`);
  return snapshot;
}

async function closeProject(): Promise<void> {
  preview?.stop();
  await mcp.stop();
  assistant.reset();
  proposals.clear();
  project?.close();
  project = null;
  win?.setTitle("Himawari Studio");
}

function previewOptions(warp?: string): { warp?: string; lang?: string } {
  return { ...(warp ? { warp } : {}), ...(previewLang ? { lang: previewLang } : {}) };
}

function needProject(): Project {
  if (!project) throw new Error("No project is open.");
  return project;
}

const str = (v: unknown, what: string): string => {
  if (typeof v !== "string") throw new Error(`${what} must be text`);
  return v;
};

/** Every renderer request, by method name. Arguments are checked here: the renderer is untrusted. */
const handlers: Record<MethodName, (...args: unknown[]) => unknown> = {
  "app.info": () => ({
    version: app.getVersion(),
    dev: !app.isPackaged,
    runtimeFound: resources().runtime !== null,
    templates: ["adv", "blank"],
    bundled: (Object.entries(resources().projects) as [BundledProject, string][]).filter(([, dir]) => existsSync(join(dir, "himawari.json"))).map(([n]) => n),
  }),
  "app.openExternal": async (url) => {
    const u = new URL(str(url, "url"));
    if (u.protocol !== "https:") throw new Error("Only https links open in the browser.");
    await shell.openExternal(u.toString());
  },
  "app.reveal": (path) => {
    const p = needProject();
    shell.showItemInFolder(p.fs.path(str(path, "path")));
  },
  "settings.get": () => getSettings(),
  "settings.set": (patch) => {
    if (!patch || typeof patch !== "object") throw new Error("settings must be an object");
    const next = setSettings(patch as Partial<Settings>);
    if ("appearance" in patch) applyAppearance();
    return next;
  },
  "dialog.pickFolder": async () => {
    // e2e tests can't drive the native dialog: in a test run it answers with the test's folder.
    const picked = process.env["HIMAWARI_STUDIO_TEST_PICK"];
    if (TEST_HOME && picked) return picked;
    const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  },
  "dialog.pickFile": async (kind) => {
    const filters: Record<string, Electron.FileFilter[]> = {
      psd: [{ name: "Photoshop", extensions: ["psd"] }],
      ora: [{ name: "OpenRaster", extensions: ["ora"] }],
      image: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
      audio: [{ name: "Audio", extensions: ["ogg", "wav", "mp3", "flac", "opus"] }],
      translation: [{ name: "CSV / XLIFF", extensions: ["csv", "xlf", "xliff"] }],
      theme: [{ name: "Himawari theme", extensions: ["json"] }],
    };
    const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters: filters[str(kind, "kind")] ?? [] });
    if (r.canceled || !r.filePaths[0]) return null;
    pickedFiles.add(r.filePaths[0]);
    return r.filePaths[0];
  },
  "dialog.saveFile": async (kind, defaultName, text) => {
    if (str(kind, "kind") !== "theme") throw new Error("unknown file kind");
    const body = str(text, "text");
    if (body.length > 1_000_000) throw new Error("too large");
    const r = await dialog.showSaveDialog(win!, { defaultPath: str(defaultName, "defaultName"), filters: [{ name: "Himawari theme", extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return false;
    await writeFile(r.filePath, body);
    return true;
  },
  "project.create": async (options) => {
    const o = options as Parameters<typeof createProject>[0];
    if (!o || typeof o.parent !== "string" || typeof o.name !== "string" || !Array.isArray(o.targetLanguages)) throw new Error("bad options");
    const root = createProject(o, resources().templates);
    return openProject(root);
  },
  "project.open": (root) => openProject(str(root, "root")),
  "project.openBundled": (name) => {
    const projects = resources().projects;
    const n = str(name, "name") as BundledProject;
    if (!(n in projects)) throw new Error("unknown project");
    const folder = n === "tutorial" ? "Tutorial" : n === "festival-eve" ? "Festival Eve" : "Layered Sprites";
    return openProject(copyBundled(projects[n], documentsDir(), folder));
  },
  "project.close": () => closeProject(),
  "project.write": (file, text) => needProject().write(str(file, "file"), str(text, "text")),
  "project.remove": (file) => needProject().remove(str(file, "file")),
  "project.rename": (from, to) => needProject().rename(str(from, "from"), str(to, "to")),
  "project.writeAsset": (file, bytes) => {
    if (!(bytes instanceof Uint8Array)) throw new Error("bytes must be binary");
    needProject().writeAsset(str(file, "file"), bytes);
  },
  "project.readExternal": async (path) => {
    // Only files the user just picked in an Open dialog (PSD/ORA/image import).
    const p = str(path, "path");
    if (!pickedFiles.has(p)) throw new Error("Studio only reads files you picked.");
    return new Uint8Array(await readFile(p));
  },
  "project.build": () => needProject().build(),
  "project.exportGame": (zip) => {
    const runtime = resources().runtime;
    if (!runtime) throw new Error("The Himawari runtime isn't installed with this Studio.");
    return needProject().exportGame(runtime, zip === true);
  },
  "preview.start": () => {
    // (Re)start: a successful build starts the preview (see `built` in openProject).
    const p = needProject();
    preview?.stop();
    p.build();
  },
  "preview.stop": () => preview?.stop(),
  "preview.command": (command) => {
    const c = command as { cmd?: unknown };
    const allowed = ["reload", "warp", "restart", "next_menu", "advance", "lang", "screen"];
    if (!c || typeof c.cmd !== "string" || !allowed.includes(c.cmd)) throw new Error("unknown preview command");
    if (c.cmd === "warp" && project && !preview?.running) {
      preview?.start(project.root, previewOptions(str((c as { to?: unknown }).to, "to")));
      return;
    }
    if (c.cmd === "lang") previewLang = str((c as { lang?: unknown }).lang, "lang");
    if (c.cmd === "screen" && !/^[a-z]{2,16}$/.test(str((c as { name?: unknown }).name, "name"))) throw new Error("bad screen name");
    preview?.send(command as Parameters<Preview["send"]>[0]);
  },
  "preview.setBounds": (rect) => {
    if (rect === null) return preview?.setBounds(null);
    const r = rect as Record<string, unknown>;
    const n = (k: string) => (typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : 0);
    preview?.setBounds({ x: n("x"), y: n("y"), w: n("w"), h: n("h") });
  },
  "proposals.list": () => proposals.list(),
  "proposals.decide": (id, decision) => proposals.decide(str(id, "id"), decision),
  "mcp.status": () => mcp.status(),
  "mcp.writeClaudeCodeConfig": () => mcp.writeClaudeCodeConfig(),
  "assistant.keyStatus": () => assistant.keyStatus(),
  "assistant.setKey": (key) => assistant.setKey(key === null ? null : str(key, "key")),
  "assistant.send": (request) => assistant.send(request),
  "assistant.cancel": () => assistant.cancel(),
  "assistant.reset": () => assistant.reset(),
};

/** Files the user picked in an Open dialog this session (the only outside files Studio reads). */
const pickedFiles = new Set<string>();

/** Our own pages: app://studio/… (a custom scheme's URL.origin is "null", so compare scheme and host), or the dev server. */
function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "app:" && u.host === "studio") return true;
    return DEV_URL !== undefined && u.origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

function trustedSender(frame: Electron.WebFrameMain | null): boolean {
  return frame !== null && isAppUrl(frame.url);
}

ipcMain.handle(CHANNELS.invoke, async (event, method: unknown, args: unknown) => {
  if (!trustedSender(event.senderFrame)) throw new Error("untrusted sender");
  const handler = typeof method === "string" ? handlers[method as MethodName] : undefined;
  if (!handler || !Array.isArray(args)) throw new Error("unknown method");
  return handler(...args);
});

/** Follows Settings → Appearance: native menus, scrollbars, and prefers-color-scheme use the same theme as Studio. */
function applyAppearance(): void {
  nativeTheme.themeSource = getSettings().appearance;
  win?.setBackgroundColor(windowBackground());
}

/** The window's color before the page paints (no white or black flash): the theme's --bg. */
function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? "#1e1d23" : "#ffffff";
}

function createWindow(): void {
  applyAppearance();
  win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: windowBackground(),
    title: "Himawari Studio",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const hwnd = win.getNativeWindowHandle();
  preview = new Preview(resources().runtime, hwnd.length >= 8 ? hwnd.readBigUInt64LE(0) : BigInt(hwnd.readUInt32LE(0)), emitPreview);
  // Automated runs open without taking focus from whatever the user is doing.
  win.once("ready-to-show", () => (TEST_HOME ? win?.showInactive() : win?.show()));
  win.on("closed", () => {
    void closeProject();
    win = null;
  });
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadURL(`${APP_ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const renderer = rendererDir();
  protocol.handle("app", (req) => serveFrom(renderer, new URL(req.url).pathname, { "content-security-policy": CSP }));
  protocol.handle("himawari-asset", (req) => {
    if (!project) return new Response("no project", { status: 404 });
    return serveFrom(join(project.root, "assets"), new URL(req.url).pathname, { "cache-control": "no-store" });
  });
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
  if (DEV_URL) {
    // The Vite dev server needs inline scripts (React refresh) and a websocket.
    const devCsp = CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*");
    s.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [devCsp] } });
    });
  }
  createWindow();
});

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on("window-all-closed", () => app.quit());

