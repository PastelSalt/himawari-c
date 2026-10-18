import type { Character } from "@himawari/core";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { setSprite } from "../character-edit";
import { type ImportDoc, layerPng, readOraFile, readPsdFile } from "../sprite-import";
import { useStudio } from "../store";
import { Modal } from "./Modal";

/** PSD/ORA import with a mapping preview (plan §6.4): adjust groups, attributes, and flags before any file is written. */
export function SpriteImport({ character, onClose }: { character: Character; onClose: () => void }) {
  const intl = useIntl();
  const [doc, setDoc] = useState<ImportDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = `sprites/${character.id}`;

  const pick = async (kind: "psd" | "ora") => {
    setError(null);
    const path = await studio.dialog.pickFile(kind);
    if (!path) return;
    setBusy(true);
    try {
      const bytes = await studio.project.readExternal(path);
      setDoc(kind === "psd" ? readPsdFile(bytes) : await readOraFile(bytes));
    } catch (e) {
      setError(intl.formatMessage({ id: "import.cantRead" }, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const update = (fn: (d: ImportDoc) => void) => {
    if (!doc) return;
    const next: ImportDoc = { ...doc, groups: doc.groups.map((g) => ({ ...g, layers: g.layers.map((l) => ({ ...l })) })) };
    fn(next);
    setDoc(next);
  };

  const run = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      let count = 0;
      for (const g of doc.groups) {
        for (const l of g.layers) {
          if (!l.include) continue;
          await studio.project.writeAsset(`assets/${root}/${g.name}/${l.attr}.png`, await layerPng(doc, l));
          count++;
        }
      }
      const groups = doc.groups
        .filter((g) => g.layers.some((l) => l.include))
        .map((g) => ({ name: g.name, always: g.always, multiple: g.multiple, defaults: g.layers.filter((l) => l.include && l.isDefault).map((l) => l.attr) }));
      const s = useStudio.getState();
      const text = s.files[character.file] ?? "";
      s.edit(character.file, setSprite(text, root, groups), "you", { id: "history.importedSprite", values: { name: character.displayName, count: String(count) } });
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={<FormattedMessage id="import.title" values={{ name: character.displayName }} />} onClose={onClose} wide>
      {!doc && (
        <div className="form">
          <p className="muted">
            <FormattedMessage id="import.explain" />
          </p>
          <div className="row">
            <button onClick={() => void pick("psd")} disabled={busy}>
              <FormattedMessage id="import.psd" />
            </button>
            <button onClick={() => void pick("ora")} disabled={busy}>
              <FormattedMessage id="import.ora" />
            </button>
          </div>
        </div>
      )}
      {doc && (
        <div className="import-map">
          <p className="muted small">
            <FormattedMessage id="import.mapping" values={{ folder: `assets/${root}/`, width: doc.width, height: doc.height }} />
          </p>
          {[...doc.groups].reverse().map((g, gi) => {
            const index = doc.groups.length - 1 - gi;
            return (
              <div key={index} className="import-group">
                <div className="row">
                  <input
                    className="group-input"
                    value={g.name}
                    onChange={(e) => update((d) => (d.groups[index]!.name = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_")))}
                    aria-label={intl.formatMessage({ id: "import.groupName" })}
                  />
                  <label className="check">
                    <input type="checkbox" checked={g.always} onChange={(e) => update((d) => (d.groups[index]!.always = e.target.checked))} />
                    <FormattedMessage id="characters.always" />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={g.multiple} onChange={(e) => update((d) => (d.groups[index]!.multiple = e.target.checked))} />
                    <FormattedMessage id="characters.multiple" />
                  </label>
                </div>
                <div className="import-layers">
                  {g.layers.map((l, li) => (
                    <div key={li} className="import-layer">
                      <input type="checkbox" checked={l.include} onChange={(e) => update((d) => (d.groups[index]!.layers[li]!.include = e.target.checked))} aria-label={intl.formatMessage({ id: "import.include" })} />
                      <input
                        value={l.attr}
                        onChange={(e) => update((d) => (d.groups[index]!.layers[li]!.attr = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_")))}
                        aria-label={intl.formatMessage({ id: "import.attrName" })}
                      />
                      {!g.always && (
                        <label className="check small">
                          <input
                            type={g.multiple ? "checkbox" : "radio"}
                            name={`default-${index}`}
                            checked={l.isDefault}
                            onChange={(e) =>
                              update((d) => {
                                const grp = d.groups[index]!;
                                if (!grp.multiple) for (const x of grp.layers) x.isDefault = false;
                                grp.layers[li]!.isDefault = e.target.checked;
                              })
                            }
                          />
                          <FormattedMessage id="import.default" />
                        </label>
                      )}
                      <span className="muted small ellipsis">{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-actions">
        <button onClick={onClose} disabled={busy}>
          <FormattedMessage id="common.cancel" />
        </button>
        {doc && (
          <button className="primary" onClick={() => void run()} disabled={busy}>
            <FormattedMessage id="import.run" />
          </button>
        )}
      </div>
    </Modal>
  );
}
