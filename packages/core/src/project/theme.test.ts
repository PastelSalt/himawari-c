import { describe, expect, test } from "vitest";
import {
  CONTRAST_PAIRS,
  THEME_DEFAULTS,
  THEME_PALETTES,
  THEME_PRESETS,
  THEME_PRESET_NAMES,
  contrastRatio,
  fixContrast,
  readTheme,
  resolveTheme,
} from "./theme.js";

const read = (theme: unknown) => readTheme(JSON.stringify(theme, null, 2));

describe("themes 2.0 (rfcs/0010)", () => {
  test.each(THEME_PRESET_NAMES)("the %s preset compiles with no problems", (name) => {
    const r = read({ preset: name });
    expect(r.diagnostics).toEqual([]);
    expect(r.entries).not.toBeNull();
  });

  test.each(Object.entries(THEME_PALETTES))("the %s palette keeps every text readable", (_name, colors) => {
    for (const [fg, bg] of CONTRAST_PAIRS) expect(contrastRatio(colors[fg], colors[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  test("the built-in look passes its own contrast check", () => {
    const c = THEME_DEFAULTS.colors;
    for (const [fg, bg] of CONTRAST_PAIRS) expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  test("a theme without a preset compiles only what it says (the runtime keeps its own look)", () => {
    const r = read({ colors: { accent: "#ff8800" } });
    expect([...(r.entries?.keys() ?? [])]).toEqual(["color.accent"]);
  });

  test("a preset's settings come first and the file's own override them", () => {
    const r = read({ preset: "pastel", shape: { radius: 4 }, layout: { textbox: { height: 30 } } });
    expect(r.entries?.get("shape.radius")).toEqual({ type: "int", value: 4 });
    expect(r.entries?.get("shape.border")).toEqual({ type: "int", value: 2 }); // from the preset
    expect(r.entries?.get("layout.textbox.height")).toEqual({ type: "int", value: 300 });
    expect(r.entries?.get("layout.textbox.x")).toEqual({ type: "int", value: 100 });
  });

  test("percent values keep one decimal (tenths); booleans and choices compile", () => {
    const r = read({ layout: { textbox: { x: 7.5 }, quickbar: { show: false, align: "left" } }, motion: { choices: "fade" } });
    expect(r.entries?.get("layout.textbox.x")).toEqual({ type: "int", value: 75 });
    expect(r.entries?.get("layout.quickbar.show")).toEqual({ type: "int", value: 0 });
    expect(r.entries?.get("layout.quickbar.align")).toEqual({ type: "str", value: "left" });
    expect(r.entries?.get("motion.choices")).toEqual({ type: "str", value: "fade" });
  });

  test("bad values say what's allowed", () => {
    const r = read({ preset: "sparkly", shape: { radius: 100, hover: "glow" }, layout: { textbox: { x: "left" }, quickbar: { show: "yes" } } });
    const msgs = r.diagnostics.map((d) => d.message);
    expect(msgs).toContain("The theme is invalid: preset must be one of himawari, pastel, minimal, paper, night, retro, high-contrast.");
    expect(msgs).toContain("The theme is invalid: shape.radius must be a whole number from 0 to 64.");
    expect(msgs).toContain('The theme is invalid: shape.hover must be one of "bar", "outline", "fill".');
    expect(msgs).toContain("The theme is invalid: layout.textbox.x must be a percent of the screen from 0 to 95.");
    expect(msgs).toContain("The theme is invalid: layout.quickbar.show must be true or false.");
  });

  test("unknown settings get a suggestion", () => {
    const r = read({ layout: { textbox: { widht: 50 } }, shape: { radios: 4 } });
    expect(r.diagnostics.map((d) => [d.code, d.help])).toEqual([
      ["HW0131", 'did you mean "layout.textbox.width"?'],
      ["HW0131", 'did you mean "shape.radius"?'],
    ]);
  });

  test("an element past the edge of the screen is a warning (HW0132)", () => {
    const r = read({ layout: { textbox: { x: 30, width: 80 }, title_menu: { x: 95, width: 600 } } });
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      "The textbox goes past the right edge of the screen.",
      "The title menu goes past the right edge of the screen.",
    ]);
  });

  test("unreadable text is a warning with a readable color to try (HW0133)", () => {
    const r = read({ colors: { text: "#cccccc", textbox: "#ffffff" } });
    expect(r.diagnostics).toHaveLength(1);
    const d = r.diagnostics[0]!;
    expect(d.code).toBe("HW0133");
    expect(d.message).toBe("Text in text #cccccc on textbox #ffffff has a contrast of only 1.6:1; at least 4.5:1 keeps it readable.");
    const fixed = /^(#[0-9a-f]{6})/.exec(d.help ?? "")?.[1] ?? "";
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  test("a nine-slice textbox image skips the textbox contrast check", () => {
    expect(read({ colors: { text: "#cccccc", textbox: "#ffffff" }, textbox: { image: "ui/box" } }).diagnostics).toEqual([]);
  });

  test("1.0 themes keep working: textbox.height and padding place the textbox", () => {
    const t = resolveTheme({ textbox: { height: 30, padding: 60 } });
    expect(t.layout.textbox).toEqual({ x: 8, y: 67, width: 84, height: 30 });
    expect(t.layout.text).toEqual({ left: 60, top: 18, right: 60 });
    expect(read({ textbox: { height: 30, padding: 60, opacity: 90 }, text: { size: 36 } }).diagnostics).toEqual([]);
  });

  test("resolveTheme fills in everything (defaults, preset, own)", () => {
    const t = resolveTheme({ preset: "retro", colors: { accent: "#00ff00" } });
    expect(t.colors.accent).toBe("#00ff00");
    expect(t.colors.textbox).toBe((THEME_PRESETS["retro"]!.colors as Record<string, string>)["textbox"]);
    expect(t.layout.choices).toEqual(THEME_DEFAULTS.layout.choices);
  });

  test("fixContrast keeps a readable color and darkens or lightens an unreadable one", () => {
    expect(fixContrast("#000000", "#ffffff")).toBe("#000000");
    expect(contrastRatio(fixContrast("#ffe0e0", "#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixContrast("#202030", "#101018"), "#101018")).toBeGreaterThanOrEqual(4.5);
  });
});
