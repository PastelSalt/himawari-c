import { useState } from "react";
import { FormattedMessage } from "react-intl";
import type { BuildReport } from "../../../shared/api";
import { studio } from "../api";
import { useStudio } from "../store";
import { Icon } from "./Icon";

/** Build (plan §11.3, §14.4): export a Windows x64 game as a folder or a zip. */
export function BuildPanel() {
  const model = useStudio((s) => s.model);
  const info = useStudio((s) => s.info);
  const [zip, setZip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuildReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errors = model?.errors ?? 0;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await studio.project.exportGame(zip);
      setResult(r);
      if (r.ok) useStudio.getState().log("output.exported", { path: r.zip ?? r.dir ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-page">
      <h2>
        <FormattedMessage id="tool.build" />
      </h2>
      <section className="card">
        <h3>
          <FormattedMessage id="build.windows" />
        </h3>
        <p className="muted small">
          <FormattedMessage id="build.explain" values={{ name: model?.check.manifest?.name ?? "" }} />
        </p>
        <div className="row">
          <label className="check">
            <input type="radio" name="format" checked={!zip} onChange={() => setZip(false)} />
            <FormattedMessage id="build.folder" />
          </label>
          <label className="check">
            <input type="radio" name="format" checked={zip} onChange={() => setZip(true)} />
            <FormattedMessage id="build.zip" />
          </label>
        </div>
        {errors > 0 && (
          <p className="error-text">
            <FormattedMessage id="build.fixFirst" values={{ count: errors }} />
          </p>
        )}
        {info && !info.runtimeFound && (
          <p className="warning-text">
            <FormattedMessage id="welcome.noRuntime" />
          </p>
        )}
        <button className="primary" disabled={busy || errors > 0 || !info?.runtimeFound} onClick={() => void run()}>
          <Icon name="build" size={14} />
          <FormattedMessage id={busy ? "build.working" : "build.export"} />
        </button>
        {result?.ok && (
          <div className="build-result">
            <Icon name="check" />
            <FormattedMessage id="build.done" values={{ path: result.zip ?? result.dir ?? "", files: result.files ?? 0 }} />
            <button className="small-button" onClick={() => void studio.app.reveal(result.zip ?? result.exe ?? result.dir ?? "")}>
              <FormattedMessage id="build.reveal" />
            </button>
          </div>
        )}
        {result && !result.ok && <pre className="error-text">{result.errors}</pre>}
        {error && <p className="error-text">{error}</p>}
      </section>
      <section className="card">
        <h3>
          <FormattedMessage id="build.later" />
        </h3>
        <p className="muted small">
          <FormattedMessage id="build.laterHint" />
        </p>
      </section>
    </div>
  );
}
