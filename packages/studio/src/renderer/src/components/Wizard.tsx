import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { ProjectSnapshot } from "../../../shared/api";
import { studio } from "../api";
import { LANGUAGE_NAMES } from "../i18n";
import { useStudio } from "../store";
import { Modal } from "./Modal";

const TEMPLATES = [
  { id: "adv", title: "wizard.template.adv", hint: "wizard.template.adv.hint" },
  { id: "blank", title: "wizard.template.blank", hint: "wizard.template.blank.hint" },
] as const;

/** New Project in three steps at most (plan §2.1): name and folder, template, languages. */
export function NewProjectWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (s: ProjectSnapshot) => void }) {
  const intl = useIntl();
  const ui = useStudio((s) => s.settings?.language ?? "en");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [template, setTemplate] = useState<string>("adv");
  const [source, setSource] = useState(ui === "ja" ? "ja" : "en");
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const dir = await studio.dialog.pickFolder();
    if (dir) setParent(dir);
  };

  const create = async () => {
    if (!parent) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await studio.project.create({ parent, name: name.trim(), template, sourceLanguage: source, targetLanguages: targets }));
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
      setBusy(false);
    }
  };

  const canNext = step === 1 ? name.trim().length > 0 && parent !== null : true;
  const toggle = (l: string) => setTargets((t) => (t.includes(l) ? t.filter((x) => x !== l) : [...t, l]));

  return (
    <Modal title={<FormattedMessage id="welcome.newProject" />} onClose={onClose}>
      <p className="muted small">
        <FormattedMessage id="wizard.step" values={{ current: step, total: 3 }} />
      </p>
      {step === 1 && (
        <div className="form">
          <h3>
            <FormattedMessage id="wizard.nameAndFolder" />
          </h3>
          <label className="field">
            <span>
              <FormattedMessage id="wizard.name" />
            </span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={intl.formatMessage({ id: "wizard.name.placeholder" })} />
          </label>
          <div className="field">
            <span>
              <FormattedMessage id="wizard.folder" />
            </span>
            <div className="row">
              <code className="path">{parent ?? intl.formatMessage({ id: "wizard.folder.none" })}</code>
              <button onClick={pick}>
                <FormattedMessage id="wizard.folder.choose" />
              </button>
            </div>
            {parent && name.trim() && (
              <span className="muted small">
                <FormattedMessage id="wizard.folder.result" values={{ path: `${parent}\\${name.trim()}` }} />
              </span>
            )}
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="form">
          <h3>
            <FormattedMessage id="wizard.template" />
          </h3>
          <div className="choice-cards">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={template === t.id ? "choice-card selected" : "choice-card"} onClick={() => setTemplate(t.id)} aria-pressed={template === t.id}>
                <strong>
                  <FormattedMessage id={t.title} />
                </strong>
                <span className="muted small">
                  <FormattedMessage id={t.hint} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="form">
          <h3>
            <FormattedMessage id="wizard.languages" />
          </h3>
          <label className="field">
            <span>
              <FormattedMessage id="wizard.sourceLanguage" />
            </span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(LANGUAGE_NAMES).map(([tag, n]) => (
                <option key={tag} value={tag}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>
              <FormattedMessage id="wizard.targetLanguages" />
            </span>
            <div className="checks">
              {Object.entries(LANGUAGE_NAMES)
                .filter(([tag]) => tag !== source)
                .map(([tag, n]) => (
                  <label key={tag} className="check">
                    <input type="checkbox" checked={targets.includes(tag)} onChange={() => toggle(tag)} />
                    {n}
                  </label>
                ))}
            </div>
            <span className="muted small">
              <FormattedMessage id="wizard.languages.later" />
            </span>
          </div>
          <div className="field">
            <span>
              <FormattedMessage id="wizard.resolution" />
            </span>
            <span>
              <FormattedMessage id="wizard.resolution.value" />
            </span>
          </div>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={step === 1 ? onClose : () => setStep(step - 1)} disabled={busy}>
          <FormattedMessage id={step === 1 ? "common.cancel" : "common.back"} />
        </button>
        {step < 3 ? (
          <button className="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            <FormattedMessage id="common.next" />
          </button>
        ) : (
          <button className="primary" disabled={busy || !parent} onClick={create}>
            <FormattedMessage id="wizard.create" />
          </button>
        )}
      </div>
    </Modal>
  );
}
