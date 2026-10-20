/**
 * Forms for stage directions, flow, variables, and conditions (FINALIZATION.md
 * §3.1, NC-1 to NC-7). Writers pick from what exists (backgrounds with
 * thumbnails, characters and their expressions, positions, sounds with ▶,
 * scenes, remembered values) and never type script syntax. Every form has an
 * "Edit as script" way out for people who code.
 */
import { type Character, characterWords } from "@himawari/core";
import { useMemo, useState } from "react";
import { FormattedMessage, type IntlShape, useIntl } from "react-intl";
import { AUDIO_EXT, IMAGE_EXT, assetUrl, findImage, namesIn } from "../assets";
import type { InvokeForm, InvokeParam, InvokeValue } from "../invoke-form";
import { type CompareOp, COMPARE_OPS, type CondForm, type CondPart, type Literal, type StageForm, TRANSITION_TYPES, type TransitionForm } from "../stage-forms";
import { useStudio } from "../store";
import { Icon } from "./Icon";
import { SpriteThumb } from "./SpriteThumb";

const FOLDER: Record<string, string> = { bg: "bg", cg: "cg", music: "music", ambient: "ambient", sfx: "sfx", voice: "voice" };
const DEFAULT_POSITIONS = ["left", "center", "right"];

function useProject() {
  const model = useStudio((s) => s.model);
  const assets = useStudio((s) => s.assets);
  const manifest = model?.check.manifest ?? null;
  return {
    assets,
    characters: model ? [...model.check.characters.values()] : [],
    positions: manifest ? Object.keys(manifest.positions) : DEFAULT_POSITIONS,
    scenes: model?.scenes.map((s) => s.id) ?? [],
    variables: manifest?.variables ?? {},
  };
}

const seconds = (ms: number | null) => (ms === null ? "" : String(Math.round(ms) / 1000));
const toMs = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v) * 1000)));

// ---- One-line summaries ----

function charName(chars: readonly Character[], id: string) {
  return chars.find((c) => c.id === id)?.displayName ?? id;
}

function posName(intl: IntlShape, p: string) {
  return DEFAULT_POSITIONS.includes(p) ? intl.formatMessage({ id: `stage.pos.${p}` }) : p;
}

function transitionName(intl: IntlShape, t: TransitionForm | null) {
  if (!t) return "";
  return intl.formatMessage({ id: "stage.sum.with" }, { name: intl.formatMessage({ id: `stage.trans.${t.type}` }) });
}

/** A form as one sentence in the UI language: "Show Hana (smile) on the left, fading in". */
export function describeForm(intl: IntlShape, f: StageForm, chars: readonly Character[]): string {
  const t = (id: string, values: Record<string, string | number> = {}) => intl.formatMessage({ id }, values);
  switch (f.kind) {
    case "bg":
    case "cg":
      return t(`stage.sum.${f.kind}`, { name: f.asset }) + transitionName(intl, f.transition);
    case "show":
      return (
        t("stage.sum.show", { name: charName(chars, f.char), attrs: [...f.add, ...f.remove.map((a) => `−${a}`)].join(", ") || "none", at: f.at ? posName(intl, f.at) : "none" }) +
        transitionName(intl, f.transition)
      );
    case "hide":
      return t("stage.sum.hide", { name: charName(chars, f.char) }) + transitionName(intl, f.transition);
    case "move":
      return t("stage.sum.move", { name: charName(chars, f.char), at: f.at ? posName(intl, f.at) : "none" }) + transitionName(intl, f.transition);
    case "audio":
      return t(`stage.sum.${f.channel}`, { name: f.asset });
    case "stop":
      return t(`stage.sum.stop.${f.channel}`);
    case "wait":
      return t("stage.sum.wait", { s: f.ms / 1000 });
    case "effect":
      return t(`stage.sum.${f.effect}`);
    case "jump":
    case "call":
      return t(`stage.sum.${f.kind}`, { name: f.target });
    case "return":
    case "end":
      return t(`stage.sum.${f.kind}`);
    case "textbox":
      return t(`stage.sum.textbox.${f.mode}`);
    case "assign":
      return assignSentence(intl, f.name, f.op, f.value);
  }
}

function valueText(intl: IntlShape, v: Literal) {
  if (v.type === "bool") return intl.formatMessage({ id: v.value ? "stage.yes" : "stage.no" });
  return String(v.value);
}

function assignSentence(intl: IntlShape, name: string, op: string, v: Literal) {
  if (op === "=" && v.type === "bool") return intl.formatMessage({ id: v.value ? "stage.sum.flagOn" : "stage.sum.flagOff" }, { name });
  const key = op === "+=" ? "add" : op === "-=" ? "subtract" : op === "*=" ? "multiply" : "set";
  return intl.formatMessage({ id: `stage.sum.assign.${key}` }, { name, value: valueText(intl, v) });
}

export function describeCondition(intl: IntlShape, c: CondForm): string {
  const parts = c.parts.map((p) =>
    p.kind === "flag"
      ? intl.formatMessage({ id: p.negate ? "stage.cond.flagOff" : "stage.cond.flagOn" }, { name: p.name })
      : intl.formatMessage({ id: `stage.cond.op.${opKey(p.op)}` }, { name: p.name, value: valueText(intl, p.value) }),
  );
  return parts.join(intl.formatMessage({ id: c.join === "and" ? "stage.cond.and" : "stage.cond.or" }));
}

const opKey = (op: CompareOp) => ({ "==": "eq", "!=": "ne", ">=": "ge", "<=": "le", ">": "gt", "<": "lt" })[op];

// ---- Pickers ----

function AssetField({ folder, value, onChange, label }: { folder: string; value: string; onChange: (v: string) => void; label: string }) {
  const intl = useIntl();
  const { assets } = useProject();
  const names = useMemo(() => namesIn(assets, folder), [assets, folder]);
  const image = findImage(assets, folder, value);
  const sound = assets.find((a) => a.startsWith(`${folder}/${value}.`) && AUDIO_EXT.test(a));
  const [adding, setAdding] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row wrap">
        {adding ? (
          <input
            autoFocus
            placeholder={intl.formatMessage({ id: "stage.newName" })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = slug((e.target as HTMLInputElement).value);
                if (v) onChange(v);
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={(e) => {
              const v = slug(e.target.value);
              if (v) onChange(v);
              setAdding(false);
            }}
          />
        ) : (
          <select value={value} onChange={(e) => (e.target.value === "\u0000new" ? setAdding(true) : onChange(e.target.value))} aria-label={label}>
            {!names.includes(value) && value && <option value={value}>{intl.formatMessage({ id: "stage.notDrawn" }, { name: value })}</option>}
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={"\u0000new"}>{intl.formatMessage({ id: "stage.newPlaceholder" })}</option>
          </select>
        )}
        {image && IMAGE_EXT.test(image) && <img className="stage-thumb" src={assetUrl(image)} alt="" />}
        {sound && <audio className="stage-audio" src={assetUrl(sound)} controls preload="none" />}
      </div>
    </div>
  );
}

function CharacterField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { characters } = useProject();
  return (
    <label className="field">
      <span>
        <FormattedMessage id="stage.field.character" />
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!characters.some((c) => c.id === value) && <option value={value}>{value}</option>}
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName}
          </option>
        ))}
      </select>
      {characters.length === 0 && (
        <span className="muted small">
          <FormattedMessage id="stage.noCharacters" />
        </span>
      )}
    </label>
  );
}

function ExpressionField({ char, add, remove, onChange }: { char: string; add: string[]; remove: string[]; onChange: (add: string[], remove: string[]) => void }) {
  const { characters } = useProject();
  const c = characters.find((x) => x.id === char);
  if (!c) return null;
  const words = [...characterWords(c)].sort();
  if (words.length === 0) return null;
  return (
    <div className="field">
      <span>
        <FormattedMessage id="stage.field.expression" />
      </span>
      <div className="stage-chips">
        {words.map((w) => {
          const on = add.includes(w);
          return (
            <button
              key={w}
              className={on ? "stage-chip on" : "stage-chip"}
              aria-pressed={on}
              onClick={() => onChange(on ? add.filter((a) => a !== w) : [...add, w], remove.filter((r) => r !== w))}
            >
              {c.hasSprite && <SpriteThumb character={c.id} attrs={[w]} size={36} />}
              <span>{w}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PositionField({ value, onChange, allowNone }: { value: string | null; onChange: (v: string | null) => void; allowNone: boolean }) {
  const intl = useIntl();
  const { positions } = useProject();
  return (
    <div className="field">
      <span>
        <FormattedMessage id="stage.field.position" />
      </span>
      <div className="segmented">
        {allowNone && (
          <button className={value === null ? "active" : ""} onClick={() => onChange(null)}>
            <FormattedMessage id="stage.pos.same" />
          </button>
        )}
        {positions.map((p) => (
          <button key={p} className={value === p ? "active" : ""} onClick={() => onChange(p)}>
            {posName(intl, p)}
          </button>
        ))}
      </div>
    </div>
  );
}

function TransitionField({ value, onChange }: { value: TransitionForm | null; onChange: (t: TransitionForm | null) => void }) {
  const intl = useIntl();
  const { assets } = useProject();
  const masks = useMemo(() => namesIn(assets, "rules"), [assets]);
  return (
    <div className="field">
      <span>
        <FormattedMessage id="stage.field.transition" />
      </span>
      <div className="row wrap">
        <select
          value={value?.type ?? ""}
          aria-label={intl.formatMessage({ id: "stage.field.transition" })}
          onChange={(e) => {
            const type = e.target.value;
            if (!type) onChange(null);
            else onChange({ type, ms: value?.ms ?? null, ...(type === "rule" ? { mask: value?.mask ?? masks[0] ?? "wipe_left" } : {}) });
          }}
        >
          <option value="">{intl.formatMessage({ id: "stage.trans.none" })}</option>
          {TRANSITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {intl.formatMessage({ id: `stage.trans.${t}` })}
            </option>
          ))}
        </select>
        {value && (
          <label className="row small">
            <input
              type="number"
              min={0}
              step={0.1}
              className="stage-seconds"
              value={seconds(value.ms)}
              placeholder={intl.formatMessage({ id: "stage.defaultSpeed" })}
              onChange={(e) => onChange({ ...value, ms: toMs(e.target.value) })}
            />
            <FormattedMessage id="stage.seconds" />
          </label>
        )}
        {value?.type === "rule" && (
          <select value={value.mask ?? ""} onChange={(e) => onChange({ ...value, mask: e.target.value })} aria-label={intl.formatMessage({ id: "stage.field.mask" })}>
            {value.mask && !masks.includes(value.mask) && <option value={value.mask}>{value.mask}</option>}
            {masks.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function SceneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { scenes } = useProject();
  return (
    <label className="field">
      <span>
        <FormattedMessage id="stage.field.scene" />
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!scenes.includes(value) && <option value={value}>{value}</option>}
        {scenes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

function SecondsField({ label, ms, onChange, allowEmpty }: { label: string; ms: number | null; onChange: (ms: number | null) => void; allowEmpty: boolean }) {
  const intl = useIntl();
  return (
    <label className="field">
      <span>{label}</span>
      <span className="row small">
        <input
          type="number"
          min={0}
          step={0.1}
          className="stage-seconds"
          value={seconds(ms)}
          placeholder={allowEmpty ? intl.formatMessage({ id: "stage.none" }) : ""}
          onChange={(e) => {
            const v = toMs(e.target.value);
            if (v !== null || allowEmpty) onChange(v);
          }}
        />
        <FormattedMessage id="stage.seconds" />
      </span>
    </label>
  );
}

/** A remembered value (variable): pick one, or make a new one by name. */
function VariableField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const intl = useIntl();
  const { variables } = useProject();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"bool" | "int" | "str">("bool");
  const names = Object.keys(variables).sort();
  if (adding) {
    const create = () => {
      const id = slug(name);
      if (id && addVariable(id, type)) onChange(id);
      setAdding(false);
    };
    return (
      <div className="field">
        <span>
          <FormattedMessage id="stage.newValue" />
        </span>
        <div className="row wrap">
          <input autoFocus value={name} placeholder={intl.formatMessage({ id: "stage.newValueName" })} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label={intl.formatMessage({ id: "variables.type" })}>
            <option value="bool">{intl.formatMessage({ id: "variables.typeName.bool" })}</option>
            <option value="int">{intl.formatMessage({ id: "variables.typeName.int" })}</option>
            <option value="str">{intl.formatMessage({ id: "variables.typeName.str" })}</option>
          </select>
          <button className="small-button" onClick={create} disabled={!slug(name)}>
            <FormattedMessage id="common.add" />
          </button>
          <button className="small-button" onClick={() => setAdding(false)}>
            <FormattedMessage id="common.cancel" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <label className="field">
      <span>
        <FormattedMessage id="stage.field.value" />
      </span>
      <select value={value} onChange={(e) => (e.target.value === "\u0000new" ? setAdding(true) : onChange(e.target.value))}>
        {!names.includes(value) && <option value={value}>{value}</option>}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value={"\u0000new"}>{intl.formatMessage({ id: "stage.newValueOption" })}</option>
      </select>
    </label>
  );
}

/** An input for a value of a variable's type: yes/no, a number, one of an enum's words, or text. */
function LiteralField({ variable, value, onChange, label }: { variable: string; value: Literal; onChange: (v: Literal) => void; label: string }) {
  const intl = useIntl();
  const { variables } = useProject();
  const decl = variables[variable];
  const type = decl?.type ?? value.type;
  return (
    <label className="field">
      <span>{label}</span>
      {type === "bool" ? (
        <select value={value.type === "bool" && value.value ? "true" : "false"} onChange={(e) => onChange({ type: "bool", value: e.target.value === "true" })}>
          <option value="true">{intl.formatMessage({ id: "stage.yes" })}</option>
          <option value="false">{intl.formatMessage({ id: "stage.no" })}</option>
        </select>
      ) : type === "int" ? (
        <input type="number" step={1} value={value.type === "int" ? value.value : 0} onChange={(e) => onChange({ type: "int", value: Math.trunc(Number(e.target.value) || 0) })} />
      ) : decl?.enum ? (
        <select value={String(value.value)} onChange={(e) => onChange({ type: "str", value: e.target.value })}>
          {decl.enum.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      ) : (
        <input value={value.type === "str" ? value.value : ""} onChange={(e) => onChange({ type: "str", value: e.target.value })} />
      )}
    </label>
  );
}

function defaultLiteral(type: string | undefined): Literal {
  return type === "int" ? { type: "int", value: 1 } : type === "str" ? { type: "str", value: "" } : { type: "bool", value: true };
}

/** "Hana trusts you" → hana_trusts_you (identifiers stay ASCII; other scripts get a numbered name). */
export function slug(name: string): string {
  const s = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) return name.trim() ? `value_${Date.now().toString(36).slice(-4)}` : "";
  return /^[0-9]/.test(s) ? `v_${s}` : s;
}

/** Declares a variable in himawari.json (one undo step). */
function addVariable(name: string, type: "bool" | "int" | "str"): boolean {
  const s = useStudio.getState();
  const text = s.files["himawari.json"];
  if (!text) return false;
  try {
    const m = JSON.parse(text) as { variables?: Record<string, unknown> };
    m.variables = { ...(m.variables ?? {}) };
    if (!m.variables[name]) m.variables[name] = { type, default: type === "bool" ? false : type === "int" ? 0 : "", scope: "save" };
    s.edit("himawari.json", `${JSON.stringify(m, null, 2)}\n`, "you", { id: "history.addedVariable", values: { name } });
    return true;
  } catch {
    return false;
  }
}

// ---- The editors ----

/** The form for one statement. Every change is applied at once (and is one undo step). */
export function StageEditor({ form, onChange, onScript, onClose }: { form: StageForm; onChange: (f: StageForm) => void; onScript: () => void; onClose: () => void }) {
  const intl = useIntl();
  const { variables } = useProject();
  const f = form;
  let fields: React.ReactNode = null;
  switch (f.kind) {
    case "bg":
    case "cg":
      fields = (
        <>
          <AssetField folder={f.kind} value={f.asset} label={intl.formatMessage({ id: `stage.field.${f.kind}` })} onChange={(asset) => onChange({ ...f, asset })} />
          <TransitionField value={f.transition} onChange={(transition) => onChange({ ...f, transition })} />
        </>
      );
      break;
    case "show":
      fields = (
        <>
          <CharacterField value={f.char} onChange={(char) => onChange({ ...f, char, add: [], remove: [] })} />
          <ExpressionField char={f.char} add={f.add} remove={f.remove} onChange={(add, remove) => onChange({ ...f, add, remove })} />
          <PositionField value={f.at} allowNone onChange={(at) => onChange({ ...f, at })} />
          <TransitionField value={f.transition} onChange={(transition) => onChange({ ...f, transition })} />
        </>
      );
      break;
    case "hide":
      fields = (
        <>
          <CharacterField value={f.char} onChange={(char) => onChange({ ...f, char })} />
          <TransitionField value={f.transition} onChange={(transition) => onChange({ ...f, transition })} />
        </>
      );
      break;
    case "move":
      fields = (
        <>
          <CharacterField value={f.char} onChange={(char) => onChange({ ...f, char })} />
          <PositionField value={f.at} allowNone={false} onChange={(at) => onChange({ ...f, at })} />
          <TransitionField value={f.transition} onChange={(transition) => onChange({ ...f, transition })} />
        </>
      );
      break;
    case "audio":
      fields = (
        <>
          <AssetField folder={FOLDER[f.channel] ?? f.channel} value={f.asset} label={intl.formatMessage({ id: `stage.field.${f.channel}` })} onChange={(asset) => onChange({ ...f, asset })} />
          {(f.channel === "music" || f.channel === "ambient") && <SecondsField label={intl.formatMessage({ id: "stage.field.fadeIn" })} ms={f.fadeMs} allowEmpty onChange={(fadeMs) => onChange({ ...f, fadeMs })} />}
        </>
      );
      break;
    case "stop":
      fields = (
        <>
          <div className="field">
            <span>
              <FormattedMessage id="stage.field.stopWhat" />
            </span>
            <div className="segmented">
              {(["music", "ambient", "voice"] as const).map((c) => (
                <button key={c} className={f.channel === c ? "active" : ""} onClick={() => onChange({ ...f, channel: c })}>
                  <FormattedMessage id={`stage.channel.${c}`} />
                </button>
              ))}
            </div>
          </div>
          <SecondsField label={intl.formatMessage({ id: "stage.field.fadeOut" })} ms={f.fadeMs} allowEmpty onChange={(fadeMs) => onChange({ ...f, fadeMs })} />
        </>
      );
      break;
    case "wait":
      fields = <SecondsField label={intl.formatMessage({ id: "stage.field.wait" })} ms={f.ms} allowEmpty={false} onChange={(ms) => onChange({ ...f, ms: ms ?? 0 })} />;
      break;
    case "effect":
      fields = (
        <>
          <div className="segmented">
            {(["shake", "flash"] as const).map((e) => (
              <button key={e} className={f.effect === e ? "active" : ""} onClick={() => onChange({ ...f, effect: e })}>
                <FormattedMessage id={`stage.sum.${e}`} />
              </button>
            ))}
          </div>
          <SecondsField label={intl.formatMessage({ id: "stage.field.duration" })} ms={f.ms} allowEmpty onChange={(ms) => onChange({ ...f, ms })} />
        </>
      );
      break;
    case "jump":
    case "call":
      fields = (
        <>
          <div className="segmented">
            {(["jump", "call"] as const).map((k) => (
              <button key={k} className={f.kind === k ? "active" : ""} onClick={() => onChange({ kind: k, target: f.target })}>
                <FormattedMessage id={`stage.flow.${k}`} />
              </button>
            ))}
          </div>
          <SceneField value={f.target} onChange={(target) => onChange({ ...f, target })} />
        </>
      );
      break;
    case "textbox":
      fields = (
        <div className="segmented">
          {(["adv", "nvl", "clear", "hide", "show"] as const).map((m) => (
            <button key={m} className={f.mode === m ? "active" : ""} onClick={() => onChange({ ...f, mode: m })}>
              <FormattedMessage id={`stage.sum.textbox.${m}`} />
            </button>
          ))}
        </div>
      );
      break;
    case "assign": {
      const type = variables[f.name]?.type ?? f.value.type;
      fields = (
        <>
          <VariableField value={f.name} onChange={(name) => onChange({ ...f, name, op: "=", value: defaultLiteral(variables[name]?.type) })} />
          <div className="field">
            <span>
              <FormattedMessage id="stage.field.change" />
            </span>
            <div className="segmented">
              {(type === "int" ? (["=", "+=", "-=", "*="] as const) : (["="] as const)).map((op) => (
                <button key={op} className={f.op === op ? "active" : ""} onClick={() => onChange({ ...f, op })}>
                  <FormattedMessage id={`stage.op.${op === "=" ? "set" : op === "+=" ? "add" : op === "-=" ? "subtract" : "multiply"}`} />
                </button>
              ))}
            </div>
          </div>
          <LiteralField variable={f.name} value={f.value} label={intl.formatMessage({ id: "stage.field.to" })} onChange={(value) => onChange({ ...f, value })} />
        </>
      );
      break;
    }
    case "return":
    case "end":
      fields = (
        <p className="muted small">
          <FormattedMessage id={`stage.help.${f.kind}`} />
        </p>
      );
      break;
  }
  return (
    <div className="stage-editor" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="stage-fields">{fields}</div>
      <div className="row">
        <button className="link-button small" onClick={onScript}>
          <Icon name="code" size={12} />
          <FormattedMessage id="stage.asScript" />
        </button>
        <div className="grow" />
        <button className="small-button" onClick={onClose}>
          <FormattedMessage id="stage.done" />
        </button>
      </div>
    </div>
  );
}

/** "Only if …": a condition built from remembered values, in words. */
export function ConditionEditor({ cond, onChange, onScript, onClose, onRemove }: { cond: CondForm; onChange: (c: CondForm) => void; onScript: () => void; onClose: () => void; onRemove?: () => void }) {
  const intl = useIntl();
  const { variables } = useProject();
  const names = Object.keys(variables).sort();
  const setPart = (i: number, p: CondPart) => onChange({ ...cond, parts: cond.parts.map((x, j) => (j === i ? p : x)) });
  const partFor = (name: string): CondPart => {
    const t = variables[name]?.type;
    if (t === "bool") return { kind: "flag", name, negate: false };
    if (t === "int") return { kind: "compare", name, op: ">=", value: { type: "int", value: 1 } };
    return { kind: "compare", name, op: "==", value: { type: "str", value: variables[name]?.enum?.[0] ?? "" } };
  };
  return (
    <div className="stage-editor">
      {cond.parts.map((p, i) => (
        <div key={i} className="row wrap stage-cond">
          {i > 0 && (
            <select value={cond.join} onChange={(e) => onChange({ ...cond, join: e.target.value === "or" ? "or" : "and" })} aria-label={intl.formatMessage({ id: "stage.cond.join" })}>
              <option value="and">{intl.formatMessage({ id: "stage.cond.andWord" })}</option>
              <option value="or">{intl.formatMessage({ id: "stage.cond.orWord" })}</option>
            </select>
          )}
          <select value={p.name} onChange={(e) => setPart(i, partFor(e.target.value))} aria-label={intl.formatMessage({ id: "stage.field.value" })}>
            {!names.includes(p.name) && <option value={p.name}>{p.name}</option>}
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {p.kind === "flag" ? (
            <select value={p.negate ? "no" : "yes"} onChange={(e) => setPart(i, { ...p, negate: e.target.value === "no" })} aria-label={intl.formatMessage({ id: "stage.field.change" })}>
              <option value="yes">{intl.formatMessage({ id: "stage.cond.isYes" })}</option>
              <option value="no">{intl.formatMessage({ id: "stage.cond.isNo" })}</option>
            </select>
          ) : (
            <>
              <select value={p.op} onChange={(e) => setPart(i, { ...p, op: e.target.value as CompareOp })} aria-label={intl.formatMessage({ id: "stage.field.change" })}>
                {(variables[p.name]?.type === "int" ? COMPARE_OPS : (["==", "!="] as const)).map((op) => (
                  <option key={op} value={op}>
                    {intl.formatMessage({ id: `stage.cond.opWord.${opKey(op)}` })}
                  </option>
                ))}
              </select>
              <LiteralField variable={p.name} value={p.value} label="" onChange={(value) => setPart(i, { ...p, value })} />
            </>
          )}
          {cond.parts.length > 1 && (
            <button className="icon-button" aria-label={intl.formatMessage({ id: "common.delete" })} onClick={() => onChange({ ...cond, parts: cond.parts.filter((_, j) => j !== i) })}>
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      ))}
      <div className="row">
        {names.length > 0 && (
          <button className="link-button small" onClick={() => onChange({ ...cond, parts: [...cond.parts, partFor(names[0]!)] })}>
            <Icon name="plus" size={12} />
            <FormattedMessage id="stage.cond.addPart" />
          </button>
        )}
        <button className="link-button small" onClick={onScript}>
          <Icon name="code" size={12} />
          <FormattedMessage id="stage.asScript" />
        </button>
        <div className="grow" />
        {onRemove && (
          <button className="small-button" onClick={onRemove}>
            <FormattedMessage id="stage.cond.remove" />
          </button>
        )}
        <button className="small-button" onClick={onClose}>
          <FormattedMessage id="stage.done" />
        </button>
      </div>
    </div>
  );
}

/** A first condition for "Only if…": the first remembered value, or none when the project has none. */
export function firstCondition(variables: Record<string, { type: string; enum?: string[] }>): CondForm | null {
  const name = Object.keys(variables).sort()[0];
  if (!name) return null;
  const t = variables[name]!.type;
  const part: CondPart =
    t === "bool" ? { kind: "flag", name, negate: false } : t === "int" ? { kind: "compare", name, op: ">=", value: { type: "int", value: 1 } } : { kind: "compare", name, op: "==", value: { type: "str", value: variables[name]!.enum?.[0] ?? "" } };
  return { join: "and", parts: [part] };
}

// ---- Saved steps (macros) and extension statements ----

function ParamField({ p, value, onChange }: { p: InvokeParam; value: InvokeValue | null; onChange: (v: InvokeValue | null) => void }) {
  const intl = useIntl();
  const label = p.description ?? p.name;
  const name = value && value.kind !== "int" ? String(value.value) : "";
  const setName = (v: string | null) => onChange(v === null || v === "" ? null : { kind: "name", value: v });
  switch (p.type) {
    case "character":
      return <CharacterField value={name} onChange={setName} />;
    case "position":
      return <PositionField value={name || null} allowNone={!p.required} onChange={setName} />;
    case "scene":
      return <SceneField value={name} onChange={setName} />;
    case "bg":
    case "cg":
    case "music":
    case "sfx":
    case "ambient":
    case "voice":
      return <AssetField folder={p.type} value={name} label={label} onChange={setName} />;
    case "transition":
    case "word":
    case "bool": {
      const options = p.type === "transition" ? [...TRANSITION_TYPES] : p.type === "bool" ? ["true", "false"] : (p.enum ?? null);
      const shown = (o: string) =>
        p.type === "transition" ? intl.formatMessage({ id: `stage.trans.${o}` }) : p.type === "bool" ? intl.formatMessage({ id: o === "true" ? "stage.yes" : "stage.no" }) : o;
      return (
        <label className="field">
          <span>{label}</span>
          {options ? (
            <select value={name} onChange={(e) => setName(e.target.value || null)}>
              {!p.required && <option value="">{intl.formatMessage({ id: "stage.usual" })}</option>}
              {options.map((o) => (
                <option key={o} value={o}>
                  {shown(o)}
                </option>
              ))}
            </select>
          ) : (
            <input value={name} onChange={(e) => setName(slug(e.target.value) || null)} />
          )}
        </label>
      );
    }
    case "int":
      return (
        <label className="field">
          <span>{label}</span>
          <input
            type="number"
            step={1}
            value={value?.kind === "int" ? value.value : ""}
            placeholder={p.required ? "" : intl.formatMessage({ id: "stage.usual" })}
            onChange={(e) => onChange(e.target.value === "" ? null : { kind: "int", value: Math.trunc(Number(e.target.value) || 0) })}
          />
        </label>
      );
    default:
      return (
        <label className="field grow">
          <span>{label}</span>
          <input value={value?.kind === "text" ? value.value : ""} onChange={(e) => onChange({ kind: "text", value: e.target.value })} />
        </label>
      );
  }
}

/** A saved step (macro) or extension call: one field per parameter. */
export function InvokeEditor({ form, onChange, onScript, onClose }: { form: InvokeForm; onChange: (f: InvokeForm) => void; onScript: () => void; onClose: () => void }) {
  return (
    <div className="stage-editor">
      <div className="stage-fields">
        {form.params.map((p) => (
          <ParamField key={p.name} p={p} value={form.values[p.name] ?? null} onChange={(v) => onChange({ ...form, values: { ...form.values, [p.name]: v } })} />
        ))}
      </div>
      <div className="row">
        <button className="link-button small" onClick={onScript}>
          <Icon name="code" size={12} />
          <FormattedMessage id="stage.asScript" />
        </button>
        <div className="grow" />
        <button className="small-button" onClick={onClose}>
          <FormattedMessage id="stage.done" />
        </button>
      </div>
    </div>
  );
}

/** "Saved steps: enter · Hana, left" or the extension's description. */
export function describeInvoke(intl: IntlShape, f: InvokeForm, chars: readonly Character[]): string {
  const values = f.params
    .map((p) => f.values[p.name])
    .filter((v): v is InvokeValue => v !== null)
    .map((v) => (v.kind === "name" ? charName(chars, v.value) : String(v.value)));
  return intl.formatMessage({ id: f.of === "macro" ? "stage.sum.macro" : "stage.sum.extension" }, { name: f.name, args: values.join(", ") || "none" });
}
