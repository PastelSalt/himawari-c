import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { AUDIO_EXT, IMAGE_EXT, assetUrl } from "../assets";
import { setSprite } from "../character-edit";
import { type PlaceholderKind, makeCard, makeCharacter } from "../placeholder";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

const FOLDERS = ["bg", "cg", "sprites", "music", "ambient", "sfx", "voice", "rules"] as const;
const CHANNEL_FOLDER: Record<string, string> = { bg: "bg", cg: "cg", music: "music", ambient: "ambient", sfx: "sfx", voice: "voice", rule: "rules" };
const STATEMENT: Record<string, string> = { bg: "bg", cg: "cg", music: "music", ambient: "ambient", sfx: "sfx" };

/** Assets (plan §11.3): thumbnails, audio preview, unused and missing flags, drag into the editor, placeholders. */
export function Assets() {
  const assets = useStudio((s) => s.assets);
  const model = useStudio((s) => s.model);
  const [making, setMaking] = useState<{ kind: PlaceholderKind; name: string } | null>(null);
  const [adding, setAdding] = useState(false);

  // References from the scripts: which assets are used, which are missing.
  const { used, missing } = useMemo(() => {
    const usedSet = new Set<string>();
    const missingMap = new Map<string, { channel: string; name: string }>();
    for (const r of model?.check.parsed.values() ?? []) {
      for (const ref of r.refs) {
        if (ref.kind !== "asset" || !ref.channel) continue;
        const folder = CHANNEL_FOLDER[ref.channel] ?? ref.channel;
        const hit = assets.find((a) => a.startsWith(`${folder}/${ref.name}.`));
        if (hit) usedSet.add(hit);
        else missingMap.set(`${folder}/${ref.name}`, { channel: ref.channel, name: ref.name });
      }
    }
    return { used: usedSet, missing: [...missingMap.values()] };
  }, [model, assets]);

  const byFolder = (f: string) => assets.filter((a) => a.startsWith(`${f}/`));
  const other = assets.filter((a) => !FOLDERS.some((f) => a.startsWith(`${f}/`)));

  return (
    <div className="tool-page">
      <div className="row">
        <h2 className="grow">
          <FormattedMessage id="tool.assets" />
        </h2>
        <button onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} />
          <FormattedMessage id="assets.add" />
        </button>
        <button className="primary" onClick={() => setMaking({ kind: "bg", name: "" })}>
          <Icon name="image" size={13} />
          <FormattedMessage id="assets.placeholder" />
        </button>
      </div>
      <p className="muted small">
        <FormattedMessage id="assets.hint" />
      </p>

      {missing.length > 0 && (
        <section className="card">
          <h3>
            <FormattedMessage id="assets.missing" values={{ count: missing.length }} />
          </h3>
          <p className="muted small">
            <FormattedMessage id="assets.missingHint" />
          </p>
          <div className="chips">
            {missing.map((m) => (
              <span key={`${m.channel}/${m.name}`} className="missing-chip">
                <code>{`${CHANNEL_FOLDER[m.channel] ?? m.channel}/${m.name}`}</code>
                {(m.channel === "bg" || m.channel === "cg") && (
                  <button className="small-button" onClick={() => setMaking({ kind: m.channel as PlaceholderKind, name: m.name })}>
                    <FormattedMessage id="assets.makeOne" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {FOLDERS.map((f) => {
        const files = byFolder(f);
        if (files.length === 0) return null;
        return (
          <section key={f} className="asset-section">
            <h3>
              <FormattedMessage id={`assets.folder.${f}`} />
              <span className="muted small">{` ${f}/ · ${files.length}`}</span>
            </h3>
            <div className="asset-grid">
              {files.map((a) => (
                <AssetTile key={a} path={a} unused={f !== "voice" && f !== "sprites" && f !== "rules" && !used.has(a)} statement={STATEMENT[f]} />
              ))}
            </div>
          </section>
        );
      })}
      {other.length > 0 && (
        <section className="asset-section">
          <h3>
            <FormattedMessage id="assets.folder.other" />
          </h3>
          <div className="asset-grid">
            {other.map((a) => (
              <AssetTile key={a} path={a} unused={false} />
            ))}
          </div>
        </section>
      )}
      {assets.length === 0 && (
        <p className="muted">
          <FormattedMessage id="assets.none" />
        </p>
      )}
      {making && <PlaceholderMaker initial={making} onClose={() => setMaking(null)} />}
      {adding && <AddAsset onClose={() => setAdding(false)} />}
    </div>
  );
}

function AssetTile({ path, unused, statement }: { path: string; unused: boolean; statement?: string | undefined }) {
  const intl = useIntl();
  const file = path.split("/").pop()!;
  const name = file.replace(/\.[^.]+$/, "");
  const isImage = IMAGE_EXT.test(path);
  const isAudio = AUDIO_EXT.test(path);
  const [playing, setPlaying] = useState(false);
  const dragText = statement ? `${statement} ${name}` : null;
  return (
    <div className="asset-tile" draggable={dragText !== null} onDragStart={(e) => dragText && e.dataTransfer.setData("text/plain", dragText)} title={path}>
      <div className="asset-thumb">
        {isImage && <img src={assetUrl(path)} alt="" loading="lazy" />}
        {isAudio &&
          (playing ? (
            <audio src={assetUrl(path)} autoPlay controls onEnded={() => setPlaying(false)} />
          ) : (
            <button className="icon-button" onClick={() => setPlaying(true)} aria-label={intl.formatMessage({ id: "assets.play" })} title={intl.formatMessage({ id: "assets.play" })}>
              <Icon name="play" size={22} />
            </button>
          ))}
        {!isImage && !isAudio && <Icon name="file" size={26} />}
      </div>
      <div className="asset-name ellipsis">{path.startsWith("sprites/") ? path.slice("sprites/".length) : name}</div>
      {unused && (
        <span className="badge">
          <FormattedMessage id="assets.unused" />
        </span>
      )}
    </div>
  );
}

const PALETTE = ["#6c8ebf", "#e6a157", "#7fb069", "#c06c84", "#8e7dbe", "#4fb3bf", "#d4a373", "#9aa0b8"];

function PlaceholderMaker({ initial, onClose }: { initial: { kind: PlaceholderKind; name: string }; onClose: () => void }) {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const [kind, setKind] = useState<PlaceholderKind>(initial.kind);
  const [name, setName] = useState(initial.name);
  const [label, setLabel] = useState("");
  const [character, setCharacter] = useState(model ? ([...model.check.characters.keys()][0] ?? "") : "");
  const [color, setColor] = useState(PALETTE[0]!);
  const [busy, setBusy] = useState(false);
  const valid = kind === "character" ? character !== "" : /^[a-z_][a-z0-9_]*$/.test(name);
  const make = async () => {
    setBusy(true);
    const s = useStudio.getState();
    if (kind === "character") {
      const c = s.model?.check.characters.get(character);
      if (!c) return;
      const layers = await makeCharacter(c.displayName, c.color ?? color);
      for (const [file, bytes] of Object.entries(layers)) await studio.project.writeAsset(`assets/sprites/${c.id}/${file}`, bytes);
      if (!c.sprite) {
        const text = s.files[c.file] ?? "";
        s.edit(
          c.file,
          setSprite(text, `sprites/${c.id}`, [
            { name: "body", always: true, multiple: false, defaults: [] },
            { name: "eyes", always: false, multiple: false, defaults: ["neutral"] },
            { name: "mouth", always: false, multiple: false, defaults: ["neutral"] },
          ]),
          "you",
          { id: "history.placeholderCharacter", values: { name: c.displayName } },
        );
      }
    } else {
      const sub = intl.formatMessage({ id: "assets.placeholderSub" }, { file: `${kind}/${name}.png` });
      await studio.project.writeAsset(`assets/${kind}/${name}.png`, await makeCard(label || name, color, sub));
    }
    onClose();
  };
  return (
    <Modal title={<FormattedMessage id="assets.placeholder" />} onClose={onClose}>
      <div className="form">
        <p className="muted small">
          <FormattedMessage id="assets.placeholderExplain" />
        </p>
        <div className="segmented">
          {(["bg", "cg", "character"] as const).map((k) => (
            <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
              <FormattedMessage id={`assets.kind.${k}`} />
            </button>
          ))}
        </div>
        {kind === "character" ? (
          <label className="field">
            <span>
              <FormattedMessage id="tool.characters" />
            </span>
            <select value={character} onChange={(e) => setCharacter(e.target.value)}>
              {[...(model?.check.characters.values() ?? [])].map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="field">
              <span>
                <FormattedMessage id="assets.fileName" />
              </span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={name !== "" && !valid} />
            </label>
            <label className="field">
              <span>
                <FormattedMessage id="assets.label" />
              </span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={name} />
            </label>
            <div className="field">
              <span>
                <FormattedMessage id="characters.color" />
              </span>
              <div className="row">
                {PALETTE.map((c) => (
                  <button key={c} className={c === color ? "color-dot selected" : "color-dot"} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
          </>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>
            <FormattedMessage id="common.cancel" />
          </button>
          <button className="primary" disabled={!valid || busy} onClick={() => void make()}>
            <FormattedMessage id="assets.create" />
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddAsset({ onClose }: { onClose: () => void }) {
  const [folder, setFolder] = useState<string>("bg");
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    const audio = ["music", "ambient", "sfx", "voice"].includes(folder);
    const path = await studio.dialog.pickFile(audio ? "audio" : "image");
    if (!path) return;
    try {
      const bytes = await studio.project.readExternal(path);
      const file = path.split(/[\\/]/).pop()!.toLowerCase().replace(/\s+/g, "_");
      await studio.project.writeAsset(`assets/${folder}/${file}`, bytes);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <Modal title={<FormattedMessage id="assets.add" />} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>
            <FormattedMessage id="assets.into" />
          </span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            {["bg", "cg", "music", "ambient", "sfx", "voice", "rules"].map((f) => (
              <option key={f} value={f}>
                {f}/
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          <FormattedMessage id="assets.addHint" />
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>
            <FormattedMessage id="common.cancel" />
          </button>
          <button className="primary" onClick={() => void add()}>
            <FormattedMessage id="assets.chooseFile" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
