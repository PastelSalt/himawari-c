import { type Character, type SpriteState, applySpriteWords, spriteLayers } from "@himawari/core";
import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { deletePreset, getBible, getNames, newCharacterFile, setBible, setColor, setName, setPreset } from "../character-edit";
import { LANGUAGE_NAMES } from "../i18n";
import { useStudio } from "../store";
import { RenameDialog } from "./FileEditor";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { SpriteImport } from "./SpriteImport";
import { type Frames, SpriteView } from "./SpriteThumb";

const ID = /^[a-z_][a-z0-9_]*$/;
const COLORS = ["#f2a541", "#e6467a", "#5b8def", "#57d68d", "#b28dff", "#ff7f50", "#2ec4b6", "#c0c4d6"];

/** Characters (plan §11.3): the frontmatter as a form, the bible, and the sprite composer (§6.4). */
export function Characters({ initial }: { initial?: string | undefined }) {
  const model = useStudio((s) => s.model);
  const chars = model ? [...model.check.characters.values()] : [];
  const [selected, setSelected] = useState<string | null>(initial && initial !== "+new" ? initial : (chars[0]?.id ?? null));
  const [creating, setCreating] = useState(initial === "+new");
  useEffect(() => {
    if (initial === "+new") setCreating(true);
    else if (initial) setSelected(initial);
  }, [initial]);
  const c = selected ? model?.check.characters.get(selected) : undefined;
  return (
    <div className="split-page">
      <aside className="split-list">
        <div className="section-head">
          <span>
            <FormattedMessage id="tool.characters" />
          </span>
        </div>
        {chars.map((ch) => (
          <button key={ch.id} className={ch.id === selected ? "tree-row tree-label selected" : "tree-row tree-label"} onClick={() => setSelected(ch.id)}>
            <span className="swatch" style={{ background: ch.color ?? "var(--muted)" }} />
            <span className="ellipsis">{ch.displayName}</span>
            <span className="muted small">{ch.id}</span>
          </button>
        ))}
        <button className="add-row" onClick={() => setCreating(true)}>
          <Icon name="plus" size={13} />
          <FormattedMessage id="characters.new" />
        </button>
      </aside>
      <div className="tool-page">{c ? <CharacterDetail key={c.id} c={c} /> : <p className="muted"><FormattedMessage id="characters.none" /></p>}</div>
      {creating && (
        <NewCharacter
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelected(id);
          }}
        />
      )}
    </div>
  );
}

function NewCharacter({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const [name, setNameValue] = useState("");
  const [id, setId] = useState("");
  const [color, setColorValue] = useState(COLORS[(model?.check.characters.size ?? 0) % COLORS.length]!);
  const suggested = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const finalId = id || suggested;
  const taken = model?.check.characters.has(finalId) ?? false;
  const ok = ID.test(finalId) && !taken && name.trim() !== "";
  const create = () => {
    if (!ok) return;
    const file = `characters/${finalId}.md`;
    useStudio.getState().edit(file, newCharacterFile(finalId, name.trim(), color), "you", { id: "history.newCharacter", values: { name: name.trim() } });
    onCreated(finalId);
  };
  return (
    <Modal title={<FormattedMessage id="characters.new" />} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label className="field">
          <span>
            <FormattedMessage id="characters.name" />
          </span>
          <input autoFocus value={name} onChange={(e) => setNameValue(e.target.value)} />
        </label>
        <label className="field">
          <span>
            <FormattedMessage id="characters.id" />
          </span>
          <input value={finalId} onChange={(e) => setId(e.target.value.toLowerCase())} aria-invalid={finalId !== "" && (!ID.test(finalId) || taken)} />
          <span className="muted small">{taken ? intl.formatMessage({ id: "characters.idTaken" }) : intl.formatMessage({ id: "characters.idHint" })}</span>
        </label>
        <div className="field">
          <span>
            <FormattedMessage id="characters.color" />
          </span>
          <div className="row">
            {COLORS.map((c) => (
              <button type="button" key={c} className={c === color ? "color-dot selected" : "color-dot"} style={{ background: c }} aria-label={c} onClick={() => setColorValue(c)} />
            ))}
            <input type="color" value={color} onChange={(e) => setColorValue(e.target.value)} aria-label={intl.formatMessage({ id: "characters.color" })} />
          </div>
        </div>
        <p className="muted small">
          <FormattedMessage id="characters.placeholderNote" />
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            <FormattedMessage id="common.cancel" />
          </button>
          <button type="submit" className="primary" disabled={!ok}>
            <FormattedMessage id="characters.create" />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CharacterDetail({ c }: { c: Character }) {
  const intl = useIntl();
  const text = useStudio((s) => s.files[c.file] ?? "");
  const manifest = useStudio((s) => s.model?.check.manifest);
  const [renaming, setRenaming] = useState(false);
  const [importing, setImporting] = useState(false);
  const source = manifest?.sourceLanguage ?? "en";
  const languages = manifest?.languages ?? [source];
  const names = getNames(text);
  const edit = (next: string, label: string) => useStudio.getState().edit(c.file, next, "you", { id: label, values: { name: c.displayName } });
  const [bible, setBibleDraft] = useState(getBible(text));
  useEffect(() => setBibleDraft(getBible(text)), [text]);

  return (
    <div className="character-detail">
      <header className="detail-head">
        <span className="swatch big" style={{ background: c.color ?? "var(--muted)" }} />
        <h2>{c.displayName}</h2>
        <code className="muted">{c.id}</code>
        <button className="small-button" onClick={() => setRenaming(true)}>
          <FormattedMessage id="characters.renameId" />
        </button>
        <div className="grow" />
        <button className="small-button" onClick={() => useStudio.getState().open({ kind: "file", file: c.file })}>
          <FormattedMessage id="characters.openFile" />
        </button>
      </header>

      <section className="card">
        <h3>
          <FormattedMessage id="characters.basics" />
        </h3>
        <div className="grid-2">
          {languages.map((l) => (
            <label key={l} className="field">
              <span>
                <FormattedMessage id="characters.nameIn" values={{ language: LANGUAGE_NAMES[l] ?? l }} />
              </span>
              <input
                defaultValue={names[l] ?? (l === source ? (names[""] ?? "") : "")}
                placeholder={l === source ? c.id : c.displayName}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const cur = names[l] ?? (l === source ? (names[""] ?? "") : "");
                  if (v !== cur) edit(setName(text, l, source, v), "history.editedCharacter");
                }}
              />
            </label>
          ))}
          <label className="field">
            <span>
              <FormattedMessage id="characters.color" />
            </span>
            <input type="color" value={c.color ?? "#888888"} onChange={(e) => edit(setColor(text, e.target.value), "history.editedCharacter")} />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="row">
          <h3 className="grow">
            <FormattedMessage id="characters.sprite" />
          </h3>
          <button className="small-button" onClick={() => setImporting(true)}>
            <Icon name="image" size={13} />
            <FormattedMessage id={c.sprite ? "characters.reimport" : "characters.import"} />
          </button>
        </div>
        {c.sprite ? (
          <Composer c={c} text={text} />
        ) : (
          <div className="row">
            <SpriteViewPlaceholder color={c.color} />
            <p className="muted">
              <FormattedMessage id="characters.noSprite" values={{ folder: `assets/sprites/${c.id}/` }} />
            </p>
          </div>
        )}
      </section>

      <section className="card">
        <h3>
          <FormattedMessage id="characters.bible" />
        </h3>
        <p className="muted small">
          <FormattedMessage id="characters.bibleHint" />
        </p>
        <textarea
          className="bible"
          value={bible}
          spellCheck={false}
          onChange={(e) => setBibleDraft(e.target.value)}
          onBlur={() => bible !== getBible(text) && edit(setBible(text, bible), "history.editedBible")}
          aria-label={intl.formatMessage({ id: "characters.bible" })}
        />
      </section>
      {renaming && <RenameDialog kind="character" from={c.id} onClose={() => setRenaming(false)} />}
      {importing && <SpriteImport character={c} onClose={() => setImporting(false)} />}
    </div>
  );
}

function SpriteViewPlaceholder({ color }: { color: string | null }) {
  return (
    <svg viewBox="0 0 100 100" width={120} height={120} aria-hidden="true">
      <circle cx="50" cy="34" r="18" fill={color ?? "#888"} opacity="0.85" />
      <path d="M18 100 C18 66 82 66 82 100 Z" fill={color ?? "#888"} opacity="0.85" />
    </svg>
  );
}

/** The sprite composer (plan §6.4): toggle attributes, apply and save presets, test blink and lip-flap. */
function Composer({ c, text }: { c: Character; text: string }) {
  const intl = useIntl();
  const sprite = c.sprite!;
  const [state, setState] = useState<SpriteState>([]);
  const [blinkTest, setBlinkTest] = useState(false);
  const [lipTest, setLipTest] = useState(false);
  const [frames, setFrames] = useState<Frames>({});
  const [presetName, setPresetName] = useState("");
  const layers = spriteLayers(sprite, state);
  const active = (group: string, attr: string) => layers.some((l) => l.group === group && l.attr === attr);
  // The show line for this look: a preset's name when one matches exactly, else the attributes (each once).
  const shownAttrs = layers.filter((l) => !sprite.groups.find((g) => g.name === l.group)?.always);
  const preset = sprite.presets.find((p) => {
    const look = spriteLayers(sprite, applySpriteWords(sprite, [], [p.name]));
    return look.length === layers.length && look.every((l, i) => l.group === layers[i]!.group && l.attr === layers[i]!.attr);
  });
  const showCommand = ["show", c.id, ...(preset ? [preset.name] : [...new Set(shownAttrs.map((l) => l.attr))])].join(" ");

  useEffect(() => {
    if (!blinkTest && !lipTest) {
      setFrames({});
      return;
    }
    let t = 0;
    const timer = setInterval(() => {
      t += 1;
      const phase = t % 20; // a blink every 2 s at 100 ms ticks
      setFrames({ blink: blinkTest ? (phase === 0 || phase === 2 ? "half" : phase === 1 ? "closed" : null) : null, mouth: lipTest && t % 3 !== 0 ? "open" : null });
    }, 100);
    return () => clearInterval(timer);
  }, [blinkTest, lipTest]);

  const toggle = (group: string, attr: string, multiple: boolean) => setState((s) => applySpriteWords(sprite, s, [multiple && active(group, attr) ? `-${attr}` : attr]));
  const savePreset = () => {
    const name = presetName.trim();
    if (!ID.test(name)) return;
    const set: Record<string, string> = {};
    for (const l of layers) {
      const g = sprite.groups.find((x) => x.name === l.group);
      if (g && !g.always && !g.multiple) set[l.group] = l.attr;
    }
    useStudio.getState().edit(c.file, setPreset(text, name, set), "you", { id: "history.savedPreset", values: { name, character: c.displayName } });
    setPresetName("");
  };

  return (
    <div className="composer">
      <div className="composer-stage">
        <SpriteView sprite={sprite} state={state} color={c.color} size={300} frames={frames} />
        <div className="row small">
          <label className="check">
            <input type="checkbox" checked={blinkTest} onChange={(e) => setBlinkTest(e.target.checked)} />
            <FormattedMessage id="characters.testBlink" />
          </label>
          <label className="check">
            <input type="checkbox" checked={lipTest} onChange={(e) => setLipTest(e.target.checked)} />
            <FormattedMessage id="characters.testLipflap" />
          </label>
        </div>
        <code className="muted small">{showCommand}</code>
      </div>
      <div className="composer-controls">
        <h4>
          <FormattedMessage id="characters.presets" />
        </h4>
        <div className="chips">
          {sprite.presets.map((p) => (
            <span key={p.name} className="preset-chip">
              <button
                className="sp-chip"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", `show ${c.id} ${p.name}`)}
                onClick={() => setState((s) => applySpriteWords(sprite, s, [p.name]))}
                title={intl.formatMessage({ id: "characters.presetHint" })}
              >
                {p.name}
              </button>
              <button className="icon-button" aria-label={intl.formatMessage({ id: "common.delete" })} title={intl.formatMessage({ id: "common.delete" })} onClick={() => useStudio.getState().edit(c.file, deletePreset(text, p.name), "you", { id: "history.deletedPreset", values: { name: p.name, character: c.displayName } })}>
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
          {sprite.presets.length === 0 && (
            <span className="muted small">
              <FormattedMessage id="characters.noPresets" />
            </span>
          )}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            savePreset();
          }}
        >
          <input value={presetName} onChange={(e) => setPresetName(e.target.value.toLowerCase())} placeholder={intl.formatMessage({ id: "characters.presetName" })} aria-invalid={presetName !== "" && !ID.test(presetName)} />
          <button type="submit" disabled={!ID.test(presetName)}>
            <FormattedMessage id="characters.savePreset" />
          </button>
        </form>
        <h4>
          <FormattedMessage id="characters.layers" />
        </h4>
        {[...sprite.groups].reverse().map((g) => (
          <div key={g.name} className="group-row">
            <span className="group-name">
              {g.name}
              {g.always && (
                <span className="badge">
                  <FormattedMessage id="characters.always" />
                </span>
              )}
              {g.multiple && (
                <span className="badge">
                  <FormattedMessage id="characters.multiple" />
                </span>
              )}
            </span>
            <span className="chips">
              {g.attrs.map((a) => (
                <button key={a} className={active(g.name, a) ? "sp-chip on" : "sp-chip"} disabled={g.always} onClick={() => toggle(g.name, a, g.multiple)}>
                  {a}
                </button>
              ))}
            </span>
          </div>
        ))}
        <button className="small-button" onClick={() => setState([])}>
          <FormattedMessage id="characters.resetDefaults" />
        </button>
      </div>
    </div>
  );
}
