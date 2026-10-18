import { RenameError, type RenameKind, planRename } from "@himawari/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { refAt } from "../editor/assist";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { Screenplay } from "./Screenplay";
import { ScriptEditor, playFrom } from "./ScriptEditor";

/** A file in the center pane: scripts get the Screenplay ↔ Script switch (P8); other files are text. */
export function FileEditor({ file }: { file: string }) {
  const view = useStudio((s) => s.view);
  const settings = useStudio((s) => s.settings);
  const exists = useStudio((s) => s.files[file] !== undefined);
  const model = useStudio((s) => s.model);
  const previewLine = useStudio((s) => s.preview.line);
  const selection = useStudio((s) => s.selection);
  const isHws = file.endsWith(".hws");
  const [renaming, setRenaming] = useState<{ kind: RenameKind; name: string } | null>(null);

  // Follow the game: when the preview's line moves to another file, open it (P3).
  const lastLine = useRef<string | null>(null);
  useEffect(() => {
    if (!previewLine || previewLine === lastLine.current) return;
    lastLine.current = previewLine;
    const loc = model?.lines.get(previewLine);
    if (loc && loc.file !== file) useStudio.getState().revealAt(loc.file, loc.start);
  }, [previewLine, model, file]);

  const actions = useMemo(
    () => ({
      goToDefinition(pos: number) {
        const s = useStudio.getState();
        const ref = refAt(s.model, file, pos);
        if (!ref || !s.model) return;
        if (ref.kind === "scene" || ref.kind === "sceneDecl") {
          const scene = s.model.scenes.find((x) => x.id === ref.name);
          if (scene) s.revealAt(scene.file, scene.start);
        } else if (ref.kind === "speaker" || ref.kind === "character" || ref.kind === "attr") {
          const id = ref.kind === "attr" ? ref.owner : ref.name;
          if (id) s.open({ kind: "tool", tool: "characters", arg: id });
        } else if (ref.kind === "variable") {
          s.open({ kind: "tool", tool: "variables" });
        } else if (ref.kind === "asset") {
          s.open({ kind: "tool", tool: "assets" });
        }
      },
      rename(pos: number) {
        const ref = refAt(useStudio.getState().model, file, pos);
        if (!ref) return;
        const kind: RenameKind | null =
          ref.kind === "scene" || ref.kind === "sceneDecl" ? "scene" : ref.kind === "speaker" || ref.kind === "character" ? "character" : ref.kind === "variable" ? "variable" : null;
        if (kind) setRenaming({ kind, name: ref.name });
      },
    }),
    [file],
  );

  if (!exists) {
    return (
      <div className="empty-center muted">
        <FormattedMessage id="editor.missing" values={{ file }} />
      </div>
    );
  }
  const showScreenplay = isHws && view === "screenplay";
  return (
    <div className="file-editor">
      <div className="pane-head">
        <Icon name="file" />
        <span className="pane-title">{file}</span>
        {isHws && (
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={view === "screenplay"} className={view === "screenplay" ? "active" : ""} onClick={() => useStudio.getState().setView("screenplay")}>
              <FormattedMessage id="editor.screenplay" />
            </button>
            <button role="tab" aria-selected={view === "script"} className={view === "script" ? "active" : ""} onClick={() => useStudio.getState().setView("script")}>
              <FormattedMessage id="editor.script" />
            </button>
          </div>
        )}
        <div className="grow" />
        {selection && selection.file === file && (
          <button
            className="small-button"
            onClick={() => useStudio.setState((st) => ({ chat: { ...st.chat, selection, draft: st.chat.draft || "" } }))}
          >
            <Icon name="assistant" size={12} />
            <FormattedMessage id="editor.askAi" />
          </button>
        )}
        {isHws && (
          <span className="muted small">
            <FormattedMessage id="editor.playHint" />
          </span>
        )}
      </div>
      {!settings?.coachDone && isHws && <CoachMark />}
      {showScreenplay ? <Screenplay file={file} onPlay={playFrom} /> : <ScriptEditor key={file} file={file} actions={actions} />}
      {renaming && <RenameDialog kind={renaming.kind} from={renaming.name} onClose={() => setRenaming(null)} />}
    </div>
  );
}

/** The one-time hint on the first project (plan §2.1). */
function CoachMark() {
  return (
    <div className="coach" role="note">
      <span>
        <FormattedMessage id="coach.firstLine" />
      </span>
      <button className="small-button" onClick={() => void useStudio.getState().setSettings({ coachDone: true })}>
        <FormattedMessage id="coach.gotIt" />
      </button>
    </div>
  );
}

/** F2: a refactor-safe rename across every file (Core's planRename, the same as the MCP tool). */
export function RenameDialog({ kind, from, onClose }: { kind: RenameKind; from: string; onClose: () => void }) {
  const intl = useIntl();
  const [to, setTo] = useState(from);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const s = useStudio.getState();
    if (!s.model) return;
    try {
      const plan = planRename(s.model.check, kind, from, to.trim(), (f) => {
        const t = s.files[f];
        if (t === undefined) throw new RenameError(intl.formatMessage({ id: "rename.missingFile" }, { file: f }));
        return t;
      });
      s.editMany(
        [...plan.changes].map(([file, text]) => ({ file, text })),
        "refactor",
        { id: "history.renamed", values: { kind, from, to: to.trim(), count: String(plan.count) } },
      );
      if (kind === "character") s.open({ kind: "tool", tool: "characters", arg: to.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal title={<FormattedMessage id={`rename.title.${kind}`} values={{ name: from }} />} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>
            <FormattedMessage id="rename.newName" />
          </span>
          <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <p className="muted small">
          <FormattedMessage id="rename.explain" />
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            <FormattedMessage id="common.cancel" />
          </button>
          <button type="submit" className="primary">
            <FormattedMessage id="rename.do" />
          </button>
        </div>
      </form>
    </Modal>
  );
}
