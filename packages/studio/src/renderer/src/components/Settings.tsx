import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { AssistantKeyStatus, McpStatus, UiLanguage } from "../../../shared/api";
import { studio } from "../api";
import { LANGUAGE_NAMES } from "../i18n";
import { setAiHelp } from "@himawari/core";
import { CREDITS, type Credit, GameIcon, creditOf, setCredit } from "./Credit";
import { selectAiAllowed, useStudio } from "../store";
import { ThemeSelect } from "./Welcome";

/** Models for the built-in assistant (plan §10.9). */
export const MODELS = [
  { id: "claude-sonnet-5-5", label: "settings.model.sonnet" },
  { id: "claude-opus-5-5", label: "settings.model.opus" },
  { id: "claude-haiku-5-5", label: "settings.model.haiku" },
] as const;

/** Tools whose proposals can be accepted automatically (plan §11.4); off by default. */
const AUTO_ACCEPT = ["set_translation", "declare_variable", "set_preset", "patch_scene", "create_scene", "update_scene", "upsert_character", "rename"];

/** Settings: UI language (§11.5), the AI assistant (§10.7–§10.9). */
export function SettingsPage() {
  const intl = useIntl();
  const settings = useStudio((s) => s.settings)!;
  const info = useStudio((s) => s.info);
  const [key, setKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<AssistantKeyStatus | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [wrote, setWrote] = useState(false);
  useEffect(() => {
    void studio.assistant.keyStatus().then(setKeyStatus);
    void studio.mcp.status().then(setMcp);
  }, []);
  const set = (patch: Parameters<ReturnType<typeof useStudio.getState>["setSettings"]>[0]) => void useStudio.getState().setSettings(patch);
  const languages: UiLanguage[] = info?.dev ? ["en", "ja", "en-XA"] : ["en", "ja"];
  const aiAllowed = useStudio(selectAiAllowed);
  const manifest = useStudio((s) => s.files["himawari.json"]);
  const [hwcOnPath, setHwcOnPath] = useState(false);
  const setProjectAi = (allowed: boolean) => {
    if (manifest === undefined) return;
    try {
      useStudio.getState().edit("himawari.json", setAiHelp(manifest, allowed), "you", { id: allowed ? "history.aiHelpOn" : "history.aiHelpOff" });
    } catch {
      /* himawari.json has errors: Problems shows them */
    }
  };

  return (
    <div className="tool-page settings">
      <h2>
        <FormattedMessage id="tool.settings" />
      </h2>

      <section className="card">
        <h3>
          <FormattedMessage id="settings.appearance" />
        </h3>
        <label className="field">
          <span>
            <FormattedMessage id="welcome.language" />
          </span>
          <select value={settings.language} onChange={(e) => set({ language: e.target.value as UiLanguage })}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {intl.formatMessage({ id: `language.ui.${l}` })}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>
            <FormattedMessage id="settings.theme" />
          </span>
          <div>
            <ThemeSelect />
          </div>
        </div>
        {!settings.coachDone ? null : (
          <button className="small-button" onClick={() => set({ coachDone: false })}>
            <FormattedMessage id="settings.showTips" />
          </button>
        )}
      </section>

      {manifest !== undefined && <ProjectSettings />}

      <Shortcuts />

      <section className="card">
        <h3>
          <FormattedMessage id="settings.advanced" />
        </h3>
        <label className="check">
          <input type="checkbox" checked={settings.advanced.scriptFirst} onChange={(e) => set({ advanced: { ...settings.advanced, scriptFirst: e.target.checked } })} />
          <FormattedMessage id="settings.scriptFirst" />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.advanced.showProjectFiles} onChange={(e) => set({ advanced: { ...settings.advanced, showProjectFiles: e.target.checked } })} />
          <FormattedMessage id="settings.showProjectFiles" />
        </label>
        {info?.toolsDir && (
          <div className="row wrap">
            <button className="small-button" onClick={() => void studio.app.addToolsToPath().then(setHwcOnPath)}>
              <FormattedMessage id="settings.hwcPath" />
            </button>
            <span className="muted small">
              <FormattedMessage id={hwcOnPath ? "settings.hwcPathDone" : "settings.hwcPathHint"} />
            </span>
          </div>
        )}
      </section>

      <section className="card">
        <h3>
          <FormattedMessage id="settings.aiHelp" />
        </h3>
        <p className="muted small">
          <FormattedMessage id="settings.aiHelpAbout" />
        </p>
        {manifest !== undefined && (
          <label className="check">
            <input type="checkbox" checked={aiAllowed} onChange={(e) => setProjectAi(e.target.checked)} />
            <FormattedMessage id="settings.aiHelpProject" />
          </label>
        )}
        {aiAllowed && (
          <>
        <h4>
          <FormattedMessage id="settings.connectClaude" />
        </h4>
        <p className="muted small">
          <FormattedMessage id="settings.connectClaudeHint" />
        </p>
        {mcp?.claudeCodeCommand ? (
          <>
            <div className="field">
              <span>
                <FormattedMessage id="settings.claudeCode" />
              </span>
              <pre className="copy-block">{mcp.claudeCodeCommand}</pre>
              <div className="row">
                <button className="small-button" onClick={() => void studio.app.copyText(mcp.claudeCodeCommand).then(() => useStudio.getState().notify({ id: "notice.copied" }))}>
                  <FormattedMessage id="settings.copy" />
                </button>
                <button
                  className="small-button"
                  onClick={() => {
                    if (!window.confirm(intl.formatMessage({ id: "settings.writeMcpConfirm" }))) return;
                    void studio.mcp.writeClaudeCodeConfig().then(() => setWrote(true));
                  }}
                >
                  <FormattedMessage id="settings.writeMcp" />
                </button>
                {wrote && (
                  <span className="muted small">
                    <FormattedMessage id="settings.wroteMcp" />
                  </span>
                )}
              </div>
            </div>
            <div className="field">
              <span>
                <FormattedMessage id="settings.desktopApp" />
              </span>
              <pre className="copy-block">{mcp.desktopConfig}</pre>
              <button className="small-button" onClick={() => void studio.app.copyText(mcp.desktopConfig).then(() => useStudio.getState().notify({ id: "notice.copied" }))}>
                <FormattedMessage id="settings.copy" />
              </button>
            </div>
            <p className="muted small">
              <FormattedMessage id={mcp.listening ? "settings.liveSyncOn" : "settings.liveSyncOff"} />
            </p>
          </>
        ) : (
          <p className="muted small">
            <FormattedMessage id="settings.openProjectFirst" />
          </p>
        )}
        <h4>
          <FormattedMessage id="settings.assistant" />
        </h4>
        <p className="muted small">
          <FormattedMessage id="settings.keyBilling" />
        </p>
        <div className="field">
          <span>
            <FormattedMessage id="settings.apiKey" />
          </span>
          {keyStatus?.hasKey ? (
            <div className="row">
              <span>
                <FormattedMessage id="settings.keyStored" />
              </span>
              <button className="small-button" onClick={() => void studio.assistant.setKey(null).then(setKeyStatus)}>
                <FormattedMessage id="settings.removeKey" />
              </button>
            </div>
          ) : (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!key.trim()) return;
                void studio.assistant.setKey(key.trim()).then((s) => {
                  setKeyStatus(s);
                  setKey("");
                });
              }}
            >
              <input type="password" className="grow" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" placeholder={intl.formatMessage({ id: "settings.keyPlaceholder" })} />
              <button type="submit" disabled={!key.trim() || keyStatus?.canStore === false}>
                <FormattedMessage id="common.save" />
              </button>
            </form>
          )}
          {keyStatus?.canStore === false && (
            <span className="warning-text small">
              <FormattedMessage id="settings.cantStoreKey" />
            </span>
          )}
        </div>
        <div className="grid-2">
          <label className="field">
            <span>
              <FormattedMessage id="settings.model" />
            </span>
            <select value={settings.ai.model} onChange={(e) => set({ ai: { ...settings.ai, model: e.target.value } })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {intl.formatMessage({ id: m.label })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              <FormattedMessage id="settings.effort" />
            </span>
            <select value={settings.ai.effort} onChange={(e) => set({ ai: { ...settings.ai, effort: e.target.value === "low" ? "low" : "high" } })}>
              <option value="high">{intl.formatMessage({ id: "settings.effort.high" })}</option>
              <option value="low">{intl.formatMessage({ id: "settings.effort.low" })}</option>
            </select>
          </label>
          <label className="field">
            <span>
              <FormattedMessage id="settings.replyLanguage" />
            </span>
            <select value={settings.ai.replyLanguage} onChange={(e) => set({ ai: { ...settings.ai, replyLanguage: e.target.value } })}>
              <option value="">{intl.formatMessage({ id: "settings.replyLanguage.ui" })}</option>
              {Object.entries(LANGUAGE_NAMES).map(([t, n]) => (
                <option key={t} value={t}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span>
            <FormattedMessage id="settings.autoAccept" />
          </span>
          <span className="muted small">
            <FormattedMessage id="settings.autoAcceptHint" />
          </span>
          <div className="checks">
            {AUTO_ACCEPT.map((tool) => (
              <label key={tool} className="check">
                <input type="checkbox" checked={settings.ai.autoAccept[tool] === true} onChange={(e) => set({ ai: { ...settings.ai, autoAccept: { ...settings.ai.autoAccept, [tool]: e.target.checked } } })} />
                <code>{tool}</code>
              </label>
            ))}
          </div>
        </div>
          </>
        )}
      </section>
    </div>
  );
}

const RESOLUTIONS: [number, number][] = [
  [1920, 1080],
  [1280, 720],
  [2560, 1440],
  [3840, 2160],
];

/** The game's own settings (FINALIZATION.md NC-11), so nobody has to open himawari.json. */
/** The keyboard shortcuts (FINALIZATION.md D-9). */
const SHORTCUTS: [keys: string, id: string][] = [
  ["F5", "shortcuts.play"],
  ["Ctrl+S", "shortcuts.save"],
  ["Ctrl+Z", "shortcuts.undo"],
  ["Ctrl+P", "shortcuts.search"],
  ["Shift Shift", "shortcuts.searchShift"],
  ["Esc", "shortcuts.close"],
];

function Shortcuts() {
  return (
    <section className="card">
      <h3>
        <FormattedMessage id="shortcuts.title" />
      </h3>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, id]) => (
          <div key={id} className="row">
            <dt>
              {keys.split(" ").map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </dt>
            <dd className="muted">
              <FormattedMessage id={id} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProjectSettings() {
  const intl = useIntl();
  const text = useStudio((s) => s.files["himawari.json"]);
  const model = useStudio((s) => s.model);
  const scenes = model?.scenes.map((s) => s.id) ?? [];
  let m: Record<string, unknown> | null = null;
  try {
    m = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    m = null;
  }
  if (!m) {
    return (
      <section className="card">
        <h3>
          <FormattedMessage id="settings.project" />
        </h3>
        <p className="warning-text small">
          <FormattedMessage id="settings.projectBroken" />
        </p>
      </section>
    );
  }
  const manifest = m;
  const patch = (fields: Record<string, unknown>, label: string) => {
    const next = { ...manifest, ...fields };
    useStudio.getState().edit("himawari.json", `${JSON.stringify(next, null, 2)}\n`, "you", { id: label });
  };
  const res = Array.isArray(manifest["resolution"]) ? (manifest["resolution"] as number[]) : [1920, 1080];
  const resKey = `${res[0]}x${res[1]}`;
  const languages = Array.isArray(manifest["languages"]) ? (manifest["languages"] as string[]) : [];
  return (
    <section className="card" id="project-settings">
      <h3>
        <FormattedMessage id="settings.project" />
      </h3>
      <div className="grid-2">
        <label className="field">
          <span>
            <FormattedMessage id="settings.projectName" />
          </span>
          <input defaultValue={String(manifest["name"] ?? "")} key={String(manifest["name"] ?? "")} onBlur={(e) => e.target.value.trim() && e.target.value !== manifest["name"] && patch({ name: e.target.value.trim() }, "history.projectRenamed")} />
        </label>
        <label className="field">
          <span>
            <FormattedMessage id="settings.projectVersion" />
          </span>
          <input
            defaultValue={String(manifest["version"] ?? "0.1.0")}
            key={String(manifest["version"] ?? "")}
            onBlur={(e) => /^\d+\.\d+\.\d+$/.test(e.target.value.trim()) && e.target.value.trim() !== manifest["version"] && patch({ version: e.target.value.trim() }, "history.projectVersion")}
          />
        </label>
        <label className="field">
          <span>
            <FormattedMessage id="settings.projectStart" />
          </span>
          <select value={String(manifest["entry"] ?? "")} onChange={(e) => patch({ entry: e.target.value }, "history.projectStart")}>
            {!scenes.includes(String(manifest["entry"])) && <option value={String(manifest["entry"] ?? "")}>{String(manifest["entry"] ?? "")}</option>}
            {scenes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            <FormattedMessage id="settings.projectResolution" />
          </span>
          <select
            value={resKey}
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              patch({ resolution: [w, h] }, "history.projectResolution");
            }}
          >
            {!RESOLUTIONS.some(([w, h]) => `${w}x${h}` === resKey) && <option value={resKey}>{`${res[0]} × ${res[1]}`}</option>}
            {RESOLUTIONS.map(([w, h]) => (
              <option key={`${w}x${h}`} value={`${w}x${h}`}>
                {intl.formatMessage({ id: "settings.resolutionOption" }, { w, h })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid-2">
        <GameIcon />
        <label className="field">
          <span>
            <FormattedMessage id="credit.label" />
          </span>
          <select value={creditOf(text) ?? "none"} onChange={(e) => setCredit(e.target.value as Credit)}>
            {CREDITS.map((c) => (
              <option key={c} value={c}>
                {intl.formatMessage({ id: `credit.${c}` })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>
          <FormattedMessage id="settings.projectLanguages" />
        </span>
        <div className="row wrap">
          {languages.map((l) => (
            <span key={l} className="badge">
              {LANGUAGE_NAMES[l] ?? l}
              {l === manifest["sourceLanguage"] ? ` · ${intl.formatMessage({ id: "explorer.source" })}` : ""}
            </span>
          ))}
          <button className="small-button" onClick={() => useStudio.getState().open({ kind: "tool", tool: "localization" })}>
            <FormattedMessage id={languages.length > 1 ? "settings.manageLanguages" : "explorer.translateGame"} />
          </button>
        </div>
      </div>
    </section>
  );
}
