/**
 * Never losing work (FINALIZATION.md §8.1): a file's earlier versions,
 * deleted files, restore points, a save that met a change made outside
 * Studio, and OneDrive's conflict copies. All of it in plain words, with a
 * look before anything is brought back.
 */
import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, FormattedRelativeTime, useIntl } from "react-intl";
import type { FileVersion, RestorePointInfo } from "../../../shared/api";
import { studio } from "../api";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

const ago = (at: number) => <FormattedRelativeTime value={Math.round((at - Date.now()) / 1000)} numeric="auto" updateIntervalInSeconds={60} />;

/** A short look at a version: its first lines. */
function Peek({ text }: { text: string | null }) {
  if (text === null) return null;
  const lines = text.split("\n");
  return (
    <pre className="version-peek">
      {lines.slice(0, 40).join("\n")}
      {lines.length > 40 ? "\n…" : ""}
    </pre>
  );
}

/** Earlier versions of one file (the local history), with "Bring this version back". */
export function VersionsDialog({ file, onClose }: { file: string; onClose: () => void }) {
  const intl = useIntl();
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    void studio.project.versions(file).then((v) => {
      setVersions(v);
      if (v[0]) setPicked(v[0].at);
    });
  }, [file]);
  useEffect(() => {
    if (picked === null) return;
    void studio.project.version(file, picked).then(setText);
  }, [file, picked]);
  const restore = () => {
    if (text === null) return;
    useStudio.getState().edit(file, text, "you", { id: "history.restoredVersion", values: { file } });
    onClose();
  };
  return (
    <Modal title={<FormattedMessage id="safety.versionsTitle" values={{ file }} />} onClose={onClose} wide>
      {versions === null ? null : versions.length === 0 ? (
        <p className="muted">
          <FormattedMessage id="safety.noVersions" />
        </p>
      ) : (
        <div className="versions">
          <ul className="version-list">
            {versions.map((v) => (
              <li key={v.at}>
                <button className={picked === v.at ? "version active" : "version"} onClick={() => setPicked(v.at)}>
                  <span>{ago(v.at)}</span>
                  <span className="muted small">
                    <FormattedMessage id={`safety.reason.${v.reason}`} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Peek text={text} />
        </div>
      )}
      <div className="row modal-actions">
        <span className="muted small grow">
          <FormattedMessage id="safety.versionsHint" />
        </span>
        <button onClick={onClose}>{intl.formatMessage({ id: "common.close" })}</button>
        <button className="primary" disabled={text === null} onClick={restore}>
          <FormattedMessage id="safety.restoreVersion" />
        </button>
      </div>
    </Modal>
  );
}

/** Files deleted from the project that can come back. */
export function DeletedFilesDialog({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const [items, setItems] = useState<{ file: string; at: number }[] | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ file: string; at: number } | null>(null);
  useEffect(() => {
    void studio.project.deletedFiles().then(setItems);
  }, []);
  useEffect(() => {
    if (picked) void studio.project.version(picked.file, picked.at).then(setText);
  }, [picked]);
  return (
    <Modal title={<FormattedMessage id="safety.deletedTitle" />} onClose={onClose} wide>
      {items === null ? null : items.length === 0 ? (
        <p className="muted">
          <FormattedMessage id="safety.noDeleted" />
        </p>
      ) : (
        <div className="versions">
          <ul className="version-list">
            {items.map((d) => (
              <li key={d.file}>
                <button className={picked?.file === d.file ? "version active" : "version"} onClick={() => setPicked(d)}>
                  <span className="ellipsis">{d.file}</span>
                  <span className="muted small">{ago(d.at)}</span>
                </button>
              </li>
            ))}
          </ul>
          <Peek text={text} />
        </div>
      )}
      <div className="row modal-actions">
        <span className="muted small grow">
          <FormattedMessage id="safety.deletedHint" />
        </span>
        <button onClick={onClose}>{intl.formatMessage({ id: "common.close" })}</button>
        <button
          className="primary"
          disabled={!picked || text === null}
          onClick={() => {
            if (!picked || text === null) return;
            useStudio.getState().edit(picked.file, text, "you", { id: "history.restoredFile", values: { file: picked.file } });
            onClose();
          }}
        >
          <FormattedMessage id="safety.restoreFile" />
        </button>
      </div>
    </Modal>
  );
}

/** A restore point's name: a Studio message (with its values) or plain text (an AI proposal's reason). */
function pointLabel(intl: ReturnType<typeof useIntl>, label: string): string {
  try {
    const l = JSON.parse(label) as { id?: unknown; values?: Record<string, string> };
    if (typeof l.id === "string") return intl.formatMessage({ id: l.id }, l.values ?? {});
  } catch {
    /* plain text */
  }
  return label;
}

/** Restore points: every file as it was before a wide change. */
export function RestorePointsDialog({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const [points, setPoints] = useState<RestorePointInfo[] | null>(null);
  const [confirm, setConfirm] = useState<RestorePointInfo | null>(null);
  useEffect(() => {
    void studio.project.restorePoints().then(setPoints);
  }, []);
  const goBack = async (p: RestorePointInfo) => {
    const files = await studio.project.restorePointFiles(p.id);
    if (!files) return;
    const now = useStudio.getState().files;
    const changes = Object.entries(files)
      .filter(([f, text]) => now[f] !== text)
      .map(([file, text]) => ({ file, text }));
    useStudio.getState().editMany(changes, "you", { id: "history.restoredPoint", values: { label: pointLabel(intl, p.label) } });
    onClose();
  };
  return (
    <Modal title={<FormattedMessage id="safety.pointsTitle" />} onClose={onClose}>
      <p className="muted small">
        <FormattedMessage id="safety.pointsHint" />
      </p>
      {points !== null && points.length === 0 && (
        <p className="muted">
          <FormattedMessage id="safety.noPoints" />
        </p>
      )}
      <ul className="version-list">
        {(points ?? []).map((p) => (
          <li key={p.id} className="row">
            <span className="grow">
              {pointLabel(intl, p.label)} <span className="muted small">· {ago(p.at)}</span>
            </span>
            {confirm?.id === p.id ? (
              <>
                <span className="small">
                  <FormattedMessage id="safety.pointConfirm" values={{ count: p.files }} />
                </span>
                <button className="small-button" onClick={() => setConfirm(null)}>
                  <FormattedMessage id="common.cancel" />
                </button>
                <button className="small-button primary" onClick={() => void goBack(p)}>
                  <FormattedMessage id="safety.pointGo" />
                </button>
              </>
            ) : (
              <button className="small-button" onClick={() => setConfirm(p)}>
                <FormattedMessage id="safety.pointGo" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="row modal-actions">
        <div className="grow" />
        <button onClick={onClose}>{intl.formatMessage({ id: "common.close" })}</button>
      </div>
    </Modal>
  );
}

/** A save that met a change made outside Studio (another editor, git, OneDrive): which to keep? */
export function ConflictDialog() {
  const conflict = useStudio((s) => s.conflict);
  if (!conflict) return null;
  const resolve = (keep: "mine" | "theirs") => useStudio.getState().resolveConflict(keep);
  return (
    <Modal title={<FormattedMessage id="safety.conflictTitle" values={{ file: conflict.file }} />} onClose={() => resolve("mine")} wide>
      <p>
        <FormattedMessage id="safety.conflictBody" />
      </p>
      <div className="conflict-sides">
        <div>
          <h4>
            <FormattedMessage id="safety.conflictMine" />
          </h4>
          <Peek text={conflict.mine} />
        </div>
        <div>
          <h4>
            <FormattedMessage id="safety.conflictTheirs" />
          </h4>
          <Peek text={conflict.theirs} />
        </div>
      </div>
      <p className="muted small">
        <FormattedMessage id="safety.conflictHint" />
      </p>
      <div className="row modal-actions">
        <div className="grow" />
        <button onClick={() => resolve("theirs")}>
          <FormattedMessage id="safety.keepTheirs" />
        </button>
        <button className="primary" onClick={() => resolve("mine")}>
          <FormattedMessage id="safety.keepMine" />
        </button>
      </div>
    </Modal>
  );
}

/** OneDrive's conflict copies ("ch1-DESKTOP-AB12.hws" beside "ch1.hws"), explained instead of puzzling (S-7). */
export function OneDriveCopies() {
  const files = useStudio((s) => s.files);
  const copies = useMemo(() => {
    const out: { copy: string; original: string }[] = [];
    for (const f of Object.keys(files)) {
      const m = /^(.*)-([A-Z][A-Z0-9-]{2,})(\.[a-z]+)$/.exec(f);
      if (m && files[`${m[1]}${m[3]}`] !== undefined) out.push({ copy: f, original: `${m[1]}${m[3]}` });
    }
    return out;
  }, [files]);
  if (copies.length === 0) return null;
  return (
    <div className="onedrive-banner">
      {copies.map((c) => (
        <div key={c.copy} className="row wrap small">
          <Icon name="warning" size={13} />
          <span className="grow">
            <FormattedMessage id="safety.onedrive" values={{ original: c.original, copy: c.copy }} />
          </span>
          <button className="small-button" onClick={() => useStudio.getState().open({ kind: "file", file: c.copy })}>
            <FormattedMessage id="safety.onedriveOpen" />
          </button>
          <button className="small-button" onClick={() => useStudio.getState().edit(c.copy, null, "you", { id: "history.removedCopy", values: { file: c.copy } })}>
            <FormattedMessage id="safety.onedriveRemove" />
          </button>
        </div>
      ))}
    </div>
  );
}
