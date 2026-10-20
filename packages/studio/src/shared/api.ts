/**
 * The typed bridge between Studio's renderer and its main process (plan §11.1:
 * contextIsolation, sandbox, a typed preload bridge). The renderer never
 * touches the file system, processes, or keys; it asks main through this
 * interface, and main validates every argument.
 */

export type UiLanguage = "en" | "ja" | "en-XA";

/** Studio's color theme: light (the default), dark, or whatever Windows uses. */
export type Appearance = "light" | "dark" | "system";

export interface Settings {
  /** Studio's UI language (§11.5). "en-XA" is the pseudo-locale, offered in development builds. */
  language: UiLanguage;
  appearance: Appearance;
  recentProjects: string[];
  /** The coach mark on the first project ("Type a line. Watch it appear.") was dismissed. */
  coachDone: boolean;
  /** The assistant panel is open (it starts closed: AI is present but quiet, FINALIZATION.md AI-1). */
  assistantOpen: boolean;
  /** The folder the last new project went into (the wizard starts there). */
  lastProjectFolder: string;
  /** For people who code (FINALIZATION.md C-7): open scripts in the Script view, and list project files (himawari.json, theme, extensions) in the Explorer. */
  advanced: { scriptFirst: boolean; showProjectFiles: boolean };
  /** Export's last choices (FINALIZATION.md OC-5): a zip, and one file instead of a folder (OC-6). */
  exportAs: { zip: boolean; singleFile: boolean };
  /** AI assistant preferences (layer 3 of the agent instructions, §10.8). */
  ai: {
    model: string;
    /** Reply language; empty = the UI language. */
    replyLanguage: string;
    /** Per-tool auto-accept (§11.4), e.g. { set_translation: true }. */
    autoAccept: Record<string, boolean>;
    /** Quality (high effort) or speed (low effort) (§10.9). */
    effort: "high" | "low";
  };
}

export interface AppInfo {
  version: string;
  /** Development build: shows the pseudo-locale and other dev tools. */
  dev: boolean;
  runtimeFound: boolean;
  templates: string[];
  /** Bundled projects available to open (the tutorial and samples). */
  bundled: BundledProject[];
  /** Studio didn't close normally last time (a crash or power loss): the Welcome screen says what was kept (S-4). */
  lastExitUnexpected: boolean;
  /** The folder of Studio's standalone tools (hwc, himawari-mcp), when installed; null in a checkout. */
  toolsDir: string | null;
  /** Where new projects go unless the user picks another folder: Documents\\Himawari (FINALIZATION.md D-1). */
  defaultProjectsDir: string;
}

/** A text file of the project, project-relative with forward slashes. */
export interface ProjectFile {
  file: string;
  text: string;
}

/** Image sizes by path under assets/: [width, height]. */
export type ImageSizes = Record<string, [number, number]>;

export interface ProjectSnapshot {
  root: string;
  /** himawari.json, script/**\/*.hws, characters/*.md, locales/*.json, extensions/*.schema.json, theme/theme.json, glossary.json, .himawari/notes.json, AGENTS.md. */
  files: ProjectFile[];
  /** Everything under assets/, relative to assets/. */
  assets: string[];
  /** Background and CG sizes by asset path, for the image hints (FINALIZATION.md W-10). */
  imageSizes: ImageSizes;
  /** The project needs a newer Himawari than this Studio (its "engine" range), e.g. "^2.0.0" (FINALIZATION.md S-12). */
  newerEngine?: string;
}

/** A save: written, or refused because the file changed outside Studio meanwhile (its text on disk). */
export type WriteResult = { ok: true } | { ok: false; conflict: string };

/** An earlier version of a file, from the local history (FINALIZATION.md S-2). */
export interface FileVersion {
  at: number;
  reason: "edit" | "delete" | "outside";
  size: number;
}

export interface RestorePointInfo {
  id: string;
  at: number;
  label: string;
  files: number;
}

export type BundledProject = "tutorial" | "sunflower-demo" | "festival-eve" | "layered";

export interface NewProjectOptions {
  /** The parent folder; the project gets its own folder inside it. */
  parent: string;
  name: string;
  template: string;
  sourceLanguage: string;
  targetLanguages: string[];
}

/** A change on disk that Studio didn't make itself (another editor, git, an AI client writing directly). */
export interface FileChange {
  file: string;
  /** null = deleted. */
  text: string | null;
}

/** Who made a change Studio didn't type itself. */
export interface ChangeOrigin {
  source: "ai";
  tool: string;
  rationale: string;
}

export interface BuildReport {
  ok: boolean;
  /** Plain-language errors when it didn't compile. */
  errors: string;
  /** For packaging: the folder written, project-relative. */
  dir?: string;
  exe?: string;
  /** The zip, when one was asked for. */
  zip?: string;
  /** The game is the exe alone (its data inside). */
  singleFile?: boolean;
  files?: number;
  /** Worth saying, didn't stop the export (an icon that couldn't be used). */
  warnings?: string[];
}

/** Events from the docked runtime (spec/debug-protocol.md). */
export type PreviewEvent =
  | { ev: "ready"; protocol: number; docked: boolean; gpu: boolean }
  | { ev: "state"; screen: string; line: string | null; waiting: boolean; choice: boolean; error?: string }
  | { ev: "reloaded"; result: string; message: string }
  | { ev: "warp"; ok: boolean; to: string; message?: string }
  /** A button label that doesn't fit (development; the UI Designer lists them). */
  | { ev: "overflow"; text: string; lang: string }
  | { ev: "exited"; code: number | null }
  /** Studio rebuilt build/game.hwb after a save (not from the runtime). */
  | { ev: "built"; ok: boolean; errors: string; ms: number }
  | { ev: "unavailable"; reason: string };

export type PreviewCommand =
  | { cmd: "reload" }
  | { cmd: "warp"; to: string }
  | { cmd: "restart" }
  | { cmd: "next_menu" }
  | { cmd: "advance" }
  | { cmd: "lang"; lang: string }
  /** Shows a built-in screen (the UI Designer): title, play, menu, load, history, config, controls, accessibility, extras, gallery, music. */
  | { cmd: "screen"; name: string };

/** A headless playtest's result, as the story graph shows it. */
export interface PlaytestSummary {
  ok: boolean;
  /** Every menu and option was tried. */
  covered: boolean;
  endings: { reached: string[]; unreached: string[] };
  /** Line IDs no path showed. */
  unseen: string[];
  lines: { seen: number; total: number };
  options: { chosen: number; total: number };
  errors: string[];
  ms: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A proposed change from an AI (§11.4): validated, waiting for a human decision. */
export interface Proposal {
  id: string;
  /** Which AI: "Claude Code" (Mode A, through MCP) or "assistant" (Mode B). */
  source: string;
  tool: string;
  rationale: string;
  /** File changes: new text, or null to delete. */
  changes: FileChange[];
  /** The text before, for the diff. null = the file is new. */
  before: Record<string, string | null>;
  /** Diagnostics the change brings (errors refuse it before it gets here, so these are warnings). */
  diagnostics: { file: string; code: string; severity: string; message: string; line: number }[];
  created: number;
}

export type ProposalDecision = { accept: true } | { accept: false; reason: string };

export interface AssistantKeyStatus {
  /** A key is stored (the key itself never reaches the renderer). */
  hasKey: boolean;
  /** safeStorage can encrypt on this machine. */
  canStore: boolean;
}

export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** In US dollars, from published per-token prices. */
  cost: number;
}

export type AssistantEvent =
  | { kind: "text"; turn: string; text: string }
  | { kind: "thinking"; turn: string }
  | { kind: "tool"; turn: string; name: string; summary: string }
  | { kind: "proposal"; turn: string; proposal: string }
  | { kind: "usage"; turn: string; usage: AssistantUsage }
  | { kind: "done"; turn: string; stop: string }
  | { kind: "error"; turn: string; message: string };

export interface AssistantRequest {
  text: string;
  /** Live editor context (§10.9): only in the newest user turn. */
  context: { openFile?: string; selection?: string; mentions: string[] };
}

/** "Translate with AI" (Localization): lines to translate into one language. */
export interface TranslateRequest {
  lang: string;
  /** claude-haiku-5-5 (the default) or claude-sonnet-5-5. */
  model: string;
  lines: { id: string; speaker: string; kind: string; text: string }[];
}

export interface TranslateEstimate {
  lines: number;
  model: string;
  /** In US dollars, a rough guess from the text length. */
  cost: number;
  hasKey: boolean;
}

export type TranslateEvent =
  | { kind: "progress"; job: string; done: number; total: number }
  | { kind: "batch"; job: string; lang: string; translations: { id: string; text: string }[]; cost: number }
  | { kind: "done"; job: string; missed: number; refusals: number; cancelled: boolean; cost: number }
  | { kind: "error"; job: string; message: string };

export interface McpStatus {
  /** Studio's own MCP endpoint is listening (Mode A live sync). */
  listening: boolean;
  /** The command that connects Claude Code to this project. */
  claudeCodeCommand: string;
  /** The entry for the Claude desktop app's config file. */
  desktopConfig: string;
}

export interface StudioApi {
  app: {
    info(): Promise<AppInfo>;
    /** Opens an https link in the user's browser. */
    openExternal(url: string): Promise<void>;
    /** Shows a file or folder in Explorer. */
    reveal(path: string): Promise<void>;
    /** Adds the tools folder to the user's PATH so `hwc` works in any terminal (asked for in Settings → Advanced). */
    addToolsToPath(): Promise<boolean>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  dialog: {
    pickFolder(): Promise<string | null>;
    pickFile(kind: "psd" | "ora" | "image" | "audio" | "translation" | "theme"): Promise<string | null>;
    /** Asks where to save a file and writes `text` there (a theme pack). False when cancelled. */
    saveFile(kind: "theme", defaultName: string, text: string): Promise<boolean>;
  };
  project: {
    create(options: NewProjectOptions): Promise<ProjectSnapshot>;
    open(root: string): Promise<ProjectSnapshot>;
    /** A project bundled with Studio (the tutorial or a sample), copied to Documents\Himawari so the user owns it. */
    openBundled(name: BundledProject): Promise<ProjectSnapshot>;
    close(): Promise<void>;
    /** Writes a text file (autosave). Refused (with the disk's text) when the file changed outside Studio meanwhile, unless `force`. */
    write(file: string, text: string, force?: boolean): Promise<WriteResult>;
    /** Earlier versions of a text file, newest first, and one of them. */
    versions(file: string): Promise<FileVersion[]>;
    version(file: string, at: number): Promise<string | null>;
    /** Text files deleted from the project that the history can bring back. */
    deletedFiles(): Promise<{ file: string; at: number }[]>;
    /** Keeps every text file as a restore point before a wide change; the points, and one point's files. */
    restorePoint(label: string): Promise<void>;
    restorePoints(): Promise<RestorePointInfo[]>;
    restorePointFiles(id: string): Promise<Record<string, string> | null>;
    remove(file: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    writeAsset(file: string, bytes: Uint8Array): Promise<void>;
    readExternal(path: string): Promise<Uint8Array>;
    /** Compiles to build/game.hwb (and reloads the preview). */
    build(): Promise<BuildReport>;
    /** Packages build/windows/<Game>/ (plan §14.4). */
    exportGame(zip: boolean, singleFile: boolean): Promise<BuildReport>;
    /** Starts the exported game (project-relative exe), as a player would. */
    playExport(exe: string): Promise<void>;
    /** Plays every path headlessly (the coverage overlay on the story graph). */
    playtest(): Promise<PlaytestSummary>;
    /** Files changed outside the renderer: on disk (another program), or by an accepted AI proposal (`origin`). `assets` is null when unchanged. */
    onChanged(listener: (changes: FileChange[], assets: string[] | null, origin?: ChangeOrigin) => void): () => void;
    /** Background and CG sizes, sent again whenever files under assets/ change. */
    onImageSizes(listener: (sizes: ImageSizes) => void): () => void;
  };
  preview: {
    start(): Promise<void>;
    stop(): Promise<void>;
    command(command: PreviewCommand): Promise<void>;
    /** The preview pane's rectangle in CSS pixels (main converts to device pixels). */
    setBounds(rect: Rect | null): Promise<void>;
    onEvent(listener: (event: PreviewEvent) => void): () => void;
  };
  proposals: {
    list(): Promise<Proposal[]>;
    decide(id: string, decision: ProposalDecision): Promise<void>;
    onChanged(listener: (proposals: Proposal[]) => void): () => void;
  };
  mcp: {
    status(): Promise<McpStatus>;
    /** Writes the project's .mcp.json for Claude Code (after the user confirms). */
    writeClaudeCodeConfig(): Promise<void>;
  };
  assistant: {
    keyStatus(): Promise<AssistantKeyStatus>;
    setKey(key: string | null): Promise<AssistantKeyStatus>;
    send(request: AssistantRequest): Promise<string>;
    cancel(): Promise<void>;
    reset(): Promise<void>;
    onEvent(listener: (event: AssistantEvent) => void): () => void;
  };
  translate: {
    estimate(request: TranslateRequest): Promise<TranslateEstimate>;
    start(request: TranslateRequest): Promise<string>;
    cancel(): Promise<void>;
    onEvent(listener: (event: TranslateEvent) => void): () => void;
  };
}

/** IPC channel names: one place, so main and preload can't drift apart. */
export const CHANNELS = {
  invoke: "himawari:invoke",
  projectChanged: "himawari:project-changed",
  projectImageSizes: "himawari:project-image-sizes",
  previewEvent: "himawari:preview-event",
  proposalsChanged: "himawari:proposals-changed",
  assistantEvent: "himawari:assistant-event",
  translateEvent: "himawari:translate-event",
} as const;

/** "project.write" style method names, for the single invoke channel. */
export type MethodName = {
  [G in keyof StudioApi]: `${G & string}.${Exclude<keyof StudioApi[G], `on${string}`> & string}`;
}[keyof StudioApi];
