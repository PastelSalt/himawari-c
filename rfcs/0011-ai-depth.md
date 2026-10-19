# RFC 0011: Review notes, the glossary, and AI depth (Phase 7)

- **Status:** **Accepted** 2026-10-19 (Phase 7, under the owner's go-ahead)
- **Author:** Claude (Opus 5.5) for Moesoft
- **Created:** 2026-10-19
- **Affects:** project files (`.himawari/notes.json`, `glossary.json`; no spec version changes) · `@himawari/core` (continuity checks HW0340–HW0342, `routeBalance`, the glossary and HW0407) · `@himawari/tools` (25 tools: `add_note`, `list_notes`, `resolve_note`; recipes) · `himawari-mcp` (the glossary resource, prompts from the recipes, MCP Apps views) · Studio (Notes panel, graph coverage and editing, route balance, "Translate with AI", the glossary editor, slash commands) · `packages/evals`
- **Plan references:** §7, §10.3, §10.4, §10.9, §11.3, §16.1, §18 Phase 7

## Summary
Phase 7 makes the AI a better reviewer and translator, and makes its quality measurable:
1. **Review notes:** findings anchored on line IDs, kept in `.himawari/notes.json`. The AI leaves them instead of editing; writers leave their own to-dos.
2. **Engine continuity checks:** a character speaking after being hidden, variables set but never read or read but never set (info diagnostics).
3. **Route balance** and a **coverage overlay** on the story graph; **graph editing** (drag to link scenes, add scenes).
4. **A glossary** (`glossary.json`) that the checker, the AI tools, and **"Translate with AI"** (batch translation, Claude Haiku 5.5 by default) all follow.
5. **Recipes:** one set of instructions behind the MCP prompts and the Studio assistant's slash commands.
6. **MCP Apps** views for the story graph and the line preview (experimental).
7. **An eval suite** with deterministic scores and a trend report.

## Motivation
Plan §18 Phase 7. Writers asked for an AI that points at problems without rewriting their work (P12), translation that doesn't cost a fortune on a 30,000-line game, and a way to know whether the AI is getting better or worse.

## Design

### Review notes
`.himawari/notes.json`: `{ "notes": [Note] }`, committed with the project (it's review state, like provenance).

| Field | Meaning |
|---|---|
| `id` | `n` + 7 base-36 characters |
| `line` / `scene` / `file` | the anchor: a line ID (preferred), a scene, or a file |
| `kind` | `continuity`, `character`, `style`, `translation`, `todo` |
| `text` | the finding, in plain words |
| `author` | `ai` or `human` |
| `created`, `resolved?` | ISO time; resolved notes stay, hidden by default |

Tools: `add_note` (checks that the anchor exists), `list_notes` (open ones by default; filter by kind or scene), `resolve_note`. Notes are written directly, not as proposals: they change no game file, and the writer resolves them in Studio's **Notes** panel (a badge on the line in the Screenplay; "Add a note" on any line).

### Continuity checks (info)
- `HW0340`: a character with a sprite speaks after `hide` in the same scene (after branches, only if hidden on every branch; a `say` with attributes counts as showing).
- `HW0341`: a variable is set but nothing reads it; `HW0342`: read but never set (so it's always its default). Spans point at the variable in `himawari.json`.

### Route balance and the graph
`routeBalance(graph)`: for each ending, the scenes that lead only to it (its own lines) and those it shares, and its choices; a route under half the median length is "short" (with 3+ routes). `analyze` reports it. The story graph colors scenes by route or by the last playtest's coverage, and can be edited: dragging from one scene to another makes the first lead there (a jump, or a choice that keeps the old way on as a second option); "New scene" adds one. Both are ordinary text edits with undo.

### The glossary
`glossary.json` at the project root (not in `locales/`, where every file is a string table): `{ "terms": [{ "source", "translations": { "<lang>": "…" }, "note"? }] }`. `HW0407` (info) notes a translation whose source uses a term but which lacks the agreed translation (whole words, any case, for Latin-script terms). `search_dialogue` with `lang` includes the glossary; MCP serves it as `himawari://project/glossary`; Studio edits it in Localization.

### "Translate with AI"
In Localization: the untranslated lines among those shown (narrow by route or search first), about 40 per request. Each request uses structured outputs (`{ translations: [{ id, text }] }`), low effort, and a cached system prompt: the rules (keep markup, natural speech, short choices), character names, the glossary, and `AGENTS.md`. **Claude Haiku 5.5** by default (plan §10.9); Claude Sonnet 5.5 for more care (with server-side refusal fallbacks). A confirm dialog shows the line count, model, and estimated cost before anything is sent. Each batch lands as one undo step, as **needs review**, with provenance stamped `ai`; lines whose markup breaks are refused by `applyTranslations` as before. Cancel keeps what came back. The key is the assistant's (Windows-encrypted, main process only).

### Recipes
`@himawari/tools/recipes`: `write_scene`, `continuity_check`, `branch_planner`, `translate_scene`, `sprite_direction`, `proofread`, `route_balance`, `playtest_report`. Each has an MCP prompt name, a slash command (`/write`, `/continuity`, `/branches`, `/translate`, `/sprites`, `/proofread`, `/balance`, `/playtest`), arguments, and its text. The reviewing recipes leave notes; the fixing ones propose edits. Studio's assistant expands `/command args` in the main process; its menu shows localized descriptions.

### MCP Apps (experimental)
`get_story_graph` and `render_line` carry `_meta.ui.resourceUri` pointing at `ui://himawari/story-graph` and `ui://himawari/scene-preview` (`text/html;profile=mcp-app`). Each view is one self-contained page (no network) that sends `ui/initialize` over postMessage and draws each `ui/notifications/tool-result`; a click on a scene asks the host to call `get_story_graph` for it. Hosts without MCP Apps ignore the hint. Experimental because the SDK has no built-in support yet and the extension may change.

### The eval suite
`packages/evals`: tasks on copies of `examples/festival-eve` (write a scene, find a planted contradiction, translate with a glossary, fix an unreachable ending, proofread planted typos), most given as the recipes. Scores are deterministic: the task's own check, validation (no errors), a headless playtest (every ending), and bible rules on new lines. A `claude` agent runs them through the SDK tool runner (needs `ANTHROPIC_API_KEY`; costs money; never in CI by default); a `scripted` agent gives the reference answers, and the tests check that it scores 100 % and that doing nothing scores 0. Results are JSON files by date; `trend` writes `TREND.md` with each model's change since its previous run.

## Alternatives considered
- **Notes as script comments:** they would travel with the text, but the AI would be editing scripts to leave them, and translators would see them. Rejected.
- **The glossary in `himawari.json`:** it can grow to hundreds of terms and is edited by translators, not the developer. Rejected.
- **Translating through the assistant's chat:** one tool call per line is slow and costs many times more. The chat recipe stays for single scenes.
- **A model as the eval grader:** less stable from run to run, and it costs more. Kept deterministic; a graded score can be added later.

## Open questions
- Glossary matching for scripts without spaces (Japanese source text matches anywhere; inflected forms in other languages aren't recognized).
- Whether MCP Apps should be served only to clients that advertise the extension once the SDK reports it.
- The eval tasks cover one small project; a bigger generated one (scripts/stress) would test the summarizing tools.
