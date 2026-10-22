import { FormattedMessage, useIntl } from "react-intl";
import { CONTACT_URL, MOEKO_WORKS_URL } from "../../../shared/links";
import { studio } from "../api";
import moekoWorks from "../brand/moeko-works.png";
import wordmark from "../brand/himawari-studio.png";
import { useStudio } from "../store";
import { Icon } from "./Icon";

/** Opens in the browser (https only; the main process checks). */
const open = (url: string) => void studio.app.openExternal(url);

/** Himawari Studio's wordmark: the flowers and the name. */
export function Wordmark({ className = "" }: { className?: string }) {
  const intl = useIntl();
  return <img className={`brand-art ${className}`} src={wordmark} alt={intl.formatMessage({ id: "app.title" })} draggable={false} />;
}

/** The Moeko Works logo, opening their website. */
export function MadeBy() {
  const intl = useIntl();
  return (
    <button className="made-by" onClick={() => open(MOEKO_WORKS_URL)} title={intl.formatMessage({ id: "about.website" })}>
      <span className="muted small">
        <FormattedMessage id="about.madeBy" />
      </span>
      <img className="brand-art" src={moekoWorks} alt={intl.formatMessage({ id: "about.moekoWorks" })} draggable={false} />
    </button>
  );
}

/** "Report a problem": Moeko Works' contact page. */
export function ReportProblem() {
  return (
    <button className="link-button" onClick={() => open(CONTACT_URL)}>
      <Icon name="note" />
      <FormattedMessage id="about.contact" />
    </button>
  );
}

/** Settings → About: the version, who makes Himawari, and where to report a problem. */
export function AboutCard() {
  const intl = useIntl();
  const info = useStudio((s) => s.info);
  return (
    <section className="card about">
      <h3>
        <FormattedMessage id="about.title" />
      </h3>
      <Wordmark className="about-wordmark" />
      {info && <p className="muted small">{intl.formatMessage({ id: "welcome.version" }, { version: info.version })}</p>}
      <MadeBy />
      <p className="muted small">
        <FormattedMessage id="about.contactHint" />
      </p>
      <div className="row wrap">
        <button className="small-button" onClick={() => open(CONTACT_URL)}>
          <Icon name="note" />
          <FormattedMessage id="about.contact" />
        </button>
        <button className="small-button" onClick={() => open(MOEKO_WORKS_URL)}>
          <Icon name="link" />
          <FormattedMessage id="about.website" />
        </button>
      </div>
    </section>
  );
}
