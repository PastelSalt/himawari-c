# RFC 0010: Theme 2.0 and the UI Designer

- **Status:** **Accepted** 2026-10-18 (Phase 6, under the owner's go-ahead)
- **Author:** Claude (Opus 5.5) for Moesoft
- **Created:** 2026-10-18
- **Affects:** `spec/theme.schema.json` 1.0 → 2.0 · `spec/language.md` §2.9 · `spec/bytecode.md` §2.11 (new keys only; bytecode stays 1.1) · `spec/debug-protocol.md` (additions, still version 1) · `@himawari/core` (`project/theme.ts`) · runtime (`hw_theme`, `hw_screens`, `hw_menus`) · Studio (the UI Designer)
- **Plan references:** §8.10, §11.6, §13, §18 Phase 6

## Summary
`theme/theme.json` grows from colors and a few textbox numbers into a description of the built-in UI's **layout and look**: where the textbox, nameplate, text area, choices, quick bar, title, and menus are and how big they are, rounded corners, borders, shadows, text outlines, choice animations, and hover and click sounds. A theme can start from a named **preset**. Core still validates and compiles it into `THEM`, and the runtime draws every screen from those values. Studio's **UI Designer** edits it visually, with presets, palettes, a color wheel, and accessibility checks.

## Motivation
The owner's request: a game made with Himawari should look like its author's game, not like "a Himawari game", and changing that should take no code. Writers and artists (plan §1.2) want to move things, recolor them, make the text area smaller, and start from good combinations, with everything they might need.

## Design

### The file
Everything in 1.0 keeps its meaning. New groups, all optional:

| Group | Settings |
|---|---|
| `preset` (top level) | `himawari` (the look so far, the default), `pastel`, `minimal`, `paper`, `night`, `retro`, `high-contrast`. Its values come first; the file's own settings override them. |
| `colors` | plus `outline` (text outlines), `border`, `button`, `button_text` |
| `shape` | `radius` (0–64 px), `border` (0–12 px), `shadow` (0–48 px), `hover`: `bar` \| `outline` \| `fill` |
| `text` | plus `outline` (0–6 px; 0 = none) |
| `layout.textbox` | `x`, `y`, `width`, `height`: percent of the screen (one decimal) |
| `layout.page` | the novel-mode page, the same four |
| `layout.text` | `left`, `top`, `right`: px inside the textbox (`textbox.padding` stays a shorthand for left and right) |
| `layout.nameplate` | `x`, `y`, `height`: px from the textbox's top-left corner (negative `y` = above it) |
| `layout.choices` | `x`, `y` (percent: the center of the list), `width` (percent), `height`, `gap` (px) |
| `layout.quickbar` | `show` (bool), `align`: `left` \| `center` \| `right` |
| `layout.title` | `x`, `y` (percent: the center of the game's name), `size` (px), `show` (bool) |
| `layout.title_menu`, `layout.game_menu` | `x`, `y` (percent: the center of the column, the top of its first button), `width`, `height`, `gap` (px) |
| `motion` | `choices`: `none` \| `fade` \| `rise`, `ms` (0–2000) |
| `sound` | `hover`, `click`: sound effect names (`assets/sfx/`) |

Pixels are at a 1080-pixel-high screen and scale with the game's resolution, like `textbox.padding` in 1.0. Positions and sizes in percent make a design work at any resolution.

### Compiling
Core merges the preset under the file, validates every value (`HW0130` with the allowed range; unknown settings `HW0131` with a suggestion), and flattens it into `THEM` entries as before: percent values become integers in tenths of a percent (`layout.textbox.x` = 80 for 8 %), booleans 0/1, choices strings. **No bytecode change:** `THEM` is a key/value table and the runtime ignores keys it doesn't know, so bytecode stays 1.1 and older players simply show the 1.0 look.

New checks, as warnings: an element that lies partly off the screen (`HW0132`), and text whose contrast against its panel is below 4.5:1 (WCAG AA, plan §13; `HW0133`), naming both colors.

### Runtime
`bind_theme` reads every value once into a layout struct, with the `himawari` preset's values as fallbacks, so a game without the new keys draws **the same pixels as before** (the golden images check it). Panels, buttons, and choices go through one helper that draws a rounded, bordered, shadowed rectangle (straight `SDL_RenderFillRect` when `radius` and `border` are 0). The player's accessibility settings still win over a design: high contrast replaces the colors and turns on borders, larger text scales with the layout, and reduce motion turns off choice animations.

### Debug protocol (additions, still version 1)
- Command `screen` with `name` (`title`, `play`, `menu`, `load`, `history`, `config`, `controls`, `accessibility`, `extras`, `gallery`, `music`): shows that screen, so the Designer can preview each one in the real game.
- Event `overflow` with `text` and `screen`: in development, a label that doesn't fit its button (once per text), so the Designer can warn about long translations.

### Studio: the UI Designer
A tool page with three parts:
- **Elements:** grouped by screen (story, title, game menu), each with the settings above as plain controls (sliders, numbers, switches), plus "reset to preset".
- **Canvas:** a 16:9 mock of the selected screen drawn from the resolved theme with sample text in the chosen language. Elements can be dragged and resized, snapping to a 1 % grid, the center lines, and the other elements, inside a safe-area guide. The docked preview beside it is the real game: every change is an ordinary edit of `theme/theme.json` (undo, history, autosave, rebuild, reload in place), and the Designer can switch the preview to the screen being designed.
- **Look:** presets and palettes as one-click cards; a color wheel (hue ring and saturation/value square, hex and RGB input, opacity where it applies, the system eyedropper, harmony suggestions, the project's swatches); a contrast badge on every text color with a one-click fix; a color-blindness preview of the canvas (protanopia, deuteranopia, tritanopia).

Theme packs: **export** writes the theme without its `strings` as a `.hwtheme.json` file; **import** reads one and keeps the project's strings.

The AI tools gain nothing new: a theme is a project file, and AI edits to it go through the same proposal review (P12). The AI never makes images (§1.5).

## Ease-of-use check
P1 (a new look in one click), P2 (every change shows in the real game in under a second), P5 (bad values are explained and the old look stays), P6 (no code, no JSON), P7 (only the elements are shown at first; numbers sit behind each element), P9 (undo and reset to preset), P10 (presets pass the contrast check; the player's accessibility settings always apply).

## Alternatives considered
- **Drawing handles over the docked runtime:** the preview is a native child window, which HTML can't draw over; a mock canvas beside the real preview gives direct manipulation without that limit.
- **A layout language (CSS or a widget tree) compiled for the runtime:** far more expressive, but a large engine and a new format to learn. The fixed set of elements covers what visual novels show; extension statements (rfcs/0007) cover the rest.
- **Pixel positions:** break at other resolutions; percent for places and 1080p pixels for sizes match how the runtime already scales.

## Compatibility and versioning
`theme.schema.json` 2.0 (1.0 files stay valid). Bytecode 1.1 unchanged. Debug protocol 1, additive. Saves unaffected.

## Open questions
- Per-language layout overrides (a wider name plate for German, say): wait for real projects to ask.
- Custom screens beyond the built-in ones: Tier C (Lua) or extension statements.
