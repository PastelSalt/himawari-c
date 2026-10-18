import { type MenuOption, type Scene, type Stmt, characterWords, parseAst } from "@himawari/core";
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
  setQuoted,
  setSayHead,
} from "../screenplay-edit";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { SpriteThumb } from "./SpriteThumb";

/** Where to put the cursor after the next render: a line start offset, and whether to edit its raw text. */
let pendingFocus: { at: number; raw: boolean } | null = null;

type Ctx = {
  file: string;
  text: string;
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
        const key = ("lineId" in s && s.lineId) || `${s.kind}@${s.span.start}@${i}`;
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
  const tools = (
    <span className="sp-tools">
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
        {tools}
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
          {tools}
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
                <RawLine at={at} ctx={ctx} icon="variables" />
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
      <RawLine at={s.span.start} ctx={ctx} icon={iconFor(s)} summary={summary(s, intl)} />
      {tools}
    </div>
  );
});

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
        <span className="sp-attr-add">
          <button className="sp-chip add" aria-label={intl.formatMessage({ id: "screenplay.addAttr" })} title={intl.formatMessage({ id: "screenplay.addAttr" })} onClick={() => setPicking(!picking)}>
            +
          </button>
          {picking && (
            <div className="sp-attr-menu" onMouseLeave={() => setPicking(false)}>
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
  if (!q) return <span className="muted">{l.body}</span>;
  return (
    <textarea
      ref={ref}
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
  );
}

/** A stage direction or flow line: a summary, or its text while editing (click to edit). */
function RawLine({ at, ctx, icon, summary: sum }: { at: number; ctx: Ctx; icon: string; summary?: string | undefined }) {
  const source = lineBodyWithoutTag(ctx.text, at).replace(/:\s*$/, ":");
  const l = lineAt(ctx.text, at);
  const [editing, setEditing] = useState(false);
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
  const active = o.lineId !== null && preview.line === o.lineId;
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
        {o.cond && (
          <span className="sp-chip cond" title={intl.formatMessage({ id: "screenplay.condition" })}>
            {lineBodyWithoutTag(ctx.text, o.span.start).replace(/^.*"\s*if\s+/, "if ").replace(/:\s*$/, "")}
          </span>
        )}
        <span className="sp-tools">
          <button className="icon-button" title={intl.formatMessage({ id: "screenplay.delete" })} aria-label={intl.formatMessage({ id: "screenplay.delete" })} onClick={() => ctx.edit(deleteLines(ctx.text, o.span.start, o.span.end), "history.deletedLine")}>
            <Icon name="trash" size={13} />
          </button>
        </span>
      </div>
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
  const end = after ? after.span.end : sceneSpanEnd;
  const firstChar = model ? [...model.check.characters.keys()][0] : undefined;
  const speaker = ctx.lastSpeaker ?? firstChar ?? null;
  const add = (bodies: string[], raw: boolean, label: string) => {
    const r = insertAfter(ctx.text, end, indent, bodies);
    pendingFocus = { at: r.at, raw };
    ctx.edit(r.text, label);
    setStage(false);
  };
  const firstAsset = (folder: string) => assets.find((a) => a.startsWith(`${folder}/`))?.slice(folder.length + 1).replace(/\.[^.]+$/, "");
  const scenes = model?.scenes.map((s) => s.id) ?? [];
  const stageItems: [string, string][] = [
    ["screenplay.add.bg", `bg ${firstAsset("bg") ?? "black"} with fade`],
    ["screenplay.add.show", `show ${firstChar ?? "someone"} at center`],
    ["screenplay.add.hide", `hide ${firstChar ?? "someone"}`],
    ["screenplay.add.music", `music ${firstAsset("music") ?? "theme"}`],
    ["screenplay.add.sfx", `sfx ${firstAsset("sfx") ?? "chime"}`],
    ["screenplay.add.wait", "wait 500"],
    ["screenplay.add.jump", `jump ${scenes[0] ?? "start"}`],
    ["screenplay.add.end", "end"],
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
      <span className="sp-stage-add">
        <button onClick={() => setStage(!stage)}>
          <Icon name="plus" size={13} />
          <FormattedMessage id="screenplay.add.stage" />
        </button>
        {stage && (
          <div className="sp-attr-menu" onMouseLeave={() => setStage(false)}>
            {stageItems.map(([label, body]) => (
              <button key={label} className="sp-attr-option" onClick={() => add([body], true, "history.addedStage")}>
                <FormattedMessage id={label} />
                <code className="muted small">{body}</code>
              </button>
            ))}
          </div>
        )}
      </span>
      <span className="muted small grow right">{intl.formatMessage({ id: "screenplay.lines" }, { count: countLines(ctx.text) })}</span>
    </div>
  );
}

function countLines(text: string): number {
  return (text.match(/^\s*(?:[a-z_][a-z0-9_]*(?:\s+-?[a-z_][a-z0-9_]*)*\s+)?"/gm) ?? []).length;
}

