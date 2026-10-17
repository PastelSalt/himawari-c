# Himawari — Detailed Project Plan

> **Status:** Draft **v0.5** · 2026-10-17 · Nothing here is final. **Phase 0 in progress** (spikes answered, RFCs 0001–0003 accepted).
> **Companion files:** [RESEARCH.md](RESEARCH.md) (evidence) · [LOG.md](LOG.md) (decision history and next steps) · [CLAUDE.md](CLAUDE.md) (context for AI coding sessions)
> Decisions marked 🔬 cite RESEARCH.md by section number (e.g. 🔬§3 = RESEARCH.md §3).

---

## 0. TL;DR

Himawari is an **open-source visual novel (VN) engine that works with AI from the start**. Other developers use it to make their own games. It has four parts that agree on one versioned **Script Data Contract**:

| Component | Tech | License | Role |
|---|---|---|---|
| **Himawari Core** (`@himawari/core`) | TypeScript | MIT | Parser, validator, analyzer, compiler, formatter, editor services. The one authority on story semantics. |
| **Himawari Studio** | Electron + React + CodeMirror 6 | MIT | Authoring app for **Windows**, with a UI in **English (default) and Japanese**. Script and Screenplay views, story graph, sprite composer, live preview, AI review, and a **built-in AI assistant (bring your own key)**. |
| **himawari-mcp** | TypeScript, MCP spec 2026-07-28 | MIT | Lets any MCP client (for example the Claude desktop app or Claude Code) query, write, validate, and playtest stories, with changes appearing live in Studio. |
| **Himawari-C** | C11, SDL 3.4, SDL3_mixer, FreeType, libunibreak | **zlib** | Small native runtime that plays compiled games. **Games ship for Windows only.** Developed natively on Windows (MSYS2 UCRT64 / MinGW-w64). |

**Platform scope (v0.5): Windows only, for everything.** Games, Studio, the CLI, the MCP server, development, and CI all target Windows x64. Linux support (Studio on Linux, a Linux runtime build, Linux CI) is a **future improvement** (§18.9), not part of v1. The C core stays portable, so adding Linux later remains a small change.

The design rules, unchanged from v0.1:
1. **The runtime never parses source text.** `.hws` source compiles to validated `.hwb` bytecode plus a `.hwp` asset pack.
2. **Build headless first:** Contract → Compiler → Runtime → MCP → Studio. An AI-to-`.exe` vertical slice works by about week 14.
3. **Ease of use is a top-level requirement** (§2). Writing and playing happen in the same window, every error comes with a suggested fix, missing art never blocks writing, and nothing advanced shows up until you need it.
4. **AI is a development assistant only** (§1.5). It reads, writes, validates, refactors, playtests, and translates *project text and scripts*. Himawari has **no image, audio, voice, video, or other media generation** of any kind.
5. **Two ways to work with AI, both first-class** (§10.7): chat in your own Claude app (via MCP) and watch Studio update live, or use Studio's **built-in assistant panel** with your own API key. Both use the same tools and the same Himawari agent instructions.

---

## 0.1 What Changed

### v0.4 → v0.5 (Phase 0 on Windows, your decisions)

| Area | v0.4 | v0.5 | Why |
|---|---|---|---|
| Platform scope | Games Windows-only; Studio Windows + Linux; internal Linux runtime; WSL2 for Linux-side work | **Windows only for everything.** No Studio-on-Linux, no Linux runtime build, no WSL2, no Linux CI in v1. Linux is a future improvement (§18.9) | Your decision, to speed up development |
| Memory-safety tooling | Linux ASan/UBSan + libFuzzer in WSL2/CI | **Windows:** `win64-asan` (MSYS2 CLANG64) and fuzz targets on Windows, both to be verified at Phase 1 start; fallbacks in §14.3 | Follows from Windows-only |
| CI | ubuntu + windows jobs, cross-build, Proton smoke | **All jobs on `windows-latest`** | Follows from Windows-only |
| Hosting | `github.com/PastelSalt/himawari` (planned) | **`github.com/PastelSalt/himawari-c`** (created, public). Spec on `https://pastelsalt.github.io/himawari-c/` | You created the repo |
| Runtime build recipe | Spike A to verify | **RFC 0001 accepted:** pinned tarballs + SHA-256, fully static, native MSYS2 UCRT64 | Spike A results |
| Transitions | Spike B to verify | **RFC 0002 accepted:** SDL_GPURenderState on the explicitly requested GPU renderer, HLSL → DXIL + SPIR-V via DXC (committed headers), crossfade fallback | Spike B results |
| Text stack | Spike C to verify | **RFC 0003 accepted:** FreeType directly + libunibreak + our layout (`src/text/hw_layout.c`); no SDL3_ttf | Spike C results |

### v0.3 → v0.4 (final planning session)

| Area | v0.3 | v0.4 | Why |
|---|---|---|---|
| AI scope | Implicit | **Development assistant only. No media generation** (images, audio, voice, video, other creative media). Placeholders are procedural | Your clarification (§1.5) |
| Dev environment | Linux primary + Windows test PC | **Windows 11 primary** (native MSYS2 UCRT64 toolchain), with **WSL2 Ubuntu** for the Linux preview runtime, sanitizers, fuzzing, and Linux Studio testing | Your decision (§14.2, §14.7) |
| CI release build | Cross-compiled on Ubuntu | **Native build on the Windows runner** (MSYS2 UCRT64), the same toolchain as your PC. The Ubuntu cross-build stays as a secondary check | Dev machine matches the release build |
| C runtime library | Unspecified | **UCRT** everywhere | Built into Windows 10+. MSYS2's recommended environment |
| Hosting | `<your-username>` | **`github.com/PastelSalt/himawari`** (name checked and free). Spec on `https://pastelsalt.github.io/himawari/` | Checked with `gh` (§17) |
| Remote-run dev agent | Planned | **Removed.** No longer needed, since you develop on Windows | §14.7 |
| History | — | **LOG.md** (decision log), **CLAUDE.md** (AI session context) | Handover to the Windows PC |

### v0.2 → v0.3 (your answers, round 2)

| Area | v0.2 | v0.3 | Why |
|---|---|---|---|
| Game output | Windows + Linux | **Windows x64 only** | Your decision. Steam Deck still runs it through Proton |
| Linux runtime | Tier 1 export target | **Internal "preview runtime"** for Studio-on-Linux, MCP playtests, and CI sanitizers. Not exportable | Studio on Linux still needs a native preview (§14.1) |
| Studio platforms | Windows + Linux | Windows + Linux (unchanged). Linux users still export Windows games, with no Wine needed | §14.4 |
| Studio UI language | English only | **Localized UI, English default, Japanese at launch** | Your requirement (§11.5) |
| AI integration | MCP first, panel in Phase 6 | **Two first-class modes**: external Claude app via MCP, and a **built-in BYOK assistant panel** in Phase 4 | Your answer #4 (§10.7–10.9) |
| Agent instructions | `llm-reference` resource | **Three-layer instructions**: engine guide + project `AGENTS.md` + user preferences, shared by both modes | §10.8 |
| Hosting | `himawari.dev` (assumed) | **Personal GitHub account**. Schemas hosted on GitHub Pages | Your answer #5 |
| Dev environment | Linux | **Linux primary plus a real Windows test machine from week 1** | Output is Windows-only (§14.7) |
| Templates / tutorial | — | 16:9 only. Plain tutorial project, no mascot | Your answers #1 and #2 |

### v0.1 → v0.2

| Area | v0.1 | v0.2 | Why |
|---|---|---|---|
| Audience | Generic | **Engine for other developers**, open source | Your answers #3 and #4 |
| Ease of use | Implicit | **§2 UX principles plus a first-run flow** | Your new requirement. Patterns proven in Inky, Naninovel, Ren'Py 🔬§9 |
| Sprites | One PNG per expression | **Layered sprites** (groups, attributes, expression presets, auto-blink, lip-flap, PSD/ORA import) | Your answer #2. Ren'Py `layeredimage` model 🔬§3 |
| Languages | Localization tables | **Multi-language from day one**: font fallback chains, per-language voice/assets, CSV + XLIFF export, interpolation and `select` variants | Your answer #1. Yarn Spinner model 🔬§2 |
| Audio | Custom mixer on SDL_AudioStream | **SDL3_mixer 3.2.x** | Official rewrite now exists 🔬§4.2 |
| Shader transitions | Undecided | **SDL 3.4 GPU render state** inside SDL_Renderer | New 3.4 API 🔬§4.1 |
| Line breaking | Hand-rolled | **libunibreak** (UAX #14) plus JLREQ overrides and W3C Simple Ruby | 🔬§4.4 |
| Code editor | Monaco | **CodeMirror 6** | Smaller and fully customizable. Decorations can hide line IDs and draw portrait chips 🔬§8 |
| Editing model | Text editor only | **Two views (Script ↔ Screenplay) over one lossless syntax tree** | Naninovel and Dialogic block editors 🔬§1 |
| Menus | Must `jump` | **Weave-style fall-through plus `once` options** | Ink 🔬§1.3 |
| MCP | Generic | **Spec 2026-07-28**: stateless, `server/discover`, MRTR confirmations, tasks extension, optional **MCP Apps** UI | 🔬§6 |
| AI edits | Structured ops | **ID-anchored edits only, never line numbers or diffs** | Edit-format evidence 🔬§7 |
| Extensibility | None | **Tiered: macros → C extension statements → optional sandboxed Lua** | Ren'Py creator-defined statements 🔬§10 |
| Accessibility | — | **v1 baseline plus first-launch prompt; self-voicing in v1.x** | 🔬§11 |
| Platforms | Windows only (Linux for dev) | Windows x64 and Linux x64 both Tier 1 (*revised in v0.3: games ship for Windows only*) | Answer #5 (see §14.1) |
| Compliance | — | **AI provenance tracking plus an "AI content report" export** (text only since v0.4) | Steam 2026 disclosure rules 🔬§13 |
| Docs | — | **Diátaxis** structure | 🔬§14 |

## 0.2 Decisions From Your Answers

| # | Question | Your answer | What it means in the plan |
|---|---|---|---|
| 1 | Languages | Multi-language | Full i18n pipeline from Phase 1 (§7). CJK, Latin, and Cyrillic are Tier 1. RTL and complex scripts are Tier 2. |
| 2 | Art pipeline | Layered sprites | First-class layered sprite system (§6) with a visual composer in Studio. |
| 3 | Licensing | Open source | zlib runtime, MIT tooling, CC-BY specs. Public governance and RFC process (§17). |
| 4 | Distribution | An engine other devs use | Stable public spec, templates, themes, extension API, docs site, semantic versioning, project migrations. |
| 5 | Linux runtime | Your call → then: *"output is Windows only"* | **Games export for Windows x64 only.** (v0.3 kept an internal Linux runtime build; v0.5 drops it, see #14.) |
| 6 | Built-in AI panel | *Both: chat in Claude via MCP, and a built-in BYOK panel with Himawari's own instructions* | **Both are first-class.** External MCP from Phase 3; built-in panel in Phase 4 (§10.7). |
| 7 | C standard | (not answered) | C11, kept. Easy to revisit. |
| 8 | 4:3 / vertical templates | No, 16:9 is the standard | Templates are 16:9 (default 1920×1080). Resolution is still configurable in the manifest. |
| 9 | Tutorial mascot | No, a simple tutorial | A plain, friendly tutorial project with no mascot. |
| 10 | Studio UI localization | **Yes, non-negotiable. English default** | Externalized UI strings from the first commit. EN + JA at v1.0. Community languages later (§11.5). |
| 11 | Hosting | Personal GitHub account (**PastelSalt**) | Repo **`github.com/PastelSalt/himawari-c`** (public, created 2026-10-17). Spec and schemas on GitHub Pages: `https://pastelsalt.github.io/himawari-c/spec/…` |
| 12 | AI and media | **Development only. No AI images, assets, or other creative media** | §1.5. No media-generation features anywhere. AI works on scripts and text only |
| 13 | Dev OS | **Windows** | Windows 11 + MSYS2 UCRT64 natively (§14.7). No WSL2 (v0.5) |
| 14 | Platform scope | **"Solely Windows only. Linux is for future improvement"** (v0.5) | Games, Studio, CLI, MCP, development, and CI are all Windows x64. Linux moves to §18.9 |
| 15 | Spike recommendations | **Accepted** (v0.5) | RFCs 0001 (static build), 0002 (GPU render-state transitions), 0003 (FreeType direct text stack) |

---

## 1. Vision, Users, Non-Goals

### 1.1 Vision
A VN engine (Windows games, authored on Windows) where **a first-time writer can play their first scene within 5 minutes**, a professional team can ship a multi-language commercial title, and an AI collaborator can contribute through a precise, validated API. All of them work on the same plain-text, git-friendly project. The shipped game is a single small native executable plus a data pack.

### 1.2 Who it's for

| Persona | Needs | Main surface |
|---|---|---|
| **Writer** (non-programmer) | Write dialogue and choices, see them play immediately, never fight syntax | Studio: Screenplay view + live preview |
| **Artist** | Drop in layered sprites and backgrounds, see them on screen, preview expressions | Studio: Sprite composer + asset browser |
| **Developer / integrator** | Custom UI themes, extension statements, CI builds, version control | Script view, `hwc` CLI, extension API |
| **Translator** | Spreadsheet or CAT-tool workflow, context for each line | CSV/XLIFF export, Studio localization table |
| **AI agent** | Typed tools, validation feedback, playtests, character context | himawari-mcp |

### 1.3 Positioning 🔬§1

| Tool | Strength | Gap Himawari fills |
|---|---|---|
| Ren'Py | Mature, huge community | Embedded Python blocks static analysis and safe AI edits. No visual editor. |
| Naninovel | Great editor UX | Requires Unity, paid. |
| Dialogic 2 | Godot integration | Requires Godot. A dialogue plugin, not a standalone VN product. |
| Ink / Yarn | Excellent narrative languages | Middleware only, no VN runtime. |
| Twine / Arcweave / articy | Flowcharts, collaboration | No native VN runtime. Arcweave is cloud-only; articy is paid per seat. |
| **Himawari** | Free, open source, standalone, offline-first, AI-native, tiny native runtime, writer-friendly editor | — |

### 1.4 Non-goals (v1)
- General game-engine features (physics, 3D, tilemaps).
- Live LLM calls inside shipped games. Generation happens at authoring time only, which keeps the Steam disclosure "pre-generated" 🔬§13.
- Live2D or skeletal animation.
- Real-time multi-user editing (git is the collaboration layer).
- Non-Windows game exports: Linux, macOS, mobile, web. Games ship as Windows x64 only. (Linux and Steam Deck players may be able to use Proton, but that is untested in v1.)
- Non-Windows tooling: Studio, `hwc`, and `himawari-mcp` on Linux or macOS. Linux support is a future improvement (§18.9).
- **Any AI media generation:** images, sprites, backgrounds, music, sound effects, voice/TTS acting, video. Permanently out of scope (§1.5).

### 1.5 AI scope (your clarification)

Himawari's AI features are **software-development assistance**, in the same category as a coding assistant.

| AI **does** (on project text and scripts) | AI **never does** |
|---|---|
| Read, search, and explain scripts, characters, and the story graph | Generate images, sprites, backgrounds, CGs, or UI art |
| Write and edit `.hws` scripts and story nodes, always as reviewable proposals | Generate music, sound effects, or voice (no TTS voice acting) |
| Validate, fix diagnostics, refactor and rename safely | Generate video or animation |
| Run headless playtests and report dead ends and coverage | Call any image, audio, or video generation API |
| Translate text through string tables (marked `needs-review`) | Run inside shipped games (no live AI at runtime) |
| Explain errors, engine features, and best practices | |

- **All assets are supplied by the developer.** Placeholders shown for missing assets are **procedural** (labeled color cards and silhouettes drawn by the engine), never AI-generated.
- The MCP server and built-in assistant expose **no media tools**. `render_line` only screenshots existing assets for layout checks.
- The engine guide (§10.8) states this scope explicitly, so agents decline media-generation requests and suggest placeholders instead.
- Text provenance tracking (§16.4) remains, because AI-written **dialogue text** that ships may still need store disclosure 🔬§13.

---

## 2. Ease-of-Use Principles (the UX north star)

These are **acceptance criteria**, not aspirations. Every feature is reviewed against them. 🔬§9

| # | Principle | Concrete rule | Proven in |
|---|---|---|---|
| P1 | **Five minutes to first scene** | New Project → template → the game is *already playable* with placeholder art. The first edit shows up in the running game in under 1 second. | Ren'Py launcher, Naninovel sandbox |
| P2 | **Write and play in one place** | The preview pane is always available. **Play-as-you-write:** after each edit, the preview re-runs to the same spot, replaying the choices you made. | Inky |
| P3 | **Always know where you are** | The current line is highlighted in the editor (green = playing, yellow = waiting for click). Clicking in the game jumps to its line, and the reverse. | Naninovel, Ren'Py Shift+E |
| P4 | **Test any moment instantly** | "▶ Play from here" on any line (state is reconstructed). Fast-skip to the next choice. Reload in place. | Ren'Py `--warp`, `>`, Shift+R |
| P5 | **Never blocked on assets** | Missing backgrounds and sprites render as **labeled procedural placeholders** (color cards, silhouettes, never AI) in dev mode instead of erroring. Studio can create placeholder characters from a name and color. | Naninovel placeholders |
| P6 | **Errors teach** | Every diagnostic gives a plain-language message, the source snippet, a "did you mean…?" suggestion, and a **one-click quick fix**. No stack traces for content errors. | Elm/Rust compilers |
| P7 | **Progressive disclosure** | Writers see dialogue, characters, and choices. Variables, conditions, macros, and the bytecode inspector appear only when used or enabled. Line IDs are always hidden. | General UX practice |
| P8 | **Two views, one truth** | **Screenplay view** (rows with dropdowns, expression thumbnails, drag-to-reorder) and **Script view** (text). Switch freely, with no conversion or loss. | Naninovel editor, Dialogic |
| P9 | **Fearless editing** | Unified undo with a **selective history list**. Rename and move refactors update every reference. AI changes are reviewed before they apply. | Naninovel |
| P10 | **Defaults that ship** | The default UI theme is accessible, polished, and localized. A new project can be exported as a real game without touching settings. | — |
| P11 | **Find anything** | Double-Shift fuzzy search across scenes, lines, characters, assets, and commands. | Naninovel, JetBrains |
| P12 | **The AI explains itself** | Every AI proposal carries a one-line rationale, a diff, and validation results. Accept or reject per change. | — |

### 2.1 First-run flow (Studio)
```
Launch Studio
 └─ Welcome: [New Project] [Open] [Open Tutorial Project] [Samples]
     └─ New Project wizard (3 steps max)
         1. Name + folder
         2. Template: Classic ADV (textbox) · NVL (full-screen text) · Kinetic (no choices) · Blank
         3. Languages: source language + targets (changeable later) · resolution (default 1920×1080)
     └─ Opens with: Screenplay view (left) · Live preview playing scene 1 (right)
         · A one-time coach mark: "Type a line. Watch it appear. →"
         · An accessibility and theme prompt in the preview's first launch, as players will see it
```

### 2.2 Diagnostic style (example)
```
error[HW0204]: Hana has no expression called "smil"
  ┌─ script/ch1.hws:7:10
  │
7 │     show hana smil at left
  │               ^^^^ not defined in characters/hana.md
  │
  = help: did you mean "smile"?              [Apply fix]
  = note: Hana's expressions: neutral, smile, surprised, angry
```

---

## 3. Changes to the Original Concept (cumulative)

| # | Original | Recommended | Why |
|---|---|---|---|
| 1 | "Himawari-C" names everything | **Himawari** = ecosystem, **Himawari-C** = runtime, **Himawari Studio**, **himawari-mcp** | Clarity |
| 2 | Contract unspecified | **`.hws` → lossless syntax tree / AST JSON → `.hwb`**, each with a versioned spec | Readable text, tooling-friendly JSON, fast C loading |
| 3 | "AI writes story nodes" | Ren'Py-like **closed** language with **stable line IDs** | LLM familiarity plus static analysis 🔬§1–2 |
| 4 | SDL2 | **SDL 3.4** + SDL3_mixer 3.2 | SDL2 is in maintenance. 3.4 adds GPU render state 🔬§4 |
| 5 | C99 | **C11** | `_Static_assert` for binary layouts, at no cost |
| 6 | MCP layer | Standalone **and** embedded in Studio, with a proposal review flow | Human in the loop |
| 7 | — | Shared `@himawari/core` | One parser, so the editor and the AI never disagree |
| 8 | Windows only | **Windows only, for everything (kept, v0.5).** Games, Studio, tooling, dev, and CI | Matches your target; Linux is a future improvement |
| 9 | — | Headless runtime for AI playtests | Same semantics as the real game |
| 10 | — | Real Windows CI runner | Wine ≠ Windows |
| 11 | — | Deterministic integer logic plus seeded RNG | Reproducible playtests and rollback |
| 12 | — | Markdown character bibles | AI context for in-character writing |
| 13 | — | **Ease-of-use principles P1–P12** | Your requirement 🔬§9 |
| 14 | — | **Layered sprites with presets, blink, and lip-flap** | Your answer 🔬§3 |
| 15 | — | **Tiered extensibility** | Engine for other devs 🔬§10 |

---

## 4. System Architecture

```mermaid
flowchart LR
    subgraph Authors
        W[Writer / Artist / Dev]
        A[AI agent<br/>Claude Code / Desktop / any MCP client]
    end

    subgraph Tooling["Tooling (TypeScript, Node)"]
        S[Himawari Studio<br/>Electron]
        M[himawari-mcp<br/>stdio / Streamable HTTP]
        CLI[hwc CLI]
        C[(@himawari/core<br/>lossless syntax tree · validator · analyzer<br/>compiler · formatter · services)]
    end

    subgraph Project["Project on disk (git)"]
        P[himawari.json · script/*.hws<br/>characters/*.md · assets/ · locales/<br/>extensions/*.schema.json]
    end

    subgraph Runtime["Himawari-C (C11 + SDL 3.4)"]
        R[game.exe]
        HL[--headless / --debug-pipe]
    end

    W --> S
    A --> M
    S --- C
    M --- C
    CLI --- C
    C <--> P
    M -. proxies when Studio is running .-> S
    C -- compile --> B[game.hwb + data.hwp]
    B --> R
    S -- debug pipe: hot reload, play-from-line,<br/>active-line events --> R
    M -- playtest --> HL
```

### 4.1 Data flow
1. **Source of truth:** the project folder (plain text, git).
2. **Core** parses `.hws` into a **lossless concrete syntax tree** that keeps comments, whitespace, and line IDs. This is the "red-green tree" pattern used by Roslyn and rust-analyzer. A typed AST is derived from it. Losslessness is what lets the Screenplay view, formatter, and AI patches edit files **without destroying the author's comments or layout**.
3. **Validator + analyzer** produce diagnostics with quick fixes, the story graph, and stats.
4. **Compiler** emits `.hwb`. The **packer** emits `.hwp` (trimmed sprite layers, per-language tables).
5. **Studio ↔ runtime** use a JSON-lines debug pipe for hot reload, warp, active-line events, and state inspection.
6. **MCP:** reads go through Core. Writes go through Studio proposals when Studio is running, or straight to disk with a journal when headless. Playtests use headless runtime runs.

### 4.2 Single-writer rule
- When Studio is running, it owns writes. It exposes an MCP endpoint on `127.0.0.1:<random>` and writes the token to `.himawari/session.json` (user-only permissions). The standalone `himawari-mcp` detects it and proxies.
- When Studio is closed, `himawari-mcp` writes directly, with `.himawari/lock` and an undo journal.
- Every write carries `base_revision` (a content hash). If it's stale, the write is rejected with a conflict and nothing is overwritten. This "explicit handle in tool arguments" is the pattern MCP 2026-07-28 recommends now that protocol sessions are gone 🔬§6.

---

## 5. The Script Data Contract

| Layer | File | Consumer | Spec |
|---|---|---|---|
| Source | `.hws` (UTF-8) | Humans, LLMs, git | `spec/language.md`, `grammar.ebnf` |
| Syntax tree / AST | JSON | Studio, MCP, external tools | `spec/ast.schema.json` (JSON Schema 2020-12) |
| Bytecode | `.hwb` | Himawari-C | `spec/bytecode.md` |
| Pack | `.hwp` | Himawari-C | `spec/pack.md` |
| Manifest | `himawari.json` | Tooling | `spec/manifest.schema.json` |
| Character | `characters/*.md` (YAML frontmatter) | Tooling, AI | `spec/character.schema.json` |
| Extension signature | `extensions/*.schema.json` | Tooling | `spec/extension.schema.json` |
| Save | `.hwsav` | Himawari-C | `spec/save.md` |
| Debug protocol | JSON-lines | Studio ↔ runtime | `spec/debug-protocol.md` |
| Locale exchange | CSV / XLIFF 2 | Translators | `spec/localization.md` |

### 5.1 Language: Himawari Script (`.hws`), draft v0.2

The language is closed and declarative, and looks like Ren'Py. **Every statement is one line** (Naninovel's rule 🔬§1.2), which makes rows in the Screenplay view and line-ID anchoring straightforward.

```hws
# script/ch1.hws
scene ch1_intro:
    bg classroom_day with dissolve(800)
    music morning_theme fade(1000)
    show hana smile uniform at left with fade(300)

    hana "Good morning, [player_name]! You're late {b}again{/b}."
    me "Sorry, sorry..."
    "The bell rang before I could finish."
    $ hana_affection += 1

    menu "What do you say?":
        "I overslept.":
            hana annoyed "Classic."
        "I was helping someone." if courage >= 2:
            $ hana_affection += 2
            hana surprised -glasses "Really? That's... actually kind of sweet."
            jump ch1_helped
    # options without a jump fall through to here (Ink-style gather)

    hana "Anyway, let's go."
    jump ch1_class

scene ch1_hub:
    menu "Ask Hana about...":
        once "The festival.":
            call talk_festival
            jump ch1_hub
        once "Her transfer rumor." if heard_rumor:
            call talk_rumor
            jump ch1_hub
        "Nothing, let's go.":
            jump ch1_class
```

What tooling writes to disk: line IDs are added automatically, and **Studio hides them**.
```hws
    hana "Good morning, [player_name]! You're late {b}again{/b}."   #line:k3f9a1
```

**v1 feature set**
- **Structure:** `scene`, `jump`, `call`/`return`, `if`/`elif`/`else`, `menu` with conditions, **fall-through gather**, **`once` options** (Ink's non-sticky choices), `end`.
- **Dialogue:**
  - `speaker "text"` and narration `"text"`.
  - **`speaker <attrs> "text"`** changes the sprite and speaks in one line (`hana happy "…"`, `hana -glasses "…"`).
  - **Interpolation** `[var]`.
  - **Variants** `{select gender_p: m="he" f="she" other="they"}`, an ICU-lite subset that is translator-safe 🔬§2.3.
- **Stage:**
  - `show <char> <attrs…> [-attr] [at pos] [with transition]` uses Ren'Py's attribute-merge model 🔬§3.1. Also `hide` and `move`.
  - `bg`, `cg` (unlocks the gallery automatically).
  - `music`, `sfx`, `ambient`, `voice`, `stop`.
  - `wait(ms)`, `shake`, `flash`.
  - Transitions: `fade`, `dissolve`, `slide_*`, `wipe`, `rule(mask, ms)`.
- **State:** `$ var = expr` and `+= -= *=`. Types: `int`, `bool`, `str`-enum. Variables are declared in the manifest as **save** or **global** scope.
- **Inline text tags:**
  - `{b}` `{i}` `{color=}` `{size=}`
  - `{w=ms}`, `{speed=}`, `{nw}`, `{shake}`
  - ruby: `{rb=かんじ}漢字{/rb}`
  - `{alt=…}` for self-voicing text
- **Macros:** `define` (Tier A extensibility, §12).
- **Line IDs:** `#line:xxxxxx`, a 6-char base32 ID. Tool-managed and never typed by hand 🔬§2.1.

**Excluded by design:** floats in logic, user-defined functions, embedded general-purpose code (except opt-in Lua in v1.x, §12), file and network access.

### 5.2 Stable IDs
Every dialogue line and menu option has a permanent ID. It anchors AI patches, save remapping, voice files, translations, read-tracking, and provenance.
- IDs are **persistent tags, not content hashes.** Hash-based IDs, as in Ren'Py's translation units, change when the text changes and orphan existing translations and voice files 🔬§2.2.
- Moving a line keeps its ID.
- Editing a line keeps the ID, but marks translations and voice as **"needs review"** when the change is large.
- Copy-pasted duplicates get new IDs.

### 5.3 AST (JSON), sketch
```jsonc
{
  "$schema": "https://pastelsalt.github.io/himawari-c/spec/ast/1.0.json",
  "version": "1.0", "file": "script/ch1.hws",
  "scenes": [{
    "kind": "Scene", "id": "ch1_intro", "span": [3,1,28,20],
    "body": [
      { "kind": "Show", "char": "hana", "add": ["smile","uniform"], "remove": [], "at": "left",
        "transition": { "type": "fade", "ms": 300 } },
      { "kind": "Say", "lineId": "k3f9a1", "speaker": "hana", "attrs": { "add": [], "remove": [] },
        "text": [ {"t":"Good morning, "}, {"var":"player_name"}, {"t":"! You're late "},
                  {"tag":"b","children":[{"t":"again"}]}, {"t":"."} ],
        "provenance": "human" },
      { "kind": "Menu", "prompt": "What do you say?", "options": [
        { "lineId": "q7c1d0", "once": false, "text": "I overslept.", "cond": null,
          "body": [ /* … */ ], "fallsThrough": true } ] }
    ]
  }]
}
```

### 5.4 Bytecode (`.hwb`), outline
- **Header:** `HWB\x01`, `u16 major/minor`, `u32 flags`, section table, CRC32.
- **Sections:**
  - `STRS` (string pool)
  - `LINE` (line table: id, speaker, text idx, placeholder schema)
  - `SCNE` (scenes + entry pc + **prefetch asset lists**)
  - `CODE`
  - `VARS`
  - `ASST`
  - `CHAR` (characters + compiled **layer tables**, §6)
  - `LOCx` (per language)
  - `XTNS` (extension statement table)
  - `DBUG` (pc ↔ file:line; stripped in release)
- **ISA:** a fixed-width stack VM. Story ops: `SAY`, `SHOW`, `HIDE`, `MOVE`, `BG`, `CG`, `MUSIC`, `SFX`, `VOICE`, `WAIT`, `MENU`, `JMP`, `JZ`, `CALL`, `RET`, `XCALL` (extension), `END`. Expression ops: `PUSH_I`, `LOAD`, `STORE`, arithmetic, comparisons, `NOT`, `RAND`.
- **Loader:** bounds-checks every offset, index, and jump target once at load. Fuzzed in CI.

### 5.5 Project layout
```
my-novel/
├── himawari.json               # manifest
├── script/*.hws
├── characters/hana.md          # frontmatter (layers, presets, colors) + prose bible
├── assets/
│   ├── bg/  cg/  music/  sfx/  ambient/  fonts/  ui/
│   ├── sprites/hana/<group>/<attribute>.png        # §6 folder convention
│   ├── voice/<lang>/<line_id>.ogg                  # auto-bound
│   └── l10n/<lang>/...                             # per-language asset overrides
├── locales/<lang>.json         # line_id → text (generated/managed)
├── extensions/*.schema.json    # optional extension statement signatures
├── theme/                      # UI theme (optional; default theme built in)
├── .himawari/                  # cache, journal, session, provenance index (gitignored)
└── build/
```

```jsonc
// himawari.json
{
  "$schema": "https://pastelsalt.github.io/himawari-c/spec/manifest/1.0.json",
  "name": "Sunflower Days", "id": "dev.moesoft.sunflowerdays", "version": "0.1.0",
  "engine": "^1.0.0",
  "resolution": [1920, 1080],
  "sourceLanguage": "en", "languages": ["en", "ja", "zh-Hans"],
  "entry": "ch1_intro",
  "positions": { "left": [0.25, 1.0], "center": [0.5, 1.0], "right": [0.75, 1.0] },
  "variables": {
    "player_name":     { "type": "str",  "default": "Aoi", "scope": "save" },
    "gender_p":        { "type": "str",  "enum": ["m","f","other"], "default": "other", "scope": "save" },
    "hana_affection":  { "type": "int",  "default": 0, "scope": "save" },
    "ending_true_seen":{ "type": "bool", "default": false, "scope": "global" }
  },
  "fonts": {
    "dialogue": { "default": ["NotoSans-Regular.otf", "NotoSansJP-Regular.otf"],
                  "ja": ["NotoSansJP-Regular.otf"], "zh-Hans": ["NotoSansSC-Regular.otf"] }
  }
}
```

### 5.6 Versioning
- Each spec uses SemVer independently. The runtime accepts the same bytecode major with an equal or lower minor.
- `hwc migrate` upgrades projects across language majors. `"engine": "^1.0.0"` in the manifest is checked by Studio and CLI.
- Saves store the bytecode hash and line-ID positions, so they remap across script edits (§8.9).
- **Spec changes go through a public RFC process** (§17), modeled on MCP's SEP workflow 🔬§6.

---

## 6. Characters and Layered Sprites (your answer #2) 🔬§3

### 6.1 Model
The semantics come from Ren'Py `layeredimage`, which is battle-tested. They are expressed as **data**, not code:
- **Groups** stack bottom → top. Each group holds **mutually exclusive attributes** (outfit: uniform | casual | pajamas). A group marked `multiple: true` allows several at once (accessories).
- **`always`** layers (body base). **`default`** attribute per group. **`when:`** conditions on other attributes (e.g., `glasses` hidden `when: surprised`).
- **Expressions are presets** over groups. Writers type `hana happy`, and the engine sets `{brows: up, eyes: smile, mouth: smile}`. Artists keep fine control, and writers keep simple words. This replaces Ren'Py's code-based `attribute_function` with a data-only mechanism.
- **Attribute merge:** `show hana casual` keeps the current expression and changes only the outfit. `-glasses` removes an attribute. Unknown words are compile errors with suggestions (P6).
- **Built-in life:**
  - **Auto-blink:** if the eyes group has `<x>_half` and `<x>_closed` frames, it blinks at a random 2–6 s interval.
  - **Lip-flap:** if the mouth group has `<x>_open`, the mouth flaps while that character's text is revealing or their voice is playing.
  - Both can be configured or disabled per character. No code needed.
- **Views** (Ren'Py's `LayeredImageProxy` idea): `side` (cropped portrait for the textbox), `tinted` (night/sepia), reusing the same layers and attributes.

### 6.2 Folder convention (auto-discovery)
```
assets/sprites/hana/
├── body/base.png                 # group with one attribute → treat as always
├── outfit/uniform.png  casual.png
├── brows/neutral.png  up.png  down.png
├── eyes/neutral.png  neutral_half.png  neutral_closed.png  smile.png ...
├── mouth/neutral.png  neutral_open.png  smile.png  smile_open.png ...
└── accessories/glasses.png  ribbon.png
```
Folders are used instead of Ren'Py's underscore filenames. This is more intuitive for artists and avoids the "spaces in filenames don't match" pitfall 🔬§3.1. All layers share one canvas size, as artists usually work. **The packer auto-trims** transparent borders and stores offsets, so this costs no memory.

### 6.3 Character file
```markdown
---
id: hana
name: { en: "Hana", ja: "花", zh-Hans: "花" }
color: "#f2a541"
voice: { blip: sfx/blip_high.ogg }          # optional text blip when unvoiced
sprite:
  root: sprites/hana
  anchor: [0.5, 1.0]
  scale: 1.0
  groups:                                   # bottom → top; omitted → folder order + defaults
    body:        { always: true }
    outfit:      { default: uniform }
    brows:       { default: neutral }
    eyes:        { default: neutral, blink: true }
    mouth:       { default: neutral, lipflap: true }
    accessories: { multiple: true, default: [glasses] }
  rules:
    - { hide: glasses, when: "surprised" }
  presets:
    neutral:   { brows: neutral, eyes: neutral, mouth: neutral }
    smile:     { brows: neutral, eyes: smile,   mouth: smile }
    surprised: { brows: up,      eyes: wide,    mouth: o }
    annoyed:   { brows: down,    eyes: half,    mouth: flat }
  views:
    side: { crop: [300, 80, 900, 700] }
---
## Personality
Cheerful class representative, secretly anxious about being relied on...
## Speech style
Short sentences, teasing, never swears. Calls the protagonist by surname until chapter 3.
## Must never
Reveal her transfer plans before ch4_rooftop.
```

### 6.4 Importers and the Studio sprite composer
- **Import PSD** (TS library `ag-psd`, to be verified 🔬§15) and **OpenRaster `.ora`** (Krita's native export: a zip of PNGs plus `stack.xml`).
  - Convention: top-level layer groups → sprite groups, layers → attributes. Markers `[always]`, `[default]`, `[multiple]` in names.
  - There's no industry standard for this, so the importer shows a **mapping preview** you can adjust before writing files 🔬§3.3.
- **Sprite composer panel:**
  - Toggle attributes and see the composite live.
  - Define presets by clicking.
  - Test blink and lip-flap.
  - A **"preset matrix"** thumbnail sheet for spotting misaligned layers.
  - Drag a preset into the Screenplay view to insert `show hana smile`.

### 6.5 Runtime rendering
- Characters are drawn as stacked layer quads every frame (typically 5–8 draws per character, which is trivial for SDL_Renderer batching).
- During transitions, the character is composited to a render target once, so fades apply to the whole character instead of each layer (avoiding see-through overlap artifacts).
- Layer tables are compiled into `CHAR`, so attribute resolution is integer-mask math with no strings at runtime.

---

## 7. Multi-Language Support (your answer #1) 🔬§2, §4.4

| Area | Design |
|---|---|
| **Source language** | One per project (`sourceLanguage`). Writers write naturally in it. |
| **Line identity** | Persistent `#line:` IDs shared by all languages, voice files, and saves (§5.2). |
| **String tables** | `locales/<lang>.json`: `{ line_id: { text, status: "ok" \| "needs-review" \| "missing", provenance } }`. Inline expressions and tags become **placeholders** (`{0}`, `<b>…</b>`) so translators can't break them. The validator checks that placeholder sets match. |
| **Exchange formats** | **CSV/TSV** (spreadsheet-friendly, with columns: id, speaker, context, source, translation, max length, notes) and **XLIFF 2** for CAT tools. Round-trip import with diff preview. |
| **Variants** | `{select var: …}` per line. Translators can add or remove cases for their language (e.g., a grammatical gender distinction English doesn't have). |
| **Names** | Character display names, UI strings, and menu prompts are all localizable. Character names come from frontmatter maps. |
| **Assets** | `assets/l10n/<lang>/…` overrides any asset path, e.g., a sign drawn in Japanese. Voice comes from `voice/<lang>/<line_id>.ogg`, falling back to the source-language voice or no voice (configurable). |
| **Fonts** | **Fallback chains per language**, so a dialogue font can cover Latin plus CJK. The validator **checks glyph coverage** of every string against the chain and reports missing glyphs before the player ever sees a tofu box (□). |
| **Layout** | **Tier 1** (v1): Latin, Cyrillic, Greek, Japanese, Chinese (Simplified and Traditional), Korean. This covers UAX #14 line breaking via libunibreak, **JLREQ kinsoku overrides**, ruby per **W3C Simple Ruby** (no overhang onto neighbors), and CJK punctuation compression (optional). **Tier 2** (v1.x, with HarfBuzz and bidi): Arabic, Hebrew, Thai, Devanagari. |
| **Runtime switching** | Change language in Config without restarting. The backlog re-renders in the new language. The first launch defaults to the OS locale when available. |
| **Studio** | Localization table: filter by status, side-by-side with the source, a **context preview** (rendered screenshot of the line in-game), and a length warning when text overflows the textbox at the current font size. |
| **AI translation** | MCP `translate_scene` prompt plus a `set_translation` tool, with a glossary (`locales/glossary.<lang>.json`), tag preservation, and character-bible voice notes. Entries are marked `provenance: ai` and land as `needs-review`. |

---

## 8. Himawari-C: The Runtime

### 8.1 Goals and budgets
| Metric | Target |
|---|---|
| Release `.exe` (static, stripped, HarfBuzz off) | ≤ 4 MB (Phase 0 spikes measured 5.1 MB; SDL alone is 4.1 MB, so SDL subsystem and FreeType module trimming are required, RFC 0001) |
| Cold start to first frame | ≤ 250 ms (SSD) |
| Frame time | 60 FPS vsync, ≤ 2 ms CPU typical |
| Memory, typical 1080p scene | ≤ 150 MB |
| Frame-loop allocations | Zero |
| `.hwb` load (1 MB) | ≤ 5 ms |
| External DLLs on Windows | None |

### 8.2 Dependencies (pinned by tag + SHA-256, built from source with CMake, linked statically; RFC 0001)
| Need | Library | License | Notes |
|---|---|---|---|
| Platform, renderer, input, threads, I/O | **SDL 3.4.x** (3.4.18) | zlib | GPU renderer + `SDL_GPURenderState` for shader effects (RFC 0002) 🔬§4.1 |
| Audio mixing, decoding, streaming | **SDL3_mixer 3.2.x** (3.2.4) | zlib | Replaces the v0.1 custom mixer. Honors loop metadata 🔬§4.2 |
| Glyphs | **FreeType** (2.14.3), used directly | FTL (credit required) | SDL3_ttf was evaluated and not adopted (RFC 0003) |
| Shaping (Tier 2 scripts) | HarfBuzz | MIT | Build option, later: `hb-ft` directly over our FreeType faces (RFC 0003) 🔬§4.3 |
| Line breaking | **libunibreak** (8.0, Unicode 17) | zlib | UAX #14 / #29, plus our JLREQ override table 🔬§4.4 |
| Shader compiler (dev only) | DXC | NCSA/MIT | HLSL → DXIL + SPIR-V offline; output committed as headers, so builds don't need it (RFC 0002) |
| Images | stb_image (PNG/JPG), libwebp | PD/MIT, BSD | WebP for sprites with alpha |
| Pack compression | LZ4 (zstd optional) | BSD | |
| Optional scripting (v1.x) | Lua 5.4 | MIT | Opt-in, sandboxed, §12 🔬§10 |
| Tests | utest.h / greatest | PD/ISC | |

### 8.3 Module layout
```
runtime/
├── src/
│   ├── core/        # NO SDL: vm, hwb_loader, expr, state, save, rollback, rng, arena, utf8, layers(resolve)
│   ├── platform/    # SDL3 window/input/paths/timing, OS locale, TTS (v1.x)
│   ├── render/      # scene graph, layered characters, transitions, GPU render-state effects
│   ├── text/        # FreeType atlas, libunibreak, JLREQ overrides, ruby, tags, reveal, glyph fallback
│   ├── audio/       # thin wrapper over SDL3_mixer: channels, crossfade, ducking, voice, lip-flap signal
│   ├── assets/      # .hwp reader, loose-file dev loader, async decode, LRU cache, placeholders
│   ├── ui/          # textbox, namebox, side portrait, menus, system screens, theme loader
│   ├── ext/         # extension-statement registry (Tier B), Lua bridge (Tier C, optional)
│   ├── debug/       # debug pipe, dev overlay, warp, reload-in-place
│   └── main.c
├── shaders/         # HLSL sources + generated/ DXIL and SPIR-V headers (committed)
├── spikes/  tests/  fuzz/  cmake/
```
**Rule:** `core/` has no SDL and no I/O. It's shared by the game, headless playtests, tests, fuzzers, and a future WASM build. `text/hw_layout.c` (line breaking, kinsoku, ruby) also has no SDL and no font library. Keeping these portable is also what keeps a future Linux port cheap (§18.9).

### 8.4 Execution model
- Fixed 60 Hz logic with interpolated render.
- The VM runs until a blocking op (`SAY`, `MENU`, `WAIT`, a transition) and emits **commands** to the presentation layer. It never renders directly, which is what makes headless mode trivial.
- `VmState = { pc, call stack, vars[], rng, display_state (bg, characters + attribute masks + positions, music) }`.

### 8.5 Rendering
- Virtual canvas from the manifest via `SDL_SetRenderLogicalPresentation(..., LETTERBOX)`.
- Layers: `bg` → characters → `cg` → textbox/UI → overlay.
- v1 transitions: fade, dissolve, slide, shake, flash, and **rule/mask** wipes using a fragment shader via **`SDL_GPURenderState`** (RFC 0002):
  - The runtime **requests the GPU renderer explicitly** (`SDL_CreateGPUDevice` + `SDL_CreateGPURenderer`); it is never the default. SDL picks D3D12 on Windows, Vulkan also works.
  - Shaders are HLSL, compiled offline by DXC to DXIL and SPIR-V and committed as headers. Pixel-shader inputs must be `TEXCOORD0`/`TEXCOORD1` to match SDL's vertex shaders.
  - A failed custom pipeline is silent outside debug mode, so the runtime **self-tests render states at startup** and falls back to the default renderer with crossfades if they don't draw.
- Prefetch: the compiler emits a per-scene asset list. Decode happens on a worker thread and upload on the main thread.

### 8.6 Text
UTF-8 everywhere. Stack decided in RFC 0003: **FreeType directly + libunibreak + our layout** (`src/text/hw_layout.c`).
- **Atlas:** FreeType renders into a dynamic multi-page glyph atlas with LRU eviction. CJK fonts are huge, so pages fill on demand (Spike C: ~2,900 outlined 48 px glyphs per 2048² page).
- **Line breaking:** libunibreak break opportunities, plus a **strict JLREQ kinsoku override table** (required: UAX #14 alone puts small kana at line starts), hanging punctuation for `、。，．`, and Latin word wrap.
- **Ruby:** placed per W3C Simple Ruby: unbreakable groups, the narrower side spread 1:2:1, no overhang. Ruby is half the base size in a reserved band above each line.
- **Effects and reveal:** per-glyph reveal timing, outline and shadow via the FreeType stroker.
- **Fallback:** a glyph-fallback chain per language.
- Atlases are rebuilt on DPI or scale change.

### 8.7 Audio (SDL3_mixer)
- **Channels:** music A/B (crossfade), ambient, SFX pool, voice.
- **Music:** loop points from file metadata.
- **Voice:** auto-bound by `line_id`. Music ducks under voice.
- **Lip-flap and settings:** the voice amplitude envelope drives lip-flap. Per-character voice volume.
- **Unvoiced text:** text blip sounds (optional).

### 8.8 Assets and packing
- **Dev mode:** loose files with hot reload. **Missing assets become labeled placeholders** (P5).
- **Release:** `.hwp` with a TOC (xxHash64 path → offset, size, codec). Entries are `store` or `lz4`. Supports patch-pack mounting with priority. Optional XOR obfuscation, documented as **not** DRM.

### 8.9 Saves, rollback, read tracking 🔬§5
- **Checkpoints and rollback:** a checkpoint at every `SAY`/`MENU`, as Ren'Py does. A rollback ring of 256+ steps uses under 1 MB thanks to the small closed state. Choosing differently after rewinding forks the timeline.
- **Save slots:** each has a thumbnail, scene name, last line, playtime, and date. Saves are written atomically with checksums, under `SDL_GetPrefPath`.
- **Save compatibility:** saves store line IDs and remap across script edits. If a line was deleted, the save falls back to the nearest previous checkpoint in the same scene, with a notice.
- **Global data:** global variables plus a read-line bitset (for "skip read text only") and gallery/music-room unlocks.

### 8.10 Built-in UI
- **Screens:**
  - Title, Save/Load, Config, Backlog (with voice replay)
  - CG Gallery, Music Room, Scene Replay (v1.x)
  - Quick Save/Load, Confirm
  - **Accessibility** (§13)
- **Themes:** `theme/theme.json` (nine-slice images, fonts, colors, positions, animations). The **default theme** ships polished, localized, and accessible (P10).
- **Modes:** ADV (textbox) and NVL (full screen) can be switched per scene.
- **Input:** keyboard, mouse, and gamepad, fully remappable.

### 8.11 Developer tools in the runtime 🔬§9 (Ren'Py parity)
| Tool | Key | Behavior |
|---|---|---|
| Dev overlay | F3 | Current scene, line, file:line, variables, FPS, memory, atlas pages |
| Reload in place | F5 | Recompile (via Studio or `hwc`), remap pc by line ID, keep state |
| Warp | `--warp file:line` / Studio ▶ | Reconstruct state along the most likely path, then start at that line |
| Fast-skip to next menu | `>` | Ren'Py-style |
| Open in Studio | F4 | Jump to the current line in Studio (or `$EDITOR file:line`) |
| Console (dev only) | `~` | Jump to scene, set variables, toggle attributes |
| Lint | `hwc check` | Same validator as Studio |

### 8.12 CLI modes
```bash
game                                        # play (finds data.hwp beside the binary)
game --project ./my-novel --dev             # loose files, placeholders, dev tools
game --debug-pipe                           # controlled by Studio (JSON-lines over stdio)
game --headless --playtest strategy=all_paths max_steps=50000 seed=1 --out report.json
```

### 8.13 Windows specifics
- `-mwindows` release subsystem.
- Manifest via `windres`: per-monitor-v2 DPI and the UTF-8 active code page.
- Static linking. Paths go through SDL (UTF-8 to wide), and **non-ASCII user folders are tested explicitly**.
- Crash handling: a minidump and a log in the pref path.

### 8.14 Robustness
- Content errors never `abort()`. Dev builds show an in-game error card with file:line and a "fix in Studio" button. Release builds show a friendly message.
- Compiled with `-Wall -Wextra -Werror -Wconversion -Wshadow -Wstrict-prototypes`. The `win64-asan` build (MSYS2 CLANG64) runs under ASan/UBSan once verified (§14.3).

---

## 9. `@himawari/core` and `hwc` CLI

### 9.1 Core modules
| Module | Purpose |
|---|---|
| `syntax` | Hand-written recursive-descent parser → **lossless CST** (keeps trivia). **Error-recovering**: one typo yields many useful diagnostics. Incremental per file. |
| `ast` | Typed view over the CST. JSON export per `ast.schema.json`. |
| `edit` | **Structured edits on the CST**: insert, replace, move, and set attribute, all keeping formatting and comments. Shared by the Screenplay view, quick fixes, refactors, and MCP `patch_scene`. |
| `ids` | Line-ID assign, de-dup, and change-magnitude detection → `needs-review`. |
| `project` | Manifest, characters (layer tables, presets), asset index, locales, extensions, file watching, revisions, provenance index. |
| `validator` | All diagnostics, with **codes, explanations, and quick fixes** (P6). Covers unknown speaker/attr/asset/scene/var, type errors, unreachable code, empty menus, placeholder mismatch, missing glyphs, text overflow, missing alt text (warning). |
| `analyzer` | Story graph, reachability, dead ends, variable read/write map, route lengths, per-character line counts, warp-path reconstruction. |
| `compiler` / `packer` | `.hwb` / `.hwp`, including layer tables and trimmed sprites. |
| `l10n` | String-table sync, CSV/XLIFF import and export, glossary. |
| `services` | Completion, hover (sprite thumbnails), go-to-definition, references, **rename refactors** (scenes, characters, attributes, variables, assets, including file moves), fuzzy search. Powers Studio and an **LSP server** (a VS Code extension at low cost). |

Performance targets: 100k lines parsed and validated in under 1 s; single-scene incremental update in under 50 ms.

### 9.2 `hwc` CLI
```bash
hwc init my-novel --template adv          # adv | nvl | kinetic | blank
hwc check                                 # validate + analyze (CI-friendly exit codes)
hwc fmt                                   # canonical format + line IDs
hwc build --release                       # → build/windows/<Game>/ (Windows x64)
hwc run [--warp script/ch1.hws:40]        # run the project in the Windows runtime (dev mode)
hwc playtest --strategy all_paths
hwc l10n export --lang ja --format xliff  # / import
hwc sprites import hana.psd               # PSD/ORA → folder convention + frontmatter
hwc graph --format mermaid
hwc report ai-content                     # provenance report for store disclosure
hwc migrate --to 2.0
```

---

## 10. himawari-mcp 🔬§6, §7

### 10.1 Protocol baseline (spec 2026-07-28)
- **Stateless.** Implements **`server/discover`**. Tools are listed in **deterministic order** (better client prompt caching).
- Transports: **stdio** (Claude Code, Claude Desktop, other local clients) and **Streamable HTTP** on localhost with a token (Studio-embedded).
- **No Roots, Sampling, or Logging** (all deprecated). The project path comes from args or config, and logs go to stderr.
- **MRTR `input_required`** for confirmations on wide-impact operations (renames across many files, deleting scenes).
- **Tasks extension** for long `playtest` and `build` calls, with a synchronous fallback.
- SDK: TypeScript **v2** (`@modelcontextprotocol/server`) if GA at Phase 3, otherwise v1.x behind an adapter.

### 10.2 Design principles
1. Reads come back as `.hws` text, which is token-efficient and familiar. Writes can be text **or ID-anchored structured edits**.
2. **Never line numbers or unified diffs.** Anchors are line IDs and scene IDs. This avoids the exact-text-match failures seen in diff-style AI edits 🔬§7.
3. Everything is validated before touching disk. `dry_run` on every write returns the diff and diagnostics.
4. Optimistic concurrency via `base_revision`.
5. Proposals by default when Studio is running.
6. Sandboxed: paths stay inside the project root, there's no shell, and playtest runs only the bundled runtime with fixed arguments.
7. Every AI write is stamped `provenance: ai` (§16.4).

### 10.3 Tools
| Tool | Kind | Notes |
|---|---|---|
| `project_info` | read | Manifest, languages, counts, spec versions |
| `list_scenes`, `read_scene` | read | `format: hws \| ast`. Returns `revision` |
| `search_dialogue` | read | Speaker, scene, and language filters |
| `get_story_graph` | read | json \| mermaid, with conditions |
| `list_characters`, `get_character` | read | Includes **bible prose, presets, available attributes** |
| `list_variables`, `list_assets` | read | Unused and missing flags |
| `validate`, `analyze` | read | Diagnostics with fix suggestions; reachability; stats |
| `create_scene`, `update_scene` | write | Whole-scene text |
| `patch_scene` | write | `insert_after(line_id, hws)`, `replace_text(line_id, text)`, `set_attrs(line_id, +/-)`, `delete(ids)`, `add_menu_option(menu_id, …)`, `move(ids, after_id)` |
| `upsert_character`, `set_preset` | write | Frontmatter and bible |
| `declare_variable` | write | |
| `rename` | write | Refactor-safe. MRTR confirm when it touches many files |
| `set_translation` | write | Lands as `needs-review` |
| `playtest` | exec | `choices[]` or `strategy`; seed; returns transcript, endings, coverage, errors. Long runs use the tasks extension |
| `render_line` | exec | Headless screenshot of a line (PNG) so the AI can *see* composition |
| `build` | exec | Gated by config |

All tools have annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) and output schemas.

### 10.4 Resources and prompts
- **Resources:** `himawari://project/manifest`, `…/scene/{id}`, `…/character/{id}`, `…/graph`, **`…/spec/llm-reference`** (compact language guide for models), **`…/agent-guide`** (the Himawari agent instructions, §10.8), **`…/project/agents-md`** (the project's `AGENTS.md`).
- **Prompts:** `write_scene`, `continuity_check`, `branch_planner`, `translate_scene`, `sprite_direction` (suggests expression changes for a scene given the presets).

### 10.5 Optional MCP Apps UI (`io.modelcontextprotocol/ui`) 🔬§6.3
- `ui://himawari/story-graph`: an interactive branch graph in the AI chat. Clicking a node asks the agent about it.
- `ui://himawari/scene-preview`: rendered dialogue screenshots with sprites, from `render_line`.
- Shown only when the client supports the extension. App-only tools are hidden from the model.

### 10.6 Example agent loop
`get_character(hana)` → `create_scene(dry_run)` → fix diagnostics → `create_scene` (proposal accepted in Studio) → `playtest(all_paths)` reports a dead end → `patch_scene` → `playtest` shows 100% of endings reachable → `render_line` to check sprite choices.

### 10.7 Two ways to work with AI (your answer #4)

Both modes are first-class. They share the **same tool registry, the same validation, the same proposal review, and the same agent instructions**, so the AI behaves the same whichever way you use it.

| | **Mode A: Chat in your Claude app** | **Mode B: Built-in assistant panel** |
|---|---|---|
| Where you type | Claude desktop app, Claude Code, or any MCP client | A chat panel docked inside Studio (like VS Code's chat) |
| How it connects | `himawari-mcp` (stdio). It proxies to the running Studio, so **edits appear live in Studio** as proposals and the preview updates | In-process. Studio runs the agent loop itself |
| Who pays | Whatever plan you use with that app (e.g. your Claude subscription) | **Bring your own API key.** Free for us to ship, since we run no servers. You pay your provider per use, directly |
| Setup | Studio → *Settings → AI → Connect Claude app*: shows the one-line command, or writes the config after you confirm | Studio → *Settings → AI → API key*. Pick a model, done |
| Best for | People who already chat with Claude; long planning sessions; using Claude's own features alongside | One-window workflow; quick "rewrite this line"; selection-aware help; users without a separate AI app |
| Available | Phase 3 (MCP), live Studio sync in Phase 4 | Phase 4 |

> **Note on keys and subscriptions:** an API key is billed per token through the provider's developer platform. It is separate from a consumer chat subscription. Users who want to use their Claude subscription should use Mode A. Studio's settings page explains this in one sentence so nobody is surprised by a bill.

### 10.8 Himawari agent instructions (the "special instructions")

AI behavior is controlled by **three layers of plain-text instructions**. Both modes load the same layers.

| Layer | File | Owner | Contents |
|---|---|---|---|
| **1. Engine guide** | `spec/agent-guide.md` (shipped and versioned with the engine) | Himawari project | Scope: development assistance only; **decline any image/audio/voice/video generation request** (§1.5). How to operate: read before you write; `dry_run` first; anchor edits on line IDs; use existing presets, never invent asset names (use placeholders); respect each character bible's "Must never"; run `playtest` after branching changes; keep translations' placeholders intact; explain every proposal in one line |
| **2. Project guide** | `AGENTS.md` at the project root (created by every template). Templates also add a `CLAUDE.md` containing `@AGENTS.md`, so Claude Code reads the same file | The game's developer | Tone, age rating, style guide, spoiler rules, naming conventions, "never touch chapter 5" |
| **3. User preferences** | Studio settings | Each user | Reply language (defaults to the Studio UI language), verbosity, auto-accept rules |

How each mode receives them:
- **Mode A:** the MCP server publishes the engine guide as its server instructions and as the `himawari://agent-guide` resource, and points the agent to `AGENTS.md`. The exact field for server instructions under spec 2026-07-28 is to be verified at Phase 3.
- **Mode B:** the panel's system prompt is layer 1 + layer 2, followed by the `llm-reference`. Layer 3 and the live editor context (open scene, selection) go into each user turn.

### 10.9 Built-in assistant: technical design (Mode B)

- **One tool registry, two outputs.** `packages/tools` defines every tool once (Zod schema + handler). It is exported **as MCP tools** (himawari-mcp) and **as SDK tools** for the panel (Anthropic TypeScript SDK `betaZodTool`). Anthropic's server-side MCP connector only reaches remote servers, so local tools run in-process.
- **Agent loop:** the SDK's tool runner (`client.beta.messages.toolRunner`, `stream: true`) in an Electron utility process. **Write tools don't apply edits directly; they create proposals** (§11.4) and return "pending review", which is the same approval gate as Mode A.
- **Provider and model:**
  - **v1 provider:** Anthropic.
  - **Default model:** Claude Opus 5.5 (`claude-opus-5-5`).
  - **Selectable models:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) for everyday work at lower cost, and Claude Haiku 5.5 (`claude-haiku-5-5`) for bulk translation.
  - **Quality vs speed:** a toggle that maps to the API's `effort` setting.
  - **Other providers:** a provider-adapter interface keeps the door open for OpenAI-compatible and local (Ollama) providers, likely as community contributions.
- **Prompt caching:** the cached prefix is the tool list (deterministic order) → engine guide → `llm-reference` → `AGENTS.md` and character bibles. Volatile context (open scene, selection, preferences) goes only in the newest user message. CI asserts that `cache_read_input_tokens` is non-zero on the second turn, so caching can't silently break.
- **Context features:**
  - `@scene`, `@character`, and `@line` mentions.
  - "Ask AI about selection" from the editor.
  - Thinking shown as a short "working…" summary.
  - Token and cost meter per message and per session, read from the API's usage fields.
- **Robustness:** handle the `refusal` stop reason with a clear message. Rely on SDK retries for rate limits. Long sessions use server-side compaction (a beta API feature) or start a fresh chat with a summary.
- **Privacy and security:**
  - The key is stored with `safeStorage` and used only in the main or utility process, never in the renderer.
  - Requests go straight from the user's machine to the provider. No telemetry of prompts.
  - A per-project "AI off" switch.
- The SDK names above come from current Anthropic docs. Re-verify them when Phase 4 starts, because the tool runner is a beta API.

---

## 11. Himawari Studio

### 11.1 Stack
- Electron (pinned stable), Vite, React, TypeScript strict, Zustand.
- **CodeMirror 6** with decorations for hidden line IDs, portrait chips, ▶ gutter, and active-line highlight 🔬§8.1.
- **React Flow** with an elk layout for graphs.
- Heavy compile and pack work runs in an Electron utility process.
- **Security:** Electron checklist enforced, with `contextIsolation`, `sandbox`, no `nodeIntegration`, a strict CSP, permission handlers, a typed preload bridge, and fuses configured (to be verified 🔬§8.2). Keys stored with `safeStorage`.

### 11.2 Layout (default)
```
┌───────────┬──────────────────────────────┬──────────────────────────┐
│ Explorer  │ [Screenplay | Script] editor │ Live Preview (runtime)   │
│ scenes    │  ▶ hana  [smile ▾] "Good…"   │  ┌────────────────────┐  │
│ characters│  ▶ me             "Sorry…"   │  │  🌻 game view       │  │
│ assets    │  ◆ menu "What do you say?"   │  └────────────────────┘  │
│ ...       │     ├ "I overslept."         │  scene ch1_intro · line 9│
│           │     └ "I was helping…" if…   │  [⏮ restart][⏭ next menu]│
├───────────┴──────────────────────────────┴──────────────────────────┤
│ Problems (2) · AI Proposals (1) · Output · Story Graph               │
└──────────────────────────────────────────────────────────────────────┘
```

### 11.3 Features
| Panel | MVP (Phase 4) | Later |
|---|---|---|
| **Screenplay view** | Rows per statement, character dropdown with expression thumbnails, inline text editing, drag-reorder, `+`/Enter to add, Ctrl+D duplicate | Block palette for stage commands, multi-select edits |
| **Script view** | Highlighting, live diagnostics with quick fixes, completion, hover thumbnails, go-to-definition, rename | Inline sprite previews, code lens stats |
| **Live preview** | Runtime child process. **Play-as-you-write with choice replay**, active-line sync both ways, ▶ play-from-line, next-menu skip, restart | Docked or undocked window, state timeline scrubber |
| **Story graph** | Auto-generated, conditional edges dashed (Naninovel convention), click to navigate | Edit on the graph, route colors, playtest coverage overlay |
| **Characters** | Frontmatter form, bible editor | AI continuity hints |
| **Sprite composer** | Toggle attributes, define presets, blink/lip-flap test, PSD/ORA import with mapping preview | Preset matrix sheet, alignment tools |
| **Assets** | Thumbnails, audio preview, unused/missing flags, drag into editor, **procedural placeholder maker** (no AI) | Import pipeline (resize, convert) |
| **Variables** | Declarations, read/write locations | Live values from the running game |
| **Localization** | Table by line × language, status filters, CSV/XLIFF import/export | Context screenshots, overflow warnings, AI batch translate |
| **Build** | Windows x64 export (folder or zip) | itch.io `butler` upload, Steam depot helper |
| **AI Proposals** | Diff per proposal, rationale, diagnostics, accept/reject, unified undo | Per-hunk accept, "explain this change" |
| **AI Assistant** | Docked chat (BYOK, Anthropic), streaming, `@mentions`, ask-about-selection, proposals, cost meter (§10.9) | More providers, saved chat threads per project, slash-command recipes ("/translate scene", "/continuity check") |
| **UI language** | English (default) + Japanese, switchable in Settings and on the Welcome screen (§11.5) | Community languages |
| **Search** | Double-Shift fuzzy search everywhere | Command palette actions |
| **History** | Unified undo plus a **selective history list** | Optional auto-commit to git with a `Co-authored-by` trailer for AI changes |

### 11.4 Proposal flow
```
AI write tool → Core validate → Proposal{id, diff, diagnostics, rationale, provenance}
     ▲                               │  Studio "AI Proposals" panel
     └── result: accepted / rejected:<reason> / edited ◀── human decision
```
Per-tool trust settings (e.g., auto-accept `set_translation`). An "autopilot" mode is off by default.

### 11.5 Studio UI localization (your answer #3, non-negotiable)

- **Default language is English.** The Welcome screen and Settings have a language picker. Japanese ships at v1.0.
- **No hard-coded UI strings, from the first commit.**
  - All text lives in `packages/studio/locales/<lang>.json` as **ICU MessageFormat** messages (FormatJS / `react-intl`).
  - A lint rule fails CI on literal strings in JSX.
- **Core diagnostics are localizable too.** Diagnostics carry a code + parameters (`HW0204 {char} {attr}`) and render in the UI language. The CLI follows the OS locale with an English fallback.
- **Text the AI reads stays in English** (tool descriptions, the engine guide), because consistent English instructions work best. The AI **replies** in the user's UI language unless a preference overrides it.
- **Pseudo-localization mode** (e.g. `[Ŝéţţîñĝš]`, 30% longer) in dev builds catches truncation and untranslated strings.
- **Docs:** tutorials are in EN and JA at v1.0; reference docs are English first.
- **Community translations:** a hosted translation platform for open-source projects (e.g. Weblate's free libre hosting, to be verified) connected to the repo after v1.0.
- **Fonts:** the UI bundles Noto Sans / Noto Sans JP, so Japanese renders on any machine.

---

## 12. Extensibility (engine for other devs) 🔬§10

The rule learned from Ren'Py's creator-defined statements: **every extension must still take part in parse, lint, completion, prediction, and translation**. If it doesn't, extensions break the tooling.

| Tier | When | What | Analyzable? |
|---|---|---|---|
| **A: Macros** | v1 | `define statement entrance(char, side="left"): show {char} at offscreen_{side} …` written in `.hws`, typed params, expanded at compile time | ✅ Fully |
| **B: Extension statements (C)** | v1 | A signature in `extensions/<name>.schema.json` (params, types, asset refs, translatable strings, blocking or not) plus a C implementation registered with `hw_register_statement()` in a custom runtime build. Core validates and completes calls from the schema. Studio shows them as Screenplay blocks automatically. | ✅ Call sites |
| **C: Lua 5.4 (opt-in)** | v1.x | Sandboxed (no `io`/`os`, instruction and memory limits) for minigames and custom screens. Functions declared with signatures so call sites validate. About 200–300 KB added only when enabled. | ◐ Call sites only |
| **Themes** | v1 | `theme/` folder, shareable as packages | ✅ |
| **Templates** | v1 | `hwc init --template <git-url \| name>` | ✅ |

Planned later: an `himawari-ext` registry (a GitHub-topic-based index) for themes, templates, and extensions.

---

## 13. Accessibility 🔬§11

**v1 baseline** (enabled by the default theme; game devs can extend but not remove the core options):
- Text size (at least 3 steps), font choice including a dyslexia-friendly font, line spacing.
- Textbox opacity / high-contrast mode. The speaker name is always shown. Max line-length guidance in the validator.
- **Reduce motion and flashes:** disables `shake`, `flash`, and fast transitions (photosensitivity).
- Full input remapping (keyboard and gamepad). The whole UI is navigable with one input method.
- A colorblind-safe default theme. The validator flags UI that relies on color alone (where detectable).
- Auto-forward speed, skip-read-only, and hold-to-skip.
- **First-launch accessibility prompt**, which players asked for instead of hidden hotkeys.

**v1.x:**
- **Self-voicing** via Windows text-to-speech (SAPI), reading dialogue, menus, and UI.
- `{alt=…}` tags and **alt text** for CGs, backgrounds, and image buttons. The validator warns when it's missing.
- Screen-reader-friendly mode that avoids clashing with NVDA (reported issue with Ren'Py).

---

## 14. Build System, Platforms, Toolchain

### 14.1 Platform matrix (decided in v0.5: Windows only)
| What | Windows x64 | Notes |
|---|---|---|
| **Exported games** | ✅ **only target** | Linux and Steam Deck players may be able to run the `.exe` through Proton, but v1 does not test it |
| **Himawari Studio** | ✅ only platform | |
| **Runtime build** | ✅ shipped inside games, also used for Studio's live preview and MCP headless playtests | |
| `hwc` CLI and `himawari-mcp` | ✅ | Node packages, supported and tested on Windows |
| Development and CI | ✅ | Windows 11 + MSYS2 UCRT64; GitHub Actions `windows-latest` |
| Linux, macOS | future (§18.9) | Not in v1 |

**Why Windows only (v0.5):** games already ship only for Windows, and dropping Studio-on-Linux removes a second runtime build, WSL2 setup, Linux CI, and cross-OS export checks. That speeds up development. The C core (`core/`, `text/hw_layout.c`) and the SDL layer stay portable, so a Linux port later remains a small change.

### 14.2 Host setup: Windows 11

**1. Base tools** (PowerShell):
```powershell
winget install --id Git.Git -e
```
```powershell
winget install --id GitHub.cli -e
```
```powershell
winget install --id MSYS2.MSYS2 -e
```
```powershell
winget install --id OpenJS.NodeJS.LTS -e
```
```powershell
winget install --id Microsoft.VisualStudioCode -e
```

**2. C toolchain** (open the **"MSYS2 UCRT64"** shell, not "MSYS"):
```bash
pacman -Syu
```
```bash
pacman -S --needed mingw-w64-ucrt-x86_64-toolchain mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-gdb git
```
Add `C:\msys64\ucrt64\bin` to your Windows `PATH`, so CMake and GCC also work from PowerShell, VS Code, and Claude Code.

**3. Node tooling** (PowerShell):
```powershell
corepack enable
```
```powershell
corepack prepare pnpm@latest --activate
```

**4. GitHub:**
```powershell
gh auth login
```
Sign in as `PastelSalt`.

**5. Shader compiler (only when editing shaders):** Microsoft's DirectX Shader Compiler (DXC) from https://github.com/microsoft/DirectXShaderCompiler/releases, unpacked outside the repo (this PC: `%LOCALAPPDATA%\himawari-tools\dxc-1.9.2609\`). Normal builds don't need it (RFC 0002).

**6. Sanitizers (to verify at Phase 1 start):** the MSYS2 **CLANG64** environment (`pacman -S --needed mingw-w64-clang-x86_64-toolchain`) for the `win64-asan` and `win64-fuzz` presets.

**7. GPU debugging (optional):** RenderDoc (`winget install --id BaldurKarlsson.RenderDoc -e`).

> Claude Code runs natively on Windows and uses Git for Windows' bash. Open it in the repo folder on the Windows drive.

### 14.3 CMake presets
| Preset | Where | Flags / purpose |
|---|---|---|
| `win64-debug` | MSYS2 UCRT64 | `-O0 -g`, console subsystem, your everyday build |
| `win64-release` | MSYS2 UCRT64 and CI `windows-latest` | `-O2` + LTO, `-static -static-libgcc -mwindows -s`, the **shipping build** (verified fully static in Spike A) |
| `win64-asan` | MSYS2 **CLANG64** | `-fsanitize=address,undefined -fno-sanitize-recover=undefined`. ✅ Verified 2026-10-17: full build including SDL, tests pass under both sanitizers |
| `win64-fuzz` | MSYS2 **CLANG64** | libFuzzer + ASan. ✅ Verified 2026-10-17, with a workaround (below) |

**Memory safety on Windows (verified at Phase 1 start, 2026-10-17).** MSYS2 CLANG64 (clang 23) supports it for MinGW targets:
- **ASan** (dynamic runtime) catches heap overflows with symbolized stacks; **UBSan** catches signed overflow. Both run on every test in `win64-asan`, and `-fno-sanitize-recover=undefined` makes UBSan fail the test.
- **libFuzzer:** the runtime ships, but clang's driver rejects `-fsanitize=fuzzer` for `x86_64-w64-windows-gnu`. Workaround in `runtime/CMakeLists.txt`: compile fuzzed code with `-fsanitize=address -fsanitize-coverage=inline-8bit-counters,pc-table,trace-cmp`, link `libclang_rt.fuzzer-x86_64.a` directly, and link as C++. Measured ~160–220k runs/s.
- Both run in CI (`runtime-asan`) and are mandatory before merging runtime changes. The fallbacks (corpus replay, Dr. Memory) are not needed.

- **CRT:** everything targets **UCRT** (built into Windows 10+). MSYS2 UCRT64 uses it by default.
- **Dependencies** are pinned release tarballs with SHA-256, fetched by `runtime/cmake/HimawariDeps.cmake` (or taken from `runtime/third_party/<name>/` if vendored) and linked statically (RFC 0001).
- **Line endings:** the repo has a `.gitattributes` with `* text=auto eol=lf`.

### 14.4 Game export
```
build/windows/SunflowerDays/
├── SunflowerDays.exe        # prebuilt Himawari-C runtime, renamed, icon + version patched
├── data.hwp  (+ patch*.hwp)
└── licenses/ + CREDITS.txt  # auto-generated (FreeType credit, fonts' OFL, SDL zlib…)
```
- **Export needs no compiler.** Studio ships the prebuilt Windows runtime, so export is: compile `.hwb` → pack `.hwp` → copy the runtime `.exe` → patch its icon and version resource → write licenses. 🔬§12
- The `.exe` resource patching is done in TypeScript (a pure-JS PE resource editor such as `resedit`, to be verified in Phase 4), so exports are reproducible.

### 14.5 Studio packaging
- `electron-builder`: NSIS installer and portable build for Windows, built on the Windows runner.
- Auto-update channel.
- **Code signing** planned before the public v1.0.

### 14.6 CI (GitHub Actions, all on `windows-latest`)
| Job | Steps |
|---|---|
| `ts` | typecheck, lint, vitest, conformance (compile half) |
| `i18n` | no hard-coded UI strings, EN/JA message keys in sync, pseudo-locale screenshot diff |
| `runtime-win` | MSYS2 UCRT64 **shipping build**, unit tests, DLL-import check, spike/runtime smoke tests, headless sample playtest, non-ASCII path test, Studio export test |
| `runtime-asan` | MSYS2 CLANG64: `win64-asan` build + tests, then 60 s `win64-fuzz` per target (§14.3) |
| `e2e` | Playwright-Electron: first-run flow, edit → preview, export |
| `ux-budget` | **P1 check**: scripted New Project → first frame in under 60 s; edit → preview update in under 1 s |
| `release` | tags: Windows Studio package (bundling the prebuilt runtime), spec docs |

### 14.7 Development environment (decided in v0.4, narrowed in v0.5)

**Windows 11 is the only dev machine.** Every build you run day to day is the real thing on the real platform.

| Task | Where |
|---|---|
| Runtime (C) everyday work, debugging, GPU testing | MSYS2 UCRT64 + CMake/Ninja, `gdb` or WinDbg, RenderDoc |
| Sanitizers and fuzzing | MSYS2 CLANG64 (to verify, §14.3) |
| Core / CLI / MCP / Studio (TypeScript, Electron) | Node LTS + pnpm |
| Studio (installer, file dialogs, Japanese paths) | Windows |

**Repo location:** any folder on the Windows drive (this PC: `C:\Users\Myaako\Documents\Moesoft\himawari-c`).

**What changed from v0.4:** no WSL2, no second clone, no Linux CI. The cost is that memory-safety tooling must work natively on Windows; §14.3 has the plan and the fallbacks.

---

## 15. Repository Structure (monorepo)

```
himawari-c/                 # github.com/PastelSalt/himawari-c
├── spec/                   # ★ the contract (CC-BY-4.0), published on GitHub Pages
│   ├── language.md grammar.ebnf ast.schema.json manifest.schema.json character.schema.json
│   ├── extension.schema.json bytecode.md pack.md save.md debug-protocol.md localization.md
│   ├── llm-reference.md
│   └── agent-guide.md      # Himawari agent instructions (layer 1, §10.8)
├── rfcs/                   # numbered spec-change proposals
├── packages/               # MIT
│   ├── core/  tools/  cli/  mcp/  studio/  lsp/   # tools = shared AI tool registry (§10.9)
├── runtime/                # zlib — Himawari-C
├── templates/              # adv, nvl, kinetic, blank, all 16:9 (+ placeholder art, AGENTS.md, CLAUDE.md)
├── examples/
│   ├── tutorial/           # simple playable tutorial project (EN + JA), no mascot
│   └── sunflower-demo/     # showcase: every feature, 3 languages, layered sprites
├── tests/conformance/      # .hws → expected AST / diagnostics / .hwb / playtest transcripts
├── docs/                   # Diátaxis: tutorials / how-to / reference / explanation
├── LICENSE-zlib  LICENSE-MIT  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  GOVERNANCE.md
└── .github/
```

---

## 16. Quality, Testing, and Provenance

### 16.1 Test matrix
| Layer | Approach |
|---|---|
| Parser | Snapshot tests per feature, error-recovery tests, **CST round-trip property test** (parse → print = identical bytes) |
| Edits | Property tests: random structured edits keep comments and formatting and re-parse cleanly |
| Compiler | Golden `hwc disasm` snapshots |
| Runtime core | VM, expressions, layered attribute resolution, save round-trip, rollback, RNG determinism |
| Loaders | libFuzzer on `.hwb`, `.hwp`, saves, text tags |
| Rendering | Golden images at chosen line IDs (perceptual diff), including layered sprites and transitions |
| Text | Layout snapshots: kinsoku, ruby (no overhang), mixed scripts, fallback fonts, long words |
| i18n | Placeholder parity, glyph coverage, CSV/XLIFF round-trip |
| End to end | `all_paths` playtest of examples in the Windows runtime, locally and on the CI Windows runner |
| MCP | Schema contract tests, sandbox escapes, stale revisions, dry-run purity, deterministic tool order |
| AI quality | Eval set: validation pass rate, playtest success, bible consistency (tracked over time, non-blocking) |
| Studio | Playwright-Electron e2e for the first-run flow, Screenplay ↔ Script round-trip, preview sync |
| UX | P1/P2 timing budgets in CI. A **hallway usability test** each milestone with 3 non-programmer writers doing scripted tasks |

### 16.2 Conformance suite
Shared cases bind the TS compiler and the C VM: input `.hws` → expected diagnostics, `.hwb`, and **headless playtest transcript**. If they drift, CI fails.

### 16.3 Performance tracking
Budgets from §8.1 are measured in CI on every merge, with a trend dashboard.

### 16.4 AI provenance 🔬§13
- Each **text** item (dialogue line, menu option, translation, character bible) records `provenance: human | ai | ai-edited`. MCP and assistant writes set `ai`, and a human edit changes it to `ai-edited`. Assets carry no AI provenance because Himawari never generates them (§1.5).
- Stored in syntax-tree metadata and `.himawari/provenance.json`. It is committed, so teams can audit it.
- `hwc report ai-content` produces a store-ready summary of AI-assisted *text*: counts, categories, and files. Himawari games are **pre-generated only** by design, with no AI at runtime.

---

## 17. Open-Source Project Setup (your answers #3, #4)

| Area | Plan |
|---|---|
| **Licenses** | Runtime **zlib** (embedded in every game; same as SDL, no attribution burden). Tooling **MIT**. Specs **CC-BY-4.0**. Bundled fonts OFL 🔬§12 |
| **Hosting** | Repo **`github.com/PastelSalt/himawari-c`** (personal account, public). Docs and spec via GitHub Pages at `https://pastelsalt.github.io/himawari-c/`. Releases via GitHub Releases. Issues and Discussions on the repo |
| **Governance** | BDFL (you) for v1, documented in `GOVERNANCE.md`. Maintainers added by contribution record |
| **Spec changes** | **RFC process** in `rfcs/`, modeled on MCP's SEP workflow: numbered proposal, discussion, accept/reject, then spec PR |
| **Versioning** | SemVer per package and per spec. Engine 1.x keeps bytecode, save, and manifest compatibility. A deprecation window of at least 2 minor versions |
| **Contribution** | `CONTRIBUTING.md`, good-first-issue labels, DCO sign-off, CI must pass, conformance tests required for language changes |
| **Security** | `SECURITY.md` with a private disclosure channel. Fuzzing in CI. MCP sandbox tests |
| **Docs** | **Diátaxis** 🔬§14: Tutorials ("First VN in 15 minutes", "Co-writing with an AI agent", "Layered sprites from your PSD"), How-to (localize, export to Steam, add an extension), Reference (spec, CLI, MCP tools), Explanation (architecture, why bytecode, why line IDs) |
| **Community** | Discussions forum, showcase gallery, template and theme sharing, a monthly changelog post |
| **Sustainability** | GitHub Sponsors / Open Collective (optional). Never feature-gate the engine |

---

## 18. Roadmap

Estimates assume **one developer full-time**. Each phase has exit criteria. ⏱ ≈ weeks.

### Phase 0: Foundations and spikes (⏱ 2) · status after 2026-10-17
- ✅ `github.com/PastelSalt/himawari-c` created and pushed. Monorepo, TS strict, CMake presets, `.gitattributes`, CI skeleton. Windows toolchain set up (§14.2).
- ✅ i18n scaffolding: message catalogs + the no-hard-coded-strings lint rule, from the first UI string onward.
- ✅ **Spike A:** fully static SDL 3.4 + SDL3_mixer + FreeType `.exe` built natively with MSYS2 UCRT64; window, sound, JP text; runs from non-ASCII paths (RFC 0001, accepted).
- ✅ **Spike B:** `SDL_GPURenderState` rule-wipe shader on D3D12 and Vulkan, pixel-identical (RFC 0002, accepted).
- ✅ **Spike C:** text stack: FreeType + libunibreak vs SDL3_ttf; a JP paragraph with ruby and kinsoku (RFC 0003, accepted: FreeType direct).
- ✅ Drafts: `language.md`, `manifest`, `character` schemas.
- ✅ **Exit:** spikes answered and decisions recorded in `rfcs/0001-0003`. Every push builds a Windows `.exe` that opens a window, plays a sound, and shows JP text, verified on your Windows machine and by the CI `runtime-win` job. ⏳ The TypeScript CI jobs failed on the first run (a setup-node/pnpm setup issue, fixed in session 8); confirm they pass on the next run.

### Phase 1: Contract and compiler (⏱ 4)
- ✅ First: verify `win64-asan` / `win64-fuzz` in MSYS2 CLANG64 (done 2026-10-17; both work, §14.3).
- ✅ Lossless CST parser with recovery, typed AST, line IDs, formatter, `hwc check` / `hwc fmt` (2026-10-17).
- ✅ Validator with codes, suggestions, and quick fixes; `hwc check` validates whole projects (2026-10-17).
- ✅ Structured `edit` API, line-ID anchored, atomic and validated (2026-10-17).
- ✅ Character frontmatter, presets, attribute discovery (validator). ⏳ l10n string tables and placeholders.
- ✅ `bytecode.md` v1 (word-aligned variable-length instructions, rich-text programs), compiler, validating reader, `hwc check|fmt|build|disasm` (2026-10-17). ⏳ `hwc l10n`.
- ✅ Conformance harness (compile half): `tests/conformance/` with golden disassembly and diagnostics.
- ⏳ Tutorial and starter (`adv` template) projects; `spec/ast.schema.json`.
- ✅ **Exit:** the tutorial and starter projects compile. Broken inputs produce friendly multi-error diagnostics with fixes. CST round-trip passes property tests.

### Phase 2: Runtime MVP (⏱ 6)
- `core/` VM, loader, saves, and rollback.
- Renderer with layered characters (blink and lip-flap), fade/dissolve.
- Text: atlas, line breaking, kinsoku, ruby, fallback.
- Textbox, menus. Audio via SDL3_mixer, including voice.
- `--dev` with placeholders, reload-in-place, warp, and dev overlay. `--headless` playtest.
- Size work: trim SDL subsystems and FreeType modules toward the 4 MB budget (§8.1).
- ✅ **Exit:** the starter VN plays in EN and JA on Windows. Headless reaches every ending. Loaders survive 10 minutes of fuzzing (or the §14.3 fallback checks).

### Phase 3: MCP v1 and CLI polish (⏱ 2)
- Shared `packages/tools` registry. All tools on spec 2026-07-28, `llm-reference`, **`agent-guide.md` v1**, prompts, `render_line`, tasks extension.
- `AGENTS.md` + `CLAUDE.md` in templates. Setup docs for the Claude desktop app and Claude Code (Mode A).
- 🎯 **M1, vertical slice (≈ week 14):** *starting from a premise and two character bibles with layered sprites, an AI agent writes a 3-route chapter via MCP. It validates, reaches 100% playtest ending coverage, gets translated to a second language, and plays as a Windows `.exe`.*

### Phase 4: Studio MVP (⏱ 9)
- Shell and **first-run flow (§2.1)**, Explorer, **Screenplay view + Script view** (CodeMirror 6), live preview with **play-as-you-write replay** and two-way line sync.
- Story graph, characters panel, **sprite composer + PSD/ORA import**, assets with a procedural placeholder maker, variables, localization table, build panel.
- Embedded MCP with AI Proposals panel; **live sync with external Claude apps (Mode A)**; unified and selective undo; double-Shift search.
- **Built-in AI assistant panel (Mode B, §10.9)**: BYOK key setup, streaming chat, `@mentions`, ask-about-selection, proposals, cost meter, prompt-cache check in CI.
- **UI in English + Japanese** (§11.5), Welcome-screen language picker, pseudo-locale checks. Studio packaged for Windows, and export verified.
- 🎯 **M2:** a non-programmer writer passes the hallway test in **either UI language**: they create, write, preview, localize one scene, and export a Windows game without docs help, while an AI contributes proposals through **both** Mode A and Mode B.

### Phase 5: Runtime feature-complete (⏱ 5)
- Backlog with voice replay, auto/skip, config, gallery, music room, quick save.
- Rule transitions, NVL mode, theming, gamepad and remapping.
- **Accessibility baseline (§13)**, `.hwp` + patches, WebP, crash dumps, Tier B extension statements, macros.
- ✅ **Exit:** `sunflower-demo` covers every feature in 3 languages. Golden-image suite green. Performance budgets met.

### Phase 6: AI depth and polish (⏱ 2)
- Continuity checks, route balance, coverage overlay on the graph, graph editing.
- AI batch translation with glossary (Haiku-class model by default for cost). Assistant slash-command recipes. MCP Apps (story graph, scene preview).
- AI eval suite trending.

### Phase 7: Open-source launch (⏱ 3)
- Docs site (Diátaxis, tutorials in EN + JA) on GitHub Pages, the tutorial project, a video walkthrough.
- Signed Studio installer for Windows, auto-update, itch.io `butler` export, `hwc report ai-content`.
- Governance and contribution docs, RFC repo, security policy, license audit.
- 🎯 **M3: public v1.0.**

**Total ≈ 33 weeks to v1.0** (v0.2 was 32: the built-in assistant and Studio UI localization add 2 weeks to Phase 4, and Phase 6 shrinks by 1). An AI-to-game slice still works at ≈ week 14.

### 18.9 After v1
- **Linux (future improvement, v0.5):** Studio on Linux, a Linux runtime build for its live preview and headless playtests, Linux CI (sanitizers, fuzzing), and possibly a tested Proton path for Steam Deck. The portable `core/` and `text/` code and the SDL layer keep this a small change. Phase 0 already proved most of the pieces on Windows.
- **v1.x:** self-voicing, Lua tier, Tier 2 scripts (RTL, complex shaping), scene replay, Steamworks (achievements, cloud), video (pl_mpeg / dav1d), VS Code extension via LSP, more assistant providers, community Studio UI languages.
- **v2 (only if wanted):** Linux/macOS game exports, web export (WASM), mobile, an extension registry, real-time collaboration (CRDT), a timeline/animation editor.

---

## 19. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope (an engine, an editor, and an AI layer) | High | Headless-first order, spikes before commitments, the M1 slice by week 14, strict non-goals |
| Screenplay ↔ Script round-trip fidelity | High | Lossless CST plus property tests from Phase 1. One shared `edit` API for every mutation |
| CJK and multi-language layout | Medium | Spike C done (RFC 0003): libunibreak + strict JLREQ overrides, 0 violations over 131 widths. Glyph-coverage validator. Snapshot tests |
| Static SDL3 build unknowns | Low (since Spike A) | Fully static native build verified (RFC 0001). Fallback if ever needed: ship SDL3 DLLs next to the `.exe` |
| Release `.exe` over the 4 MB budget | Medium | Measured 5.1 MB in Phase 0. Trim SDL subsystems and FreeType modules in Phase 2; revisit the budget if trimming isn't enough |
| GPU render state on older GPUs, or a silently failing pipeline | Low–Med | Startup self-test and crossfade fallback (RFC 0002) |
| TS compiler vs C VM drift | High | One VM, conformance transcripts in CI |
| Windows-specific bugs | Low (since v0.4) | You develop on Windows natively, and the release build runs on the CI Windows runner |
| Weaker sanitizer and fuzzing coverage on Windows only | Low (since Phase 1) | Verified: MSYS2 CLANG64 ASan/UBSan and libFuzzer (with a link workaround) run locally and in CI (§14.3) |
| A later Linux port is harder than expected | Low | Keep `core/` and `text/` free of SDL and OS APIs; keep platform code behind `platform/` |
| Built-in assistant cost surprises users | Medium | Cost meter per message and session, cheaper-model toggle, a clear "API key ≠ subscription" note, no background AI calls |
| AI provider API drift (beta tool runner) | Medium | Thin provider adapter. Pin SDK versions. Mode A (MCP) keeps working if Mode B breaks |
| Japanese UI translation quality | Medium | AI-assisted first pass marked `needs-review`, then native-speaker review before each release. Pseudo-locale tests catch layout breakage |
| Save breakage across edits | Medium | Line-ID remap plus checkpoint fallback, versioned save format |
| AI story inconsistency | Medium | Character bibles, continuity checks, playtests, human review by default |
| MCP spec and SDK churn | Medium | Thin adapter over Core. Pinned SDK. Avoid deprecated features. Track the spec's 12-month deprecation policy |
| Extension tier fragmenting tooling | Medium | Signature schemas are mandatory. Lua is opt-in and off by default |
| OSS maintainer burnout | Medium | Clear scope, a "not planned" list, RFC gate for language changes, automation-heavy CI |
| Licensing mistakes in exports | Low | Auto-generated `licenses/` and credits. License audit in the Phase 7 checklist |
| AI-content store policies | Low | No media generation at all. Text provenance plus a report export. Pre-generated-only by design |

---

## 20. Remaining Open Questions

All earlier questions are answered (see §0.2 and [LOG.md](LOG.md)). Small items left, none of them blocking:

1. ~~**Repo name**~~ Resolved in v0.5: `PastelSalt/himawari-c`.
2. **Japanese UI review:** you, a friend, or a community reviewer before v1.0?
3. **Donations** (GitHub Sponsors): yes or no.

---

## 21. Glossary
- **VN:** visual novel. **ADV / NVL:** textbox mode / full-screen text mode.
- **MCP:** Model Context Protocol. **MRTR:** Multi Round-Trip Requests. **MCP Apps:** UI extension using `ui://` resources.
- **`.hws` / `.hwb` / `.hwp` / `.hwsav`:** Himawari Script source / bytecode / pack / save.
- **CST:** concrete syntax tree. Lossless, keeps comments and whitespace.
- **Line ID:** permanent identifier of a dialogue line or menu option.
- **Layered sprite:** a character built from stacked layer groups. **Preset:** a named expression that sets several groups at once.
- **Kinsoku shori:** Japanese line-breaking rules. **Ruby:** furigana annotations. **JLREQ:** W3C Japanese layout requirements.
- **Rollback:** step-wise rewind restoring exact state.
- **Proposal:** an AI change awaiting human review.
- **Mode A / Mode B:** working with AI through your own Claude app via MCP / through Studio's built-in assistant panel with your own API key.
- **BYOK:** bring your own (API) key.
- **Preview runtime:** (v0.3–v0.4 only) an internal Linux build of Himawari-C for Studio on Linux. Dropped in v0.5; see §18.9.
- **Kinsoku override table:** Himawari's JLREQ rules applied on top of UAX #14 line breaking (RFC 0003).
- **Provenance:** human/AI origin record per text item.
- **Conformance suite:** shared tests binding the TS compiler and the C VM.
