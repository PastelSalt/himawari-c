import { contrastRatio, fixContrast } from "@himawari/core";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Icon } from "./Icon";

/* ---- color math (HSV ↔ RGB ↔ hex) ---- */

export type Hsv = { h: number; s: number; v: number };

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1]!, 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

/** Colors that go with `hex`: complementary, analogous, triadic, and lighter and darker shades. */
export function harmonies(hex: string): { kind: string; colors: string[] }[] {
  const c = hexToHsv(hex);
  const turn = (deg: number) => hsvToHex({ ...c, h: (c.h + deg + 360) % 360 });
  return [
    { kind: "complementary", colors: [turn(180)] },
    { kind: "analogous", colors: [turn(-30), turn(30)] },
    { kind: "triadic", colors: [turn(120), turn(240)] },
    { kind: "shades", colors: [0.35, 0.65, 0.85].map((v) => hsvToHex({ ...c, v: Math.min(1, v + c.v * 0.15) })).concat(hsvToHex({ ...c, s: c.s * 0.35, v: 0.97 })) },
  ];
}

type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> };

/**
 * The color wheel (plan §11.6): a hue ring around a saturation/brightness
 * square, hex and RGB input, the system eyedropper, harmonies, and the
 * project's swatches. When `against` is given, a contrast badge with a fix.
 */
export function ColorPicker({
  value,
  onChange,
  onClose,
  swatches,
  against,
}: {
  value: string;
  onChange: (hex: string, done: boolean) => void;
  onClose: () => void;
  swatches: string[];
  against?: { color: string; label: string };
}) {
  const intl = useIntl();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const ring = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);

  useEffect(() => setHexText(hex), [hex]);
  // Close on Escape or a click outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const set = (next: Hsv, done = false) => {
    setHsv(next);
    onChange(hsvToHex(next), done);
  };
  const setHex = (h: string, done = true) => {
    if (!/^#[0-9a-f]{6}$/i.test(h)) return;
    const next = hexToHsv(h);
    setHsv(next);
    onChange(h.toLowerCase(), done);
  };

  const drag = (target: () => HTMLElement | null, apply: (e: PointerEvent, r: DOMRect) => void) => (e: React.PointerEvent) => {
    const el = target();
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    apply(e.nativeEvent, r);
    const move = (ev: PointerEvent) => apply(ev, r);
    const up = (ev: PointerEvent) => {
      apply(ev, r);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onRing = drag(() => ring.current, (e, r) => {
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    set({ ...hsv, h: ((a * 180) / Math.PI + 90 + 360) % 360 }, e.type === "pointerup");
  });
  const onSquare = drag(() => square.current, (e, r) => {
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    set({ ...hsv, s, v }, e.type === "pointerup");
  });

  const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const [r, g, b] = hexToRgb(hex);
  const ratio = against ? contrastRatio(hex, against.color) : 0;
  const angle = (hsv.h - 90) * (Math.PI / 180);

  return (
    <div className="color-picker" ref={box} role="dialog" aria-label={intl.formatMessage({ id: "designer.color.title" })}>
      <div className="wheel" ref={ring} onPointerDown={onRing}>
        <span className="wheel-knob" style={{ left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 44 * Math.sin(angle)}%`, background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }} />
        <div
          className="sv-square"
          ref={square}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSquare(e);
          }}
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex({ h: hsv.h, s: 1, v: 1 })})` }}
        >
          <span className="sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
        </div>
      </div>

      <div className="row color-inputs">
        <span className="swatch big" style={{ background: hex }} />
        <input
          className="hex-input"
          value={hexText}
          aria-label={intl.formatMessage({ id: "designer.color.hex" })}
          onChange={(e) => {
            setHexText(e.target.value);
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            if (/^#[0-9a-f]{6}$/i.test(v)) setHex(v, false);
          }}
          onBlur={() => setHex(hexText.startsWith("#") ? hexText : `#${hexText}`)}
        />
        {eyeDropper && (
          <button
            className="icon-button"
            title={intl.formatMessage({ id: "designer.color.eyedropper" })}
            aria-label={intl.formatMessage({ id: "designer.color.eyedropper" })}
            onClick={async () => {
              try {
                const picked = await new eyeDropper().open();
                setHex(picked.sRGBHex);
              } catch {
                // The user pressed Escape.
              }
            }}
          >
            <Icon name="eyedropper" />
          </button>
        )}
      </div>
      <div className="rgb-row">
        {(["r", "g", "b"] as const).map((k, i) => (
          <label key={k} className="rgb-input">
            <span>{k.toUpperCase()}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={[r, g, b][i]}
              onChange={(e) => {
                const c = [r, g, b];
                c[i] = Number(e.target.value);
                setHex(rgbToHex(c[0]!, c[1]!, c[2]!));
              }}
            />
          </label>
        ))}
      </div>

      {against && (
        <div className={ratio >= 4.5 ? "contrast ok" : "contrast low"}>
          <span>
            <FormattedMessage id={ratio >= 4.5 ? "designer.contrast.ok" : "designer.contrast.low"} values={{ ratio: ratio.toFixed(1), on: against.label }} />
          </span>
          {ratio < 4.5 && (
            <button className="small-button" onClick={() => setHex(fixContrast(hex, against.color))}>
              <FormattedMessage id="designer.contrast.fix" />
            </button>
          )}
        </div>
      )}

      <div className="harmonies">
        {harmonies(hex).map((h) => (
          <div key={h.kind} className="harmony">
            <span className="muted small">
              <FormattedMessage id={`designer.harmony.${h.kind}`} />
            </span>
            <div className="chips">
              {h.colors.map((c) => (
                <button key={c} className="color-chip" style={{ background: c }} title={c} aria-label={c} onClick={() => setHex(c)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {swatches.length > 0 && (
        <div className="harmony">
          <span className="muted small">
            <FormattedMessage id="designer.color.swatches" />
          </span>
          <div className="chips">
            {swatches.map((c) => (
              <button key={c} className="color-chip" style={{ background: c }} title={c} aria-label={c} onClick={() => setHex(c)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
