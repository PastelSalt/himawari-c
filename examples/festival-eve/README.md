# Festival Eve (M1 vertical slice)

A short three-route chapter, made to prove Himawari's milestone M1 (DETAILED_PLAN.md §18, Phase 3):

> Starting from a premise and two character bibles with layered sprites, an AI agent writes a 3-route chapter via MCP. It validates, reaches 100% playtest ending coverage, gets translated to a second language, and plays as a Windows `.exe`.

## How it was made
- **By a person (the inputs):** `PREMISE.md`, `AGENTS.md` (tone, rating, style rules), the two character files `characters/hana.md` and `characters/ren.md` with their layered sprite definitions, and `make-art.mjs`, which draws the sprite layers procedurally (simple shapes; no AI images). Japanese was added to `languages` in `himawari.json`.
- **By an AI agent (Claude, through himawari-mcp over stdio, on 2026-10-17):** it read the project (`project_info`, `AGENTS.md`, `get_character` for both, `list_assets`), declared three variables, wrote all seven scenes in `script/` with `create_scene` (dry run first), checked them with `validate` and `playtest` (5 paths, **3 of 3 endings, 35/35 lines, 7/7 choices**), translated all 45 lines into Japanese with `set_translation`, looked at two lines with `render_line`, and packaged the game with `build`.
- Every AI-written line and translation is recorded in `.himawari/provenance.json`; `hwc report ai-content` summarizes it. The **Japanese translations are marked `needs-review`** for a human translator.
- The two backgrounds (`shrine_evening`, `festival_morning`) don't exist yet, so they show as labeled placeholders.

## Play it
From this folder, with Himawari built:
```bash
hwc run
```
Or build a standalone folder (`build/windows/Festival Eve/`):
```bash
hwc build --release
```
