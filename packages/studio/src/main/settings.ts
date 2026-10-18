/** Studio settings in %APPDATA%/Himawari Studio/settings.json (no secrets here: the API key uses safeStorage). */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { Settings, UiLanguage } from "../shared/api.js";

const LANGUAGES: readonly UiLanguage[] = ["en", "ja", "en-XA"];

function defaults(): Settings {
  // English is the default (§11.5); a Japanese Windows starts in Japanese.
  const ui: UiLanguage = app.getLocale().toLowerCase().startsWith("ja") ? "ja" : "en";
  return {
    language: ui,
    recentProjects: [],
    coachDone: false,
    ai: { model: "claude-opus-5-5", replyLanguage: "", autoAccept: {}, effort: "high" },
  };
}

const file = () => join(app.getPath("userData"), "settings.json");

let current: Settings | null = null;

/** Keeps only known fields with the right types, so a hand-edited file can't break Studio. */
function sanitize(raw: unknown): Settings {
  const d = defaults();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const ai = (r["ai"] && typeof r["ai"] === "object" ? r["ai"] : {}) as Record<string, unknown>;
  const auto = ai["autoAccept"] && typeof ai["autoAccept"] === "object" ? (ai["autoAccept"] as Record<string, unknown>) : {};
  return {
    language: LANGUAGES.includes(r["language"] as UiLanguage) ? (r["language"] as UiLanguage) : d.language,
    recentProjects: Array.isArray(r["recentProjects"]) ? r["recentProjects"].filter((p): p is string => typeof p === "string").slice(0, 10) : [],
    coachDone: r["coachDone"] === true,
    ai: {
      model: typeof ai["model"] === "string" && ai["model"] ? ai["model"] : d.ai.model,
      replyLanguage: typeof ai["replyLanguage"] === "string" ? ai["replyLanguage"] : "",
      autoAccept: Object.fromEntries(Object.entries(auto).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>,
      effort: ai["effort"] === "low" ? "low" : "high",
    },
  };
}

export function getSettings(): Settings {
  if (!current) {
    try {
      current = sanitize(JSON.parse(readFileSync(file(), "utf8")));
    } catch {
      current = defaults();
    }
  }
  return current;
}

export function setSettings(patch: Partial<Settings>): Settings {
  current = sanitize({ ...getSettings(), ...patch });
  const path = file();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(current, null, 2));
  renameSync(`${path}.tmp`, path);
  return current;
}

export function addRecent(root: string): void {
  const s = getSettings();
  setSettings({ recentProjects: [root, ...s.recentProjects.filter((p) => p.toLowerCase() !== root.toLowerCase())].slice(0, 10) });
}
