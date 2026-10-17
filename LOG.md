# Himawari — Development Log

> A running record of how the project was planned and why each decision was made. Newest entries are at the **bottom**. Add a new entry for every work session.
>
> **Files:** [DETAILED_PLAN.md](DETAILED_PLAN.md) (the plan, currently **v0.5**) · [RESEARCH.md](RESEARCH.md) (evidence, **v1.2**) · [CLAUDE.md](CLAUDE.md) (context for AI coding sessions) · [rfcs/](rfcs/) (accepted spike decisions) · this file.

---

## Project at a Glance (as of 2026-10-17)

| | |
|---|---|
| **What** | Himawari: an open-source, AI-assisted visual novel engine for other developers |
| **Parts** | `@himawari/core` (TS compiler and validator) · Himawari Studio (Electron authoring app) · `himawari-mcp` (MCP server) · **Himawari-C** (C11 + SDL 3.4 runtime) |
| **Platform** | **Windows only, for everything** (games, Studio, tooling, dev, CI). Linux is a future improvement |
| **Game output** | Windows x64 only |
| **Studio** | Windows, UI in English (default) + Japanese |
| **AI role** | Development assistant only. **No media generation** |
| **Phase** | **Phase 1 done** (session 9): sanitizers; lexer, CST parser, AST + `ast.schema.json`, formatter, validator, edit API, bytecode spec + compiler, conformance (compile half), localization, templates + tutorial, `hwc check/fmt/build/disasm/init/l10n`. Next: Phase 2 |
| **Phase 2** | **Done** (session 10): `himawari.exe` (loader, VM, saves, rollback, headless playtests, windowed player with layered sprites, rule wipes, EN/JA), bytecode 1.0 frozen, 2.38 MB release |
| **Phase 3** | **Done** (session 11): `@himawari/tools` (22 tools) + `himawari-mcp` (spec 2026-07-28, SDK v2), agent guide, `hwc run/playtest/graph/report/ai setup`, `build --release` packaging; **M1 reached** (`examples/festival-eve`). Next: **Phase 4, Studio MVP** (waiting on your go-ahead) |
| **Owner** | Moesoft (GitHub: `PastelSalt`) |
| **Repo** | **https://github.com/PastelSalt/himawari-c** (public) |

---

## Session 1: 2026-10-15 · Initial concept → plan v0.1
**Machine:** Linux (Ubuntu-based), project folder `~/Desktop/Moesoft/himawari-c` (empty).

**Your starting concept** (quoted verbatim):
> Himawari-C is an advanced, AI-first visual novel ecosystem designed for high-performance execution and seamless developer tooling, featuring a decoupled architecture split into an Electron and TypeScript-powered Authoring Suite, a Model Context Protocol (MCP) server layer for programmatic AI agent orchestration, and Himawari-C—an ultra-lightweight C99 runtime engine built with SDL2 and FreeType. Targeted for Windows deployment while engineered entirely on Linux via MinGW-w64 cross-compilation, the project bridges human creative authoring and autonomous AI assistance through a clean script data contract, allowing external LLMs to natively query, write, and validate story nodes while preserving maximum execution efficiency.

You noted that nothing was final and asked for improvements.

**Environment found:** empty directory, not a git repo. Node v26.10.0 installed. No MinGW-w64, GCC, or CMake.

**Created:** `DETAILED_PLAN.md` v0.1.

**Main proposals:**
- **Three-layer script contract:** `.hws` text → AST JSON → `.hwb` bytecode. **The runtime never parses source text.**
- A closed, Ren'Py-like script language (no embedded Python), with **stable line IDs**.
- A shared `@himawari/core` package, so Studio, MCP, and CLI use one parser.
- SDL2 → **SDL3**; C99 → **C11**.
- MCP runs standalone *and* embedded in Studio. AI edits become reviewable **proposals**.
- A headless runtime mode for AI playtests. Deterministic integer logic with a seeded RNG.
- Markdown character bibles for AI context.
- **Headless-first build order:** Contract → Compiler → Runtime → MCP → Studio.
- Roadmap ≈ 26 weeks.

**Questions asked:** languages, art pipeline, licensing, distribution, Linux runtime, AI panel, C standard, first-game scale.

---

## Session 2: 2026-10-17 · Answers round 1, ease of use, research → RESEARCH.md v1.0 + plan v0.2

**Your answers:**
1. Multi-language support.
2. Layered sprites.
3. Open source.
4. It's an engine that other developers will use.
5. Linux runtime: "you decide".

**New requirement:** make it **as easy to use as possible** without compromising the original concept. Research proven approaches first, so the project rests on solid foundations instead of guesses.

**Research done** (≈30 web searches and doc fetches): Ren'Py, Naninovel, Ink/Inky, Yarn Spinner, Dialogic, Twine/Arcweave/articy, SDL 3.4, SDL3_mixer, SDL3_ttf, libunibreak, W3C JLREQ/Simple Ruby, MCP spec 2026-07-28, MCP TS SDK v2, MCP Apps, AI edit-format evidence (Aider), CodeMirror vs Monaco, Electron security, Lua size, Steam AI disclosure (Jan 2026), Game Accessibility Guidelines, licensing, Diátaxis.

**Created:** `RESEARCH.md` v1.0. **Rewrote:** plan → v0.2.

**Main decisions:**
- **Ease of use:** 12 UX principles, P1–P12 (e.g. a playable first scene in 5 minutes, play-as-you-write with choice replay, labeled placeholders for missing assets, errors with one-click fixes, progressive disclosure, Screenplay ↔ Script dual view).
- **Layered sprites:** Ren'Py `layeredimage` semantics as data. Folder auto-discovery, expression presets, built-in blink and lip-flap, PSD/ORA import.
- **Multi-language:** Yarn-style persistent `#line:` IDs, string tables with placeholders, CSV + XLIFF, font fallback chains, glyph-coverage validation, kinsoku and ruby.
- **Stack:** SDL3_mixer 3.2 (instead of a custom mixer), the SDL 3.4 GPU render state for shader transitions, libunibreak, **CodeMirror 6** (instead of Monaco), a lossless syntax tree.
- **MCP:** target spec 2026-07-28. AI edits anchored on line IDs, never line numbers or diffs.
- **Extensibility tiers:** macros → C extension statements → optional sandboxed Lua.
- **Licenses:** runtime **zlib**, tooling **MIT**, specs **CC-BY-4.0**.
- An accessibility baseline, AI provenance tracking, and Diátaxis docs.
- Linux runtime made Tier 1 (later reversed in session 3).
- Roadmap ≈ 32 weeks.

---

## Session 3: 2026-10-17 · Answers round 2 → plan v0.3

**Your answers:**
1. No 4:3 or vertical templates. 16:9 is the modern standard.
2. No mascot. A simple tutorial is enough.
3. **Studio UI localization: yes, non-negotiable. English is the default.**
4. AI: you'd thought of using Claude via MCP, with changes appearing in Studio. A **built-in chat panel** (like VS Code's, bring your own key, with Himawari's own instructions) would also be welcome if it's possible for free.
5. You use your personal GitHub account.
- **Question:** should development move to Windows, since Studio ships for Windows + Linux but **game output is Windows-only**?

**Changes in v0.3:**
- **Game export: Windows x64 only.** The Linux runtime build became an internal "preview runtime" for Linux Studio, MCP playtests, and CI.
- **Two first-class AI modes** (§10.7):
  - **Mode A:** your own Claude app via MCP, with live sync into Studio.
  - **Mode B:** a built-in BYOK assistant panel. Free to ship; the user pays their own API usage. An API key is separate from a Claude subscription.
- **Three-layer agent instructions** (§10.8): engine `agent-guide.md` + project `AGENTS.md` (with `CLAUDE.md` importing it) + user preferences.
- **Assistant design** (§10.9): a single Zod tool registry exported as MCP tools and as SDK tools. Default model Claude Opus 5.5 (`claude-opus-5-5`), with a Sonnet/Haiku 5.5 option. Prompt caching. A cost meter.
- **Studio UI i18n** (§11.5): ICU messages, a no-hard-coded-strings lint rule, EN + JA at v1.0.
- The built-in panel moved from Phase 6 to Phase 4. Roadmap ≈ 33 weeks.
- **Dev OS answer at the time:** stay on Linux and add a real Windows test PC (superseded in session 4).
- **RESEARCH.md §16** added: Anthropic SDK facts (tool runner, the MCP connector only reaches remote servers, caching, model IDs).

---

## Session 4: 2026-10-17 · Final Linux session → plan v0.4, LOG.md, CLAUDE.md

**You clarified:**
- **The software is for software development only. It is not meant to generate AI images, assets, or other creative media.**
- Start checking GitHub with commands.
- Create this LOG.md, covering the earlier chats too.
- **You're moving development to Windows.** This was the last session on the Linux machine. The `.md` files will be copied to the Windows PC.

**GitHub check** (read-only, with `gh`):
- `gh` 2.46.0, logged in as **`PastelSalt`** ("Moesoft: Moeko Software and Technologies"). Token scopes: `repo`, `workflow`, `gist`, `read:org`.
- `PastelSalt/himawari` and `PastelSalt/himawari-c` **do not exist yet**, so both names are free.
- `PastelSalt.github.io` does not exist. A project Pages site works without it: `https://pastelsalt.github.io/himawari/`.
- **Nothing was created on GitHub.**

**Changes in v0.4:**
- **AI scope (§1.5):** development assistance only.
  - AI reads, writes, validates, refactors, playtests, and translates scripts and text, always as reviewable proposals.
  - **No image, audio, voice, video, or other media generation anywhere.** Placeholders are procedural. No media tools in MCP or the assistant. The agent guide tells agents to decline media requests.
  - Provenance tracking is limited to text.
- **Dev environment (§14.2, §14.7):** **Windows 11 primary.**
  - **Windows native:** MSYS2 **UCRT64** (GCC/MinGW-w64) + CMake + Ninja, Node LTS + pnpm.
  - **WSL2 Ubuntu:** Linux preview runtime, ASan/UBSan, fuzzing, and Linux Studio testing via WSLg.
  - UCRT everywhere. A `.gitattributes` LF policy.
  - The remote-run dev agent and the separate test PC are no longer needed.
- **CI:** the shipping build is now **native on the `windows-latest` runner** (MSYS2 UCRT64), matching your PC. The Ubuntu cross-build stays as a secondary check.
- **Hosting:** `github.com/PastelSalt/himawari`, with the spec on `https://pastelsalt.github.io/himawari/spec/…`.
- **RESEARCH.md v1.1:** §13 (AI scope) and §15 (new items to verify: MSYS2 sanitizers, `resedit`) updated.
- **Created:** `LOG.md` (this file) and `CLAUDE.md`.

**Note:** Claude's memory on the Linux machine does **not** move to Windows. `CLAUDE.md` + this log carry the context instead.

---

## Session 5: 2026-10-17 · First Windows session → Phase 0 scaffold + Spike A
**Machine:** Windows 11 Pro, project folder `C:\Users\Myaako\Documents\Moesoft\himawari-c` (kept instead of `C:\dev\himawari`).

**You asked:** read, analyze, and execute the plan. You approved installing the §14.2 toolchain.

**Environment found:** only Node v24.22.0. No git, gh, MSYS2, CMake, or WSL.

**Installed:** Git 2.55 and GitHub CLI (winget), MSYS2 + UCRT64 `toolchain cmake ninja gdb git` (GCC 16.2.0, CMake 4.4.4, Ninja 1.13.2, GDB 18.1). pnpm 12.14.0 via corepack (not globally enabled).
**Not done (needs you):** WSL2 (admin + reboot), `gh auth login`, creating the GitHub repo, adding `C:\msys64\ucrt64\bin` to the Windows `PATH`.

**Created (Phase 0, plan §18):**
- **Monorepo:** pnpm workspace, TS 6.0.3 strict (pinned below 6.1 because typescript-eslint 8.71 does not support TS 7 yet), vitest 5, ESLint 10.12 (10.13 was <1 day old and tripped pnpm's release-age gate, so it was pinned back rather than excluded), `.gitattributes` LF policy, `.editorconfig`, licenses (MIT, zlib, CC-BY-4.0 notice for `spec/`), README.
- **`@himawari/core`:** spec version constants and **line IDs** (6-char lowercase Crockford base32; generate, validate, extract `#line:` tags), with tests. **`hwc` CLI:** `--version` and `--help` only.
- **Spec drafts:** `spec/language.md` v0.2.0-draft, `manifest.schema.json` and `character.schema.json` (JSON Schema 2020-12), plan examples in `spec/examples/`, validated by Ajv in strict mode with positive and negative tests.
- **Studio i18n (§11.5):** `packages/studio/locales/en.json` + `ja.json` (24 ICU messages for the Welcome screen, wizard, panels), `check-locales.mjs` (keys and ICU arguments in sync), and a custom ESLint rule `himawari/no-hardcoded-ui-strings` for Studio JSX, with tests.
- **Runtime:** `runtime/CMakeLists.txt`, all 7 presets from §14.3, the MinGW cross toolchain file, deps pinned by tag + SHA-256 (SDL `release-3.4.18`, SDL3_mixer `release-3.2.4`, FreeType `VER-2-14-3`), `core/` UTF-8 decoder (no SDL, no I/O) with tests and a libFuzzer target, **Spike A**.
- **CI skeleton:** `.github/workflows/ci.yml` with `ts`, `i18n`, `runtime-win` (MSYS2 UCRT64 shipping build, DLL-import check, smoke test), `runtime-linux` (ASan/UBSan + preview build), `fuzz`. Not run yet (no remote repo).
- **RFCs:** `rfcs/README.md`, template, 0001 (Spike A results), 0002 and 0003 (questions for Spikes B and C).
- **Local git repo:** `git init -b main`. Nothing committed.

**Verified on this PC:**
- `pnpm check`: typecheck, lint, 37 vitest tests, i18n check all pass.
- `win64-debug`: clean build with `-Wall -Wextra -Werror -Wconversion`; `ctest` passes; `spike_a.exe` opens a window (Direct3D 11 renderer), plays a 440 Hz tone through SDL3_mixer, and renders Japanese with FreeType + Yu Gothic (checked from a screenshot).
- `win64-release`: **fully static** `.exe` (imports only Windows system DLLs and the UCRT), GUI subsystem, runs and renders correctly, including from a non-ASCII folder (`…\ひまわり テスト\ゲーム.exe`). **5.17 MB, over the 4 MB budget**; SDL subsystem trimming is a follow-up. Details in `rfcs/0001`.

**Decisions made in this session (small, recorded in specs, not in the register):**
- Line-ID alphabet: lowercase Crockford base32 (no i, l, o, u).
- Character `views.crop` is `[x, y, width, height]`.
- Variables in the manifest require an explicit `scope`.

---

## Session 6: 2026-10-17 · Spike B: GPU rule-wipe transitions
**You asked:** go ahead with Spike B (rfcs/0002). You approved downloading Microsoft's DirectX Shader Compiler (DXC 1.9.2609, Microsoft-signed) to `%LOCALAPPDATA%\himawari-tools\`, outside the repo.

**Created:**
- `runtime/shaders/rule_wipe.frag.hlsl` (rule/mask wipe with a soft edge), `runtime/shaders/compile-shaders.cmake` (DXC → DXIL + SPIR-V → C headers), generated headers in `runtime/shaders/generated/` (committed, so builds and CI need no DXC).
- `runtime/spikes/b_rule_wipe/main.c`: explicit GPU renderer, three procedural masks, `--driver`, `--progress`, `--screenshot`, `--benchmark`, `--no-gpu` fallback (crossfade on the default renderer).
- CI: Spike B smoke test in `runtime-win`. RFC 0002 filled in with results; screenshots in `rfcs/assets/`.

**Verified on this PC (RX 580):**
- D3D12 and Vulkan both render the wipe correctly, **pixel-identical** to each other on all three masks; endpoints correct; fallback blends exactly; no errors in GPU debug mode; static release `.exe` runs on both drivers and the fallback. About 0.3 ms per frame with vsync off. SDL picks D3D12 by default.

**Key findings (details in rfcs/0002):**
- The 3.4 struct is `SDL_GPURenderStateCreateInfo` (settles RESEARCH.md §4.1).
- The GPU renderer must be requested explicitly; it is never the default.
- **Pixel-shader inputs must use `TEXCOORD0`/`TEXCOORD1`**, because SDL's shaders go through SDL_shadercross. With `COLOR0`, D3D12 pipeline creation fails, and **SDL skips the draw silently** outside debug mode. Vulkan hid the bug. The runtime needs a startup self-test for custom render states.
- SDL alone makes a 4.14 MB release `.exe`, so the 4 MB budget needs SDL trimming (RFC 0001).

**Mistakes fixed along the way:** `SDL_clamp(argv[++i], …)` evaluated its argument several times (macro), which skipped `--frames` and hung the first runs; the stuck processes were stopped.

**Note:** SDL's source tree has a `CLAUDE.md` saying generative AI must not be used for contributions to SDL. It doesn't affect using SDL, but any upstream report about the `TEXCOORD` issue must be written by a human.

---

## Session 7: 2026-10-17 · Spike C: Japanese text stack
**You asked:** go ahead with Spike C (rfcs/0003): FreeType + libunibreak vs SDL3_ttf, a JP paragraph with ruby and kinsoku.

**New pinned dependencies:** libunibreak 8.0 (compiled from its sources; it has no CMake build) and SDL3_ttf 3.2.2 (HarfBuzz and PlutoSVG off). SDL3_ttf's `find_package(Freetype)` is redirected to our pinned FreeType with `OVERRIDE_FIND_PACKAGE`.

**Created:**
- `runtime/src/text/hw_layout.{h,c}`: our VN paragraph layout (pure C): libunibreak UAX #14 + strict JLREQ kinsoku table + hanging punctuation + unbreakable ruby groups with 1:2:1 spreading + reveal order. Input is pre-structured runs, not markup (D01).
- `runtime/tests/test_layout.c` (in `ctest`): every kinsoku class, hanging on/off, inseparables, Latin, emergency split, both ruby cases.
- `runtime/spikes/c_text/`: shared atlas + renderer, two backends (`spike_c_ft`, `spike_c_ttf`), `--check-only` mode that verifies kinsoku on real font metrics without a window.
- CI: kinsoku check on the Windows runner (if it has Yu Gothic). RFC 0003 filled in; screenshots in `rfcs/assets/`.

**Results (release builds):**
- Both backends render the paragraph identically (ruby, fallback Segoe UI → Yu Gothic, outlines).
- 131 widths × 3 modes × 2 backends: **0 kinsoku violations in strict mode**; plain UAX #14 has 19 (small kana at line starts), so the override table is required.
- FreeType direct: ~1.7× faster rasterization (8.9 vs 15.2 ms for 156 glyphs), ~1.6 MB less memory, exact outline placement. SDL3_ttf adds only 22 KB but needed an outline-placement workaround.
- **Proposed decision: FreeType direct + libunibreak + our layout; no SDL3_ttf.** Revisit at Tier 2 (HarfBuzz).
- libunibreak 8.0 implements Unicode 17 (RESEARCH.md §4.4 said 15.0).

**Mistakes fixed along the way:** `%zu` isn't accepted by `SDL_Log`'s format check on MinGW; my kinsoku checker first flagged invisible trailing spaces as overflow; one layout test expectation was wrong (em dashes are 5 px in the test metrics); the RFC's first line counts were guesses and were corrected from the files.

**Phase 0 status:** all three spikes are answered on Windows. What's left for the Phase 0 exit (plan §18): the Linux half (WSL2), CI green on GitHub (needs the repo), and accepting RFCs 0001–0003.

**Session 7 follow-up:** you asked to commit all Phase 0 work to local `main` without pushing: commit `3cb3cb9` (74 files).

---

## Session 8: 2026-10-17 · Windows-only scope → plan v0.5, RFCs accepted, first push
**You decided:**
- **"This project will be solely for Windows only. The Linux integration/development will be for future improvement."** Update the plan, log, and every connected document.
- You added MSYS2 to `PATH` and ran `gh auth login` (next steps 1 and 3 from session 7). WSL2 is no longer needed.
- Repo: **https://github.com/PastelSalt/himawari-c** (public, created empty).
- **You accepted the spike recommendations** (RFCs 0001–0003).
- Push the codebase; wait for your go-ahead before Phase 1.

**Changes:**
- **Plan v0.5:** Windows-only scope in §0, §0.1 (new change table), §0.2 (decisions #14 and #15), §1, §3, §8 (accepted spike decisions folded into §8.1, §8.2, §8.3, §8.5, §8.6), §9.2, §11.3, **§14 rewritten** (platform matrix, host setup with no WSL2, Windows presets, memory-safety plan on Windows, Windows-only Studio packaging and CI), §15, §16, §17, §18 (Phase 0 marked done; Phase 1 starts with sanitizer verification; Phase 2 adds size trimming), §18.9 (Linux as a future improvement), §19, §20, §21.
- **Build:** removed the `linux-debug`, `linux-preview`, `fuzz`, and `win64-cross` presets and the MinGW cross toolchain file; added `win64-fuzz` (CLANG64, to verify).
- **CI:** every job now runs on `windows-latest`; removed `runtime-linux` and `fuzz`.
- **Spec URLs:** schemas, examples, tests, and `SPEC_BASE_URL` now point at `https://pastelsalt.github.io/himawari-c/spec/…` to match the repo name.
- **RFCs 0001–0003:** status **Accepted**; Linux items moved to "deferred".
- **CLAUDE.md, README.md, RESEARCH.md (v1.2):** updated for Windows-only and the accepted decisions.
- Pushed `main` to `origin` (see the end of this session's work).

**Consequence to watch:** memory-safety tooling (ASan/UBSan, libFuzzer) was planned on Linux. It now depends on MSYS2 CLANG64 working for MinGW targets, to be verified first thing in Phase 1, with fallbacks in plan §14.3.

### Session 8b: code cleanup after the Windows-only decision
**You asked:** do a proper cleanup of the code, given that consequence.

**First CI run (38997022400), checked before cleaning up:**
- ✅ `runtime-win` passed on `windows-latest`: static release build, `ctest`, DLL-import check, Spike A (dummy audio, Yu Gothic present), Spike B (D3D12 GPU renderer on a GPU-less runner, presumably WARP; pixels not checked), Spike C kinsoku check (0 violations at 4 widths).
- ❌ `ts` and `i18n` failed at `actions/setup-node@v5`: it saw `packageManager: pnpm` in `package.json` and tried to cache pnpm before `corepack enable` had run.

**Cleanup:**
- `runtime/CMakeLists.txt`: **fails fast on non-Windows hosts** with a message pointing at plan v0.5; removed the `if(UNIX)` `-lm` blocks and the non-Windows release-link branch.
- Spike A: removed the Linux font paths. Spike C: removed the `_WIN32` guards (the Windows memory API is used directly).
- `hw_layout.c`: an explicit `n == 0` guard. A clean LTO release build showed `-Wstringop-overflow` on `items[n - 1]` (GCC can't prove `n >= 1`); the guard documents the invariant and removes the warning. Link-time warnings aren't covered by `-Werror`, which is why it hadn't failed the build.
- CI: `package-manager-cache: false` on both setup-node steps, and `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` for the workflow.
- RFCs 0001–0003 and plan §18 Phase 0 updated with the CI results.

**Checked and left alone:**
- Portable code in `core/` and `text/` has no OS-specific branches; it stays portable by design.
- GCC's LTO link runs serially ("serial compilation of N LTRANS jobs") even though CMake already passes `-flto=auto`; parallel LTO on Windows needs a `make` program on `PATH`. A clean release build takes ~130 s, so this was left as is.
- FreeType's own `-Wstringop-overflow` warning under LTO is upstream code.
- SDL3_ttf stays pinned only for the Spike C comparison; RFC 0003 schedules its removal when the spikes retire (Phase 2).

**Verified locally:** clean rebuilds of `win64-debug` and `win64-release` with no warnings from our code; `ctest` 2/2 on both; release Spike A and Spike C run; `pnpm check` passes.

You then asked to commit and push: `0419238`.

---

## Session 9: 2026-10-17 · Phase 1 starts (contract and compiler)
**You asked:** continue with Phase 1, and keep the log current because your session limit is close. This entry is updated after each milestone, so it shows exactly where work stopped.

**CI:** run 38997827583 (the cleanup commit): `ts` ✅ and `i18n` ✅ now pass (setup-node fix confirmed); `runtime-win` was still running when this entry was opened (it passed on the previous run).

**Phase 1 work order (plan §18):**
1. Verify `win64-asan` / `win64-fuzz` in MSYS2 CLANG64, or adopt the §14.3 fallbacks.
2. Lossless lexer and CST parser in `@himawari/core` with error recovery, plus round-trip tests.
3. Typed AST over the CST; line-ID assignment; validator with codes and quick fixes; formatter; structured `edit` API.
4. `bytecode.md` v1, compiler, `hwc check|fmt|build|disasm|l10n`; conformance harness (compile half).

**Progress:** _(updated below as milestones land)_

- ✅ **Milestone 1: lossless lexer + error-recovering CST parser** (`packages/core/src/syntax/`):
  - `lexer.ts`: every character lands in exactly one token (indent, whitespace, comments, `#line:` tags, newlines, BOM). It never throws; bad input becomes `Error` tokens + diagnostics.
  - `cst.ts`: node/token tree with `textOf`, `tokensOf`, `spanOf`, `walk`, `childNodes`, `childTokens`.
  - `parser.ts`: one statement per line, blocks by indentation, line-scoped recovery (one diagnostic per broken line, parsing continues). Covers every spec/language.md v0.2 statement: scene, define (raw signature for now), jump/call/return/end, if/elif/else (one `IfStmt`), menu with options (`once`, `if` conditions), say (speaker + attributes), narration, show/hide/move with attributes, `-attr`, `at`, and `with` transitions, bg/cg, music/sfx/ambient/voice with `fade(ms)`, stop, wait, shake/flash, `$` assignments with a Pratt expression parser (or < and < not < comparisons < + - < * / % < unary minus; `rand(n)` calls).
  - Comment lines right before a dedented statement attach to the outer block (so the `# gather` comment after a menu stays with the scene, not the menu).
  - `diagnostics.ts`: codes HW0001–HW0015 with params + English messages (localizable by code, plan §11.5).
  - Exported from `@himawari/core`.
- Tests (`parser.test.ts`, 26): byte-exact round-trip of the plan §5.1 sample, CRLF/BOM/tabs/garbage, **500 random inputs** (never throw, always round-trip), token offsets contiguous; the sample parses with **zero diagnostics**; structure of scenes, menus, if/elif/else, show clauses; precedence; every diagnostic HW0001–HW0015; recovery (3 broken lines → exactly 3 diagnostics, all 5 statements still parsed). `pnpm check`: 63 tests pass.
- ✅ **Milestone 2: memory-safety tooling verified on Windows** (MSYS2 CLANG64, clang 23.1.3, installed with pacman):
  - A deliberate heap overflow is caught by **ASan** (symbolized stack, `overflow.c:17`); a signed overflow is caught by **UBSan**. Added `-fno-sanitize-recover=undefined` so UBSan fails tests instead of only logging.
  - `win64-asan`: full build including SDL; `ctest` 2/2 pass under ASan + UBSan.
  - Clang found `-Wenum-float-conversion` in spikes B and C (enum constants in float math) that GCC never reported; fixed with explicit casts.
  - **libFuzzer:** clang rejects `-fsanitize=fuzzer` for MinGW targets, but the runtime ships. Workaround in `runtime/CMakeLists.txt`: manual `-fsanitize-coverage=inline-8bit-counters,pc-table,trace-cmp` + ASan, direct link of `libclang_rt.fuzzer-x86_64.a`, C++ link. `fuzz_utf8`: 3.3–4.6 M runs in ~20 s, no crashes.
  - New CI job `runtime-asan` (CLANG64): ASan/UBSan tests + 60 s fuzz. Plan §14.3/§14.6/§19, RESEARCH §15, CLAUDE.md updated. The §14.3 fallbacks are not needed.
- ✅ **Milestone 3: typed AST + text parser** (`packages/core/src/syntax/ast.ts`, `text.ts`):
  - `parseAst(source, file)` → `{ ast, diagnostics, cst }` in the plan §5.3 JSON shape: scenes and every statement kind with spans, line IDs, attribute add/remove, transitions, fades, expressions (`Int`, `Bool`, `Str`, `Var`, `Unary`, `Binary`, `Call`), if clauses, menu options with `once`, conditions, and **`fallsThrough`** (computed by `endsFlow`).
  - Text inside strings: escapes, `[var]`, wrapping tags (`b i color size speed shake rb`), standalone tags (`w nw alt`), ruby, nested tags, `{select var: k="…" other="…"}` (`other` required). New codes HW0016–HW0021. Diagnostic spans are file offsets.
  - Tests (`ast.test.ts`, 22). Syntax suite total: 48.
- ✅ **Milestone 4: formatter + line-ID assignment** (`packages/core/src/format.ts`, the engine behind `hwc fmt`):
  - Rebuilds indentation from block depth (4 spaces), normalizes token spacing (`fade(300)`, `wait(500)`, `-glasses`, `-1`, but `if (a)` and `not (b)` keep their space), never touches string contents or comments, collapses blank-line runs, drops blank lines right after a header, one blank line before each top-level scene unless a comment introduces it, LF + final newline, strips the BOM.
  - Adds `#line:` IDs to every dialogue line, narration line, and menu option without one; keeps existing IDs; reassigns duplicates on the later copy; avoids IDs taken elsewhere in the project (`takenIds`).
  - Refuses files with real syntax errors (returns them unchanged with the diagnostics), but fixes the two indentation errors itself (HW0001 tabs, HW0006 width).
  - **Bug found by the idempotence test and fixed:** a tag written after a comment (`# note #line:…`) was swallowed by the comment, so every run added a new ID. The lexer now reads `#line:xxxxxx` at the start of a comment as a `LineTag` followed by an ordinary comment, and the formatter writes the tag first: `"…"   #line:k3f9a1  # note`.
  - Tests (`format.test.ts`, 10): exact canonical output for a messy file, idempotence, meaning preserved (AST equal apart from spans and IDs), duplicate handling, project-wide ID avoidance, CRLF/BOM, refusal on errors. Core suite: 66 tests.
- Added `LineIndex` (offset ↔ 1-based line/col) and `renderDiagnostic` (plan §2.2 style: `error[HW0011]: …`, `┌─ file:line:col`, source line, carets).
- ⏸ **Session limit hit here** (the previous chat ended mid-milestone 5). Resumed in a new session: next was wiring `hwc check` and `hwc fmt`.
- ✅ **Milestone 5: `hwc check` and `hwc fmt` work** (`packages/cli/src/main.ts`):
  - `hwc check [paths]`: parses every `.hws` (default `./script`, else the current folder), prints diagnostics in the plan §2.2 style, exits 1 on errors.
  - `hwc fmt [--check] [paths]`: formats in place; reserves every existing line ID in the project first, so new IDs are unique across files; skips (and explains) files with syntax errors; `--check` exits 1 if anything needs formatting (for CI).
  - Tried end to end on a scratch project: friendly diagnostics, 3 IDs assigned, second run changes nothing, broken file skipped.
- **Checks at this point:** `pnpm check` 96 tests ✅; GCC `win64-debug` build + `ctest` ✅. (ASan/fuzz verified earlier in this session.)
- 📦 **Committed and pushed** at your request: `b055cd1` "Phase 1: sanitizers, parser, AST, formatter, hwc check/fmt".
- ✅ **Milestone 6: semantic validator** (`packages/core/src/project/`):
  - `parseAst` now also returns `refs`: every name used in the file with its exact span (scene declarations, scenes, speakers, characters, attributes with owner and `-`, positions, transitions with arg count, assets with channel, variables incl. assignments and `{select}` cases, functions). Drives the validator now and editor features later.
  - Diagnostics gained `help`, `note`, and `fixes` (one-click text edits). New codes HW0101–HW0111 (manifest/characters), HW0201–HW0217 (names, types, assets, duplicates), HW0310/0320/0321/0331 (flow). `renderDiagnostic` prints `= help:` / `= note:` lines.
  - `manifest.ts` (plain-language checks of `himawari.json`), `character.ts` (YAML frontmatter → presets and layer attributes, plus attributes found in `assets/<root>/<group>/<attr>.png`, ignoring blink/lip-flap frames), `suggest.ts` (edit distance), `check.ts` (`checkProject({manifest, characters, scripts, assets})` → per-file diagnostics; pure, no I/O).
  - P5 respected: missing assets are warnings ("a placeholder will be used"); attribute checks are skipped for characters without sprites.
  - Core now depends on `yaml` 2.9.1 (lockfile updated).
  - Tests (`check.test.ts`, 38): a realistic correct project yields **zero** diagnostics (no false positives); every code has a failing case; suggestions, quick-fix spans, and the "Hana's expressions" note are checked; P5 (no-sprite characters accept any attribute; asset checks skipped without an asset list; variable checks skipped without a manifest).
  - **Language bug found by the tests and fixed:** `"{select g: m="he" other="they"} waved."` ended the string at the first inner quote. The lexer now treats quotes inside a `{…}` tag as part of the tag (literal `{` is `\{`). Documented in `spec/language.md` §2.2; parser test added.
  - **`hwc check` is now a project check** (`packages/cli/src/project.ts`): finds the nearest `himawari.json` upward, loads `characters/*.md`, every `script/**/*.hws` (cross-file checks need all of them even when you pass one file), and the `assets/` listing. Outside a project it falls back to syntax-only with a note. Tried on a sample project built from the spec examples: HW0204 with "did you mean smile" and Hana's expression list, HW0201 "hanna" → "hana", HW0210 `[player_nmae]` → `player_name`, HW0208, and HW0320, all with exact carets.
- **Checks:** `pnpm check` **135 tests** ✅ (typecheck, lint, i18n).
- 📦 **Committed and pushed** at your request: `850419d` "Phase 1: semantic validator; hwc check validates projects".
- ✅ **Milestone 7: structured edit API** (`packages/core/src/edit.ts`, `applyEdits(source, ops, {takenIds, random})`):
  - Operations, all anchored on **line IDs** (never line numbers or diffs, plan §10.2): `insert_after`, `insert_before`, `append_to_scene`, `replace_text`, `set_attrs` (add/remove, keeps other attributes), `delete` (an option goes with its block; nested IDs are merged), `move` (keeps IDs, re-indents; refuses moving a line into its own block). A menu option's line ID addresses the whole option.
  - Only the touched lines change; comments and odd spacing elsewhere stay byte-for-byte. Inserted snippets are dedented and re-indented to the anchor's level.
  - `addLineIds(source, span, …)`: tags only the inserted lines (dialogue, narration, options), putting the tag before any comment. Existing lines are never re-tagged.
  - Batches are atomic: if any op fails (unknown ID, wrong line kind, bad name) or the result has more syntax errors than the input (e.g. emptying a menu, a broken snippet, an unescaped quote), nothing is applied and the original text is returned with a reason.
  - Tests (`edit.test.ts`, 19): exact output for every op, rejections, an atomic-batch failure, and a **property test of 400 random batches** (184 accepted, 216 rejected): accepted batches never have syntax errors, IDs stay unique, every dialogue/narration/option line keeps exactly one ID; rejected batches return the input unchanged.
- **Checks:** `pnpm check` **154 tests** ✅.
- 📦 **Committed and pushed** at your request: `24de0a5` "Phase 1: structured edit API anchored on line IDs". You then said "continue with the next phase"; Phase 1 isn't finished (the runtime needs bytecode to run anything), so work continued with the rest of Phase 1.
- ✅ **Milestone 8a: spec documents.**
  - `spec/grammar.ebnf`: the grammar the parser implements (layout rules, statements, option/menu structure, expression precedence, line tags, strings with tags, keyword list).
  - `spec/bytecode.md` v1.0: header (magic `HWB\x01`, major/minor, flags, size, CRC-32), section table, sections `STRS` `VARS` `CHAR` `SCNE` `LINE` `TEXT` `CODE` `DBUG` (reserved: `ASST`, `LOCx`, `XTNS`); **rich-text programs** (`RUN`/`VAR`/`OPEN`/`CLOSE`/`MARK`/`SELECT`), so the runtime never parses markup; the ISA (story ops SAY…END, MENU with condition values and `once`, expression ops PUSH…RAND); loader rules (validate once, then no bounds checks); compilation notes.
  - **Design change from plan §5.4:** instructions are word-aligned and variable-length (`opcode | argc << 8`, then `argc` words) instead of fixed-width, because `show` carries a variable number of attributes and `argc` makes bounds checks trivial. Recorded in the spec.
- ✅ **Milestone 8b: compiler + reader + disassembler** (`packages/core/src/bytecode/`):
  - `format.ts` (opcodes, text ops, module types, argc rules), `crc32.ts`, `writer.ts` (module → bytes, CRC over the whole file), `reader.ts` (bytes → module, applying every loader rule from spec §3: magic/version/size/CRC, section bounds and alignment, string/var/line/text/scene index ranges, UTF-8, text programs, argc per opcode, jump/menu/scene targets on op words; the reference for the Phase 2 C loader), `compiler.ts` (refuses projects with errors or without `himawari.json`; interns strings; scenes in name order; `if` → JZ/JMP chains; menus → conditions, MENU, JMP gather, option bodies; rich-text programs; DBUG pc → file:line), `disasm.ts`.
  - Also: `lineIdToNumber`/`numberToLineId` in `ids.ts`; characters now keep their `color`.
  - ✅ Tests (`compiler.test.ts`, 20): scene/var/char/line tables, rich text (tags, `[var]`, select, ruby), disassembly, END on fall-off, refusal on errors or no manifest; binary header, **round-trip read(write(m)) = m**, **deterministic bytes**, no-debug builds; the reader rejects bad magic, newer major, wrong size, a jump into the middle of an instruction, unknown opcodes, out-of-range string indices (each with a fixed CRC so only the structural check can catch it), checksum damage, and truncation.
  - Read the full disassembly of an if/elif/else + menu sample by hand: control flow is correct. Removed two redundant jumps (last `if` clause, last menu option).
  - **Decision: no TypeScript VM.** Plan §19's mitigation for compiler/VM drift is "one VM": only the C runtime executes bytecode. Phase 1 conformance covers the compile half (golden disassembly); execution transcripts come with the C VM in Phase 2.
- ✅ **Milestone 8c: conformance suite (compile half) + `hwc build` / `hwc disasm`.**
  - `tests/conformance/`: each case is a small project with `expected.disasm` (must compile to exactly this, with **no** diagnostics) or `expected.diagnostics` (exact codes and positions). Cases: `basic` (the plan §5.1 example completed into 6 scenes), `text` (every markup form, escapes, select, ruby, emoji), `errors` (9 deliberate mistakes, one diagnostic each). Regenerate with `UPDATE_CONFORMANCE=1` and review the diff.
  - **False positive found and fixed:** a scene ending in a menu with an always-available option that jumps/ends was warned as a dead end (HW0320). `endsFlow` now treats a menu as ending the flow when every option ends it and at least one option is unconditional and not `once`. The compiler, separately, always appends `END` unless the scene literally ends in jump/return/end, so a menu's gather point always lands inside the scene.
  - Type-error carets (HW0211) now point at the statement, not its indentation.
  - `hwc build [--release]` → `build/game.hwb` (2612 bytes with debug info, 2248 without, for the basic case); refuses with friendly diagnostics on errors. `hwc disasm <file.hwb>` validates and lists.
  - **Bug found by running the CLI on a real file, fixed:** `readHwb` used `bytes.slice()`, which for a Node `Buffer` is a view into a shared pool, so the CRC check zeroed the wrong memory and rejected every file read from disk (the in-memory tests couldn't see it). Now it makes a real copy; a regression test feeds it a non-zero-offset view and checks the surrounding memory is untouched.
- **Checks:** `pnpm check` **179 tests** ✅.
- 📦 **Committed and pushed** at your request: `bac5bc2` "Phase 1: bytecode spec, compiler, conformance, hwc build/disasm". You asked to finish Phase 1: tutorial and starter projects, `hwc l10n`, `ast.schema.json`.
- ✅ **Milestone 9a: templates + `hwc init`.**
  - `templates/adv/` (P1: playable before any art exists): `himawari.json`, `script/start.hws` (Aoi greets the player, a menu, a variable, an if/else), `characters/aoi.md` (no sprite yet → placeholder), `assets/README.md` (folder conventions; "Himawari never generates art"), `AGENTS.md` (project layer of the AI instructions, plan §10.8, with the no-media scope), `CLAUDE.md` (`@AGENTS.md`), `gitignore.txt` (→ `.gitignore`). `templates/blank/`: the minimum.
  - `hwc init <folder> [--template adv|blank] [--name] [--lang] [--id]` (`packages/cli/src/init.ts`): fills `{{name}}`/`{{id}}`/`{{lang}}` (JSON-escaped in .json), derives a valid id from the name, assigns fresh line IDs via the formatter, refuses non-empty folders.
  - **Decision: HW0213 (missing asset) is now `info`, not a warning.** Missing art is the normal state while writing (P5); a fresh project shouldn't greet users with warnings. A release export can be stricter later.
  - Tried end to end: `init` → `check` (one info note) → `build` (1512 bytes) for `adv`; `blank` is fully clean.
- ✅ **Milestone 9b: tutorial project** (`examples/tutorial/`, plain, no mascot, D16): a hub menu of `once` lessons (dialogue and narration, choices and gather points, variables and conditions, text formatting with ruby), each a `call`ed scene that returns, plus a finish scene. Kai (`characters/kai.md`, EN/JA names) demonstrates dialogue; no art yet, so placeholders. 28 line IDs from `hwc fmt`; compiles to 4848 bytes, 7 scenes.
  - `tests/projects.test.ts` (6 tests) enforces the Phase 1 exit criterion in CI: both templates (rendered by `hwc init`) and every example check with no errors or warnings, compile, and survive the validating reader; template IDs are unique; names with quotes stay valid JSON.
- ✅ **Milestone 9c: localization** (`packages/core/src/l10n/`, `packages/cli/src/l10n.ts`):
  - `table.ts`: `locales/<lang>.json` = `{ language, sourceLanguage, lines: [{ id, source, text, status, provenance }] }` in script order (an array, so diffs stay stable). `collectLines` (tagged dialogue/narration/options with scene and speaker context, text as written), `syncTable` (new → missing; changed source → needs-review, keeping the old translation; deleted → removed), **placeholder parity** (`parityProblems`: same `[vars]`, tags, and `{select}` variables; ruby exempt), `applyTranslations` (refuses entries that break parity; human imports → ok, AI → needs-review).
  - **Decision:** translations use the same markup as the source (translators see `[player_name]` and `{b}…{/b}`) rather than numbered `{0}` placeholders as plan §7 sketched; parity checking protects them, and XLIFF `<ph>`/`<pc>` inline codes can come later.
  - `exchange.ts`: CSV (RFC 4180, UTF-8 BOM, columns id/scene/speaker/source/translation/status) and XLIFF 2.0 (scene/speaker notes, segment state), both with importers.
  - `hwc check` now checks `locales/*.json` (HW0401 broken placeholders, HW0402 untranslated count, HW0403 stale source, HW0404 needs-review count, HW0405 orphaned entry, HW0406 unreadable table).
  - CLI: `hwc l10n sync` (every target language in `himawari.json`), `hwc l10n export --lang ja [--format csv|xliff]` (syncs first, writes `locales/ja.csv` or `.xlf`), `hwc l10n import <file> --lang ja [--ai]` (exit 1 if anything was refused). Refuses to run while scripts have errors.
  - Tests (`l10n.test.ts`, 18): line collection with context, sync add/change/remove, JSON round-trip, parity cases (reordering allowed, ruby exempt, select cases may differ per language), human vs AI imports, CSV quoting/BOM/multi-line cells, XLIFF escaping/notes/state, `hwc check` integration.
  - Tried on a copy of the tutorial: sync (28 lines) → CSV export → a translator's broken cell (dropped `[player_name]`) refused with the reason → correct cells imported as `ok` → XLIFF export. (A bug in my own test edit, not in the tool, hid one import at first: an unquoted CSV cell.)
  - Not yet: compiling translations into `.hwb` (`LOCx` sections) for in-game language switching; menu prompts have no line IDs, so they can't be translated yet (a small spec change for Phase 2).

- ✅ **Milestone 9d: `spec/ast.schema.json`** (JSON Schema 2020-12, `$id` `…/spec/ast/1.0.json`): the JSON form of `parseAst()`'s `ast` (scenes, all 15 statement kinds, expressions, text parts, menu options with `fallsThrough`, spans, line IDs). Closed objects (`additionalProperties: false`), so any AST change must update the schema. Tests in `tests/spec/schemas.test.ts` validate the real AST of every conformance case, example, and template, plus a script that uses every statement and expression kind, under Ajv strict mode.
- ✅ **Phase 1 complete.** `corepack pnpm check`: 212 tests, typecheck, lint, i18n all pass; runtime `win64-debug` builds and ctest passes.
- 📦 **Committed and pushed** at your request: `df0c634` "Phase 1: templates, hwc init, tutorial, localization, AST schema".

**Phase 1 exit (plan §18), final state:**
1. ✅ Project model + semantic validator (milestone 6). Known gaps: manifest/character diagnostics point at line 1; `if`/`elif` type errors point at the `if` line; no test yet that the TS manifest reader and `spec/manifest.schema.json` agree on shared fixtures.
2. ✅ Structured edit API (milestone 7). Later: cross-file rename refactors via the `refs` index.
3. ✅ Spec documents: `grammar.ebnf`, `bytecode.md`, `ast.schema.json`. Still open: the open questions in `spec/language.md` §5.
4. ✅ Bytecode, compiler, `hwc build`/`disasm`, conformance compile half (milestone 8).
5. ✅ Tutorial + starter templates (9a, 9b), `hwc l10n` (9c), `ast.schema.json` (9d). Friendly multi-error diagnostics with fixes and CST round-trip property tests were already met.

**Carried into Phase 2:** compile `locales/*.json` into `.hwb` (`LOCx` sections) for in-game language switching; give menu prompts line IDs so they can be translated; execution transcripts for the conformance suite once the C VM runs.

## Session 10: 2026-10-17 · Phase 2: the runtime MVP
**You asked:** continue with Phase 2 and keep logging after every milestone. This entry is updated after each one.

**Work order (plan §18 Phase 2):** bytecode additions the runtime needs → C loader → C VM → headless playtests + conformance transcripts → saves and rollback → windowed player (renderer, text, menus, audio, EN/JA) → dev tools → fuzzing and size.

- ✅ **Milestone 10a: bytecode additions before the freeze** (rfcs/0004, accepted under your Phase 2 go-ahead; `spec/bytecode.md` stays 1.0 because nothing has shipped against it):
  - `META` (required): title, id, resolution, languages (source first), named positions. The runtime never reads `himawari.json` (D01), so it needs these compiled in.
  - `LOCL` (optional): per target language, a TEXT index per line (or "untranslated" → source text) and a name per character. Built from `locales/*.json` by the compiler; the disassembler lists it.
  - **Menu prompts get line IDs** (`menu "Where to?":   #line:…`): formatter, AST (`promptLineId`, also in `ast.schema.json`), string tables (`kind: "prompt"`), compiler. The tutorial got 2 new IDs from `hwc fmt`.
  - Stricter loader rules (string operands, channels, effect kinds, `SELECT` case order so text evaluation can't loop) in the spec and the TS reader. RNG specified (PCG32), values-as-text specified, VM limits (256 stack, 64 frames).
  - Characters keep per-language names (`names`); `checkProject` returns the readable string tables (`locales`).
  - Conformance: compile cases now commit **`expected.hwb`** (byte-exact) for the C side; new cases `l10n` (JA table, character names, prompt ID) and `flow` (integer division/modulo edge cases, division by zero, `rand`, call/return, `once` options, a menu that runs out of options, string enums, a global variable).
  - `corepack pnpm check`: 217 tests pass.

- ✅ **Milestone 10b: the C loader** (`runtime/src/core/hw_hwb.{h,c}`, `hw_crc32.{h,c}`): a port of `reader.ts` that validates everything once (spec §3, including the new rules) and never aborts; refusals are one-line reasons. Lookups for scenes, variables, strings, locales; pc → scene and pc → file:line from `DBUG`.
  - `tests/test_hwb.c`: loads the committed conformance `.hwb` files, then damages copies **with the CRC recomputed** so each deeper rule is reached (unknown opcode, wrong argc, string index, jump into an instruction's arguments, scene entry, resolution, source language, truncated counts, misaligned and runaway section tables, LOCL range) and refuses every truncation of a real file.
- ✅ **Milestone 10c: the VM, text, and headless play** (`hw_vm.{h,c}`, `hw_play.{h,c}`; no SDL, no I/O):
  - **VM:** `hw_vm_next()` runs until an event (SAY, MENU, SHOW, HIDE, MOVE, BG, CG, AUDIO, STOP, WAIT, EFFECT, END, ERROR). It never renders; it keeps the display state (bg, cg, music, ambient, up to 16 characters with positions and attributes) so saves and rollback restore the screen without replaying. Wrapping arithmetic without undefined behavior (`INT_MIN / -1`, division by zero → 0 and counted), the PCG32 RNG, stack/frame limits and a 1,000,000-instruction "endless loop" guard as content errors. A **checkpoint hook** fires before each SAY/MENU (plan §8.9). Snapshots are fixed-size (`hw_vm_core` + variables + spent `once` options); restoring keeps global variables.
  - **Text:** evaluates TEXT programs into a sink (run/open/close/mark) with variables and selects resolved and tags always balanced; per-language line text and speaker names from `LOCL`, falling back to the source; canonical markup output for transcripts.
  - **Display rules decided (documented in the spec work for 10e):** `bg` clears a CG; `show` adds an absent character at `center`; attributes are a set of words. **Gap:** Ren'Py-style group replacement (`show hana casual` swapping only the outfit) needs layer groups in `CHAR`; until then the transcript shows `smile` and `annoyed` together. Tracked for the layered-sprite milestone.
  - **Headless** (`runtime/src/main.c`, `src/app/hw_headless.c`): `himawari --headless [game.hwb | --project DIR] --playtest [max_steps=N] [seed=N] [lang=xx] [--out report.json]` explores every menu choice depth-first, merging menu states it has already explored (hash of the snapshot), and reports endings reached vs. reachable `END`s, errors, line/option coverage, unseen line IDs, and divisions by zero; exit 1 when something is wrong. `--transcript "0 1 2"` prints every event.
  - **Conformance, execution half:** `runtime/tests/test_conformance.c` plays each case's committed `expected.hwb` with `playthroughs.txt` and compares with `expected.transcript` (`UPDATE_CONFORMANCE=1` to regenerate). The transcripts check integer semantics, `rand`, call/return, `once` exhaustion, a menu running out, gather points, Japanese text and names, and fallback to the source.
  - **Compiler fix found by the playtest:** a menu that can never run out of options no longer gets a `JMP` to its gather point, and a scene that can't fall off its end no longer gets a dead `END`, so playtests don't report phantom unreachable endings (spec §4 updated).
  - **The tutorial, headless:** 62 paths, 70 menu states, every ending reached, 21/21 lines seen, 7/7 options chosen.
  - ctest: utf8, hwb, conformance, layout, playtest_basic, playtest_flow pass.
  - **Fuzzing (Phase 2 exit item):** `fuzz_hwb` (loader + VM + text + snapshots + playtest; the harness fixes up the CRC so mutations reach the structural checks). The first run found a real bug within seconds: a top-level `return` counts as an ending but isn't an `END` instruction, so "total minus reached" underflowed and the report wrote out of bounds. Fixed (a separate unreached count) and the input kept as `runtime/fuzz/regressions/hwb/`, replayed by `ctest --preset win64-fuzz`. **The second run: 10 minutes, 2.05 million inputs, no crashes.** CI now replays regressions and fuzzes `.hwb` for 60 s per push.
- ✅ **Milestone 10d: saves and rollback** (`runtime/src/core/hw_save.{h,c}`, plan §8.9):
  - **Save format v1** (`HWSV`, CRC-checked): the game id, the build's CRC, the save screen info (time, play time, scene, preview, language), the RNG, the position, call frames, save-scope variables, spent `once` options, and the stage, all stored **by name and line ID**, not by index.
  - **Same build → exact restore. Another build → remapped:** the position by line ID; if that line was deleted, the newest of up to 16 earlier checkpoints that still exists (from the rollback history), then the scene's start (`HW_SAVE_FALLBACK`, so the game can tell the player). Call frames are anchored as "the k-th `call X` inside scene Y", which survives edits elsewhere. Variables by name and type (gone or retyped → default), `once` options by line ID, stage by asset and character names. Every pc from a save is checked against instruction starts before use, so a crafted save can't make the VM read out of bounds.
  - **Rollback history:** a ring of checkpoint snapshots (256 × ~2.5 KB ≈ 640 KB for the basic case, under the plan's 1 MB). `hw_rollback()` steps back one line and replays it.
  - `tests/test_save.c`: exact round trip inside a `call`, a simulated rebuild (same story after remapping), a deleted line (fallback to an earlier checkpoint), damaged and foreign saves refused without touching the VM, rollback replaying the previous line and stopping at the first, and the ring's eviction. A `fuzz_save` target feeds edited save files to both the exact and the remap paths.
- ✅ **Milestone 10e: the windowed player** (`runtime/src/app/`, plan §8.4–§8.11). `himawari [game.hwb] [--lang xx]` and `himawari --project DIR` (dev mode):
  - **Loop:** the VM runs until a line, menu, wait, or transition blocks; each event updates the shown stage. The scene is drawn into an offscreen texture every frame, so transitions blend the old and new scene: `fade` (through black), `dissolve`, `slide_*`, `wipe`; `rule` falls back to a dissolve until the GPU shader path from rfcs/0002 is wired in. `shake` and `flash` effects; `wait` (click skips).
  - **Text:** typewriter reveal with per-run `{speed}`, `{w=…}` pauses, `{nw}`, `{color}`, `{size}`, `{b}`, `{i}`, `{shake}`, ruby, kinsoku; FreeType through `src/app/hw_text_draw.{h,c}` (fallback chain: `assets/fonts/main.*`, Segoe UI, Yu Gothic, Meiryo; synthetic bold and italic; stroked outlines; paged atlas). `hw_layout` glyphs now carry their run index and the advance callback gets it.
  - **UI (default theme):** title screen, textbox with name plate (character color), menus (mouse, arrows, Enter, number keys), a quick bar (Rewind, History, Auto, Skip, Save, Load, Menu), system menu (save, load, history, language, text speed, title, quit), six save slots plus a quick slot (F6 / F9) with date, play time, and the line, history (backlog), quit confirmation, "The End", and an error card (dev: the message with file:line and "press F5"; release: a friendly message). UI strings in English and Japanese (`hw_ui_text.c`; they move into theme files with the theme loader).
  - **Rewind** (mouse wheel up, PageUp, the quick bar) through the rollback ring; **skip** (Ctrl or Tab) passes read lines only, any line in dev mode; **auto** mode; read lines and global variables persist in `global.dat`; atomic save writes (temp file + rename) under `SDL_GetPrefPath`. Language: settings, else the OS locale if the game offers it, else the source language; switching relayouts the current line.
  - **Placeholders (P5):** missing backgrounds and CGs become name-colored gradients with a label (dev mode adds the expected path); characters without `assets/sprites/<id>.png` become silhouettes in their color with name and attributes. Missing audio is silence (the dev overlay lists it). Images: PNG and BMP via `SDL_LoadSurface`; JPG/WebP report "not supported yet". Voice plays `voice/<lang>/<line id>` when it exists.
  - **Audio** (`hw_audio.c`, SDL3_mixer): music crossfades on two tracks, ambient, a 6-track SFX pool, voice; looping music is not restarted when the same track is requested again; after loads, rewinds, and reloads the music follows the restored state.
  - **Dev mode:** F3 overlay (scene, file:line, pc, stack, rewind depth, variables, missing audio, divisions by zero), **F5 reload in place** (re-reads the `.hwb`, carries the position over through a save so it remaps by line ID, keeps read lines and globals, flushes cached art).
  - **Smoke-test flags:** `--start`, `--frames N`, `--advance N`, `--screenshot out.png`; startup errors are logged and skip the modal box in unattended runs. Checked by screenshots: the tutorial's title, a menu, Kai's placeholder and name plate mid-typewriter, and the `l10n` case in Japanese (花, translated prompt and options, Japanese UI). CI now runs a player smoke test and uploads the screenshot.
  - Release build: 5.72 MB, system DLLs only. Headless output from the GUI-subsystem release exe now honors redirection (it only attaches to the parent console when stdout/stderr aren't already redirected).
  - **Gotcha found:** the PC clock went backwards between sessions, leaving object files with future timestamps, so ninja silently skipped recompiling changed sources. Fixed by deleting our future-dated outputs; worth remembering if a build ever "does nothing".
  - Save fuzzing: **10 minutes, 11.3 million inputs, no crashes** (`fuzz_save`, seeded with a real save); CI fuzzes saves for 60 s too.

- ✅ **Milestone 10f: the tutorial in Japanese** (Phase 2 exit: "the starter VN plays in EN and JA"): all 30 tutorial lines translated into `examples/tutorial/locales/ja.json`, imported as **AI-provided** (`provenance: ai`, `needs-review`, so `hwc check` notes 30 lines awaiting human review). Headless in Japanese: every ending, 21/21 lines, 7/7 options. Screenshots confirm Japanese line breaking, ruby (向日葵 / ひまわり), and bold, italic, and colored runs. Added `--pick K` (choose option K) to the smoke-test flags.
- ✅ **Milestone 10g: layered sprites** (rfcs/0005, `spec/bytecode.md` §2.9, plan §6):
  - Core: characters keep their full sprite definition (`sprite`: groups bottom to top with `always`/`multiple`/`blink`/`lipflap`, defaults, attributes from frontmatter and asset folders, presets, rules, anchor, scale; a folder-only group with one attribute is `always`, plan §6.2). The compiler emits a new optional **`SPRT`** section; the reader validates it; the disassembler lists it.
  - VM: **attribute merge** (presets set several groups; an attribute replaces its group's previous one unless the group is `multiple`; `-attr` keeps a default off until re-added). State entries are (attribute, group) pairs, because one word can live in several groups (eyes=smile, mouth=smile); the first version collapsed them, and the new transcripts caught it. `hw_sprite_layers()` resolves what is in effect (set attributes, else defaults, `always` groups, then rules; a rule's `when` matches an attribute or a preset whose attributes are all in effect). Saves store `[-]group/attr`.
  - Player: draws `<root>/<group>/<attr>.png` bottom to top at the anchor and scale; **auto-blink** (`_half`/`_closed`, every 2–6 s) and **lip-flap** (`_open`, while that character's line appears or their voice plays). Without art, the silhouette lists the attributes in effect.
  - `tests/test_sprite.c`: defaults on first show, presets sharing words across groups, replacement instead of piling up, the hide-when-preset rule turning on and off, removing a default, removing a set attribute. The `basic` transcript now shows `show hana (brows=neutral eyes=smile mouth=smile outfit=uniform)` → `annoyed` replacing group by group.
  - **`examples/layered/`**: Mio, a test character whose layers are drawn by `make-art.mjs` (procedural shapes, plan §1.5), and a short script showing a preset, an outfit change that keeps the expression, and the ribbon rule. Screenshots confirm all of it, including lip-flap mid-line.
  - The clock problem also hit `tsc -b` (stale `packages/*/dist`, so the CLI compiled without `SPRT`); cleaned and rebuilt. Example build outputs (`examples/*/build/`) are now gitignored.
  - Checks: `corepack pnpm check` 219 tests; runtime ctest 8/8.

- ✅ **Milestone 10h: rule wipes, warp, and size** (Phase 2's last items):
  - **Rule wipes on the GPU render state** (`src/app/hw_rulewipe.{h,c}`, rfcs/0002): the player now asks for the GPU renderer (D3D12 here), builds the committed DXIL/SPIR-V shader and a render state per mask (`assets/rules/<mask>.png`, or a procedural diagonal mask when it's missing, P5), and **self-tests at startup** (a 4×4 wipe must come out white; a silently failing pipeline leaves black) before using it. No GPU device, a failed self-test, or `--no-gpu` → the default renderer and a dissolve. Screenshots confirm both paths; text, sprites, and lip-flap look the same on the GPU renderer.
  - **Warp** (plan §8.11): `himawari --project DIR --warp scene|file:line` (`ch1.hws:49` matches `script/ch1.hws`). `hw_warp()` in core explores paths like a playtest until it reaches that line and starts from the checkpoint right before it, so the variables are ones a real path set (test: warping to `talk_rumor` arrives with `heard_rumor = true`, inside the call).
  - **Size** (plan §8.1, ≤ 4 MB): 5.72 MB → **2.38 MB** release `.exe`. SDL without camera, haptics, HIDAPI (gamepads still work through XInput and raw input; PlayStation/Switch-specific features need it back later), sensors, power, dialogs, tray, OpenGL/GLES, Vulkan, and the D3D9 and D3D12 2D renderers (the GPU renderer drives D3D12; D3D11 is the fallback); FreeType registers only TrueType, CFF, autofit, and smooth (`runtime/cmake/freetype/hw_ftmodule.h`; C sources only, because `windres` can't take the angle brackets); and the release preset builds with `-Os`, which alone saved about 2 MB over `-O2`. System DLLs only.
  - **ASan/UBSan** (CLANG64): clang found one error GCC allows (enum and float arithmetic in the procedural mask); fixed. All 8 tests pass under the sanitizers, and the windowed player ran clean under ASan on the layered example, the rule-wipe project, and the Japanese tutorial with warp.
- ✅ **Phase 2 complete** (plan §18, exit criteria):
  - **"The starter VN plays in EN and JA on Windows":** the tutorial, in both languages (screenshots); the `adv` template plays too (one language until a project adds `ja`).
  - **"Headless reaches every ending":** tutorial (62 paths, EN and JA), conformance cases, CI runs it.
  - **"Loaders survive 10 minutes of fuzzing":** `.hwb` (2.05 M inputs) and saves (11.3 M inputs), after the one bug the first run found.
  - Bytecode **1.0 is frozen** (`spec/bytecode.md`); later additions bump the minor version.
  - Not done in Phase 2 (none were in its list): JPG/WebP images (PNG/BMP only), side portraits and tinted views, `theme.json` themes (UI strings live in `hw_ui_text.c` for now), `.hwp` packs, gamepad remapping, measured cold-start/frame/memory budgets, Windows manifest via `windres` and crash minidumps (plan §8.13), backlog voice replay, save thumbnails.
  - Checks at the end: `corepack pnpm check` 219 tests; runtime ctest 8/8 (debug, release, ASan); spikes A and B OK on the trimmed SDL.
  - 📦 **Committed and pushed** at your request: `55a0744` "Phase 2: runtime MVP (himawari.exe)".

## Session 11: 2026-10-17 · Phase 3: MCP v1 and CLI polish
**You asked:** continue with Phase 3 and keep logging after every milestone. This entry is updated after each one.

**Work order (plan §18 Phase 3):** shared tool registry → himawari-mcp on spec 2026-07-28 → agent guide and llm-reference → resources and prompts → CLI polish (`hwc run`, `playtest`, `graph`, `report`, `build --release` packaging) → setup docs for Mode A → the M1 vertical slice.

- ✅ **Milestone 11a: the tool registry and the MCP server.**
  - **SDK check (plan §10.1 asked to verify at Phase 3):** TypeScript SDK **v2 is GA** (`@modelcontextprotocol/server` 2.3.1, "the stable release line, implementing the 2026-07-28 spec"), so himawari-mcp builds on v2 directly; no v1 adapter. Instructions go in the server's `instructions` option (the open question in plan §10.8); MRTR confirmations use the SDK's `inputRequired` / `acceptedContent`.
  - **`packages/tools` (`@himawari/tools`):** every tool defined once (Zod input, output schema, annotations, handler), in a fixed order (plan §10.1). **22 tools**: reads `project_info`, `list_scenes`, `read_scene` (hws or AST, with a `revision`), `search_dialogue` (with translations), `get_story_graph` (JSON or Mermaid), `list_characters`, `get_character` (frontmatter + bible + valid words), `list_variables` (reads/writes, unused), `list_assets` (missing = placeholders, unused), `validate`, `analyze`; writes `create_scene`, `update_scene`, `patch_scene` (the Core edit API, line-ID anchored), `upsert_character`, `set_preset`, `declare_variable`, `rename` (scene/character/variable, from the refs index), `set_translation` (parity-checked, lands `needs-review`); execs `playtest` (all paths or a transcript), `render_line` (a PNG from the real runtime via `--warp '#lineid' --text-speed 1000 --screenshot`), `build` (gated by `--allow-build`).
  - **Rules from plan §10.2, enforced in code:** the sandbox refuses paths outside the project; every write is validated against the **whole project** before touching disk and refused if it adds errors (the diagnostics come back so the model can fix them in one round); `dry_run` everywhere; `base_revision` optimistic concurrency on scene writes; patch anchors must belong to the scene; atomic writes; the runtime only with fixed arguments and no shell; **provenance** in `.himawari/provenance.json` (lines, translations, bibles; `ai`, or `ai-edited` when an AI rewrites a human line or a human changes an AI line, detected by text hash).
  - **Core additions:** a story-graph analyzer (`storyGraph`, `graphToMermaid`, `exprToString`: edges labeled with the menu choice and conditions on the way, reachability, endings); `SPEC_VERSIONS` now lists bytecode and AST.
  - **Runtime additions:** `--warp '#k3f9a1'` (a line ID; an option warps to its menu) and `--text-speed N` (a per-run override that's never saved).
  - **`packages/mcp` (`himawari-mcp`):** stdio server (`--project`, `--runtime`, `--allow-build`; logs to stderr), the agent guide as server instructions, **resources** `himawari://project/manifest`, `…/project/agents-md`, `…/agent-guide`, `…/spec/llm-reference`, `…/graph`, `…/scene/{id}`, `…/character/{id}`, and **prompts** `write_scene`, `continuity_check`, `branch_planner`, `translate_scene`, `sprite_direction`.
  - **`spec/agent-guide.md` v1** (layer 1: scope with no media generation, read before writing, line-ID edits, validate and dry-run, playtest after branching, translation markup, provenance, one-line explanations) and **`spec/llm-reference.md`** (the language on two pages, with the real diagnostic codes, checked against Core).
  - **Tests:** an end-to-end suite starts the real stdio server on a temp copy of a project and drives it with the official v2 client (tool list and order, instructions, read tools, `patch_scene` with revisions and provenance, refused writes and dry runs, variables, characters, presets, translations with a parity refusal, a rename across 5 files that triggers a real **MRTR elicitation round trip**, the sandbox, resources, prompts, `build` gating): 10 tests. Exec tools against the real runtime (all-paths playtest, transcript, a rendered PNG, a packaged `build/windows/<Game>/`): 4 tests, skipped when no runtime is built. `corepack pnpm check`: 233 tests.

- ✅ **Milestone 11b: CLI polish and Mode A setup** (plan §9.2, §10.7):
  - **`hwc run [--warp scene|file:line|#lineid] [--lang xx] [--no-gpu]`** compiles to `build/game.hwb` and starts the runtime in dev mode. **`hwc playtest [--choices "0 1"] [--seed N] [--lang xx] [--out report.json]`** plays every path headlessly (or one). **`hwc graph [--format mermaid|json]`**. **`hwc report ai-content [--format json]`**: a store-ready summary of AI-written script lines, translations, and bibles from `.himawari/provenance.json`, re-checked against the current text (human / AI / AI then edited), stating that no media was AI-generated. **`hwc build --release`** now also packages **`build/windows/<Game>/<Game>.exe`** (the runtime, `game.hwb`, `assets/`); the packaged layered example runs standalone (screenshot).
  - **`hwc ai setup [--write]`** prints the exact `claude mcp add himawari -- …` command and the Claude desktop config entry for this project and machine; `--write` creates the project's `.mcp.json` for Claude Code. The desktop app's own config is never edited.
  - **`docs/ai-setup.md`**: the Mode A guide (what the AI can and can't do, setup for Claude Code and the desktop app, options, how to work with `AGENTS.md`, the prompts).
  - The runtime is found via `$HIMAWARI_RUNTIME` or a checkout's `runtime/build/win64-release|debug` (`@himawari/tools` `findRuntime`); hwc now depends on `@himawari/tools`.
  - Tests: graph (Mermaid and JSON), report counts (human / AI / AI-edited by hash), `ai setup --write`. `corepack pnpm check`: 236 tests.

- ✅ **Milestone 11c: M1, the vertical slice** (`examples/festival-eve/`). **Inputs (by a person):** `PREMISE.md` (three routes, three endings), `AGENTS.md` (tone, rating, style rules), two character bibles with layered sprites (Hana, Ren) and procedurally drawn layers (`make-art.mjs`), Japanese added to `languages`. **The agent (this Claude session) through the real himawari-mcp over stdio, driven by the official client:** read the project and both bibles, declared 3 variables, wrote 7 scenes (opening, 3 routes, 3 endings) with `create_scene` (dry run first), `validate` → 0 errors, `playtest` → **5 paths, 3 of 3 endings, 35/35 lines, 7/7 choices**, translated all **45 lines into Japanese** (`set_translation`, `needs-review`), checked two lines with `render_line` (English and Japanese), and packaged **`build/windows/Festival Eve/Festival Eve.exe`** with `build`. The packaged exe plays standalone in Japanese (screenshot). `hwc report ai-content`: 45/45 script lines and 45 translations AI-written.
  - **The run found and fixed six real problems:** (1) a pre-existing project error (the not-yet-written entry scene) blocked every write; now only *new* errors block, matched by code, file, and message. (2) `create_scene` took one scene, so scenes that jump to each other could never be added; it now takes a whole chapter. (3) `render_line` reported success with a title-screen screenshot when the warp failed (the release runtime was stale, so it didn't know `#lineid` yet); a failed warp in an unattended run now exits with code 3 and the tool reports the error. (4) Unattended runtime runs (`--frames`, used by `render_line` and smoke tests) wrote the player's `global.dat`; they no longer write player data. (5) `--lang` was saved as the player's language; it's now for that run only, and `render_line` defaults to the source language. (6) Template and root `.gitignore` ignored all of `.himawari/`, but `provenance.json` must be committed (plan §16.4); now only `.himawari/cache/` is ignored. Also: `set_translation` no longer echoes table-wide progress notes on every call.
  - Regression tests for (1) and (2) in the MCP suite; a bad-line-ID `render_line` is refused.
- ✅ **Phase 3 complete** (plan §18): the registry, all tools on spec 2026-07-28, `llm-reference`, `agent-guide.md` v1, resources, prompts, `render_line`, setup docs and `hwc ai setup`, CLI polish, **M1**. **Deferred:** the tasks extension (TypeScript SDK v2.3.1 has no server-side helper for `io.modelcontextprotocol/tasks`, and its 2026-era codec strips the old `taskSupport` fields; long calls use the plan's synchronous fallback, and playtests take milliseconds today) and the optional MCP Apps UI (`ui://himawari/story-graph`, `scene-preview`). README updated (it still said Phase 0). `corepack pnpm check`: 241 tests. Not committed yet.

---

## Decision Register

| ID | Decision | Since | Status |
|---|---|---|---|
| D01 | Runtime loads compiled bytecode only, never source text | v0.1 | ✅ Active |
| D02 | Closed, Ren'Py-like script language `.hws` with stable `#line:` IDs | v0.1 / v0.2 | ✅ Active |
| D03 | Shared `@himawari/core` is the only parser/validator | v0.1 | ✅ Active |
| D04 | C11 + SDL 3.4 + SDL3_mixer 3.2 + FreeType + libunibreak | v0.2 | ✅ Active (Phase 0 spikes verify) |
| D05 | Headless-first build order; M1 vertical slice ≈ week 14 | v0.1 | ✅ Active |
| D06 | Layered sprites: groups, attributes, presets, blink, lip-flap, PSD/ORA import | v0.2 | ✅ Active |
| D07 | Multi-language games: line-ID string tables, CSV/XLIFF, font fallback | v0.2 | ✅ Active |
| D08 | Ease-of-use principles P1–P12 are acceptance criteria | v0.2 | ✅ Active |
| D09 | CodeMirror 6, lossless CST, Screenplay ↔ Script dual view | v0.2 | ✅ Active |
| D10 | MCP spec 2026-07-28, ID-anchored edits, proposals by default | v0.2 | ✅ Active |
| D11 | Licenses: runtime zlib, tooling MIT, specs CC-BY-4.0 | v0.2 | ✅ Active |
| D12 | Linux runtime as a Tier 1 export | v0.2 | ❌ Superseded by D13 |
| D13 | Games export for Windows x64 only. ~~The Linux runtime is internal (preview, playtests, CI)~~ | v0.3 | ✅ Active (Linux clause superseded by D21) |
| D14 | Two AI modes: external Claude app via MCP + built-in BYOK assistant panel | v0.3 | ✅ Active |
| D15 | Studio UI localized: English default, Japanese at v1.0 | v0.3 | ✅ Active |
| D16 | 16:9 templates only; plain tutorial without a mascot | v0.3 | ✅ Active |
| D17 | Develop on Linux plus a Windows test PC | v0.3 | ❌ Superseded by D19 |
| D18 | AI is a development assistant only. **No media generation** | v0.4 | ✅ Active |
| D19 | Develop on Windows 11 (MSYS2 UCRT64); UCRT. (The WSL2 part was dropped by D21) | v0.4 / v0.5 | ✅ Active |
| D20 | Hosting on the personal GitHub account `PastelSalt`, repo **`himawari-c`**, GitHub Pages (`pastelsalt.github.io/himawari-c`) for spec and docs | v0.4 / v0.5 | ✅ Active (repo created 2026-10-17) |
| D21 | **Windows only, for everything** (games, Studio, CLI, MCP, dev, CI). Linux is a future improvement (plan §18.9). Supersedes the internal Linux runtime in D13 and the WSL2 part of D19 | v0.5 | ✅ Active |
| D22 | Runtime build recipe: pinned tarballs + SHA-256, fully static, native MSYS2 UCRT64 (rfcs/0001) | v0.5 | ✅ Active |
| D23 | Transitions/effects via `SDL_GPURenderState` on the explicitly requested GPU renderer; HLSL → DXIL + SPIR-V with DXC, committed headers; crossfade fallback after a startup self-test (rfcs/0002) | v0.5 | ✅ Active |
| D24 | Text stack: FreeType directly + libunibreak + our layout with a strict JLREQ kinsoku table; no SDL3_ttf (rfcs/0003) | v0.5 | ✅ Active |
| D25 | Bytecode 1.0 gains `META`, `LOCL` (compiled translations), menu prompt line IDs, stricter loader rules, PCG32 (rfcs/0004), and `SPRT` layered sprites with attribute merge in the VM (rfcs/0005); **1.0 frozen** at the end of Phase 2 | session 10 | ✅ Active |
| D26 | Shipping runtime size: SDL subsystems a VN doesn't use are off (incl. HIDAPI and Vulkan), FreeType registers TrueType/CFF only, release builds use `-Os` + LTO → 2.38 MB | session 10 | ✅ Active |
| D27 | Saves store names and line IDs (not indices) and remap across script edits; call frames anchor on "k-th call to X in scene Y" | session 10 | ✅ Active |
| D28 | himawari-mcp builds on TypeScript SDK **v2** (GA, spec 2026-07-28); tools defined once in `@himawari/tools`; writes refused only for *new* errors; tasks extension deferred (synchronous fallback) | session 11 | ✅ Active |

Also: **D13** (games export for Windows x64 only) stays active; its "internal Linux runtime" clause is superseded by D21.

## Open Items (non-blocking)
- Who reviews the Japanese Studio UI strings before v1.0.
- GitHub Sponsors: yes or no.
- ~~Verify at Phase 1 start: ASan/UBSan and libFuzzer in MSYS2 CLANG64 (plan §14.3).~~ ✅ Verified in session 9 (`win64-asan`, `win64-fuzz`).

---

## Next Steps (after session 11)

1. **You:** decide whether to commit and push Phase 3 (everything after `55a0744`), then check CI on that push.
2. **Phase 4: Studio MVP**, on your go-ahead (plan §18): the Electron shell, Screenplay and Script views (CodeMirror 6), live preview, story graph, characters panel and sprite composer, the embedded MCP with a proposals panel (Mode A live sync), and the built-in assistant panel (Mode B).
3. Follow-ups any time: the MCP tasks extension once the SDK supports it; MCP Apps UI; runtime items from session 10 (JPG/WebP, side portraits, `theme.json`, `.hwp` packs, gamepad remapping, manifest/minidumps, budget measurements).
4. Human review of AI-written Japanese in `examples/tutorial` (30 lines) and `examples/festival-eve` (45 lines), both marked `needs-review`.
