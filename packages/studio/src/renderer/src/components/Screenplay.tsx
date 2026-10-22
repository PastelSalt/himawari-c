import { type Expr, type MenuOption, NOTES_FILE, type Note, type Scene, type Stmt, characterWords, newNoteId, parseAst, readNotes, stringifyNotes } from "@himawari/core";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  copyWithoutIds,
  deleteLines,
  insertAfter,
  lineAt,
  lineBodyWithoutTag,
  moveLines,
  moveLinesBefore,
  quotedOn,
  rawToDisplay,
  setLineBody,
  setOptionHead,
  setQuoted,
  setSayHead,
} from "../screenplay-edit";
import { conditionOf, conditionSource, formOf, formSource } from "../stage-forms";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { ConditionEditor, InvokeEditor, StageEditor, describeCondition, describeForm, describeInvoke, firstCondition, slug } from "./StageEditor";
import { invokeFormOf, invokeSource } from "../invoke-form";
import { SpriteThumb } from "./SpriteThumb";
import { StyledPreview, TextToolbar } from "./TextTools";
import { hasMarkup } from "../text-style";

/** Where to put the cursor after the next render: a line start offset, and whether to edit its raw text or open its form. */
let pendingFocus: { at: number; raw: boolean; form?: boolean } | null = null;

type Ctx = {
  file: string;
  text: string;
  /** Open review notes by line ID (rfcs/0011). */
  notes: ReadonlyMap<string, Note[]>;
  edit: (next: string, label?: string) => void;
  play: (lineId: string) => void;
  lastSpeaker: string | null;
};

/**
 * The Screenplay view (plan §11.3, P8): one row per statement. Writers see
 * dialogue, speakers, and choices; stage directions are compact rows that
 * open as text when clicked (P7). It edits the same text as the Script view.
 */
export function Screenplay({ file, onPlay }: { file: string; onPlay: (lineId: string) => void }) {
  const intl = useIntl();
  const text = useStudio((s) => s.files[file] ?? "");
  const reveal = useStudio((s) => s.reveal);
  const previewLine = useStudio((s) => s.preview.line);
  const model = useStudio((s) => s.model);
  const parsed = useMemo(() => parseAst(text, file), [text, file]);
  const hasErrors = parsed.diagnostics.some((d) => d.severity === "error");
  const notesText = useStudio((s) => s.files[NOTES_FILE]);
  const notes = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of readNotes(notesText)) if (n.line && !n.resolved) m.set(n.line, [...(m.get(n.line) ?? []), n]);
    return m;
  }, [notesText]);
  const root = useRef<HTMLDivElement>(null);
  // Scenes that must be drawn even when off screen: the one being revealed, and the one the game is playing.
  const [goTo, setGoTo] = useState<{ scene: string; seq: number } | null>(null);
  const sceneAt = (offset: number) => parsed.ast.scenes.find((sc) => offset >= sc.span.start && offset <= sc.span.end)?.id ?? null;
  const playing = previewLine ? model?.lines.get(previewLine) : undefined;
  const playingScene = playing && playing.file === file ? sceneAt(playing.start) : null;

  // Explorer, search, the story graph, and "go to definition" reveal a place: scroll to its scene.
  useEffect(() => {
    if (!reveal || reveal.file !== file) return;
    const id = sceneAt(reveal.offset);
    if (id) setGoTo({ scene: id, seq: reveal.seq });
  }, [reveal]);
  useEffect(() => {
    if (!goTo) return;
    root.current?.querySelector(`[data-scene="${CSS.escape(goTo.scene)}"]`)?.scrollIntoView({ block: "start" });
  }, [goTo]);
  const ctx: Ctx = {
    file,
    text,
    notes,
    edit: (next, label) => useStudio.getState().edit(file, next, "you", label ? { id: label, values: { file } } : undefined),
    play: onPlay,
    lastSpeaker: null,
  };
  const big = parsed.ast.scenes.length > 3;
  return (
    <div className="screenplay" ref={root}>
      {big && (
        <div className="sp-jump">
          <Icon name="scene" />
          <select
            value={goTo?.scene ?? ""}
            aria-label={intl.formatMessage({ id: "screenplay.goToScene" })}
            onChange={(e) => e.target.value && setGoTo({ scene: e.target.value, seq: Date.now() })}
          >
            <option value="">{intl.formatMessage({ id: "screenplay.goToScene" }, { count: parsed.ast.scenes.length })}</option>
            {parsed.ast.scenes.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.id}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasErrors && (
        <div className="screenplay-warning">
          <Icon name="warning" />
          <FormattedMessage id="screenplay.hasErrors" />
          <button className="small-button" onClick={() => useStudio.getState().setView("script")}>
            <FormattedMessage id="screenplay.openScript" />
          </button>
        </div>
      )}
      {parsed.ast.scenes.length === 0 && (
        <p className="muted empty">
          <FormattedMessage id="screenplay.noScenes" />
        </p>
      )}
      {parsed.ast.scenes.map((scene) => (
        <LazyScene key={scene.id} scene={scene} root={root} force={scene.id === goTo?.scene || scene.id === playingScene}>
          <header className="sp-scene-head">
            <Icon name="scene" />
            <span>{scene.id}</span>
          </header>
          <Body stmts={scene.body} ctx={ctx} depth={0} />
          <AddBar ctx={ctx} after={scene.body[scene.body.length - 1] ?? null} sceneSpanEnd={scene.span.end} indent="    " />
        </LazyScene>
      ))}
    </div>
  );
}

/** A one-line note on a line (the writer's own to-do), saved to .himawari/notes.json. */
function NoteForm({ lineId, onDone }: { lineId: string; onDone: () => void }) {
  const intl = useIntl();
  const [text, setText] = useState("");
  const save = () => {
    const t = text.trim();
    if (t) {
      const s = useStudio.getState();
      const notes = readNotes(s.files[NOTES_FILE]);
      const note: Note = { id: newNoteId(notes.map((n) => n.id)), line: lineId, kind: "todo", text: t, author: "human", created: new Date().toISOString() };
      s.edit(NOTES_FILE, stringifyNotes([...notes, note]), "you", { id: "history.noteAdded" });
    }
    onDone();
  };
  return (
    <form
      className="sp-note-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Icon name="note" size={13} />
      <input
        autoFocus
        value={text}
        placeholder={intl.formatMessage({ id: "notes.placeholder" })}
        aria-label={intl.formatMessage({ id: "notes.add" })}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
      />
    </form>
  );
}

/** Rows a scene shows, for the height of its placeholder. */
function countRows(stmts: readonly Stmt[]): number {
  let n = 0;
  for (const s of stmts) {
    n++;
    if (s.kind === "Menu") for (const o of s.options) n += 1 + countRows(o.body);
    if (s.kind === "If") for (const c of s.clauses) n += 1 + countRows(c.body);
  }
  return n;
}

/**
 * A scene drawn only while it's near the visible part of the Screenplay (a file with
 * thousands of lines would otherwise build thousands of rows at once); elsewhere, an
 * empty box of the same height keeps the scrollbar honest.
 */
function LazyScene({ scene, root, force, children }: { scene: Scene; root: React.RefObject<HTMLDivElement | null>; force: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const height = useRef(56 + countRows(scene.body) * 40);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (!e.isIntersecting && el.offsetHeight > 0) height.current = el.offsetHeight; // remember the real height
        setNear(e.isIntersecting);
      },
      { root: root.current, rootMargin: "1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  const shown = near || force;
  return (
    <section ref={ref} className="sp-scene" data-scene={scene.id} style={shown ? undefined : { height: height.current }}>
      {shown ? children : null}
    </section>
  );
}

function Body({ stmts, ctx, depth }: { stmts: Stmt[]; ctx: Ctx; depth: number }) {
  return (
    <div className="sp-body" style={{ marginLeft: depth ? 18 : 0 }}>
      {stmts.map((s, i) => {
        if (s.kind === "Say") ctx.lastSpeaker = s.speaker;
        // Keyed by place, so a row's open form stays open while its kind changes (go to → visit).
        const key = ("lineId" in s && s.lineId) || `${s.span.start}@${i}`;
        return <Row key={key} s={s} ctx={ctx} depth={depth} />;
      })}
    </div>
  );
}

/** Drag-and-drop between rows of the same block: the dragged statement's span. */
let dragging: { from: number; to: number; indent: number } | null = null;

const Row = memo(function Row({ s, ctx, depth }: { s: Stmt; ctx: Ctx; depth: number }) {
  const intl = useIntl();
  const preview = useStudio((st) => st.preview);
  const ref = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<"before" | "after" | null>(null);
  const [noting, setNoting] = useState(false);
  const lineId = s.kind === "Say" || s.kind === "Narration" || s.kind === "Invoke" ? s.lineId : s.kind === "Menu" ? s.promptLineId : null;
  const active = lineId !== null && preview.line === lineId;
  const line = lineAt(ctx.text, s.span.start);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const remove = () => ctx.edit(deleteLines(ctx.text, s.span.start, s.span.end), "history.deletedLine");
  const duplicate = () => {
    const copy = copyWithoutIds(ctx.text, s.span.start, s.span.end).replace(/\n$/, "").split("\n");
    const r = insertAfter(ctx.text, s.span.end, "", copy);
    pendingFocus = { at: r.at, raw: false };
    ctx.edit(r.text, "history.duplicated");
  };

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!dragging || dragging.indent !== line.indent.length) return;
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDrop(e.clientY < r.top + r.height / 2 ? "before" : "after");
    },
    onDragLeave: () => setDrop(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const d = dragging;
      setDrop(null);
      dragging = null;
      if (!d || (d.from === s.span.start && d.to === s.span.end)) return;
      const next = drop === "before" ? moveLinesBefore(ctx.text, d.from, d.to, s.span.start) : moveLines(ctx.text, d.from, d.to, s.span.end);
      ctx.edit(next, "history.moved");
    },
  };

  const handle = (
    <span
      className="sp-handle"
      draggable
      title={intl.formatMessage({ id: "screenplay.drag" })}
      onDragStart={(e) => {
        dragging = { from: s.span.start, to: s.span.end, indent: line.indent.length };
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => (dragging = null)}
    >
      <Icon name="drag" size={14} />
    </span>
  );
  const myNotes = lineId ? (ctx.notes.get(lineId) ?? []) : [];
  const noteBadge =
    myNotes.length > 0 ? (
      <button
        className="note-badge"
        title={myNotes.map((n) => `${n.author === "ai" ? "AI: " : ""}${n.text}`).join("\n")}
        aria-label={intl.formatMessage({ id: "notes.onLine" }, { count: myNotes.length })}
        onClick={() => useStudio.getState().setBottom("notes")}
      >
        <Icon name="note" size={12} />
        {myNotes.length}
      </button>
    ) : null;
  const noteForm = noting && lineId ? <NoteForm lineId={lineId} onDone={() => setNoting(false)} /> : null;
  const tools = (
    <span className="sp-tools">
      {lineId && (
        <button className="icon-button" title={intl.formatMessage({ id: "notes.add" })} aria-label={intl.formatMessage({ id: "notes.add" })} onClick={() => setNoting(true)}>
          <Icon name="note" size={13} />
        </button>
      )}
      <button className="icon-button" title={intl.formatMessage({ id: "screenplay.duplicate" })} aria-label={intl.formatMessage({ id: "screenplay.duplicate" })} onClick={duplicate}>
        <Icon name="plus" size={13} />
      </button>
      <button className="icon-button" title={intl.formatMessage({ id: "screenplay.delete" })} aria-label={intl.formatMessage({ id: "screenplay.delete" })} onClick={remove}>
        <Icon name="trash" size={13} />
      </button>
    </span>
  );
  const play = lineId ? (
    <button className="sp-play" title={intl.formatMessage({ id: "editor.playFromHere" })} aria-label={intl.formatMessage({ id: "editor.playFromHere" })} onClick={() => ctx.play(lineId)}>
      ▶
    </button>
  ) : (
    <span className="sp-play-space" />
  );
  const cls = `sp-row${active ? (preview.waiting ? " waiting" : " playing") : ""}${drop ? ` drop-${drop}` : ""}`;

  if (s.kind === "Say" || s.kind === "Narration") {
    return (
      <div ref={ref} className={cls} {...dragProps}>
        {play}
        {handle}
        <SpeakerPicker s={s} ctx={ctx} />
        <LineText at={s.span.start} ctx={ctx} onDuplicate={duplicate} speaker={s.kind === "Say" ? s.speaker : null} attrsSource={s} />
        {noteBadge}
        {tools}
        {noteForm}
      </div>
    );
  }
  if (s.kind === "Menu") {
    return (
      <div ref={ref} className="sp-block" {...dragProps}>
        <div className={cls}>
          {play}
          {handle}
          <span className="sp-chip menu">
            <Icon name="proposal" size={13} />
            <FormattedMessage id="screenplay.choice" />
          </span>
          {s.prompt ? <LineText at={s.span.start} ctx={ctx} speaker={null} /> : <span className="muted small"><FormattedMessage id="screenplay.noPrompt" /></span>}
          {noteBadge}
          {tools}
          {noteForm}
        </div>
        {s.options.map((o) => (
          <OptionRow key={o.lineId ?? o.span.start} o={o} ctx={ctx} depth={depth + 1} />
        ))}
        <button
          className="sp-add-option"
          onClick={() => {
            const last = s.options[s.options.length - 1];
            const indent = last ? lineAt(ctx.text, last.span.start).indent : `${line.indent}    `;
            const r = insertAfter(ctx.text, last ? last.span.end : s.span.end, indent, [`"${intl.formatMessage({ id: "screenplay.newOption" })}":`, `    "…"`]);
            pendingFocus = { at: r.at, raw: false };
            ctx.edit(r.text, "history.addedOption");
          }}
        >
          <Icon name="plus" size={13} />
          <FormattedMessage id="screenplay.addOption" />
        </button>
      </div>
    );
  }
  if (s.kind === "If") {
    let cursor = s.span.start;
    return (
      <div ref={ref} className="sp-block" {...dragProps}>
        {s.clauses.map((c, i) => {
          const at = i === 0 ? s.span.start : (c.body[0] ? ctx.text.lastIndexOf("\n", lineAt(ctx.text, c.body[0].span.start).start - 2) + 1 : cursor);
          cursor = c.body[c.body.length - 1]?.span.end ?? cursor;
          return (
            <div key={i}>
              <div className={cls}>
                <span className="sp-play-space" />
                {i === 0 ? handle : <span className="sp-handle" />}
                <ConditionLine at={at} cond={c.cond} first={i === 0} ctx={ctx} />
                {i === 0 && tools}
              </div>
              <Body stmts={c.body} ctx={ctx} depth={depth + 1} />
            </div>
          );
        })}
      </div>
    );
  }
  // Stage directions and flow: a compact row; click to edit its text.
  return (
    <div ref={ref} className={cls} {...dragProps}>
      <span className="sp-play-space" />
      {handle}
      <StageLine s={s} ctx={ctx} icon={iconFor(s)} summary={summary(s, intl)} />
      {tools}
    </div>
  );
});

/** A stage direction, flow, or value row: a plain sentence that opens a form (FINALIZATION.md §3.1). */
function StageLine({ s, ctx, icon, summary: sum }: { s: Stmt; ctx: Ctx; icon: string; summary?: string | undefined }) {
  const intl = useIntl();
  const model = useStudio((st) => st.model);
  const chars = useMemo(() => (model ? [...model.check.characters.values()] : []), [model]);
  const form = useMemo(() => formOf(s), [s]);
  const call = useMemo(() => (model ? invokeFormOf(s, model.check) : null), [s, model]);
  const l = lineAt(ctx.text, s.span.start);
  const [mode, setMode] = useState<"closed" | "form" | "script">("closed");
  useEffect(() => {
    if (pendingFocus && pendingFocus.form && pendingFocus.at === l.start) {
      pendingFocus = null;
      setMode(form || call ? "form" : "script");
    }
  });
  if (call && mode !== "script") {
    return (
      <>
        <button className={mode === "form" ? "sp-stage open" : "sp-stage"} aria-expanded={mode === "form"} onClick={() => setMode(mode === "form" ? "closed" : "form")}>
          <Icon name={icon} size={13} />
          <span className="sp-stage-text">{describeInvoke(intl, call, chars)}</span>
        </button>
        {mode === "form" && (
          <InvokeEditor
            form={call}
            onChange={(f) => ctx.edit(setLineBody(ctx.text, s.span.start, invokeSource(f)), "history.editedStage")}
            onScript={() => setMode("script")}
            onClose={() => setMode("closed")}
          />
        )}
      </>
    );
  }
  if (!form || mode === "script") return <RawLine at={s.span.start} ctx={ctx} icon={icon} summary={sum} startEditing={mode === "script"} onDone={() => setMode("closed")} />;
  return (
    <>
      <button className={mode === "form" ? "sp-stage open" : "sp-stage"} aria-expanded={mode === "form"} onClick={() => setMode(mode === "form" ? "closed" : "form")}>
        <Icon name={icon} size={13} />
        <span className="sp-stage-text">{describeForm(intl, form, chars)}</span>
      </button>
      {mode === "form" && (
        <StageEditor
          form={form}
          onChange={(f) => ctx.edit(setLineBody(ctx.text, s.span.start, formSource(f)), "history.editedStage")}
          onScript={() => setMode("script")}
          onClose={() => setMode("closed")}
        />
      )}
    </>
  );
}

/** A branch's header: "Only if …", "Otherwise, if …", or "Otherwise", with a form for the condition. */
function ConditionLine({ at, cond, first, ctx }: { at: number; cond: Expr | null; first: boolean; ctx: Ctx }) {
  const intl = useIntl();
  const form = useMemo(() => (cond ? conditionOf(cond) : null), [cond]);
  const [mode, setMode] = useState<"closed" | "form" | "script">("closed");
  if (!cond) {
    return (
      <span className="sp-stage static">
        <Icon name="variables" size={13} />
        <span className="sp-stage-text">
          <FormattedMessage id="stage.cond.otherwise" />
        </span>
      </span>
    );
  }
  if (!form || mode === "script") return <RawLine at={at} ctx={ctx} icon="variables" startEditing={mode === "script"} onDone={() => setMode("closed")} />;
  return (
    <>
      <button className={mode === "form" ? "sp-stage open" : "sp-stage"} aria-expanded={mode === "form"} onClick={() => setMode(mode === "form" ? "closed" : "form")}>
        <Icon name="variables" size={13} />
        <span className="sp-stage-text">{intl.formatMessage({ id: first ? "stage.cond.onlyIf" : "stage.cond.otherwiseIf" }, { cond: describeCondition(intl, form) })}</span>
      </button>
      {mode === "form" && (
        <ConditionEditor
          cond={form}
          onChange={(c) => ctx.edit(setLineBody(ctx.text, at, `${first ? "if" : "elif"} ${conditionSource(c)}:`), "history.editedStage")}
          onScript={() => setMode("script")}
          onClose={() => setMode("closed")}
        />
      )}
    </>
  );
}

function iconFor(s: Stmt): string {
  switch (s.kind) {
    case "Bg":
    case "Cg":
      return "image";
    case "Show":
    case "Hide":
    case "Move":
      return "characters";
    case "Audio":
    case "Stop":
      return "music";
    case "Jump":
    case "Call":
    case "Return":
    case "End":
      return "next";
    case "Assign":
      return "variables";
    case "Textbox":
      return "book";
    default:
      return "settings";
  }
}

function summary(s: Stmt, intl: ReturnType<typeof useIntl>): string | undefined {
  const t = (id: string, values: Record<string, string> = {}) => intl.formatMessage({ id }, values);
  switch (s.kind) {
    case "Bg":
      return t("screenplay.stage.bg", { name: s.asset });
    case "Cg":
      return t("screenplay.stage.cg", { name: s.asset });
    case "Show":
      return t("screenplay.stage.show", { name: s.char, attrs: s.add.join(" "), at: s.at ?? "" });
    case "Hide":
      return t("screenplay.stage.hide", { name: s.char });
    case "Audio":
      return t(`screenplay.stage.${s.channel}`, { name: s.asset });
    case "Jump":
      return t("screenplay.stage.jump", { name: s.target });
    case "Call":
      return t("screenplay.stage.call", { name: s.target });
    case "End":
      return t("screenplay.stage.end");
    case "Textbox":
      return t(`screenplay.stage.textbox.${s.mode}`);
    case "Invoke":
      return t("screenplay.stage.invoke", { name: s.name, args: s.args.map((a) => (a.value.kind === "text" ? `"${a.value.raw}"` : String(a.value.value))).join(", ") });
    default:
      return undefined;
  }
}

/** Speaker dropdown (characters, or narration) with the line's expression chips. */
function SpeakerPicker({ s, ctx }: { s: Extract<Stmt, { kind: "Say" | "Narration" }>; ctx: Ctx }) {
  const intl = useIntl();
  const model = useStudio((st) => st.model);
  const chars = model ? [...model.check.characters.values()] : [];
  const speaker = s.kind === "Say" ? s.speaker : "";
  const attrs = s.kind === "Say" ? [...s.attrs.add, ...s.attrs.remove.map((a) => `-${a}`)] : [];
  const c = speaker ? model?.check.characters.get(speaker) : undefined;
  const words = c ? [...characterWords(c)].sort().filter((w) => !attrs.includes(w)) : [];
  const [picking, setPicking] = useState(false);
  const attrBox = useRef<HTMLSpanElement>(null);
  useDismiss(attrBox, picking, () => setPicking(false));
  const setHead = (sp: string | null, at: string[]) => ctx.edit(setSayHead(ctx.text, s.span.start, sp, at), "history.changedSpeaker");
  return (
    <span className="sp-speaker">
      <select
        className="sp-speaker-select"
        value={speaker}
        style={{ borderColor: c?.color ?? undefined }}
        aria-label={intl.formatMessage({ id: "screenplay.speaker" })}
        onChange={(e) => setHead(e.target.value || null, e.target.value === speaker ? attrs : [])}
      >
        <option value="">{intl.formatMessage({ id: "screenplay.narration" })}</option>
        {chars.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.displayName}
          </option>
        ))}
        {speaker && !c && <option value={speaker}>{speaker}</option>}
      </select>
      {attrs.map((a) => (
        <button key={a} className="sp-chip attr" title={intl.formatMessage({ id: "screenplay.removeAttr" })} onClick={() => setHead(speaker, attrs.filter((x) => x !== a))}>
          {a} ×
        </button>
      ))}
      {c && words.length > 0 && (
        <span className="sp-attr-add" ref={attrBox}>
          <button className="sp-chip add" aria-label={intl.formatMessage({ id: "screenplay.addAttr" })} title={intl.formatMessage({ id: "screenplay.addAttr" })} onClick={() => setPicking(!picking)}>
            +
          </button>
          {picking && (
            <div className="sp-attr-menu">
              {words.map((w) => (
                <button
                  key={w}
                  className="sp-attr-option"
                  onClick={() => {
                    setPicking(false);
                    setHead(speaker, [...attrs, w]);
                  }}
                >
                  {c.hasSprite && <SpriteThumb character={c.id} attrs={[...attrs.filter((a) => !a.startsWith("-")), w]} size={44} />}
                  <span>{w}</span>
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </span>
  );
}

/** The quoted text of a line, edited in place. Enter adds the next line; Ctrl+D duplicates. */
function LineText({ at, ctx, onDuplicate, speaker }: { at: number; ctx: Ctx; onDuplicate?: () => void; speaker: string | null; attrsSource?: Stmt }) {
  const intl = useIntl();
  const l = lineAt(ctx.text, at);
  const q = quotedOn(ctx.text.slice(l.start, l.end));
  const value = q ? rawToDisplay(q.raw) : "";
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (pendingFocus && !pendingFocus.raw && pendingFocus.at === l.start) {
      pendingFocus = null;
      ref.current?.focus();
      ref.current?.select();
    }
  });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  const [focused, setFocused] = useState(false);
  if (!q) return <span className="muted">{l.body}</span>;
  return (
    <div className="sp-text-wrap">
    <textarea
      ref={ref}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="sp-text"
      rows={1}
      value={value}
      spellCheck={false}
      placeholder={intl.formatMessage({ id: "screenplay.textPlaceholder" })}
      aria-label={intl.formatMessage({ id: "screenplay.text" })}
      onChange={(e) => ctx.edit(setQuoted(ctx.text, at, e.target.value.replace(/\n/g, "")))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          const body = speaker ? `${speaker} ""` : `""`;
          const r = insertAfter(ctx.text, l.end, l.indent, [body]);
          pendingFocus = { at: r.at, raw: false };
          ctx.edit(r.text, "history.addedLine");
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
          e.preventDefault();
          onDuplicate?.();
        }
      }}
    />
    {focused && (
      <TextToolbar
        target={() => ref.current}
        value={value}
        apply={(r) => {
          ctx.edit(setQuoted(ctx.text, at, r.text), "history.styledText");
          requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.setSelectionRange(r.selStart, r.selEnd);
          });
        }}
      />
    )}
    {hasMarkup(value) && <StyledPreview display={value} />}
    </div>
  );
}

/** A stage direction or flow line: a summary, or its text while editing (click to edit). */
function RawLine({ at, ctx, icon, summary: sum, startEditing, onDone }: { at: number; ctx: Ctx; icon: string; summary?: string | undefined; startEditing?: boolean; onDone?: () => void }) {
  const source = lineBodyWithoutTag(ctx.text, at).replace(/:\s*$/, ":");
  const l = lineAt(ctx.text, at);
  const [editing, setEditingState] = useState(startEditing === true);
  const setEditing = (v: boolean) => {
    setEditingState(v);
    if (!v) onDone?.();
  };
  const [draft, setDraft] = useState(source);
  useEffect(() => {
    if (pendingFocus && pendingFocus.raw && pendingFocus.at === l.start) {
      pendingFocus = null;
      setDraft(source);
      setEditing(true);
    }
  });
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== source.trim()) ctx.edit(setLineBody(ctx.text, at, draft), "history.editedStage");
  };
  if (editing) {
    return (
      <input
        className="sp-raw-input"
        autoFocus
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      className="sp-stage"
      onClick={() => {
        setDraft(source);
        setEditing(true);
      }}
    >
      <Icon name={icon} size={13} />
      <span className="sp-stage-text">{sum ?? source}</span>
      {sum && <code className="muted small">{source}</code>}
    </button>
  );
}

function OptionRow({ o, ctx, depth }: { o: MenuOption; ctx: Ctx; depth: number }) {
  const intl = useIntl();
  const preview = useStudio((st) => st.preview);
  const variables = useStudio((st) => st.model?.check.manifest?.variables) ?? NO_VARIABLES;
  const hasValues = Object.keys(variables).length > 0;
  const active = o.lineId !== null && preview.line === o.lineId;
  const [editingCond, setEditingCond] = useState(false);
  const condForm = useMemo(() => (o.cond ? conditionOf(o.cond) : null), [o.cond]);
  // The condition exactly as written (so toggling "only once" never rewrites it).
  const condText = o.cond ? (/"\s*if\s+(.*?)\s*:\s*$/.exec(lineBodyWithoutTag(ctx.text, o.span.start))?.[1] ?? null) : null;
  const setHead = (once: boolean, cond: string | null) => ctx.edit(setOptionHead(ctx.text, o.span.start, once, cond), "history.editedChoice");
  return (
    <div className="sp-option">
      <div className={`sp-row option${active ? " waiting" : ""}`}>
        {o.lineId ? (
          <button className="sp-play" title={intl.formatMessage({ id: "editor.playFromHere" })} aria-label={intl.formatMessage({ id: "editor.playFromHere" })} onClick={() => ctx.play(o.lineId!)}>
            ▶
          </button>
        ) : (
          <span className="sp-play-space" />
        )}
        <span className="sp-option-mark">{o.once ? "◇" : "◆"}</span>
        <LineText at={o.span.start} ctx={ctx} speaker={null} />
        {o.cond && condForm && (
          <button className="sp-chip cond" title={intl.formatMessage({ id: "screenplay.condition" })} onClick={() => setEditingCond(!editingCond)}>
            {intl.formatMessage({ id: "stage.cond.onlyIf" }, { cond: describeCondition(intl, condForm) })}
          </button>
        )}
        {o.cond && !condForm && (
          <span className="sp-chip cond" title={intl.formatMessage({ id: "screenplay.condition" })}>
            {intl.formatMessage({ id: "stage.cond.code" }, { code: condText ?? "" })}
          </span>
        )}
        <span className="sp-tools">
          <button className={o.once ? "small-button on" : "small-button"} aria-pressed={o.once} title={intl.formatMessage({ id: "stage.once.hint" })} onClick={() => setHead(!o.once, condText)}>
            <FormattedMessage id="stage.once" />
          </button>
          {!o.cond && hasValues && (
            <button className="small-button" onClick={() => {
              const c = firstCondition(variables);
              if (c) {
                setHead(o.once, conditionSource(c));
                setEditingCond(true);
              }
            }}>
              <FormattedMessage id="stage.cond.add" />
            </button>
          )}
          <button className="icon-button" title={intl.formatMessage({ id: "screenplay.delete" })} aria-label={intl.formatMessage({ id: "screenplay.delete" })} onClick={() => ctx.edit(deleteLines(ctx.text, o.span.start, o.span.end), "history.deletedLine")}>
            <Icon name="trash" size={13} />
          </button>
        </span>
      </div>
      {editingCond && condForm && (
        <ConditionEditor
          cond={condForm}
          onChange={(c) => setHead(o.once, conditionSource(c))}
          onScript={() => setEditingCond(false)}
          onClose={() => setEditingCond(false)}
          onRemove={() => {
            setHead(o.once, null);
            setEditingCond(false);
          }}
        />
      )}
      <Body stmts={o.body} ctx={ctx} depth={depth} />
    </div>
  );
}

/** Add a line, narration, choice, or stage direction at the end of a scene. */
function AddBar({ ctx, after, sceneSpanEnd, indent }: { ctx: Ctx; after: Stmt | null; sceneSpanEnd: number; indent: string }) {
  const intl = useIntl();
  const model = useStudio((st) => st.model);
  const assets = useStudio((st) => st.assets);
  const [stage, setStage] = useState(false);
  const stageBox = useRef<HTMLSpanElement>(null);
  const stageMenu = useRef<HTMLDivElement>(null);
  useDismiss(stageBox, stage, () => setStage(false));
  // A menu opened near the bottom of the pane scrolls into view once, so every choice can be seen.
  useEffect(() => {
    if (stage) stageMenu.current?.scrollIntoView({ block: "nearest" });
  }, [stage]);
  const end = after ? after.span.end : sceneSpanEnd;
  const firstChar = model ? [...model.check.characters.keys()][0] : undefined;
  const speaker = ctx.lastSpeaker ?? firstChar ?? null;
  const add = (bodies: string[], raw: boolean, label: string) => {
    const r = insertAfter(ctx.text, end, indent, bodies);
    pendingFocus = { at: r.at, raw };
    ctx.edit(r.text, label);
    setStage(false);
  };
  // A new stage direction opens as a form, never as text to type.
  const addStage = (bodies: string[], label: string) => {
    const r = insertAfter(useStudio.getState().files[ctx.file] ?? ctx.text, end, indent, bodies);
    pendingFocus = { at: r.at, raw: false, form: true };
    ctx.edit(r.text, label === "stage.add.onlyIf" ? "history.addedBranch" : "history.addedStage");
    setStage(false);
  };
  const firstAsset = (folder: string) => assets.find((a) => a.startsWith(`${folder}/`))?.slice(folder.length + 1).replace(/\.[^.]+$/, "");
  const scenes = model?.scenes.map((s) => s.id) ?? [];
  const chars = model ? [...model.check.characters.keys()] : [];
  const variables = model?.check.manifest?.variables ?? {};
  // A value to remember: the first one the project has, or a new yes/no one.
  const firstValue = () => {
    const name = Object.keys(variables).sort()[0];
    if (name) {
      const t = variables[name]!.type;
      return `$ ${name} = ${t === "bool" ? "true" : t === "int" ? "1" : JSON.stringify(variables[name]!.enum?.[0] ?? "")}`;
    }
    const fresh = slug(intl.formatMessage({ id: "stage.defaultValueName" })) || "choice_made";
    newVariable(fresh);
    return `$ ${fresh} = true`;
  };
  const firstCond = () => {
    const c = firstCondition(variables);
    if (c) return conditionSource(c);
    const fresh = slug(intl.formatMessage({ id: "stage.defaultValueName" })) || "choice_made";
    newVariable(fresh);
    return fresh;
  };
  const stageGroups: { group: string; items: [string, () => string[]][] }[] = [
    {
      group: "stage.group.scene",
      items: [
        ["screenplay.add.bg", () => [`bg ${firstAsset("bg") ?? "black"} with fade`]],
        ["stage.add.cg", () => [`cg ${firstAsset("cg") ?? "picture"} with dissolve`]],
        ["screenplay.add.show", () => [`show ${firstChar ?? "someone"} at center with dissolve`]],
        ["screenplay.add.hide", () => [`hide ${firstChar ?? "someone"} with dissolve`]],
        ["stage.add.move", () => [`move ${chars[0] ?? "someone"} at left`]],
      ],
    },
    {
      group: "stage.group.sound",
      items: [
        ["screenplay.add.music", () => [`music ${firstAsset("music") ?? "theme"} fade(1000)`]],
        ["stage.add.ambient", () => [`ambient ${firstAsset("ambient") ?? "rain"} fade(1000)`]],
        ["screenplay.add.sfx", () => [`sfx ${firstAsset("sfx") ?? "chime"}`]],
        ["stage.add.stop", () => ["stop music fade(1000)"]],
      ],
    },
    {
      group: "stage.group.timing",
      items: [
        ["screenplay.add.wait", () => ["wait(500)"]],
        ["stage.add.shake", () => ["shake"]],
        ["stage.add.flash", () => ["flash"]],
        ["stage.add.textbox", () => ["textbox nvl"]],
      ],
    },
    {
      group: "stage.group.story",
      items: [
        ["screenplay.add.jump", () => [`jump ${scenes[0] ?? "start"}`]],
        ["stage.add.call", () => [`call ${scenes[0] ?? "start"}`]],
        ["screenplay.add.end", () => ["end"]],
        ["stage.add.remember", () => [firstValue()]],
        ["stage.add.onlyIf", () => [`if ${firstCond()}:`, `    "…"`]],
      ],
    },
  ];
  return (
    <div className="sp-addbar">
      <button onClick={() => add([speaker ? `${speaker} ""` : `""`], false, "history.addedLine")}>
        <Icon name="plus" size={13} />
        <FormattedMessage id="screenplay.add.line" />
      </button>
      <button onClick={() => add([`""`], false, "history.addedLine")}>
        <Icon name="plus" size={13} />
        <FormattedMessage id="screenplay.add.narration" />
      </button>
      <button
        onClick={() =>
          add(
            ["menu:", `    "${intl.formatMessage({ id: "screenplay.newOption" })}":`, `        "…"`, `    "${intl.formatMessage({ id: "screenplay.newOption" })} 2":`, `        "…"`],
            false,
            "history.addedChoice",
          )
        }
      >
        <Icon name="plus" size={13} />
        <FormattedMessage id="screenplay.add.choice" />
      </button>
      <span className="sp-stage-add" ref={stageBox}>
        <button onClick={() => setStage(!stage)} aria-expanded={stage}>
          <Icon name="plus" size={13} />
          <FormattedMessage id="screenplay.add.stage" />
        </button>
        {stage && (
          <div className="sp-attr-menu stage-menu" ref={stageMenu}>
            {stageGroups.map((g) => (
              <div key={g.group} className="stage-menu-group">
                <span className="muted small">
                  <FormattedMessage id={g.group} />
                </span>
                {g.items.map(([label, body]) => (
                  <button key={label} className="sp-attr-option" onClick={() => addStage(body(), label)}>
                    <FormattedMessage id={label} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </span>
      <span className="muted small grow right">{intl.formatMessage({ id: "screenplay.lines" }, { count: countLines(ctx.text) })}</span>
    </div>
  );
}

/**
 * Closes a small menu on a click outside `box` (the menu and its button) or on Escape. Menus used
 * to close when the mouse left them, but scrolling (the mouse wheel, or a test scrolling to an
 * item) moves a menu out from under a still pointer, and it vanished mid-choice.
 */
function useDismiss(box: React.RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [box, open, close]);
}

const NO_VARIABLES: Readonly<Record<string, { type: string; enum?: string[] }>> = {};

/** Declares a yes/no value in himawari.json (when a form needs one and the project has none). */
function newVariable(name: string) {
  const s = useStudio.getState();
  const text = s.files["himawari.json"];
  if (!text) return;
  try {
    const m = JSON.parse(text) as { variables?: Record<string, unknown> };
    if (m.variables?.[name]) return;
    m.variables = { ...(m.variables ?? {}), [name]: { type: "bool", default: false, scope: "save" } };
    s.edit("himawari.json", `${JSON.stringify(m, null, 2)}\n`, "you", { id: "history.addedVariable", values: { name } });
  } catch {
    /* himawari.json has errors: Problems shows them */
  }
}

function countLines(text: string): number {
  return (text.match(/^\s*(?:[a-z_][a-z0-9_]*(?:\s+-?[a-z_][a-z0-9_]*)*\s+)?"/gm) ?? []).length;
}

