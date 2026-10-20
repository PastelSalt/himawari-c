import {
  CONTRAST_PAIRS,
  type ResolvedTheme,
  THEME_COLORS,
  THEME_PALETTES,
  THEME_PRESET_NAMES,
  THEME_STRING_KEYS,
  type ThemeColor,
  contrastRatio,
  resolveTheme,
} from "@himawari/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { studio } from "../api";
import { assetUrl, findImage, namesIn } from "../assets";
import { diagnosticsOf } from "../model";
import { useStudio } from "../store";
import { ColorPicker } from "./ColorPicker";
import { Icon } from "./Icon";

/*
 * The UI Designer (plan §11.6, rfcs/0010): restyle the game's built-in UI
 * by hand. A mock of each screen drawn from the resolved theme, where
 * elements can be dragged and resized; presets, palettes, the color wheel,
 * and readability checks beside it. Every change is an ordinary edit of
 * theme/theme.json (undo, autosave, rebuild), so the docked preview shows
 * the real game a moment later.
 */

const FILE = "theme/theme.json";
type Raw = Record<string, unknown>;
type Screen = "story" | "choices" | "page" | "title" | "menu";
type El = "textbox" | "text" | "nameplate" | "quickbar" | "choices" | "page" | "title" | "title_menu" | "game_menu";
type Mode = "move" | "nw" | "ne" | "sw" | "se";
type Box = { x: number; y: number; w: number; h: number };

const SCREENS: Screen[] = ["story", "choices", "page", "title", "menu"];
const ELEMENTS: Record<Screen, El[]> = {
  story: ["textbox", "text", "nameplate", "quickbar"],
  choices: ["textbox", "choices"],
  page: ["page"],
  title: ["title", "title_menu"],
  menu: ["game_menu"],
};
/** The runtime screen that shows each mock (debug pipe `screen`). */
const PREVIEW_SCREEN: Record<Screen, string> = { story: "play", choices: "play", page: "play", title: "title", menu: "menu" };
const MENU_COUNT: Record<string, number> = { title_menu: 5, game_menu: 7 };
const BLINDNESS = ["none", "protanopia", "deuteranopia", "tritanopia"] as const;
/** Settings a preset replaces when it's applied (the game's strings, fonts, images, and sounds stay). */
const LOOK_GROUPS = ["colors", "shape", "layout", "motion"];

const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => Math.round(v * 10) / 10;

/** `raw` with `path` set to `value` (undefined removes it, and groups left empty). */
export function setIn(raw: Raw, path: string[], value: unknown): Raw {
  const [head, ...rest] = path;
  if (head === undefined) return raw;
  const out: Raw = { ...raw };
  if (rest.length === 0) {
    if (value === undefined) delete out[head];
    else out[head] = value;
    return out;
  }
  const child = setIn(isObject(raw[head]) ? raw[head] : {}, rest, value);
  if (Object.keys(child).length === 0) delete out[head];
  else out[head] = child;
  return out;
}

/** Where an element is, in fractions of the screen (pixels are at a 1080-pixel-high screen). */
export function geometry(t: ResolvedTheme, el: El, aspect: number): Box {
  const L = t.layout;
  const W = 1080 * aspect;
  const tb = { x: L.textbox.x / 100, y: L.textbox.y / 100, w: L.textbox.width / 100, h: L.textbox.height / 100 };
  switch (el) {
    case "textbox":
      return tb;
    case "page":
      return { x: L.page.x / 100, y: L.page.y / 100, w: L.page.width / 100, h: L.page.height / 100 };
    case "text":
      return { x: tb.x + L.text.left / W, y: tb.y + L.text.top / 1080, w: Math.max(0.02, tb.w - (L.text.left + L.text.right) / W), h: Math.max(0.02, tb.h - L.text.top / 1080 - 56 / 1080) };
    case "nameplate":
      return { x: tb.x + L.nameplate.x / W, y: tb.y + L.nameplate.y / 1080, w: 200 / W, h: L.nameplate.height / 1080 };
    case "quickbar": {
      const w = 600 / W;
      const x = L.quickbar.align === "left" ? tb.x + 16 / W : L.quickbar.align === "center" ? tb.x + (tb.w - w) / 2 : tb.x + tb.w - 16 / W - w;
      return { x, y: tb.y + tb.h - 48 / 1080, w, h: 34 / 1080 };
    }
    case "choices": {
      const total = (3 * L.choices.height + 2 * L.choices.gap) / 1080;
      return { x: L.choices.x / 100 - L.choices.width / 200, y: Math.max(0.05, L.choices.y / 100 - total / 2), w: L.choices.width / 100, h: total };
    }
    case "title": {
      const s = L.title.size;
      const w = (s * 6) / W;
      return { x: L.title.x / 100 - w / 2, y: L.title.y / 100 - (0.8 * s) / 1080, w, h: (1.05 * s) / 1080 };
    }
    case "title_menu":
    case "game_menu": {
      const c = L[el];
      const n = MENU_COUNT[el] ?? 5;
      return { x: c.x / 100 - c.width / 2 / W, y: c.y / 100, w: c.width / W, h: (n * c.height + (n - 1) * c.gap) / 1080 };
    }
  }
}

/** The theme after dragging `el` by (dx, dy) screen fractions in `mode`. Everything is written in full, so a 1.0 theme gains a layout. */
export function dragged(raw: Raw, t: ResolvedTheme, el: El, mode: Mode, dx: number, dy: number, aspect: number): Raw {
  const W = 1080 * aspect;
  const L = t.layout;
  const east = mode === "ne" || mode === "se";
  const south = mode === "sw" || mode === "se";
  const put = (group: string, values: Record<string, number | string | boolean>) => setIn(raw, ["layout", group], { ...(isObject(isObject(raw["layout"]) ? (raw["layout"] as Raw)[group] : undefined) ? ((raw["layout"] as Raw)[group] as Raw) : {}), ...values });
  switch (el) {
    case "textbox":
    case "page": {
      const b = L[el];
      let { x, y, width, height } = b;
      if (mode === "move") {
        x += dx * 100;
        y += dy * 100;
      } else {
        if (east) width += dx * 100;
        else {
          x += dx * 100;
          width -= dx * 100;
        }
        if (south) height += dy * 100;
        else {
          y += dy * 100;
          height -= dy * 100;
        }
      }
      width = clamp(width, 5, 100);
      height = clamp(height, 5, 100);
      return put(el, { x: pct(clamp(x, 0, 95)), y: pct(clamp(y, 0, 95)), width: pct(width), height: pct(height) });
    }
    case "text": {
      let { left, top, right } = L.text;
      if (mode === "move") {
        left += dx * W;
        right -= dx * W;
        top += dy * 1080;
      } else {
        if (east) right -= dx * W;
        else left += dx * W;
        if (!south) top += dy * 1080;
      }
      return put("text", { left: Math.round(clamp(left, 0, 400)), top: Math.round(clamp(top, 0, 300)), right: Math.round(clamp(right, 0, 400)) });
    }
    case "nameplate": {
      let { x, y, height } = L.nameplate;
      if (mode === "move") {
        x += dx * W;
        y += dy * 1080;
      } else if (south) height += dy * 1080;
      else {
        y += dy * 1080;
        height -= dy * 1080;
      }
      return put("nameplate", { x: Math.round(clamp(x, -400, 1600)), y: Math.round(clamp(y, -300, 300)), height: Math.round(clamp(height, 24, 200)) });
    }
    case "choices": {
      let { x, y, width, height } = L.choices;
      if (mode === "move") {
        x += dx * 100;
        y += dy * 100;
      } else {
        width += (east ? 2 : -2) * dx * 100;
        height += ((south ? 1 : -1) * dy * 1080) / 3;
      }
      return put("choices", { x: pct(clamp(x, 0, 100)), y: pct(clamp(y, 0, 100)), width: pct(clamp(width, 10, 100)), height: Math.round(clamp(height, 32, 300)), gap: L.choices.gap });
    }
    case "title": {
      let { x, y, size } = L.title;
      if (mode === "move") {
        x += dx * 100;
        y += dy * 100;
      } else size += (south ? 1 : -1) * dy * 1080;
      return put("title", { x: pct(clamp(x, 0, 100)), y: pct(clamp(y, 0, 100)), size: Math.round(clamp(size, 16, 200)), show: L.title.show });
    }
    case "title_menu":
    case "game_menu": {
      const c = L[el];
      const n = MENU_COUNT[el] ?? 5;
      let { x, y, width, height } = c;
      if (mode === "move") {
        x += dx * 100;
        y += dy * 100;
      } else {
        width += (east ? 2 : -2) * dx * W;
        height += ((south ? 1 : -1) * dy * 1080) / n;
      }
      return put(el, { x: pct(clamp(x, 0, 100)), y: pct(clamp(y, 0, 95)), width: Math.round(clamp(width, 80, 1800)), height: Math.round(clamp(height, 32, 200)), gap: c.gap });
    }
    case "quickbar":
      return raw;
  }
}

/** Snaps a moved box's edges and center to the screen's center, the safe area, and other elements; returns the adjusted move and the guides hit. */
function snap(box: Box, dx: number, dy: number, others: Box[]): { dx: number; dy: number; guides: { x: number[]; y: number[] } } {
  const T = 0.008;
  const xs = [0.05, 0.5, 0.95, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ys = [0.05, 0.5, 0.95, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const guides = { x: [] as number[], y: [] as number[] };
  const fit = (edges: number[], targets: number[], d: number, out: number[]) => {
    let best: number | null = null;
    for (const e of edges) for (const t of targets) if (Math.abs(e + d - t) < T && (best === null || Math.abs(e + d - t) < Math.abs(best))) best = e + d - t;
    if (best === null) return d;
    const nd = d - best;
    for (const e of edges) for (const t of targets) if (Math.abs(e + nd - t) < 1e-6) out.push(t);
    return nd;
  };
  const ndx = fit([box.x, box.x + box.w / 2, box.x + box.w], xs, dx, guides.x);
  const ndy = fit([box.y, box.y + box.h / 2, box.y + box.h], ys, dy, guides.y);
  return { dx: ndx, dy: ndy, guides };
}

const hexA = (hex: string, a: number) => `${hex}${Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, "0")}`;

export function Designer() {
  const intl = useIntl();
  const text = useStudio((s) => s.files[FILE]);
  const model = useStudio((s) => s.model);
  const assets = useStudio((s) => s.assets);
  const overflows = useStudio((s) => s.preview.overflows);
  const previewReady = useStudio((s) => s.preview.ready);
  const [screen, setScreen] = useState<Screen>("story");
  const [selected, setSelected] = useState<El | null>("textbox");
  const [draft, setDraft] = useState<Raw | null>(null);
  const [picker, setPicker] = useState<ThemeColor | null>(null);
  const [blind, setBlind] = useState<(typeof BLINDNESS)[number]>("none");
  const [snapOn, setSnapOn] = useState(true);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  let raw: Raw = {};
  let broken = false;
  if (text !== undefined) {
    try {
      const v: unknown = JSON.parse(text);
      if (isObject(v)) raw = v;
      else broken = true;
    } catch {
      broken = true;
    }
  }
  const current = draft ?? raw;
  const theme = useMemo(() => resolveTheme(current), [current]);
  const manifest = model?.check.manifest;
  const aspect = manifest ? manifest.resolution[0] / manifest.resolution[1] : 16 / 9;
  const presetName = typeof current["preset"] === "string" ? current["preset"] : "himawari";

  // Show the screen being designed in the real game.
  useEffect(() => {
    if (previewReady) void studio.preview.command({ cmd: "screen", name: PREVIEW_SCREEN[screen] });
  }, [screen, previewReady]);

  const commit = (next: Raw) => {
    setDraft(null);
    useStudio.getState().edit(FILE, `${JSON.stringify(next, null, 2)}\n`, "you", { id: "history.designer" });
  };
  const change = (path: string[], value: unknown, done = true) => {
    const next = setIn(current, path, value);
    if (done) commit(next);
    else setDraft(next);
  };

  const applyPreset = (name: string) => {
    let next: Raw = { ...raw, preset: name };
    for (const g of LOOK_GROUPS) delete next[g];
    for (const k of ["outline"]) next = setIn(next, ["text", k], undefined);
    for (const k of ["opacity", "height", "padding"]) next = setIn(next, ["textbox", k], undefined);
    if (name === "himawari") delete next["preset"];
    commit(next);
  };

  const onDrag = (el: El, mode: Mode, dx: number, dy: number, done: boolean, free: boolean) => {
    let ddx = dx;
    let ddy = dy;
    if (mode === "move" && snapOn && !free) {
      const others = ELEMENTS[screen].filter((e) => e !== el && e !== "quickbar").map((e) => geometry(resolveTheme(raw), e, aspect));
      const s = snap(geometry(resolveTheme(raw), el, aspect), dx, dy, others);
      ddx = s.dx;
      ddy = s.dy;
      setGuides(done ? { x: [], y: [] } : s.guides);
    } else if (done) setGuides({ x: [], y: [] });
    const next = dragged(raw, resolveTheme(raw), el, mode, ddx, ddy, aspect);
    if (done) commit(next);
    else setDraft(next);
  };

  const colors = theme.colors as Record<ThemeColor, string>;
  const swatches = [...new Set(Object.values(colors))].slice(0, 16);
  const pairFor = (c: ThemeColor) => CONTRAST_PAIRS.find(([fg]) => fg === c);
  const problems = diagnosticsOf(model, FILE);
  const sfx = namesIn(assets, "sfx");

  if (broken) {
    return (
      <div className="tool-page">
        <h2>
          <FormattedMessage id="tool.designer" />
        </h2>
        <p className="warning-text">
          <FormattedMessage id="designer.broken" />
        </p>
        <button onClick={() => useStudio.getState().open({ kind: "file", file: FILE })}>
          <FormattedMessage id="designer.openFile" />
        </button>
      </div>
    );
  }

  const slider = (label: string, path: string[], value: number, min: number, max: number, unit = "") => (
    <label className="field slider">
      <span>
        <FormattedMessage id={label} /> <b>{`${value}${unit}`}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => change(path, Number(e.target.value), false)}
        onPointerUp={(e) => change(path, Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => change(path, Number((e.target as HTMLInputElement).value))}
      />
    </label>
  );

  return (
    <div className="designer">
      <aside className="designer-side">
        <section>
          <h3>
            <FormattedMessage id="designer.looks" />
          </h3>
          <div className="preset-grid">
            {THEME_PRESET_NAMES.map((name) => {
              const t = resolveTheme({ preset: name });
              const c = t.colors as Record<ThemeColor, string>;
              return (
                <button key={name} className={presetName === name ? "preset-card selected" : "preset-card"} aria-pressed={presetName === name} onClick={() => applyPreset(name)}>
                  <span className="preset-sample" style={{ background: `linear-gradient(${c.title}, ${c.background})` }}>
                    <span className="preset-box" style={{ background: c.textbox, borderRadius: Math.min(8, t.shape.radius / 2), border: t.shape.border ? `1px solid ${c.border}` : "none" }}>
                      <span style={{ background: c.text }} />
                      <span style={{ background: c.accent }} />
                    </span>
                  </span>
                  <FormattedMessage id={`designer.preset.${name}`} />
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3>
            <FormattedMessage id="designer.palettes" />
          </h3>
          <div className="palette-list">
            {Object.entries(THEME_PALETTES).map(([name, p]) => (
              <button key={name} className="palette-row" onClick={() => change(["colors"], { ...p })} title={intl.formatMessage({ id: `designer.palette.${name}` })}>
                {(["textbox", "nameplate", "accent", "text"] as const).map((k) => (
                  <span key={k} className="palette-dot" style={{ background: p[k] }} />
                ))}
                <span className="small">
                  <FormattedMessage id={`designer.palette.${name}`} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>
            <FormattedMessage id="designer.colors" />
          </h3>
          <div className="color-list">
            {THEME_COLORS.map((c) => {
              const pair = pairFor(c);
              const ratio = pair ? contrastRatio(colors[pair[0]], colors[pair[1]]) : null;
              return (
                <div key={c} className="color-row">
                  <button className="color-swatch" style={{ background: colors[c] }} aria-label={intl.formatMessage({ id: `designer.color.${c}` })} onClick={() => setPicker(picker === c ? null : c)} />
                  <span className="grow">
                    <FormattedMessage id={`designer.color.${c}`} />
                  </span>
                  {ratio !== null && (
                    <span className={ratio >= 4.5 ? "contrast-badge ok" : "contrast-badge low"} title={intl.formatMessage({ id: "designer.contrast.hint" })}>
                      {ratio >= 4.5 ? <Icon name="check" size={12} /> : <Icon name="warning" size={12} />} {ratio.toFixed(1)}
                    </span>
                  )}
                  <code className="muted small">{colors[c]}</code>
                  {picker === c && (
                    <ColorPicker
                      value={colors[c]}
                      swatches={swatches}
                      onChange={(hex, done) => change(["colors", c], hex, done)}
                      onClose={() => {
                        if (draft) commit(draft);
                        setPicker(null);
                      }}
                      {...(pair ? { against: { color: colors[pair[1]], label: intl.formatMessage({ id: `designer.color.${pair[1]}` }) } } : {})}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3>
            <FormattedMessage id="designer.shape" />
          </h3>
          {slider("designer.shape.radius", ["shape", "radius"], theme.shape.radius, 0, 64, " px")}
          {slider("designer.shape.border", ["shape", "border"], theme.shape.border, 0, 12, " px")}
          {slider("designer.shape.shadow", ["shape", "shadow"], theme.shape.shadow, 0, 48, " px")}
          {slider("designer.textbox.opacity", ["textbox", "opacity"], theme.textbox.opacity, 0, 100, "%")}
          <label className="field">
            <span>
              <FormattedMessage id="designer.shape.hover" />
            </span>
            <select value={theme.shape.hover} onChange={(e) => change(["shape", "hover"], e.target.value)}>
              {["bar", "outline", "fill"].map((h) => (
                <option key={h} value={h}>
                  {intl.formatMessage({ id: `designer.hover.${h}` })}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h3>
            <FormattedMessage id="designer.text" />
          </h3>
          {slider("designer.text.size", ["text", "size"], theme.text.size, 12, 96, " px")}
          {slider("designer.text.outline", ["text", "outline"], theme.text.outline, 0, 6, " px")}
        </section>

        <section>
          <h3>
            <FormattedMessage id="designer.motion" />
          </h3>
          <label className="field">
            <span>
              <FormattedMessage id="designer.motion.choices" />
            </span>
            <select value={theme.motion.choices} onChange={(e) => change(["motion", "choices"], e.target.value)}>
              {["none", "fade", "rise"].map((m) => (
                <option key={m} value={m}>
                  {intl.formatMessage({ id: `designer.motion.${m}` })}
                </option>
              ))}
            </select>
          </label>
          {theme.motion.choices !== "none" && slider("designer.motion.ms", ["motion", "ms"], theme.motion.ms, 0, 2000, " ms")}
          {(["hover", "click"] as const).map((k) => {
            const sound = isObject(current["sound"]) ? current["sound"][k] : undefined;
            return (
              <label key={k} className="field">
                <span>
                  <FormattedMessage id={`designer.sound.${k}`} />
                </span>
                <select value={typeof sound === "string" ? sound : ""} onChange={(e) => change(["sound", k], e.target.value || undefined)}>
                  <option value="">{intl.formatMessage({ id: "designer.sound.none" })}</option>
                  {sfx.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          {sfx.length === 0 && (
            <p className="muted small">
              <FormattedMessage id="designer.sound.empty" />
            </p>
          )}
        </section>

        <WordsSection current={current} change={change} languages={manifest?.languages ?? []} />

        <section className="row wrap">
          <button
            className="small-button"
            onClick={() => {
              const pack: Raw = { ...current };
              delete pack["strings"];
              void studio.dialog.saveFile("theme", `${manifest?.name ?? "theme"}.hwtheme.json`, `${JSON.stringify(pack, null, 2)}\n`);
            }}
          >
            <FormattedMessage id="designer.export" />
          </button>
          <button
            className="small-button"
            onClick={async () => {
              const path = await studio.dialog.pickFile("theme");
              if (!path) return;
              try {
                const pack: unknown = JSON.parse(new TextDecoder().decode(await studio.project.readExternal(path)));
                if (!isObject(pack)) return;
                const next: Raw = { ...pack };
                if (raw["strings"] !== undefined) next["strings"] = raw["strings"]; // the project's own UI text stays
                else delete next["strings"];
                commit(next);
              } catch {
                useStudio.getState().log("designer.importFailed", {}, "error");
              }
            }}
          >
            <FormattedMessage id="designer.import" />
          </button>
        </section>
      </aside>

      <div className="designer-main">
        <div className="pane-head">
          <span className="pane-title">
            <FormattedMessage id="tool.designer" />
          </span>
          <div className="grow" />
          <label className="check small">
            <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
            <FormattedMessage id="designer.snap" />
          </label>
          <select className="small-select" value={blind} onChange={(e) => setBlind(e.target.value as (typeof BLINDNESS)[number])} aria-label={intl.formatMessage({ id: "designer.vision" })}>
            {BLINDNESS.map((b) => (
              <option key={b} value={b}>
                {intl.formatMessage({ id: `designer.vision.${b}` })}
              </option>
            ))}
          </select>
        </div>
        <div className="designer-tabs">
          <div className="segmented" role="tablist">
            {SCREENS.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={screen === s}
                className={screen === s ? "active" : ""}
                onClick={() => {
                  setScreen(s);
                  setSelected(ELEMENTS[s][ELEMENTS[s].length - 1] ?? null);
                }}
              >
                <FormattedMessage id={`designer.screen.${s}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="designer-body">
          <MockScreen theme={theme} screen={screen} aspect={aspect} selected={selected} onSelect={setSelected} onDrag={onDrag} guides={guides} blind={blind} />
          <p className="muted small designer-hint">
            <FormattedMessage id="designer.hint" />
          </p>

          {selected && (
            <section className="card inspector">
              <div className="row">
                <h3 className="grow">
                  <FormattedMessage id={`designer.el.${selected}`} />
                </h3>
                <button className="small-button" onClick={() => change(["layout", selected], undefined)}>
                  <FormattedMessage id="designer.reset" />
                </button>
              </div>
              <Inspector el={selected} theme={theme} onChange={(key, v, done) => change(["layout", selected, key], v, done)} />
            </section>
          )}

          <section className="card">
            <h3>
              <FormattedMessage id="designer.readability" />
            </h3>
            <ul className="check-list">
              {CONTRAST_PAIRS.map(([fg, bg]) => {
                const ratio = contrastRatio(colors[fg], colors[bg]);
                return (
                  <li key={fg} className={ratio >= 4.5 ? "ok" : "low"}>
                    <Icon name={ratio >= 4.5 ? "check" : "warning"} size={14} />
                    <FormattedMessage
                      id="designer.pair"
                      values={{ fg: intl.formatMessage({ id: `designer.color.${fg}` }), bg: intl.formatMessage({ id: `designer.color.${bg}` }), ratio: ratio.toFixed(1) }}
                    />
                  </li>
                );
              })}
              {problems
                .filter((d) => d.code === "HW0132")
                .map((d, i) => (
                  <li key={`edge${i}`} className="low">
                    <Icon name="warning" size={14} />
                    {intl.formatMessage({ id: `diag.${d.code}` }, d.params as Record<string, string>)}
                  </li>
                ))}
              {overflows.map((o) => (
                <li key={`${o.lang}:${o.text}`} className="low">
                  <Icon name="warning" size={14} />
                  <FormattedMessage id="designer.overflow" values={{ text: o.text, lang: o.lang }} />
                </li>
              ))}
            </ul>
            <p className="muted small">
              <FormattedMessage id="designer.overflowHint" />
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Number fields for the selected element's settings (the exact values behind dragging). */
function Inspector({ el, theme, onChange }: { el: El; theme: ResolvedTheme; onChange: (key: string, value: unknown, done: boolean) => void }) {
  const intl = useIntl();
  const values = (theme.layout as unknown as Record<string, Record<string, number | string | boolean>>)[el] ?? {};
  return (
    <div className="grid-2">
      {Object.entries(values).map(([key, v]) =>
        typeof v === "boolean" ? (
          <label key={key} className="check">
            <input type="checkbox" checked={v} onChange={(e) => onChange(key, e.target.checked, true)} />
            <FormattedMessage id={`designer.field.${key}`} />
          </label>
        ) : typeof v === "string" ? (
          <label key={key} className="field">
            <span>
              <FormattedMessage id={`designer.field.${key}`} />
            </span>
            <select value={v} onChange={(e) => onChange(key, e.target.value, true)}>
              {["left", "center", "right"].map((a) => (
                <option key={a} value={a}>
                  {intl.formatMessage({ id: `designer.align.${a}` })}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={key} className="field">
            <span>
              <FormattedMessage id={`designer.field.${key}`} /> <span className="muted">{unitOf(el, key)}</span>
            </span>
            <input type="number" step={unitOf(el, key) === "%" ? 0.5 : 1} value={v} onChange={(e) => e.target.value !== "" && onChange(key, Number(e.target.value), true)} />
          </label>
        ),
      )}
    </div>
  );
}

function unitOf(el: El, key: string): string {
  if (el === "textbox" || el === "page") return "%";
  if ((el === "choices" || el === "title" || el === "title_menu" || el === "game_menu") && (key === "x" || key === "y")) return "%";
  if (el === "choices" && key === "width") return "%";
  return "px";
}

/** A mock of one screen, drawn from the theme; elements of that screen can be selected, dragged, and resized. */
function MockScreen({
  theme,
  screen,
  aspect,
  selected,
  onSelect,
  onDrag,
  guides,
  blind,
}: {
  theme: ResolvedTheme;
  screen: Screen;
  aspect: number;
  selected: El | null;
  onSelect: (el: El) => void;
  onDrag: (el: El, mode: Mode, dx: number, dy: number, done: boolean, free: boolean) => void;
  guides: { x: number[]; y: number[] };
  blind: string;
}) {
  const intl = useIntl();
  const assets = useStudio((s) => s.assets);
  const gameName = useStudio((s) => s.model?.check.manifest?.name);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const height = width / aspect;
  const k = height / 1080;
  const c = theme.colors as Record<ThemeColor, string>;
  const t = (id: string) => intl.formatMessage({ id });

  const panel = (bg: string, alpha: number): React.CSSProperties => ({
    background: hexA(bg, alpha),
    borderRadius: theme.shape.radius * k,
    border: theme.shape.border ? `${Math.max(1, theme.shape.border * k)}px solid ${c.border}` : "none",
    boxShadow: theme.shape.shadow ? `0 ${theme.shape.shadow * 0.35 * k}px ${theme.shape.shadow * k}px rgb(0 0 0 / 20%)` : "none",
  });
  const textStyle = (size: number, color: string): React.CSSProperties => {
    const o = theme.text.outline * k * 0.9;
    return {
      fontSize: size * k,
      color,
      textShadow: o > 0 ? [`${o}px 0`, `-${o}px 0`, `0 ${o}px`, `0 -${o}px`].map((s) => `${s} ${c.outline}`).join(", ") : "none",
    };
  };
  const at = (b: Box): React.CSSProperties => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });

  const start = (el: El, mode: Mode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el);
    if (el === "quickbar") return;
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => onDrag(el, mode, (ev.clientX - sx) / width, (ev.clientY - sy) / height, false, ev.altKey);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (ev.clientX !== sx || ev.clientY !== sy) onDrag(el, mode, (ev.clientX - sx) / width, (ev.clientY - sy) / height, true, ev.altKey);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const keys = (el: El) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.005;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m || el === "quickbar") return;
    e.preventDefault();
    onDrag(el, "move", m[0], m[1], true, true);
  };

  /** A selectable, draggable element frame; `children` is what it looks like. */
  const frame = (el: El, b: Box, children: React.ReactNode, style: React.CSSProperties = {}) => (
    <div
      key={el}
      className={selected === el ? "mock-el selected" : "mock-el"}
      style={{ ...at(b), ...style }}
      onPointerDown={start(el, "move")}
      onKeyDown={keys(el)}
      tabIndex={0}
      role="button"
      aria-label={t(`designer.el.${el}`)}
      aria-pressed={selected === el}
    >
      {children}
      {selected === el && el !== "quickbar" && (["nw", "ne", "sw", "se"] as const).map((h) => <span key={h} className={`handle ${h}`} onPointerDown={start(el, h)} />)}
    </div>
  );

  const g = (el: El) => geometry(theme, el, aspect);
  const L = theme.layout;
  const bgName = namesIn(assets, "bg")[0];
  const bgImage = bgName ? findImage(assets, "bg", bgName) : null;
  const titleName = (theme as { title?: { background?: unknown } }).title?.background;
  const titleImage = typeof titleName === "string" ? findImage(assets, titleName.split("/").slice(0, -1).join("/"), titleName.split("/").pop() ?? "") : null;
  const story = screen === "story" || screen === "choices" || screen === "page";
  const background = story
    ? bgImage
      ? `center / cover no-repeat url("${assetUrl(bgImage)}")`
      : "linear-gradient(#a9d3f5, #e8f3fb 55%, #8cc07a 56%, #5f9a52)"
    : titleImage
      ? `center / cover no-repeat url("${assetUrl(titleImage)}")`
      : `linear-gradient(${c.title}, ${c.background})`;

  const tb = g("textbox");
  const menuLabels = (el: "title_menu" | "game_menu") =>
    el === "title_menu" ? ["start", "load", "config", "extras", "quit"] : ["resume", "save", "load", "history", "config", "title", "quit"];

  return (
    <div className="mock-wrap" ref={box}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="cb-protanopia">
          <feColorMatrix type="matrix" values="0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0" />
        </filter>
        <filter id="cb-deuteranopia">
          <feColorMatrix type="matrix" values="0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0" />
        </filter>
        <filter id="cb-tritanopia">
          <feColorMatrix type="matrix" values="0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0" />
        </filter>
      </svg>
      <div
        className="mock"
        style={{ height, background, filter: blind === "none" ? "none" : `url(#cb-${blind})` }}
        onPointerDown={() => onSelect(ELEMENTS[screen][0] ?? "textbox")}
      >
        {screen === "menu" && <div className="mock-dim" style={{ background: hexA(c.background, 0.7) }} />}
        <div className="safe-area" />
        {guides.x.map((x) => (
          <div key={`gx${x}`} className="guide v" style={{ left: `${x * 100}%` }} />
        ))}
        {guides.y.map((y) => (
          <div key={`gy${y}`} className="guide h" style={{ top: `${y * 100}%` }} />
        ))}

        {(screen === "story" || screen === "choices") &&
          frame("textbox", tb, <div className="mock-fill" style={panel(c.textbox, theme.textbox.opacity / 100)} />)}
        {screen === "story" && (
          <>
            {frame(
              "nameplate",
              g("nameplate"),
              <div className="mock-fill mock-plate" style={{ ...panel(c.nameplate, Math.min(1, theme.textbox.opacity / 100 + 0.1)), ...textStyle(34, c.text), fontWeight: 700, paddingLeft: 24 * k }}>
                {t("designer.sample.name")}
              </div>,
            )}
            {frame("text", g("text"), <div className="mock-text" style={{ ...textStyle(theme.text.size, c.text) }}>{t("designer.sample.line")}</div>, { outline: "1px dashed rgb(127 127 127 / 45%)" })}
            {L.quickbar.show &&
              frame(
                "quickbar",
                g("quickbar"),
                <div className="mock-quick" style={{ ...textStyle(22, c.dim), justifyContent: L.quickbar.align === "left" ? "flex-start" : L.quickbar.align === "center" ? "center" : "flex-end" }}>
                  {["rollback", "history", "auto", "skip", "save", "load", "menu"].map((q) => (
                    <span key={q}>{t(`designer.sample.${q}`)}</span>
                  ))}
                </div>,
              )}
          </>
        )}
        {screen === "choices" &&
          frame(
            "choices",
            g("choices"),
            <div className="mock-column" style={{ gap: L.choices.gap * k }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="mock-button" style={{ ...panel(i === 1 ? c.choice_hover : c.choice, i === 1 ? 0.95 : 0.85), ...textStyle(36, i === 1 ? c.accent : c.choice_text), height: L.choices.height * k }}>
                  {t(`designer.sample.choice${i}`)}
                </div>
              ))}
            </div>,
          )}
        {screen === "page" &&
          frame(
            "page",
            g("page"),
            <div className="mock-fill mock-page" style={{ ...panel(c.textbox, theme.textbox.opacity / 100), ...textStyle(theme.text.size, c.text), padding: `${L.text.left * k}px ${0.06 * width}px` }}>
              <p>{t("designer.sample.line")}</p>
              <p>{t("designer.sample.line2")}</p>
            </div>,
          )}
        {screen === "title" && L.title.show && frame("title", g("title"), <div className="mock-title" style={{ ...textStyle(L.title.size, c.text) }}>{gameName ?? t("designer.sample.title")}</div>)}
        {(screen === "title" || screen === "menu") &&
          (() => {
            const el = screen === "title" ? "title_menu" : "game_menu";
            const col = L[el];
            return frame(
              el,
              g(el),
              <div className="mock-column" style={{ gap: col.gap * k }}>
                {menuLabels(el).map((label, i) => (
                  <div key={label} className="mock-button" style={{ ...panel(i === 0 ? c.choice_hover : c.button, i === 0 ? 0.95 : 0.85), ...textStyle(32, i === 0 ? c.accent : c.button_text), height: col.height * k }}>
                    {t(`designer.sample.${label}`)}
                  </div>
                ))}
              </div>,
            );
          })()}
      </div>
    </div>
  );
}

/** Formats a few UI words keep: where the number or detail goes. */
const WORD_FORMATS: Readonly<Record<string, string>> = { slot: "%d", load_failed: "%s", reload_failed: "%s" };

/** The game's own words on its buttons and menus (theme.strings), per language (FINALIZATION.md NC-13). */
function WordsSection({ current, change, languages }: { current: Raw; change: (path: string[], value: unknown, done?: boolean) => void; languages: string[] }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(languages[0] ?? "en");
  const [query, setQuery] = useState("");
  const strings = isObject(current["strings"]) && isObject(current["strings"][lang]) ? (current["strings"][lang] as Record<string, unknown>) : {};
  const human = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const keys = THEME_STRING_KEYS.filter((k) => !query.trim() || k.includes(query.trim().toLowerCase().replace(/ /g, "_")) || String(strings[k] ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <section>
      <button className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h3>
          <FormattedMessage id="designer.words" />
        </h3>
      </button>
      {open && (
        <>
          <p className="muted small">
            <FormattedMessage id="designer.wordsHint" />
          </p>
          <div className="row wrap">
            {languages.length > 1 && (
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={intl.formatMessage({ id: "l10n.language" })}>
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            <input type="search" value={query} placeholder={intl.formatMessage({ id: "designer.wordsSearch" })} aria-label={intl.formatMessage({ id: "designer.wordsSearch" })} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="words-list">
            {keys.map((k) => (
              <label key={`${lang}.${k}`} className="field">
                <span className="muted small">
                  {human(k)}
                  {WORD_FORMATS[k] ? ` (${intl.formatMessage({ id: "designer.wordsKeep" }, { code: WORD_FORMATS[k] })})` : ""}
                </span>
                <input
                  defaultValue={typeof strings[k] === "string" ? (strings[k] as string) : ""}
                  placeholder={intl.formatMessage({ id: "designer.wordsDefault" })}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (typeof strings[k] === "string" ? strings[k] : "")) return;
                    change(["strings", lang, k], v || undefined);
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
