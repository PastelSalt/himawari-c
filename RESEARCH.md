# Himawari — Foundations Research

> **Status:** v1.2 · 2026-10-17 (§4.4 and §15 updated with Phase 0 spike results; plan v0.5 is Windows-only, so Linux-specific findings, e.g. cross-compiling in §4.5, are kept for the future Linux work in plan §18.9 but are not on the v1 path)
> **Purpose:** Find proven, field-tested patterns before committing to designs, so the plan rests on evidence instead of guesses.
> **Method:** Web research across official docs, specs, source repositories, and practitioner write-ups (October 2026). Each finding is rated:
> - ✅ **Primary:** official docs, specs, or source code
> - ◐ **Secondary:** blogs, forums, vendor comparisons. Use it as direction, and verify before relying on details.
> - 💭 **Inference:** my own reasoning from the findings. Labeled as such.
>
> Each section ends with **→ Himawari decision**: what we **Adopt** as-is, **Adapt** with changes, or **Avoid**.

---

## 0. Executive Summary: What the Evidence Says

| # | Topic | Proven precedent | Himawari decision | Conf. |
|---|---|---|---|---|
| 1 | Script syntax | Ren'Py (huge corpus, familiar to LLMs); Naninovel (one statement per line, `@command`) | **Adopt** a Ren'Py-like closed language. **Adapt** Naninovel's line-oriented clarity for the visual editor | ✅ |
| 2 | Line identity / localization | Yarn Spinner `#line:` tags, auto-added by tooling; string tables with placeholders | **Adopt** almost exactly | ✅ |
| 3 | Layered sprites | Ren'Py `layeredimage`: groups, attributes, `default`, `auto`, `when`, `if` | **Adapt**: same model, but declared in data with folder-based auto-discovery, plus built-in blink and lip-flap | ✅ |
| 4 | Writer UX | Inky "play as you write" with choice replay; Naninovel live preview with active-line highlight, placeholders, rename-refactors | **Adopt** all four as core Studio features | ✅/◐ |
| 5 | Dev-loop tooling | Ren'Py: lint, Shift+R reload-in-place, `--warp file:line`, Shift+E open-in-editor, fast-skip to next menu | **Adopt** every one (Studio + runtime dev mode) | ✅ |
| 6 | Rendering | SDL **3.4** added `SDL_CreateGPURenderState` (custom fragment shaders inside `SDL_Renderer`) | **Adopt**: rule/mask transitions without leaving SDL_Renderer | ✅ |
| 7 | Audio | **SDL3_mixer 3.x** (full rewrite, requires SDL ≥ 3.4, current 3.2.x) | **Adopt** instead of writing a custom mixer | ✅ |
| 8 | Text | FreeType + HarfBuzz (SDL3_ttf wraps both); libunibreak (UAX #14, zlib); W3C JLREQ / Simple Ruby | **Adopt** FreeType + libunibreak + JLREQ/Simple-Ruby rules. Custom VN layout on top | ✅ |
| 9 | Rollback | Ren'Py checkpoints at each say statement; rollback-safe RNG | **Adopt** (matches plan v0.1) | ✅/◐ |
| 10 | MCP | Spec **2026-07-28**: stateless, `server/discover`, tasks became an extension, Roots/Sampling/Logging deprecated | **Adopt** latest spec. Avoid all deprecated features | ✅ |
| 11 | MCP UI | **MCP Apps** extension (`ui://` resources in sandboxed iframes), supported by Claude and others | **Adopt** (optional): story-graph and scene-preview apps inside the AI chat | ◐ |
| 12 | AI edit format | Aider: search/replace beats unified diff (26% → 59% for GPT-4); whole-file is robust but costly | **Adapt**: ID-anchored structured edits plus whole-scene replace. Never line-number diffs | ◐ |
| 13 | Code editor | CodeMirror 6 is far lighter than Monaco and fully customizable | **Switch** Monaco → **CodeMirror 6** | ◐ |
| 14 | Electron | Official security checklist (context isolation, sandbox, CSP, permission handlers) | **Adopt** checklist as a CI-enforced policy | ✅ |
| 15 | Extensibility | Ren'Py creator-defined statements declare `parse/lint/execute/predict`; Lua 5.4 ≈ 200–300 KB | **Adapt**: tiered (macros → C extension statements → optional sandboxed Lua) | ✅/◐ |
| 16 | Accessibility | Game Accessibility Guidelines / IGDA Top Ten; Ren'Py self-voicing + `{alt}` | **Adopt** baseline in v1. Self-voicing in v1.x | ✅/◐ |
| 17 | License | MIT/zlib maximize adoption; MPL-2.0 keeps engine changes open | **Runtime: zlib. Tooling: MIT** | ◐ |
| 18 | AI content compliance | Steam (Jan 2026): disclose pre-generated vs live-generated AI content; dev tools exempt | **Adopt** text-only provenance tracking and an exportable "AI content report". Himawari has no media generation (plan v0.4 §1.5) | ◐ |
| 19 | Docs | Diátaxis (tutorials / how-to / reference / explanation) | **Adopt** | ◐ |

---

## 1. Script Language and Authoring Model

### 1.1 Ren'Py ✅
- Indentation-based script with labels, `jump`/`call`, `menu`, and `say` statements. It is the most widely used VN engine, so its syntax is heavily represented in LLM training data. 💭 *Inference: LLMs will produce valid Ren'Py-like syntax with fewer errors than a novel syntax.*
- Image display uses **tag + attributes**: `show mira happy hat -glasses`. The engine merges new attributes with previous ones and resolves group conflicts.
- Weakness for our goals: embedded Python means the script can't be fully analyzed statically, and AI edits can do anything. 💭

### 1.2 Naninovel ✅ (docs) / ◐ (review)
- **Unity-based.** Plain-text `.nani` scripts. **Each line is one statement:** command, generic text, label, or comment.
- Command lines start with `@`. The same commands can be **inlined inside dialogue in `[ ]`**.
- Commands are case-insensitive and have short aliases.
- Basic VNs require no programming. Custom gameplay needs C#.
- Visual editor: script lines as **rows**, added with `+`/Enter, reordered by drag-and-drop, duplicated with Ctrl+D.
- Story graph: scripts and labels as nodes; conditional `@goto` links appear as **dashed edges**.
- **Live preview:** edits apply immediately to the running game. The active line is highlighted (green when running, yellow when waiting for input). Ctrl+X jumps from the game to the current line.
- **Placeholder assets:** create placeholder backgrounds and characters with editable traits that show up in the preview and dropdowns.
- **Rename/move files automatically updates `@goto` / `@gosub` paths.**
- Double-Shift global search. A dirty-asset list. A **selective undo/redo history** list.
- The editor also runs as a browser PWA ("sandbox mode") and writes standard script files.

### 1.3 Ink / Inky ✅ (structure) / ◐ (Inky README, alpha-era)
- Story structure: **knots** (sections), **stitches** (sub-sections), **diverts** (`->`), **weave** (inline choices `*` with **gathers** `-` that re-join branches), and **sticky** choices (`+`, remain available after being picked).
- **Inky IDE:** constantly recompiles to surface errors early. **"Play as you write":** the play pane remembers your earlier choices and **fast-forwards to where you were after each recompile.**

### 1.4 Dialogic 2 (Godot) ◐
- Timelines built from event blocks: Text, Character (join/leave/update), Choice, Condition, Jump, Signal. A visual block editor sits alongside a text mode.

### 1.5 Narrative tools: Twine, Arcweave, articy:draft ◐
- **Twine:** free, open source, flowchart-first, approachable for beginners. Manual export to engines.
- **Arcweave:** cloud drag-and-drop flowcharts, real-time collaboration. **No offline mode**, and large projects need a paid plan.
- **articy:draft X:** Windows desktop, strong data modeling, localization, and multi-user workflows. Per-seat licensing.

### → Himawari decisions
- **Adopt** a Ren'Py-like surface syntax, including `show <tag> <attributes>` and `-attribute` removal.
- **Adopt** Naninovel's **one statement per line** discipline. It makes the row-based visual editor and AI line anchoring trivial.
- **Adapt** Naninovel's inline commands as inline **text tags** (`{w=500}`, `{shake}`) so dialogue lines stay one row.
- **Adopt** Ink's **weave-style inline menus that re-join** (an option body that doesn't `jump` falls through to the next line after the menu). Also **sticky vs once-only** options (`once` keyword), since "hub" conversations are a common VN pattern.
- **Adopt** a **dual view over one document:** Script (text) and Screenplay (rows/blocks, like Naninovel and Dialogic). Both edit the same syntax tree.
- **Avoid** cloud-only design (Arcweave's weakness). Himawari is offline-first, and git is the collaboration layer.

---

## 2. Stable Line IDs and Localization

### 2.1 Yarn Spinner ✅
- A line ID is a **`#line:` tag at the end of a line** that uniquely identifies it (example: `#line:1a64a5`).
- Tooling adds tags automatically ("Add Line Tags to Scripts"). It rewrites files and only tags untagged lines.
- A strings file **can't be generated until every line has an ID.**
- The **same ID is shared across all language string tables**, so code stays the same and only the text changes.
- **Inline expressions are replaced with placeholders** in string tables.
- Each project has a **base language**.

### 2.2 Ren'Py translation framework ◐ (translated docs fragments)
- A translation unit is a block of translatable statements ending in one `say`. Its identifier is generated from the **preceding label and a hash of the unit's code.**
- Translators can split, combine, reorder, or omit dialogue.
- "Extract Dialogue" exports a **tab-delimited spreadsheet** whose first column is the identifier.
- **Voice files are matched by the same identifier** (automatic voice).
- 💭 *Inference: hash-of-content IDs change when the source text is edited, which orphans existing translations and voice files. Yarn's persistent explicit tags avoid this. That is why we choose explicit tags.*

### 2.3 Plurals and gender ◐
- ICU MessageFormat (MF1) and Unicode **MessageFormat 2** support `plural`/`select` (gender) with nesting (select outside plural is recommended). Project Fluent covers similar ground.
- 💭 VNs rarely need plurals in dialogue, but interpolated names (`[player_name]`) and gendered protagonists are common.

### → Himawari decisions
- **Adopt** Yarn's model: persistent `#line:xxxxxx` tags, auto-assigned by tooling, shared across all languages, inline expressions → placeholders.
- **Adopt** "a translation export requires every line tagged". Our tooling does this automatically, so writers never see the requirement.
- **Adopt** Ren'Py-style **voice-by-ID** convention.
- **Adopt** a **spreadsheet export** (CSV/TSV) for translators, plus **XLIFF 2.x** for professional CAT tools. 💭 XLIFF is the industry interchange standard. Its details weren't re-verified in this pass.
- **Adapt** for v1: support `[var]` interpolation and **`select`-style variants for gendered/variable text**, using an ICU-lite subset. Full MF2 is deferred.

---

## 3. Layered Sprites (your answer #2)

### 3.1 Ren'Py `layeredimage` ✅ (official docs)
- `always`: a layer that is always shown.
- `attribute <name>`: a layer tied to a show-time attribute. Properties: `default`, `null` (tracked but invisible), **`when <expr>`** (show only if a boolean expression over active attributes is true), `variant`, `at`/transform properties.
- `group <name>`: attributes are **mutually exclusive**. The reserved name `multiple` disables exclusivity.
- **`auto`**: discovers images by naming pattern `<image>_<group>_<attribute>.png`. **Filenames with spaces don't match**, a known pitfall.
- `if/elif/else`: chooses a layer by **runtime game state**, not by attributes.
- **Resolution order on `show`:** adjust_attributes callback → default-attribute callbacks → merge with previous attributes (group conflicts) → `attribute_function` (can add dependencies or randomization) → final group checks → display.
- `image_format` maps names to paths (`"sprites/mira/{image}.png"`). **`LayeredImageProxy`** reuses a layered image elsewhere (side images, a sepia copy) while still accepting attributes.
- Prediction: `if` conditions can cause unpredicted image loads unless `predict_all` is set.

### 3.2 Blink and lip-flap in practice ◐
- Common pattern: the **layered base carries eyes (blink animation with a random interval between open frames, plus a brief half/closed sequence)**, and a **separate mouth layer swaps open/closed shapes while dialogue text is printing.**
- Mouth images must share the base canvas size and position.
- Live2D users drive a "Mouth Open" parameter the same way, which practitioners note is not real lip-sync.
- Practitioners note layered images are computed when shown. 💭 This is fine on native, and worth caching on weak hardware.

### 3.3 Art pipeline: PSD / Krita ◐
- **There is no established VN-specific layer-naming standard.**
- Krita ships a Batch Exporter (since 4.4) that reads **tags in layer names** (`e=png s=50,100 p=path`) but flattens hierarchy.
- Spine's PSD import uses **bracketed layer-name prefixes** (`[skin]`, `[slot]`, `[folder]`). This shows the general pattern of encoding structure in layer names.
- PSD is not an ideal interchange format: Krita-written PSDs can flatten vector layers.
- 💭 **OpenRaster (`.ora`)**, a zip of PNGs plus `stack.xml` that Krita exports natively, is an open, easy-to-parse alternative to PSD.

### → Himawari decisions
- **Adopt** Ren'Py's semantics: groups (exclusive), attributes, `default`, `always`, `when`, attribute merge with `-attr` removal.
- **Adapt:**
  - **Folder-based auto-discovery:** `sprites/<char>/<group>/<attribute>.png`. More intuitive than underscore naming and avoids the spaces pitfall.
  - Declare layers in the character file as data, not code.
  - **Expressions become named presets over groups** (`happy = {brows: up, eyes: smile, mouth: smile}`). Writers type `hana happy`, and artists keep fine control. This replaces Ren'Py's `attribute_function` with a data-only mechanism.
  - **Built-in blink** (eyes group frames `x` / `x_half` / `x_closed`, random 2–6 s interval) and **built-in lip-flap** (mouth `x` / `x_open` while text reveals or voice plays). Zero code needed.
  - **Importer:** PSD (via the `ag-psd` TS library 💭 not re-verified) and **ORA**, using a simple convention: top-level groups → sprite groups, layers → attributes, `[always]` / `[default]` markers.
  - The packer **auto-trims** transparent borders and stores offsets, so same-size canvases cost no extra memory.
- **Adopt** proxies as **"views"**: side-portrait and tinted variants reuse the same layered definition.

---

## 4. Runtime Stack: Rendering, Audio, Text, Build

### 4.1 SDL 3.4 ✅
- **3.4.0 added `SDL_CreateGPURenderer`, `SDL_GetGPURendererDevice`, `SDL_CreateGPURenderState`, `SDL_SetGPURenderState`, `SDL_SetGPURenderStateFragmentUniforms`, and `SDL_DestroyGPURenderState`.** These let you use **custom fragment shaders with the 2D renderer.**
- The state descriptor holds a fragment shader, extra sampler bindings, and storage textures/buffers.
- Calls must happen on the renderer's thread.
- ⚠️ The docs disagree on the struct name (`SDL_GPURenderStateDesc` vs `SDL_GPURenderStateCreateInfo`). Check the 3.4 header.
- Patch releases continue: 3.4.6 has release notes, and Fedora packages 3.4.14, including a `mingw64-SDL3-static` sub-package.

### 4.2 SDL3_mixer 3.x ✅
- An **almost-from-scratch rewrite**, incompatible with 2.x. **Requires SDL ≥ 3.4.0.** Everything is `MIX_`-prefixed. `MIX_Init` is reference-counted. It has explicit `MIX_LockMixer` / `MIX_UnlockMixer`.
- The current line is **3.2.x**. 3.2.4 added an "ignore file loop metadata" option, which implies **loop metadata is honored by default** (useful for VN music loops). It also fixed crashes.

### 4.3 SDL3_ttf ✅ / ◐
- zlib license. Wraps **FreeType (FTL), HarfBuzz (MIT), and PlutoSVG/PlutoVG (MIT)**.
- 3.x introduced text objects with **surface, renderer, and GPU text engines**, **fallback fonts**, OT-SVG color emoji, and per-text script/direction (`TTF_SetTextScript` fails without HarfBuzz).
- 3.2.2 added `TTF_GetFontWeight`.

### 4.4 Line breaking and Japanese layout ✅ / ◐
- **libunibreak** (C, zlib) implements **UAX #14 line breaking** and UAX #29 word/grapheme breaking. Line breaking is at Unicode 15.0, because some 15.1 rules are incompatible with its incremental API.
  - ✅ **Correction (Spike C, 2026-10-17):** libunibreak **8.0** (Sept 2026) implements UAX #14 revision 55 for **Unicode 17.0**. With `lang = "ja"` it still allows small kana (e.g. っ) at a line start, so the JLREQ override table is required (rfcs/0003).
- CSS's `line-break: normal` follows **JLREQ** for a few code points and otherwise matches UAX #14. So **JLREQ kinsoku can differ slightly from pure UAX #14**, which means a small override table is needed.
- **W3C "Rules for Simple Placement of Japanese Ruby"** (from the JLREQ task force): the top priority is avoiding misreadings. **Ruby wider than its base must not overhang adjacent characters.** It gives a single layout method per case, plus guidance for double-sided ruby.

### 4.5 Cross-compiling SDL3 with MinGW-w64 ◐
- Working pattern: `CMAKE_SYSTEM_NAME=Windows`, `x86_64-w64-mingw32-{gcc,g++,windres}`, `CMAKE_FIND_ROOT_PATH=/usr/x86_64-w64-mingw32`.
- SDL ships `build-scripts/cmake-toolchain-mingw64-x86_64.cmake` and an official INTRO-mingw guide.
- One forum thread built `SDL_SHARED=ON` plus `SDL_STATIC=ON` without a confirmed outcome. **A static-only Linux→Windows recipe still needs verification in our Phase 0 spike.**

### → Himawari decisions
- **SDL 3.4.x** (pinned). Use the **GPU renderer + GPU render state** for rule/mask transitions and screen effects. Shaders are compiled offline to SPIR-V/DXIL/MSL (💭 via SDL_shadercross, not re-verified). There's a CPU fallback for old GPUs.
- **SDL3_mixer 3.2.x** replaces the custom mixer from plan v0.1. This removes about a month of risk.
- **Text:** FreeType + **libunibreak** + our own VN layout (per-glyph reveal, ruby per W3C Simple Ruby, JLREQ kinsoku overrides, outlines). HarfBuzz is enabled for complex scripts.
  - **Phase 0 spike:** evaluate SDL3_ttf as the font/shaping/atlas layer under our layout before writing a custom atlas.
- **Phase 0 spike:** prove a fully static SDL3 + SDL3_mixer + FreeType Windows `.exe` cross-built from Linux, running on Wine and on real Windows.

---

## 5. Saves and Rollback

### Ren'Py ✅ / ◐
- Rollback works by **saving state at the start of each statement that interacts with the user** (effectively each `say`) and reloading on rollback.
- It records the current statement and its return stack, **not how it got there.**
- Only variables declared with `default` participate fully in save/rollback.
- Use **`renpy.random` for rollback-safe randomness.**
- Configuration and styles are not saved.

### → Himawari decisions
- **Adopt:** checkpoint at each `say`/`menu`; seeded RNG in state; only declared variables are saved (our manifest already requires declarations).
- 💭 Our closed VM state (pc + call stack + vars + display state) is much smaller than pickled Python, so we can afford a deep rollback buffer (256+ steps under 1 MB).

---

## 6. Model Context Protocol (current state, Oct 2026)

### 6.1 Spec revision 2026-07-28 ✅ (official changelog)
**Major changes**
- **Stateless:** no `initialize` handshake. Every request carries protocol version and client capabilities in `_meta`.
- New mandatory **`server/discover`**.
- **Protocol-level sessions removed**, along with the `Mcp-Session-Id` header. Cross-call state uses **server-minted handles passed as tool arguments.**
- `subscriptions/listen` replaces the GET endpoint and resource subscribe. Clients opt in to list-changed and resource notifications.
- **Multi Round-Trip Requests (MRTR):** instead of server-initiated requests (elicitation, sampling, roots), the server returns `resultType: "input_required"` with `inputRequests`, and the client retries with `inputResponses`.
- **Tasks moved to an official extension** (`io.modelcontextprotocol/tasks`), with polling via `tasks/get`.
- SSE resumability removed. `ping` and `logging/setLevel` removed.

**Minor changes**
- **Tools SHOULD be listed in deterministic order** (improves prompt-cache hits).
- `inputSchema`/`outputSchema` accept any JSON Schema 2020-12. `structuredContent` accepts any JSON.
- `ttlMs`/`cacheScope` on list results.

**Deprecated**
- **Roots, Sampling, and Logging.** Recommended replacements: pass paths via tool params or config, call LLM APIs directly, log to stderr.
- The HTTP+SSE transport.

### 6.2 TypeScript SDK ◐
- v2 splits packages into `@modelcontextprotocol/server` and `@modelcontextprotocol/client`, with middleware for Express/Hono/Node HTTP.
- `registerTool(name, config, handler)` with Zod v4 or any Standard Schema.
- v1.x is maintained for at least 6 months after v2.
- ⚠️ Sources disagree on whether v2 is GA. **Check the releases page at implementation time.**

### 6.3 MCP Apps extension ◐
- Extension `io.modelcontextprotocol/ui`, stable since 2026-01-26 (SEP-1865).
- Tools link to `ui://` resources via `_meta.ui.resourceUri`. Hosts render them in **sandboxed iframes** with restricted CSP and talk to them over JSON-RPC.
- App-only tools can be hidden from the model (`_meta.ui.visibility = ["app"]`).
- Reported client support: Claude web/desktop, ChatGPT, Goose, VS Code.

### → Himawari decisions
- **Target spec 2026-07-28.**
  - Implement `server/discover`.
  - Expose no session-dependent behavior. Concurrency uses explicit **`base_revision` handles in tool arguments** (exactly the spec's recommended pattern).
  - Use deterministic tool order.
- **Don't use** Roots, Sampling, or Logging. The project path comes from server config or args. Logs go to stderr.
- Use **MRTR `input_required`** for confirmations, for example "rename character `hana` across 41 files?".
- Use the **tasks extension** for long `playtest`/`build` calls, with a synchronous fallback for clients without it.
- **Optional MCP Apps:** `ui://himawari/story-graph` and `ui://himawari/scene-preview`, so the AI's chat window can show an interactive branch graph or a rendered dialogue preview.
- Build on SDK v2 if GA at Phase 3, otherwise v1.x behind a thin adapter.

---

## 7. AI Edit Reliability ◐

- Aider documents several edit formats and picks per model. Whole-file is simplest and robust, but slow and costly for small changes.
- Reported (secondhand, attributed to Aider): switching GPT-4 from a strict unified diff to **search/replace blocks raised edit success from 26% to 59%**. The Diff-XYZ benchmark found search/replace beats unified diffs for large models, while small models barely benefit from any format.
- Known failure: models fail to reproduce long lines exactly in search blocks.
- 💭 **Implication:** anchor edits on **stable IDs**, not on reproduced text or line numbers. This avoids the exact-match failure entirely.

### → Himawari decisions
- `patch_scene` operations reference **line IDs** (`insert_after`, `replace_text(line_id, new)`, `delete`).
- `update_scene` (whole-scene replace) is offered for small scenes and new drafts.
- **No line-number or unified-diff editing.**
- Every write is validated, with `dry_run` returning diagnostics the AI can fix in one round.

---

## 8. Studio Technology

### 8.1 Code editor: CodeMirror 6 vs Monaco ◐
- Sourcegraph migrated off Monaco: **Monaco alone was a 2.4 MB download.** Swapping it was their single biggest bundle win (43%).
- CodeMirror 6 core is about 50–200 kB and tree-shakeable. Custom languages use the **Lezer** parser system.
- Replit found **"completely replacing core components … was simply not possible with Monaco."**
- Monaco wins on VS Code-grade IntelliSense out of the box and isn't mobile-friendly.

### 8.2 Electron security ✅
Official checklist:
- Load only secure content; no Node integration for remote content.
- **Context isolation in all renderers** (default since Electron 12) and **process sandboxing**.
- Permission request handlers; keep `webSecurity` on.
- Enabling `nodeIntegration` also disables sandboxing for that process.

### → Himawari decisions
- **Switch to CodeMirror 6.** Its **decoration system** is what we need to:
  - hide or dim `#line:` tags
  - show inline character-portrait chips and expression thumbnails
  - render the "▶ play from here" gutter
  - power the Screenplay row view
- Diagnostics, completion, and hover still come from `@himawari/core` services.
- Electron checklist enforced in code review and CI. 💭 Also enable Electron **fuses** (e.g., disable `RunAsNode`). The fuses docs were not retrieved in this pass, so verify the exact set.

---

## 9. Ease-of-Use Patterns (your new requirement)

Synthesis of the proven patterns above, ranked by how much they reduce friction:

| Pattern | Proven in | What it removes |
|---|---|---|
| **Play as you write, with choice replay** | Inky | Re-clicking through the story after every edit |
| **Live preview with active-line highlight; jump game → line** | Naninovel | "Where am I in the script?" |
| **Reload in place** (keep position after code change) | Ren'Py Shift+R | Restart-to-test loops |
| **Warp / play from any line** | Ren'Py `--warp`, Naninovel | Playing 20 minutes to test one scene |
| **Fast-skip to next choice** | Ren'Py `>` | Tedious testing of branches |
| **Open current line in editor** | Ren'Py Shift+E, Naninovel Ctrl+X | Hunting for the text you just saw |
| **Lint with stats** | Ren'Py launcher | Shipping broken jumps and missing images |
| **Placeholder assets** | Naninovel sandbox | Blocking writing on art |
| **Rename refactors update references** | Naninovel | Broken links after reorganizing |
| **Global fuzzy search (double-Shift)** | Naninovel, JetBrains | Navigation friction |
| **Selective undo history list** | Naninovel | Fear of experimenting |
| **Block/row editor alongside text** | Naninovel, Dialogic, TyranoBuilder | Syntax anxiety for non-programmers |
| **Flowchart overview** | Twine, Arcweave | Losing track of branches |
| **Tutorial project inside the tool** | Ren'Py's bundled tutorial games 💭 | Blank-page paralysis |

💭 Also adopted from general developer-tool practice (well known, not re-verified in this pass):
- **Elm/Rust-style diagnostics:** plain language, a source snippet, a caret, and a "did you mean…?" suggestion with a one-click fix.
- **Progressive disclosure:** advanced features (variables, bytecode, macros) stay hidden until needed.
- **Sensible defaults:** a new project works and plays before any configuration.

---

## 10. Extensibility (since other developers will build on the engine)

### Ren'Py creator-defined statements ✅ / ◐
- Developers add new statements via `renpy.register_statement`, which takes **`parse`, `lint`, `execute`, `predict`, `next`, `scry`, `block`, `init`, `translatable`.**
- Historically single-line only.
- Load order matters: definitions go in an early block, and the defining file must load before files that use it.
- 💭 The key lesson: **custom statements must still participate in lint, prediction, and translation.** Otherwise extensibility breaks tooling.

### Lua 5.4 ◐
- Default build is about **200–300 KB**. The parser/lexer is a big share of that, and it can be dropped by precompiling.
- Long track record in games.
- Sandboxing (removing `io`/`os`, instruction/memory limits) wasn't covered by the sources and needs its own research when we get to that tier.

### → Himawari decisions (tiered)
1. **Tier A, v1: macros.** `define` new statements in `.hws` as compositions of built-ins with typed parameters. They are fully analyzable, previewable, and safe for AI.
2. **Tier B, v1: extension statements in C.** A registration API (`hw_register_statement`) with a **JSON-Schema signature** shipped in the project, so Core can parse, validate, complete, and translate calls. Game devs who need custom behavior build a custom runtime from source (it's open source).
3. **Tier C, v1.x: optional sandboxed Lua 5.4** for minigames and custom screens. Opt-in per project, with declared signatures, so the validator still checks call sites. Off by default to preserve the "fully analyzable" guarantee.

---

## 11. Accessibility ✅ / ◐

- **Game Accessibility Guidelines** names the four most-complained-about issues: **remapping, text size, colorblindness, subtitle presentation.**
- **IGDA Top Ten:**
  - large, clear default text, ideally player-adjustable (test: readable at double the normal viewing distance)
  - subtitles in a readable size, **≤ 38 characters per line**, always contrasting, **showing the speaker**, a dark box behind light text
- Don't rely on color alone. Support red-green and blue-yellow deficiencies. Remappable controls; UI usable with the same input as gameplay.
- **Ren'Py self-voicing:** OS text-to-speech toggled with V, an accessibility menu on A, and `{alt}`/`{noalt}` tags for spoken alternatives (e.g., for non-verbal sounds).
  - Menus and images need alt text or they're silent.
  - Conflicts with NVDA reported. Users want a **first-launch option** instead of a hidden hotkey.

### → Himawari decisions
- **v1 baseline:**
  - text size and font choice (including a dyslexia-friendly option)
  - textbox opacity / high contrast
  - speaker always shown
  - full remapping (keyboard + gamepad)
  - **"reduce motion & flashes"** (disables `shake`/`flash`/fast transitions, for photosensitivity)
  - colorblind-safe default UI theme
  - a **first-launch accessibility prompt**
- **v1.x:** self-voicing via OS TTS (Windows SAPI; speech-dispatcher on Linux) with `{alt=...}` tags and alt text on CGs and menu items. The validator warns when images lack alt text.

---

## 12. Licensing (your answer #3: open source) ◐

- MIT/zlib maximize adoption, and most game developers don't want to open their games. MPL-2.0 (file-level copyleft) keeps engine modifications open while games stay closed. Tilengine moved LGPL → MPL-2.0 so console devs could link statically.
- 💭 Known facts not re-verified in this pass: Godot and Ren'Py are MIT; SDL, SDL_mixer, and SDL_ttf are zlib (confirmed for SDL_ttf above). The zlib license does not require notices in binary distributions.

### → Himawari decisions
- **Runtime (Himawari-C): zlib.** It's linked into every game. Same license as SDL, with no attribution burden on game devs beyond what dependencies need.
- **Tooling (Core, CLI, MCP, Studio): MIT.**
- **Spec documents: CC-BY-4.0**, so others can implement compatible tools.
- ⚠️ **FreeType FTL requires a credit in documentation.** The exporter auto-generates `licenses/` and a credits snippet. Bundled fonts must be OFL (e.g., Noto).

---

## 13. AI-Generated Content Compliance ◐

- **Steam (revised Jan 2026):** disclosure covers AI-generated content players consume (in-game and marketing). **AI-assisted dev tools (code assistants, unshipped concept art) are exempt.** There are two categories: **pre-generated** (during development) and **live-generated** (during gameplay, which requires describing guardrails). Live-generated adult sexual content has no approval path.
- Sources disagree on how strictly it's enforced.

### → Himawari decisions
- **Scope (plan v0.4):** Himawari is a development tool and has **no AI media generation** (images, audio, voice, video). That keeps it close to the exempt "development tools" category.
- **Provenance tracking:** AI-written *text* that ships (dialogue, menu options, translations) may still need disclosure, so every text item records `origin: human | ai | ai-edited` (set automatically for AI writes and changed when a human edits).
- Studio exports an **"AI content report"** for store disclosure forms.
- Himawari games are **pre-generated only** by design (the runtime has no live LLM calls). This is the simpler disclosure category.

---

## 14. Documentation ◐

- **Diátaxis:** four separate modes.
  - **Tutorials:** learning-oriented, for newcomers.
  - **How-to guides:** task-oriented, for practitioners.
  - **Reference:** factual and neutral.
  - **Explanation:** the "why".
- The most common failure is mixing modes, especially explanation inside how-tos. Canonical adopted it company-wide.

### → Himawari decisions
- Docs site in four sections. The first tutorial is **"Your first visual novel in 15 minutes"** (no AI), then **"Co-writing with an AI agent"**.
- `spec/` is pure reference. An `llm-reference.md` is a compact reference written for models.

---

## 15. Still to Verify (scheduled spikes)

| Item | Why | When |
|---|---|---|
| ~~Fully static SDL3 + SDL3_mixer + FreeType `.exe`~~ | ✅ Verified natively with MSYS2 UCRT64 (rfcs/0001). The cross-build part is deferred with Linux (plan v0.5) | Done (Phase 0) |
| ASan/UBSan **and libFuzzer** in MSYS2 CLANG64 for MinGW targets | Plan v0.5 is Windows-only, so this decides the whole memory-safety approach (plan §14.3) | **Phase 1 start** |
| `resedit` (pure-JS PE resource editing) for per-game `.exe` icons | Reproducible exports without a compiler | Phase 4 |
| ~~`SDL_GPURenderState` on MinGW builds (D3D12/Vulkan)~~ | ✅ Verified; struct is `SDL_GPURenderStateCreateInfo` (rfcs/0002) | Done (Phase 0) |
| ~~SDL3_ttf as atlas/shaping layer vs direct FreeType~~ | ✅ Decided: FreeType direct (rfcs/0003) | Done (Phase 0) |
| MCP TS SDK v2 GA status | Conflicting sources | Phase 3 start |
| Electron fuses recommended set | Not retrieved | Phase 4 |
| Lua sandboxing approach | Not covered | Before Tier C |
| `ag-psd` / ORA parsing of real artist files | Real files vary | Phase 5 importer |
| Exact Ren'Py docs pages (translation hash, rollback) | Only fragments found | Reference only, not blocking |

---

## 16. Built-in AI Assistant: SDK Facts (added 2026-10-17, for plan v0.3) ✅

Source: Anthropic's current Claude API reference material (official SDK docs bundled with Claude Code, cached 2026-10-06).

- **Agent loop:** the TypeScript SDK has a **beta tool runner**. `betaZodTool({ name, description, inputSchema: z.object(...), run })` defines a tool, and `client.beta.messages.toolRunner({ model, max_tokens, tools, messages, stream })` runs the loop.
  - Human approval doesn't require a manual loop. You gate inside `run()`, which is how Himawari's write tools return "pending review" proposals.
- **MCP:** Anthropic's server-side **MCP connector only connects to remote URL servers**, and only Python has MCP→tool conversion helpers. So the panel can't reuse himawari-mcp directly.
  - → Decision: one shared Zod tool registry (`packages/tools`) exported both as MCP tools and as SDK tools.
- **Prompt caching** is a prefix match in the order `tools` → `system` → `messages`. Any byte change invalidates everything after it, so tool order and system prompt must be stable and volatile context goes last. Verify with `usage.cache_read_input_tokens`.
- **Current models** (pricing per million tokens, input/output):

  | Model | ID | Price |
  |---|---|---|
  | Claude Opus 5.5 (default) | `claude-opus-5-5` | $4 / $20 |
  | Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 |
  | Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 / $0.50 for prompts up to 100K tokens |

  Thinking is adaptive, and depth is controlled with `output_config.effort`. Responses can stop with `stop_reason: "refusal"`, which must be handled.
- **Billing:** API keys are billed per token through the developer platform and are separate from consumer chat subscriptions. 💭 That's why plan §10.7 keeps Mode A (external Claude app via MCP) for subscription users.
- ⚠️ The tool runner is beta, so re-verify the API surface when Phase 4 starts.

---

## Sources

**Engines and authoring tools**
- Ren'Py: [Layered Images](https://www.renpy.org/doc/html/layeredimage.html) · [Developer tools (source)](https://github.com/renpy/renpy/blob/master/sphinx/source/developer_tools.rst) · [Rollback discussion](https://lemmasoft.renai.us/forums/viewtopic.php?p=11065) · [Translation docs (fragments)](https://translations.launchpad.net/renpy-doc/trunk/+pots/translation/ja/+translate?start=18) · [Extract Dialogue tooling](https://blog.argentgames.co/post/2019-02-11-renpy-translation-files-extraction-tool/) · [CDS docs (fragments)](https://translations.launchpad.net/renpy-doc/trunk/+pots/cds/ko/+translate) · [Self-voicing / accessibility devlog](https://quandtuniverse.itch.io/beaconing/devlog/1028254/accessible-design-in-visual-novels-renpy-and-beyond) · [Screen-reader guide](https://metaphorsandmoonlight.com/how-to-make-visual-novels-accessible-for-screen-readers/)
- Naninovel: [Story Editor](https://naninovel.com/guide/editor) · [Getting started](https://naninovel.com/guide/getting-started) · [Utage vs Naninovel review](https://hazedenki.net/post/from-zero-to-game-dev-part-2-choosing-a-visual-novel-engine-utage-vs-naninovel?lang=en)
- Yarn Spinner: [Localisation and Assets](https://docs.yarnspinner.dev/yarn-spinner-for-unity/assets-and-localization) · [v1 localisation](https://v1.yarnspinner.dev/docs/unity/localisation/)
- Ink / Inky: [Inky README mirror](https://gitee.com/hygx/inky) · [inkling crate](https://docs.rs/crate/inkling/0.9.3) · [Learning Ink series](https://videlais.com/2018/08/10/learning-ink-part-8-knot-parameters-and-functions/)
- Dialogic: [DeepWiki overview](https://deepwiki.com/dialogic-godot/documentation)
- Narrative tools: [Arcweave top-10 tools](https://blog.arcweave.com/top-10-tools-for-narrative-design) · [articy vs Twine](https://pulsegeek.com/articles/articydraft-vs-twine-for-production-pipelines) · [ChatMapper alternatives](https://www.chatmapper.com/?p=1375)
- Sprites: [Lip flaps and blinks](https://nothack-europa.itch.io/lip-flaps-and-blinks) · [Blinking side LayeredImage](https://karita0101.itch.io/depthofsky/devlog/837963/how-to-make-a-blinking-side-layeredimage-mc-corner-sprite-in-renpy) · [Layered mouth thread](https://lemmasoft.renai.us/forums/viewtopic.php?p=570291) · [Krita Batch Exporter](https://www.gdquest.com/library/plugin_krita_batch_exporter) · [Spine PSD import](https://ko.esotericsoftware.com/forum/d/25617-spine-42-imports-psds-directly-no-photoshop-scripts-needed/26) · [Krita PSD vector flattening](https://forum.kde.org/viewtopic.php%3Ff=156&t=128446.html)

**Runtime libraries**
- SDL: [SDL 3.4.6 WhatsNew](https://skia.googlesource.com/external/github.com/libsdl-org/SDL/+/refs/tags/release-3.4.6/WhatsNew.txt) · [SDL_SetGPURenderState](https://wiki.libsdl.org/SDL3/SDL_SetGPURenderState) · [SDL_CreateGPURenderState man page](https://www.mankier.com/3/SDL_CreateGPURenderState) · [INTRO-mingw](https://wiki.libsdl.org/SDL3/INTRO-mingw) · [Build SDL3 from Linux thread](https://discourse.libsdl.org/t/build-sdl3-dll-from-linux/49987) · [Fedora mingw64-SDL3-static](https://packages.fedoraproject.org/pkgs/mingw-SDL3/mingw64-SDL3-static)
- SDL_mixer: [Releases](https://github.com/libsdl-org/SDL_mixer/releases) · [Migration guide](https://wiki.libsdl.org/SDL3_mixer/README-migration) · [3.0 announcement](https://discourse.libsdl.org/t/announcing-the-sdl-mixer-3-official-release/66567)
- SDL_ttf: [Repository](https://github.com/libsdl-org/SDL_ttf) · [TTF_SetTextScript](https://www.mankier.com/3/TTF_SetTextScript) · [openSUSE package changelog](https://packagehub.suse.com/packages/SDL3_ttf/3_2_2-bp160_1_3)
- Text: [libunibreak](https://github.com/GerHobbelt/libunibreak) · [W3C Simple Ruby](https://www.w3.org/TR/simple-ruby/) · [CSS line-break vs JLREQ](https://lists.w3.org/Archives/Public/public-css-archive/2019Nov/0105.html)
- Lua: [LWN on Lua 5.4](https://lwn.net/Articles/826134/) · [lua-l size thread](https://lua-users.org/lists/lua-l/2018-01/msg00053.html)

**AI / MCP**
- MCP: [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) · [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog) · [TS SDK v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/) · [MCP Apps overview](https://rits.shanghai.nyu.edu/ai/mcp-apps-interactive-uis-become-an-official-part-of-mcp) · [MCP Apps reference](https://nanohub-mcp.readthedocs.io/en/latest/skill/references/mcp-apps.html) · [Thoughtworks Radar: MCP Apps](https://www.thoughtworks.com/en-au/radar/platforms/mcp-apps)
- Edit formats: [Aider edit formats](https://aider.chat/docs/more/edit-formats.html) · [Edit format selection](https://agentpatterns.ai/tool-engineering/llm-edit-format-selection/) · [Aider long-line issue](https://github.com/aider-ai/aider/issues/4716)

**Studio**
- [Sourcegraph: Monaco → CodeMirror](https://sourcegraph.com/blog/migrating-monaco-codemirror) · [Replit on CodeMirror](https://blog.repl.it/codemirror) · [Editor tradeoffs](https://www.techinterview.org/post/3233475355/build-code-editor-codemirror-monaco-tradeoffs/) · [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)

**Policy, accessibility, licensing, docs**
- [Game Accessibility Guidelines (basic)](https://gameaccessibilityguidelines.com/basic/) · [IGDA Top Ten](https://igda-gasig.org/how/game-accessibility-top-ten-se/) · [Games for Change tips (PDF)](https://gamesforchange.org/studentchallenge/wp-content/uploads/2022/01/Tips_Resources_for-Considering-the-Needs-of-Disabled-Gamers-in-Design.pdf)
- [Steam AI disclosure update (Gigazine)](https://gigazine.net/gsc_news/en/20260120-steam-updates-ai-disclosure-guidelines) · [Steam AI policy guide](https://legalmoveslawfirm.com/steam-ai-policy/) · [AI assets & Steam 2026](https://blog.promise.legal/ai-game-assets-copyright-steam-disclosure-2026/)
- [Tilengine license discussion](https://www.tilengine.org/forum/showthread.php?tid=244) · [GameDev.net engine license thread](https://comic.gamedev.net/forums/topic/700181-license-for-a-game-engine)
- [Diátaxis at Canonical](https://ubuntu.com/blog/diataxis-a-new-foundation-for-canonical-documentation)
- Localization formats: [ICU MessageFormat guide](https://simplelocalize.io/blog/posts/what-is-icu/) · [fluent-rs](https://docs.rs/crate/fluent/0.3.0)
