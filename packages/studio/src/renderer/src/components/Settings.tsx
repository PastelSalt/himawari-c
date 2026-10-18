import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { AssistantKeyStatus, McpStatus, UiLanguage } from "../../../shared/api";
import { studio } from "../api";
import { LANGUAGE_NAMES } from "../i18n";
import { useStudio } from "../store";

/** Models for the built-in assistant (plan §10.9). */
export const MODELS = [
  { id: "claude-opus-5-5", label: "settings.model.opus" },
  { id: "claude-sonnet-5-5", label: "settings.model.sonnet" },
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
        {!settings.coachDone ? null : (
          <button className="small-button" onClick={() => set({ coachDone: false })}>
            <FormattedMessage id="settings.showTips" />
          </button>
        )}
      </section>

      <section className="card">
        <h3>
          <FormattedMessage id="settings.connectClaude" />
        </h3>
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
                <button className="small-button" onClick={() => void navigator.clipboard.writeText(mcp.claudeCodeCommand)}>
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
              <button className="small-button" onClick={() => void navigator.clipboard.writeText(mcp.desktopConfig)}>
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
      </section>

      <section className="card">
        <h3>
          <FormattedMessage id="settings.assistant" />
        </h3>
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
      </section>
    </div>
  );
}
