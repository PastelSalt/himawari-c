import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { LANGUAGE_NAMES } from "../i18n";
import { useStudio } from "../store";
import { Icon } from "./Icon";

/** The runtime's screen names (spec/debug-protocol.md, `state` event) that have a label. */
const SCREENS = new Set(["title", "play", "menu", "slots", "history", "confirm", "end", "error", "config", "controls", "accessibility", "extras", "gallery", "cg", "music"]);

/**
 * The live preview (plan §11.3, P2–P4): the real runtime, docked into this
 * pane as a native child window. This component only reserves the space and
 * tells main where it is; while a dialog is open the game is hidden.
 */
export function PreviewPane() {
  const intl = useIntl();
  const host = useRef<HTMLDivElement>(null);
  const preview = useStudio((s) => s.preview);
  const overlays = useStudio((s) => s.overlays);
  const model = useStudio((s) => s.model);
  const searchOpen = useStudio((s) => s.searchOpen);
  const hidden = overlays > 0 || searchOpen;
  const languages = model?.check.manifest?.languages ?? [];
  const [lang, setLang] = useState<string | null>(null);
  const shownLang = lang ?? model?.check.manifest?.sourceLanguage ?? "";

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (hidden || r.width < 8 || r.height < 8) {
          void studio.preview.setBounds(null);
          return;
        }
        // Fit 16:9 inside the pane (the games are 16:9, D16), in device pixels for the native window.
        const w = Math.min(r.width, (r.height * 16) / 9);
        const h = (w * 9) / 16;
        const dpr = window.devicePixelRatio;
        void studio.preview.setBounds({ x: (r.left + (r.width - w) / 2) * dpr, y: (r.top + (r.height - h) / 2) * dpr, w: w * dpr, h: h * dpr });
      });
    };
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    const dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener("change", place);
    place();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", place);
      dprQuery.removeEventListener("change", place);
    };
  }, [hidden, preview.ready]);

  const send = (cmd: Parameters<typeof studio.preview.command>[0]) => void studio.preview.command(cmd);
  const loc = preview.line ? model?.lines.get(preview.line) : undefined;

  let overlay: React.ReactNode = null;
  if (preview.unavailable === "runtime") overlay = <FormattedMessage id="preview.noRuntime" />;
  else if (preview.unavailable) overlay = <FormattedMessage id="preview.cantStart" />;
  else if (preview.built && !preview.built.ok && !preview.ready) overlay = <FormattedMessage id="preview.fixErrors" />;
  else if (!preview.ready) overlay = <FormattedMessage id="preview.starting" />;

  return (
    <div className="preview">
      <div className="pane-head">
        <span className="pane-title">
          <FormattedMessage id="preview.title" />
        </span>
        <div className="grow" />
        {languages.length > 1 && (
          <select
            className="small-select"
            value={shownLang}
            aria-label={intl.formatMessage({ id: "preview.language" })}
            title={intl.formatMessage({ id: "preview.language" })}
            onChange={(e) => {
              setLang(e.target.value);
              send({ cmd: "lang", lang: e.target.value });
            }}
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l] ?? l}
              </option>
            ))}
          </select>
        )}
        <button className="icon-button" title={intl.formatMessage({ id: "preview.restart" })} aria-label={intl.formatMessage({ id: "preview.restart" })} onClick={() => send({ cmd: "restart" })} disabled={!preview.ready}>
          <Icon name="restart" />
        </button>
        <button className="icon-button" title={intl.formatMessage({ id: "preview.nextChoice" })} aria-label={intl.formatMessage({ id: "preview.nextChoice" })} onClick={() => send({ cmd: "next_menu" })} disabled={!preview.ready}>
          <Icon name="skip" />
        </button>
        <button className="icon-button" title={intl.formatMessage({ id: "preview.reload" })} aria-label={intl.formatMessage({ id: "preview.reload" })} onClick={() => void studio.preview.start()}>
          <Icon name="reload" />
        </button>
      </div>
      <div className="preview-host" ref={host}>
        {overlay && <div className="preview-overlay muted">{overlay}</div>}
        {hidden && preview.ready && (
          <div className="preview-overlay muted">
            <FormattedMessage id="preview.hidden" />
          </div>
        )}
      </div>
      <div className="preview-status">
        {preview.built && !preview.built.ok && preview.ready && (
          <span className="error-text small">
            <FormattedMessage id="preview.staleBuild" />
          </span>
        )}
        {preview.error && <span className="error-text small">{preview.error}</span>}
        {loc ? (
          <button className="link-row small" onClick={() => useStudio.getState().revealAt(loc.file, loc.start)}>
            <span className={preview.waiting ? "dot waiting" : "dot playing"} />
            <FormattedMessage id={preview.waiting ? (preview.choice ? "preview.atChoice" : "preview.waiting") : "preview.playing"} values={{ scene: loc.scene, file: loc.file.replace(/^script\//, "") }} />
          </button>
        ) : (
          preview.ready && (
            <span className="muted small">
              <FormattedMessage id={`preview.screen.${!preview.screen ? "play" : SCREENS.has(preview.screen) ? preview.screen : "other"}`} />
            </span>
          )
        )}
        {preview.reloaded === "fallback" && (
          <span className="muted small">
            <FormattedMessage id="preview.fallback" />
          </span>
        )}
      </div>
    </div>
  );
}
