/**
 * The typed bridge between Studio's renderer and its main process (plan §11.1:
 * contextIsolation, sandbox, a typed preload bridge). The renderer never
 * touches the file system, processes, or keys; it asks main through this
 * interface, and main validates every argument.
 */

export type UiLanguage = "en" | "ja" | "en-XA";

export interface Settings {
  /** Studio's UI language (§11.5). "en-XA" is the pseudo-locale, offered in development builds. */
  language: UiLanguage;
  recentProjects: string[];
  /** The coach mark on the first project ("Type a line. Watch it appear.") was dismissed. */
  coachDone: boolean;
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
}

/** A text file of the project, project-relative with forward slashes. */
export interface ProjectFile {
  file: string;
  text: string;
}

export interface ProjectSnapshot {
  root: string;
  /** himawari.json, script/**\/*.hws, characters/*.md, locales/*.json, AGENTS.md. */
  files: ProjectFile[];
  /** Everything under assets/, relative to assets/. */
  assets: string[];
}

export type BundledProject = "tutorial" | "festival-eve" | "layered";

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
  files?: number;
}

/** Events from the docked runtime (spec/debug-protocol.md). */
export type PreviewEvent =
  | { ev: "ready"; protocol: number; docked: boolean; gpu: boolean }
  | { ev: "state"; screen: string; line: string | null; waiting: boolean; choice: boolean; error?: string }
  | { ev: "reloaded"; result: string; message: string }
  | { ev: "warp"; ok: boolean; to: string; message?: string }
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
  | { cmd: "lang"; lang: string };

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
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  dialog: {
    pickFolder(): Promise<string | null>;
    pickFile(kind: "psd" | "ora" | "image" | "audio" | "translation"): Promise<string | null>;
  };
  project: {
    create(options: NewProjectOptions): Promise<ProjectSnapshot>;
    open(root: string): Promise<ProjectSnapshot>;
    /** A project bundled with Studio (the tutorial or a sample), copied to Documents\Himawari so the user owns it. */
    openBundled(name: BundledProject): Promise<ProjectSnapshot>;
    close(): Promise<void>;
    /** Writes a text file (autosave). Returns the content hash on disk. */
    write(file: string, text: string): Promise<void>;
    remove(file: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    writeAsset(file: string, bytes: Uint8Array): Promise<void>;
    readExternal(path: string): Promise<Uint8Array>;
    /** Compiles to build/game.hwb (and reloads the preview). */
    build(): Promise<BuildReport>;
    /** Packages build/windows/<Game>/ (plan §14.4). */
    exportGame(zip: boolean): Promise<BuildReport>;
    /** Files changed outside the renderer: on disk (another program), or by an accepted AI proposal (`origin`). `assets` is null when unchanged. */
    onChanged(listener: (changes: FileChange[], assets: string[] | null, origin?: ChangeOrigin) => void): () => void;
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
}

/** IPC channel names: one place, so main and preload can't drift apart. */
export const CHANNELS = {
  invoke: "himawari:invoke",
  projectChanged: "himawari:project-changed",
  previewEvent: "himawari:preview-event",
  proposalsChanged: "himawari:proposals-changed",
  assistantEvent: "himawari:assistant-event",
} as const;

/** "project.write" style method names, for the single invoke channel. */
export type MethodName = {
  [G in keyof StudioApi]: `${G & string}.${Exclude<keyof StudioApi[G], `on${string}`> & string}`;
}[keyof StudioApi];
