import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { Appearance, BundledProject, ProjectSnapshot, UiLanguage } from "../../../shared/api";
import { studio } from "../api";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { NewProjectWizard } from "./Wizard";

/** Himawari's mark: a flat sunflower (petals around a seed disc), drawn in the theme's accent. */
export function Logo() {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden>
      <g transform="translate(32 32)">
        {petals.map((a) => (
          <ellipse key={a} cx="0" cy="-19" rx="6.5" ry="11" transform={`rotate(${a})`} fill="var(--accent)" stroke="var(--accent-line)" strokeWidth="1" />
        ))}
        <circle r="12" fill="var(--hl-string)" opacity="0.85" />
        <circle r="12" fill="none" stroke="var(--accent-hover)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/** Light, dark, or Windows's own theme (Settings → Appearance). */
export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const intl = useIntl();
  const appearance = useStudio((s) => s.settings?.appearance ?? "light");
  const options: [Appearance, string][] = [
    ["light", "sun"],
    ["dark", "moon"],
    ["system", "monitor"],
  ];
  return (
    <div className="segmented theme-select" role="radiogroup" aria-label={intl.formatMessage({ id: "settings.theme" })}>
      {options.map(([a, icon]) => (
        <button
          key={a}
          role="radio"
          aria-checked={appearance === a}
          className={appearance === a ? "active" : ""}
          title={intl.formatMessage({ id: `settings.theme.${a}` })}
          onClick={() => void useStudio.getState().setSettings({ appearance: a })}
        >
          <Icon name={icon} />
          {!compact && <FormattedMessage id={`settings.theme.${a}`} />}
        </button>
      ))}
    </div>
  );
}

/** The first screen (plan §2.1): New Project, Open, the tutorial, samples, the UI language, and the theme. */
export function Welcome() {
  const intl = useIntl();
  const settings = useStudio((s) => s.settings)!;
  const info = useStudio((s) => s.info);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (open: () => Promise<ProjectSnapshot | null>) => {
    setBusy(true);
    setError(null);
    try {
      const s = await open();
      if (s) useStudio.getState().openSnapshot(s);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFolder = () =>
    run(async () => {
      const dir = await studio.dialog.pickFolder();
      return dir ? studio.project.open(dir) : null;
    });

  const samples = (info?.bundled ?? []).filter((b): b is Exclude<BundledProject, "tutorial"> => b !== "tutorial");
  const languages: UiLanguage[] = info?.dev ? ["en", "ja", "en-XA"] : ["en", "ja"];

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-brand">
          <Logo />
          <div>
            <h1>
              <FormattedMessage id="app.title" />
            </h1>
            <p className="muted">
              <FormattedMessage id="welcome.tagline" />
            </p>
          </div>
        </div>

        <div className="welcome-actions">
          <button className="big primary" disabled={busy} onClick={() => setWizard(true)}>
            <Icon name="plus" />
            <FormattedMessage id="welcome.newProject" />
          </button>
          <button className="big" disabled={busy} onClick={openFolder}>
            <Icon name="folder" />
            <FormattedMessage id="welcome.open" />
          </button>
          {info?.bundled.includes("tutorial") && (
            <button className="big" disabled={busy} onClick={() => run(() => studio.project.openBundled("tutorial"))}>
              <Icon name="book" />
              <FormattedMessage id="welcome.openTutorial" />
            </button>
          )}
        </div>

        {samples.length > 0 && (
          <section className="welcome-section">
            <h3>
              <FormattedMessage id="welcome.samples" />
            </h3>
            <div className="sample-list">
              {samples.map((s) => (
                <button key={s} className="link-row" disabled={busy} onClick={() => run(() => studio.project.openBundled(s))}>
                  <FormattedMessage id={`welcome.sample.${s}`} />
                </button>
              ))}
            </div>
          </section>
        )}

        {settings.recentProjects.length > 0 && (
          <section className="welcome-section">
            <h3>
              <FormattedMessage id="welcome.recent" />
            </h3>
            <div className="recent-list">
              {settings.recentProjects.map((p) => (
                <button key={p} className="link-row" disabled={busy} onClick={() => run(() => studio.project.open(p))} title={p}>
                  <span className="recent-name">{p.split(/[\\/]/).pop()}</span>
                  <span className="recent-path muted">{p}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {info?.lastExitUnexpected && (
          <p className="info-text" role="status">
            <FormattedMessage id="safety.crashed" />
          </p>
        )}
        {info && !info.runtimeFound && (
          <p className="warning-text">
            <FormattedMessage id="welcome.noRuntime" />
          </p>
        )}

        <div className="welcome-footer">
          <label className="inline-field">
            <Icon name="globe" />
            <span>
              <FormattedMessage id="welcome.language" />
            </span>
            <select
              value={settings.language}
              onChange={(e) => void useStudio.getState().setSettings({ language: e.target.value as UiLanguage })}
              aria-label={intl.formatMessage({ id: "welcome.language" })}
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {intl.formatMessage({ id: `language.ui.${l}` })}
                </option>
              ))}
            </select>
          </label>
          <ThemeSelect compact />
          <span className="muted small">{info ? intl.formatMessage({ id: "welcome.version" }, { version: info.version }) : ""}</span>
        </div>
      </div>
      {wizard && <NewProjectWizard onClose={() => setWizard(false)} onCreated={(s) => useStudio.getState().openSnapshot(s)} />}
    </div>
  );
}
