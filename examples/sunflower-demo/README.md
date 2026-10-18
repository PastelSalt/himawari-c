# Sunflower Days (feature showcase)

A short summer story that uses every Himawari feature, in English, Japanese, and Mandarin Chinese (written in Simplified Chinese, `zh-Hans`). It is Phase 5's exit demo (DETAILED_PLAN.md §18) and the source of the golden-image tests (`tests/golden/`).

## What it shows
| Feature | Where |
|---|---|
| Layered sprites: presets (`happy`, `surprised`), attributes, removing a default (`-sunflower_pin`), a `multiple` group (Ren's glasses), a rule (the ribbon appears with the yukata), blinking and lip-flap | `characters/`, every scene |
| Macros (`define statement`) with typed and default parameters | `enter`, `change_place` in `script/start.hws` |
| An extension statement: `screen_tint(night)` (`extensions/screen_tint.schema.json`; built into the stock runtime as a sample) | `river_night`, `field_evening`, `ending` |
| Novel mode: `textbox nvl`, `clear`, `adv`, and `textbox hide` | `classroom`, `river_night` |
| Menus: a prompt, a condition (`if hana_heart >= 2`), a `once` option, fall-through | `ask`, `classroom` |
| Flow: `jump`, `call` / `return`, `if` / `elif` / `else`, `end` | every file |
| Variables: int, bool, a string enum, a global (`times_finished`) | `himawari.json` |
| Text markup: bold, italic, color, size, speed, a pause `{w=…}`, shaking text, ruby (Japanese), `{select …}`, `[variable]`, `{alt=…}` | the lines |
| Transitions: fade, dissolve, slide, wipe, and rule wipes with two masks (`assets/rules/`) | every scene |
| Effects: `shake`, `flash`, `wait` | `classroom`, `river_night` |
| Audio: music, ambience, a sound effect, a voice (the files don't exist yet, so they're silent, P5) | `start`, `classroom` |
| CGs (and so the gallery), music (and so the music room) | `river_night`, `field_evening` |
| A theme: colors, the textbox, the default transition time, and UI strings; **the whole Chinese UI comes from the theme** (the runtime ships English and Japanese) | `theme/theme.json` |
| Three languages: AI-written translations, marked `needs-review`; Chinese text uses Microsoft YaHei, which the player puts first for Chinese (Japanese fonts lack many simplified characters) | `locales/` |

## How it was made
- `make-art.mjs` draws every picture from simple shapes: two layered characters, three backgrounds, two CGs, and two rule masks. No AI images (plan §1.5). Run `node make-art.mjs` to redraw them.
- The script, the theme, and the Japanese and Chinese translations were written by an AI (Claude) during Phase 5. The translations need a human review.

## Play it
From this folder, with Himawari built:
```bash
hwc run
```
Every path, headless:
```bash
hwc playtest
```
A standalone folder with `data.hwp` (`build/windows/Sunflower Days/`):
```bash
hwc build --release
```
