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
| **Phase** | **Phase 1 in progress** (as of session 9): sanitizers verified; lexer, CST parser, AST, formatter, semantic validator, `hwc check`/`fmt` done. Next: edit API, spec docs, bytecode + compiler |
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
- **Checks:** `pnpm check` **135 tests** ✅ (typecheck, lint, i18n). Not committed yet (milestone 6 is new since `b055cd1`).

**Remaining Phase 1 work (plan §18), in order:**
1. ~~Project model + semantic validator~~ ✅ done (milestone 6). Known gaps to revisit: manifest/character diagnostics have no line positions yet (they point at line 1); `if`/`elif` type errors point at the `if` line; a test asserting the TS manifest reader and `spec/manifest.schema.json` agree on shared fixtures.
2. **Structured edit API** (`edit.ts`): insert_after(line_id), replace_text(line_id), set_attrs, delete, move, add_menu_option, all on the CST so comments and layout survive; property test: random edits keep the file parseable and round-trippable.
3. **Spec documents:** `spec/grammar.ebnf` (from the parser), `spec/ast.schema.json` (from `ast.ts` types), resolve the open questions in `spec/language.md` §5.
4. **Bytecode:** `spec/bytecode.md` v1 (header, sections, ISA from plan §5.4), compiler in Core, `hwc build` (writes `.hwb`) and `hwc disasm`; conformance harness (compile half) in `tests/conformance/`.
5. `hwc l10n` (string tables, CSV/XLIFF) can follow, or move to Phase 2 if time is short.
6. Phase 1 exit: tutorial and starter projects compile; broken inputs give friendly multi-error diagnostics with fixes; CST round-trip property tests pass (✅ already).

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

Also: **D13** (games export for Windows x64 only) stays active; its "internal Linux runtime" clause is superseded by D21.

## Open Items (non-blocking)
- Who reviews the Japanese Studio UI strings before v1.0.
- GitHub Sponsors: yes or no.
- Verify at Phase 1 start: ASan/UBSan and libFuzzer in MSYS2 CLANG64 (plan §14.3).

---

## Next Steps (after session 9)

1. ~~CI: confirm `ts` and `i18n` pass~~ ✅ confirmed in session 9.
2. **Phase 1 continues** with the "Remaining Phase 1 work" list at the end of session 9 (edit API → spec docs → bytecode + compiler).
3. **You:** milestone 6 (validator) is not committed yet; `b055cd1` has everything before it.
