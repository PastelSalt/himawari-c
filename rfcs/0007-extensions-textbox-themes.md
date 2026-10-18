# RFC 0007: Extension statements, textbox modes, and themes (bytecode 1.1)

- **Status:** **Accepted** 2026-10-18 (Phase 5, under the owner's go-ahead)
- **Author:** Claude (Opus 5.5) for Moesoft
- **Created:** 2026-10-18
- **Affects:** `spec/language.md` 0.2.0-draft → 0.3.0-draft (§2.7–§2.9, §3) · `spec/grammar.ebnf` · `spec/bytecode.md` 1.0 → 1.1 · `spec/ast.schema.json` 1.0 → 1.1 · new `spec/extension.schema.json`, `spec/theme.schema.json` · `@himawari/core` · runtime (`ext/`, NVL, theme)
- **Plan references:** §5.4, §5.6, §8.10, §12 (Tier B), §13, §18 Phase 5

## Summary
Three additions that let a game look and behave like itself without leaving the closed language: **extension statements** (`phone(hana, "On my way!")`, declared by a JSON signature and implemented in C), **textbox modes** (`textbox nvl|adv|clear|hide|show`), and **themes** (`theme/theme.json`). All three are checked by Core and compiled into bytecode 1.1, so the runtime still never parses source or JSON (D01).

## Motivation
Phase 5 makes the runtime feature-complete. Games need things the language will never have built in (a phone UI, a minigame, a map), novel-style pages, and their own look. Plan §12 sets the order of extensibility: macros (Tier A, rfcs/0008), then typed extension statements in C (Tier B), then optional Lua (Tier C, later). Each tier must stay statically analyzable, so the validator, Studio, and AI tools keep working on games that use them.

## Design
- **One call syntax for macros and extensions:** `name(arg, …, key=value)`, positional arguments first. Values are integers (with an optional `-`), bare words, or one quoted string. The parser produces an `InvokeStmt`; the checker resolves the name against macros, then extensions (`HW0220` with a suggestion otherwise), binds arguments (`HW0221`–`HW0224`), and checks each value against its parameter type. Name-typed arguments become ordinary references (characters, positions, scenes, assets with their channel, transitions), so validation, hover, rename, and quick fixes treat them like written names.
- **Extension signatures** live in `extensions/<name>.schema.json` (`name`, `description`, `blocking`, `params` with `type`, `default`, `enum`, `description`). Core checks them (`HW0120`): the name must match the file and not be a keyword, types are from a fixed list, and at most one parameter is `text`. A `text` argument is translatable: the statement gets a `#line:` ID, appears in `locales/<lang>.json` with kind `call`, and compiles to a `LINE` entry with the new call flag.
- **Runtime contract** (Tier B, `runtime/src/app/hw_ext.h`): a custom runtime build lists its C files in the CMake cache variable `HW_EXTENSIONS`; each `<stem>.c` defines `hw_ext_register_<stem>()`, which calls `hw_register_statement()` with callbacks: `begin` (the typed values, read by parameter name; the text in the player's language), `update` (a `blocking` statement holds the story until it returns true), `click`, `finish` (the player skips, rewinds, or loads), `restore`, and `draw` (over the scene, under the textbox). The VM remembers each statement's most recent call (its first 8 values) as part of the display state, and saves keep it by statement name with typed values; after a load, a rewind, a reload, or a warp the player calls `restore` with that call, so whatever a statement left on screen comes back without the handler keeping state of its own. (A first version gave handlers four saved state words; a warp, which rebuilds state by running the VM headlessly, never called the handler, so the tint was lost. Remembering the call in the VM fixes that for every way of rebuilding state.) The player matches `XTNS` names to handlers when it loads the file. A missing handler never crashes: the player skips the statement and reports it in dev builds and playtests. The stock runtime carries one sample, `screen_tint` (`runtime/ext/`).
- **`textbox`** switches the presentation mode. NVL keeps the page's lines (and their read state) in the saved state; `clear` starts a page; `hide` lasts until the next line.
- **Themes:** `theme/theme.json` with groups `colors`, `textbox` (opacity, height, padding, nine-slice image and borders), `text`, `font`, `title`, `menu`, `transition`, and per-language `strings` for the built-in UI. Core flattens it to typed entries (`color.accent`, `textbox.slice.left`, `string.ja.start`, …), warns on unknown settings with suggestions (`HW0131`), and compiles `THEM`. The runtime uses the keys it knows.
- **Bytecode 1.1:** ops `TEXTBOX` (0x0C) and `XCALL` (0x0D), sections `XTNS` and `THEM`, `LINE` flag bit 3. Writers emit the **lowest minor** a module needs, so games without these features stay 1.0 and still load in Phase 2–4 players. A 1.0 file's `XTNS`/`THEM` are unknown sections and skipped; 1.1 ops in a 1.0 file are rejected.
- **AST 1.1:** `Textbox` and `Invoke` statements and the file's `macros`. The AST keeps calls as written; `ProjectCheck.expanded` holds the expanded statements for the compiler, flow checks, and the story graph.

## Ease-of-use check
P5 (errors at the argument, with "did you mean"), P6 (extensions and themes need no engine code to *use*; a missing extension degrades instead of crashing), P8 (call texts are translated like every other line), P10 (AI tools see signatures in `project_info` and the same checks apply to their edits), P11 (themes replace UI strings per language).

## Alternatives considered
- **A `$ call_ext("phone", …)` expression form:** reuses existing syntax but loses typed parameters and per-argument diagnostics.
- **Loading extensions from DLLs** instead of a custom runtime build: no rebuild for game developers, but it opens native code loading in every shipped game and complicates crash reports. The plan chose custom builds; DLLs can be reconsidered with Tier C.
- **Theme as CSS-like files or Lua:** more expressive, but needs a parser in the runtime (against D01) or code execution.
- **Always writing minor 1:** simpler, but would make every game built after Phase 5 refuse to load in older players for no reason.
