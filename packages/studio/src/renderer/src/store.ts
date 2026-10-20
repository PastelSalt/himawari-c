/**
 * Studio's state (Zustand). The project's text lives here while it is open;
 * every change goes through `edit`, which autosaves (P1: no Save button),
 * gives new script lines their hidden line IDs, re-checks the project with
 * Core, and records the change in the unified history (P9).
 */
import { addLineIds, aiHelpAllowed, applyTranslations, collectLines, parseTable, stringifyTable, syncTable } from "@himawari/core";
import { create } from "zustand";
import type { AppInfo, AssistantEvent, AssistantUsage, FileChange, ImageSizes, PreviewEvent, ProjectSnapshot, Proposal, Settings, TranslateEvent } from "../../shared/api";
import { studio } from "./api";
import { type ProjectModel, buildModel, isScript } from "./model";
import { applyPatch } from "../../shared/patch";

export type Tool = "characters" | "assets" | "variables" | "localization" | "graph" | "designer" | "build" | "settings";
export type Center = { kind: "file"; file: string } | { kind: "tool"; tool: Tool; arg?: string } | null;
export type BottomTab = "problems" | "notes" | "proposals" | "output" | "history";
export type Source = "you" | "ai" | "refactor" | "outside" | "fix";

export interface HistoryEntry {
  id: number;
  time: number;
  source: Source;
  /** A message id and values (rendered in the UI language). */
  label: { id: string; values?: Record<string, string> };
  changes: { file: string; before: string | null; after: string | null }[];
  undone: boolean;
  /** Typing in one file keeps extending the same entry for a few seconds. */
  typing?: boolean;
}

export interface PreviewState {
  ready: boolean;
  docked: boolean;
  screen: string;
  line: string | null;
  waiting: boolean;
  choice: boolean;
  error: string | null;
  built: { ok: boolean; errors: string; ms: number } | null;
  unavailable: string | null;
  /** The last reload's outcome ("remapped", "fallback", …) for the status line. */
  reloaded: string | null;
  /** How many times the game reloaded, and when last (e2e checks the edit → preview budget, P1). */
  reloads: number;
  reloadedAt: number;
  /** Labels the game reported as too long for their buttons (the UI Designer lists them). */
  overflows: { text: string; lang: string }[];
}

export type ChatItem =
  | { kind: "user"; turn: string; text: string }
  | { kind: "assistant"; turn: string; text: string }
  | { kind: "tool"; turn: string; name: string; summary: string }
  | { kind: "thinking"; turn: string }
  | { kind: "error"; turn: string; message: string }
  | { kind: "refusal"; turn: string };

export interface ChatState {
  items: ChatItem[];
  running: string | null;
  /** Usage of the last answer and of the whole session (the cost meter, §10.9). */
  last: AssistantUsage | null;
  session: AssistantUsage;
  /** Text waiting in the input (e.g. from "Ask AI about this selection"). */
  draft: string;
  selection: { file: string; text: string } | null;
}

/** "Translate with AI" (Localization): the run in progress, or how the last one went. */
export interface TranslationRun {
  job: string | null;
  lang: string;
  done: number;
  total: number;
  cost: number;
  /** Lines written so far, and lines whose markup broke (left untranslated). */
  written: number;
  refused: number;
  finished: { missed: number; refusals: number; cancelled: boolean } | null;
  error: string | null;
}

/** False when the open project turned AI help off (himawari.json "aiHelp": false). */
export const selectAiAllowed = (s: { files: Record<string, string> }) => aiHelpAllowed(s.files["himawari.json"]);

const NO_USAGE: AssistantUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0 };

export interface OutputLine {
  time: number;
  /** A message id and values. */
  id: string;
  values?: Record<string, string>;
  level: "info" | "error";
}

interface State {
  info: AppInfo | null;
  settings: Settings | null;
  root: string | null;
  files: Record<string, string>;
  assets: string[];
  model: ProjectModel | null;
  center: Center;
  view: "screenplay" | "script";
  bottom: BottomTab;
  bottomOpen: boolean;
  /** Where the editor should put the cursor next (go to line, problems, search). */
  reveal: { file: string; offset: number; seq: number } | null;
  preview: PreviewState;
  /** Dialogs open over the preview pane (the docked game hides while any is open). */
  overlays: number;
  history: HistoryEntry[];
  proposals: Proposal[];
  output: OutputLine[];
  searchOpen: boolean;
  chat: ChatState;
  translation: TranslationRun | null;
  /** A save refused because the file changed outside Studio: the writer's text and the disk's. */
  conflict: { file: string; mine: string; theirs: string } | null;
  /** Keep the writer's version (write it over the disk's) or the disk's (take it into Studio). */
  resolveConflict(keep: "mine" | "theirs"): void;
  /** A short notice with Undo, after an action that's done at once instead of asked about (F7). */
  notice: { label: HistoryEntry["label"]; undo: number | null; seq: number } | null;
  /** Shows a notice; `undoLast` offers Undo for the change just made. */
  notify(label: HistoryEntry["label"], undoLast?: boolean): void;
  /** The open project needs a newer Himawari ("^2.0.0"): saving here may lose what this Studio doesn't know (S-12). */
  newerEngine: string | null;
  /** Background and CG sizes, for the image hints (W-10). */
  imageSizes: ImageSizes;
  /** The Script view's selection, for "ask about selection". */
  selection: { file: string; text: string } | null;

  init(): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<void>;
  openSnapshot(s: ProjectSnapshot): void;
  closeProject(): Promise<void>;
  edit(file: string, text: string | null, source?: Source, label?: HistoryEntry["label"]): void;
  editMany(changes: FileChange[], source: Source, label: HistoryEntry["label"]): void;
  undoEntry(id: number): { ok: boolean; file?: string };
  open(center: Center): void;
  revealAt(file: string, offset: number): void;
  setView(view: State["view"]): void;
  setBottom(tab: BottomTab | null): void;
  pushOverlay(): void;
  popOverlay(): void;
  log(id: string, values?: Record<string, string>, level?: OutputLine["level"]): void;
  setSearch(open: boolean): void;
  setSelection(sel: { file: string; text: string } | null): void;
  askAssistant(text: string, context: { openFile?: string; selection?: string; mentions: string[] }): Promise<void>;
  setDraft(draft: string): void;
  resetChat(): Promise<void>;
}

const initialPreview: PreviewState = {
  ready: false,
  docked: false,
  screen: "",
  line: null,
  waiting: false,
  choice: false,
  error: null,
  built: null,
  unavailable: null,
  reloaded: null,
  reloads: 0,
  reloadedAt: 0,
  overflows: [],
};

let modelTimer: ReturnType<typeof setTimeout> | null = null;
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let nextHistory = 1;
let revealSeq = 0;

/** Line IDs used anywhere in the project's scripts, so new ones don't collide. */
function takenIds(files: Record<string, string>): Set<string> {
  const taken = new Set<string>();
  for (const [f, t] of Object.entries(files)) {
    if (!isScript(f)) continue;
    for (const m of t.matchAll(/#line:([0-9a-hjkmnp-tv-z]{6})/g)) taken.add(m[1]!);
  }
  return taken;
}

export const useStudio = create<State>((set, get) => {
  const recompute = (delay = 120) => {
    if (modelTimer) clearTimeout(modelTimer);
    modelTimer = setTimeout(() => {
      modelTimer = null;
      const { files, assets, imageSizes, root } = get();
      if (root) set({ model: buildModel(files, assets, imageSizes) });
    }, delay);
  };

  /** Autosave a file shortly after the last change. Scripts get line IDs for new lines first. */
  const scheduleSave = (file: string) => {
    const t = saveTimers.get(file);
    if (t) clearTimeout(t);
    saveTimers.set(
      file,
      setTimeout(() => {
        saveTimers.delete(file);
        let text = get().files[file];
        if (text === undefined) return;
        if (isScript(file)) {
          const r = addLineIds(text, { start: 0, end: text.length }, takenIds(get().files));
          if (r.added.length > 0) {
            text = r.text;
            set((s) => ({ files: { ...s.files, [file]: r.text } }));
            recompute(0);
          }
        }
        const mine = text;
        studio.project
          .write(file, mine)
          .then((r) => {
            // The file changed outside Studio meanwhile: nothing was written; the writer chooses (FINALIZATION.md S-6).
            if (!r.ok) set({ conflict: { file, mine, theirs: r.conflict } });
          })
          .catch((e: unknown) => get().log("output.saveFailed", { file, reason: friendlyError(e) }, "error"));
      }, 250),
    );
  };

  /** "ENOSPC: no space left on device" → words (S-10). */
  const friendlyError = (e: unknown) => {
    const m = String(e);
    if (/ENOSPC/.test(m)) return "the drive is full";
    if (/EPERM|EACCES|EROFS/.test(m)) return "the file is read-only or locked by another program";
    return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  };

  const record = (source: Source, label: HistoryEntry["label"], changes: HistoryEntry["changes"], typing = false) => {
    const h = get().history;
    const last = h[h.length - 1];
    const one = changes.length === 1 ? changes[0]! : null;
    if (typing && one && last?.typing && !last.undone && last.changes.length === 1 && last.changes[0]!.file === one.file && Date.now() - last.time < 4000) {
      const merged: HistoryEntry = { ...last, time: Date.now(), changes: [{ ...last.changes[0]!, after: one.after }] };
      set({ history: [...h.slice(0, -1), merged] });
      return;
    }
    const entry: HistoryEntry = { id: nextHistory++, time: Date.now(), source, label, changes, undone: false, ...(typing ? { typing } : {}) };
    set({ history: [...h, entry].slice(-200) });
  };

  return {
    info: null,
    settings: null,
    root: null,
    files: {},
    assets: [],
    model: null,
    center: null,
    view: "screenplay",
    bottom: "problems",
    bottomOpen: true,
    reveal: null,
    preview: initialPreview,
    overlays: 0,
    history: [],
    proposals: [],
    output: [],
    searchOpen: false,
    chat: { items: [], running: null, last: null, session: NO_USAGE, draft: "", selection: null },
    translation: null,
    conflict: null,
    newerEngine: null,
    imageSizes: {},
    notice: null,

    notify(label, undoLast = false) {
      const last = get().history[get().history.length - 1];
      set({ notice: { label, undo: undoLast && last ? last.id : null, seq: Date.now() } });
    },

    resolveConflict(keep) {
      const c = get().conflict;
      if (!c) return;
      set({ conflict: null });
      if (keep === "mine") {
        const now = get().files[c.file] ?? c.mine;
        void studio.project.write(c.file, now, true);
      } else {
        get().edit(c.file, c.theirs, "outside", { id: "history.outside", values: { files: c.file } });
        void studio.project.write(c.file, c.theirs, true);
      }
    },
    selection: null,

    async init() {
      const [info, settings] = await Promise.all([studio.app.info(), studio.settings.get()]);
      set({ info, settings, view: settings.advanced.scriptFirst ? "script" : "screenplay" });
      // Development builds expose the store to end-to-end tests.
      if (info.dev) (window as unknown as { __studio: typeof useStudio }).__studio = useStudio;
      studio.project.onImageSizes((imageSizes) => {
        if (!get().root) return;
        set({ imageSizes });
        recompute();
      });
      studio.project.onChanged((changes, assets, origin) => {
        if (!get().root) return;
        const files = { ...get().files };
        const recorded: HistoryEntry["changes"] = [];
        for (const c of changes) {
          if ((files[c.file] ?? null) === c.text) continue;
          recorded.push({ file: c.file, before: files[c.file] ?? null, after: c.text });
          if (c.text === null) delete files[c.file];
          else files[c.file] = c.text;
        }
        set(assets ? { files, assets } : { files });
        if (recorded.length > 0) {
          if (origin) record("ai", { id: "history.aiChange", values: { tool: origin.tool, rationale: origin.rationale } }, recorded);
          else record("outside", { id: "history.outside", values: { files: recorded.map((r) => r.file).join(", ") } }, recorded);
        }
        recompute(0);
      });
      studio.preview.onEvent((e: PreviewEvent) => {
        const p = get().preview;
        switch (e.ev) {
          case "ready":
            set({ preview: { ...p, ready: true, docked: e.docked, unavailable: null } });
            break;
          case "state":
            set({ preview: { ...p, screen: e.screen, line: e.line, waiting: e.waiting, choice: e.choice, error: e.error ?? null } });
            break;
          case "reloaded":
            set({ preview: { ...p, reloaded: e.result, reloads: p.reloads + 1, reloadedAt: performance.now() } });
            if (e.result === "failed") get().log("output.reloadFailed", { reason: e.message }, "error");
            break;
          case "built":
            set({ preview: { ...p, built: { ok: e.ok, errors: e.errors, ms: e.ms } } });
            break;
          case "warp":
            if (!e.ok) get().log("output.warpFailed", { to: e.to }, "error");
            break;
          case "overflow":
            if (!p.overflows.some((o) => o.text === e.text && o.lang === e.lang)) set({ preview: { ...p, overflows: [...p.overflows, { text: e.text, lang: e.lang }].slice(-50) } });
            break;
          case "exited":
            set({ preview: { ...initialPreview, built: p.built } });
            if (e.code !== 0) get().log("output.previewExited", { code: String(e.code) }, "error");
            break;
          case "unavailable":
            set({ preview: { ...p, ready: false, unavailable: e.reason } });
            break;
        }
      });
      studio.assistant.onEvent((e: AssistantEvent) => {
        const c = get().chat;
        const items = [...c.items];
        const lastItem = items[items.length - 1];
        switch (e.kind) {
          case "text":
            if (lastItem?.kind === "assistant" && lastItem.turn === e.turn) items[items.length - 1] = { ...lastItem, text: lastItem.text + e.text };
            else items.push({ kind: "assistant", turn: e.turn, text: e.text });
            break;
          case "thinking":
            if (!(lastItem?.kind === "thinking" && lastItem.turn === e.turn)) items.push({ kind: "thinking", turn: e.turn });
            break;
          case "tool":
            items.push({ kind: "tool", turn: e.turn, name: e.name, summary: e.summary });
            break;
          case "usage": {
            const s2 = c.session;
            const u = e.usage;
            set({
              chat: {
                ...c,
                last: u,
                session: {
                  inputTokens: s2.inputTokens + u.inputTokens,
                  outputTokens: s2.outputTokens + u.outputTokens,
                  cacheReadTokens: s2.cacheReadTokens + u.cacheReadTokens,
                  cacheWriteTokens: s2.cacheWriteTokens + u.cacheWriteTokens,
                  cost: s2.cost + u.cost,
                },
              },
            });
            return;
          }
          case "error":
            items.push({ kind: "error", turn: e.turn, message: e.message });
            break;
          case "proposal":
            break;
          case "done":
            if (e.stop === "refusal") items.push({ kind: "refusal", turn: e.turn });
            set({ chat: { ...c, items: items.filter((i) => !(i.kind === "thinking" && i.turn === e.turn)), running: null } });
            return;
        }
        set({ chat: { ...c, items } });
      });
      studio.translate.onEvent((e: TranslateEvent) => {
        const t = get().translation;
        if (!t || t.job !== e.job) return;
        switch (e.kind) {
          case "progress":
            set({ translation: { ...t, done: e.done, total: e.total } });
            break;
          case "batch": {
            // Applied to the table as it is now (the writer may have edited meanwhile): one undo step per batch.
            const s = get();
            const m = s.model?.check.manifest;
            const file = `locales/${e.lang}.json`;
            if (!m || !s.model) break;
            let existing = null;
            try {
              existing = s.files[file] ? parseTable(s.files[file]) : null;
            } catch {
              // A broken table: Problems shows it, and nothing is written over it.
              set({ translation: { ...t, cost: e.cost, refused: t.refused + e.translations.length } });
              break;
            }
            const table = syncTable(existing, collectLines(s.model.check.parsed), e.lang, m.sourceLanguage).table;
            const r = applyTranslations(table, new Map(e.translations.map((x) => [x.id, x.text])), "ai");
            if (r.updated > 0) s.edit(file, stringifyTable(r.table), "ai", { id: "history.aiTranslated", values: { lang: e.lang, count: String(r.updated) } });
            set({ translation: { ...get().translation!, cost: e.cost, written: t.written + r.updated, refused: t.refused + r.refused.length } });
            break;
          }
          case "done":
            set({ translation: { ...t, job: null, cost: e.cost, finished: { missed: e.missed, refusals: e.refusals, cancelled: e.cancelled } } });
            break;
          case "error":
            set({ translation: { ...t, job: null, error: e.message } });
            break;
        }
      });
      studio.proposals.onChanged((proposals) => {
        // A new proposal brings the AI Proposals tab forward (P12: the AI's changes wait for you there).
        const known = new Set(get().proposals.map((p) => p.id));
        if (proposals.some((p) => !known.has(p.id))) set({ bottom: "proposals", bottomOpen: true });
        set({ proposals });
      });
    },

    async setSettings(patch) {
      set({ settings: await studio.settings.set(patch) });
    },

    openSnapshot(s) {
      const files: Record<string, string> = {};
      for (const f of s.files) files[f.file] = f.text;
      const first = Object.keys(files).filter(isScript).sort()[0];
      set({
        root: s.root,
        files,
        assets: s.assets,
        // Checked right after the workspace first paints: a big project takes most of a second to check.
        model: null,
        center: first ? { kind: "file", file: first } : null,
        history: [],
        proposals: [],
        output: [],
        preview: initialPreview,
        newerEngine: s.newerEngine ?? null,
        imageSizes: s.imageSizes,
        conflict: null,
      });
      void studio.proposals.list().then((proposals) => set({ proposals }));
      void studio.preview.start();
      requestAnimationFrame(() => requestAnimationFrame(() => recompute(0)));
    },

    async closeProject() {
      await studio.project.close();
      set({
        root: null,
        files: {},
        assets: [],
        imageSizes: {},
        model: null,
        center: null,
        history: [],
        preview: initialPreview,
        selection: null,
        chat: { items: [], running: null, last: null, session: NO_USAGE, draft: "", selection: null },
        translation: null,
      });
    },

    edit(file, text, source = "you", label) {
      const before = get().files[file] ?? null;
      if (before === text) return;
      const files = { ...get().files };
      if (text === null) delete files[file];
      else files[file] = text;
      set({ files });
      record(source, label ?? { id: "history.edited", values: { file } }, [{ file, before, after: text }], source === "you" && !label);
      if (text === null) void studio.project.remove(file);
      else scheduleSave(file);
      recompute();
    },

    editMany(changes, source, label) {
      if (changes.length === 0) return;
      // A wide change (a rename across files, an import): keep a restore point first (S-8).
      if (changes.length >= 3) void studio.project.restorePoint(JSON.stringify(label));
      const files = { ...get().files };
      const recorded = changes.map((c) => ({ file: c.file, before: files[c.file] ?? null, after: c.text }));
      for (const c of changes) {
        if (c.text === null) delete files[c.file];
        else files[c.file] = c.text;
      }
      set({ files });
      record(source, label, recorded);
      for (const c of changes) {
        if (c.text === null) void studio.project.remove(c.file);
        else scheduleSave(c.file);
      }
      recompute(0);
    },

    undoEntry(id) {
      const entry = get().history.find((h) => h.id === id);
      if (!entry || entry.undone) return { ok: false };
      // Selective undo: reverse this entry's changes on top of whatever came after (P9).
      const next: FileChange[] = [];
      for (const c of entry.changes) {
        const current = get().files[c.file] ?? null;
        if (current === c.after) {
          next.push({ file: c.file, text: c.before });
          continue;
        }
        if (current === null || c.after === null || c.before === null) return { ok: false, file: c.file };
        const patched = applyPatch(c.after, c.before, current);
        if (patched === null) return { ok: false, file: c.file };
        next.push({ file: c.file, text: patched });
      }
      set({ history: get().history.map((h) => (h.id === id ? { ...h, undone: true } : h)) });
      get().editMany(next, "you", { id: "history.undid", values: { what: entry.label.values?.["file"] ?? "" } });
      return { ok: true };
    },

    open(center) {
      set({ center });
    },

    revealAt(file, offset) {
      set({ center: { kind: "file", file }, reveal: { file, offset, seq: ++revealSeq } });
    },

    setView(view) {
      set({ view });
    },

    setBottom(tab) {
      if (tab === null) set({ bottomOpen: false });
      else set({ bottom: tab, bottomOpen: true });
    },

    pushOverlay() {
      set((s) => ({ overlays: s.overlays + 1 }));
    },

    popOverlay() {
      set((s) => ({ overlays: Math.max(0, s.overlays - 1) }));
    },

    log(id, values, level = "info") {
      set((s) => ({ output: [...s.output, { time: Date.now(), id, ...(values ? { values } : {}), level }].slice(-300) }));
    },

    setSearch(open) {
      set({ searchOpen: open });
    },

    setSelection(sel) {
      set({ selection: sel });
    },

    async askAssistant(text, context) {
      const c = get().chat;
      try {
        const turn = await studio.assistant.send({ text, context });
        set({ chat: { ...c, draft: "", running: turn, items: [...c.items, { kind: "user", turn, text }] } });
      } catch (e) {
        const message = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e);
        set({ chat: { ...c, items: [...c.items, { kind: "error", turn: "", message }] } });
      }
    },

    setDraft(draft) {
      set({ chat: { ...get().chat, draft } });
    },

    async resetChat() {
      await studio.assistant.reset();
      set({ chat: { items: [], running: null, last: null, session: NO_USAGE, draft: "", selection: null } });
    },
  };
});
