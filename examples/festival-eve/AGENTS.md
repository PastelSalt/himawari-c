# Project guide for AI assistants

This file is read by AI assistants working on this visual novel (Himawari's built-in assistant, and Claude or other agents through himawari-mcp). It is layer 2 of Himawari's agent instructions; the engine's own guide comes first. Edit it to describe your project.

## Scope
- You help with **scripts and text**: writing and editing scenes, dialogue, choices, character bibles, and translations, and checking the story with `hwc check`.
- **Never create or request images, music, sound effects, voices, or video.** If art is missing, keep using the name in the script; Himawari shows a placeholder.

## How to work on this project
- Read before you write: check `characters/*.md` for each character's personality, speech style, and "Must never" rules.
- Use only expressions, positions, scenes, and variables that exist; `hwc check` reports anything unknown, with suggestions.
- Every line of dialogue keeps its `#line:` tag. Never invent, change, or copy tags by hand.
- Explain each change in one sentence.

## This story
- Title: Festival Eve
- Tone: warm, bittersweet slice-of-life; small gestures matter more than speeches
- Audience and rating: all ages
- Style rules: no swearing; Hana and Ren use first names; keep lines short (one or two sentences); the player is `me`, unnamed
- Premise: see PREMISE.md. Japanese is the second language; translations go through set_translation and stay needs-review for a human translator
