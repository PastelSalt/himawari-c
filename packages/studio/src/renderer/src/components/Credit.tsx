/**
 * Crediting Himawari, kindly (FINALIZATION.md OC-10, D60): optional, asked once
 * at a project's first export, credits only by default (CREDITS.txt and the
 * exe's file properties). The game's icon lives here too.
 */
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { assetUrl } from "../assets";
import { useStudio } from "../store";
import { Modal } from "./Modal";

export const CREDITS = ["none", "title", "window"] as const;
export type Credit = (typeof CREDITS)[number];

/** himawari.json's "credit", or null when the project hasn't been asked yet. */
export function creditOf(manifestText: string | undefined): Credit | null {
  if (!manifestText) return null;
  try {
    const c = (JSON.parse(manifestText) as { credit?: unknown }).credit;
    return CREDITS.includes(c as Credit) ? (c as Credit) : null;
  } catch {
    return null;
  }
}

export function setCredit(credit: Credit): void {
  const s = useStudio.getState();
  const text = s.files["himawari.json"];
  if (!text) return;
  try {
    const m = JSON.parse(text) as Record<string, unknown>;
    m["credit"] = credit;
    s.edit("himawari.json", `${JSON.stringify(m, null, 2)}\n`, "you", { id: "history.credit" });
  } catch {
    /* himawari.json has errors: Problems shows them */
  }
}

/** The one-time question at the first export. */
export function CreditChoice({ onDone, onCancel }: { onDone: (c: Credit) => void; onCancel: () => void }) {
  const intl = useIntl();
  const [choice, setChoice] = useState<Credit>("none");
  return (
    <Modal title={<FormattedMessage id="credit.question" />} onClose={onCancel}>
      <p className="muted small">
        <FormattedMessage id="credit.about" />
      </p>
      <div className="credit-choices">
        {CREDITS.map((c) => (
          <label key={c} className={choice === c ? "credit-choice active" : "credit-choice"}>
            <input type="radio" name="credit" checked={choice === c} onChange={() => setChoice(c)} />
            <span>
              <strong>{intl.formatMessage({ id: `credit.${c}` })}</strong>
              <span className="muted small">{intl.formatMessage({ id: `credit.${c}.hint` })}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="row modal-actions">
        <span className="muted small grow">
          <FormattedMessage id="credit.later" />
        </span>
        <button onClick={onCancel}>
          <FormattedMessage id="common.cancel" />
        </button>
        <button className="primary" onClick={() => onDone(choice)}>
          <FormattedMessage id="credit.export" />
        </button>
      </div>
    </Modal>
  );
}

/** The game's icon (assets/icon.png): shown on the exported exe. */
export function GameIcon() {
  const assets = useStudio((s) => s.assets);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const has = assets.includes("icon.png");
  const choose = async () => {
    setError(null);
    const path = await studio.dialog.pickFile("image");
    if (!path) return;
    const bytes = await studio.project.readExternal(path);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const isPng = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!isPng) return setError("credit.iconNotPng");
    if (v.getUint32(16) > 256 || v.getUint32(20) > 256) return setError("credit.iconTooBig");
    await studio.project.writeAsset("assets/icon.png", bytes);
    setVersion((n) => n + 1);
  };
  return (
    <div className="field">
      <span>
        <FormattedMessage id="credit.icon" />
      </span>
      <div className="row">
        {has && <img className="game-icon" src={assetUrl("icon.png", version)} alt="" />}
        <button className="small-button" onClick={() => void choose()}>
          <FormattedMessage id={has ? "credit.iconChange" : "credit.iconChoose"} />
        </button>
      </div>
      <span className={error ? "error-text small" : "muted small"}>
        <FormattedMessage id={error ?? "credit.iconHint"} />
      </span>
    </div>
  );
}
