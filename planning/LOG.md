# Himawari — Development Log

> A running record of how the project was planned and why each decision was made. Newest entries are at the **bottom**. Add a new entry for every work session.
>
> **Files** (in `planning/` since session 24): [DETAILED_PLAN.md](DETAILED_PLAN.md) (the plan, **v0.7**) · [FINALIZATION.md](FINALIZATION.md) (Phase 8's finalization half, **v0.5**) · [BREAK_IT.md](BREAK_IT.md) (breaking it on purpose, with the findings log) · [RESEARCH.md](RESEARCH.md) (evidence, **v1.3**) · [CLAUDE.md](../CLAUDE.md) (context for AI coding sessions) · [rfcs/](../rfcs/) (accepted decisions) · [tests/README.md](../tests/README.md) (where every test lives) · this file.

---

## Project at a Glance (as of 2026-10-21)

| | |
|---|---|
| **What** | Himawari: an open-source, AI-assisted visual novel engine for other developers |
| **Parts** | `@himawari/core` (TS compiler and validator) · Himawari Studio (Electron authoring app) · `himawari-mcp` (MCP server) · **Himawari-C** (C11 + SDL 3.4 runtime) |
| **Platform** | **Windows only, for everything** (games, Studio, tooling, dev, CI). Linux is a future improvement |
| **Game output** | Windows x64 only |
| **Studio** | Windows, UI in English (default) + Japanese |
| **AI role** | Development assistant only. **No media generation** |
| **Phase 1** | **Done** (session 9): sanitizers; lexer, CST parser, AST + `ast.schema.json`, formatter, validator, edit API, bytecode spec + compiler, conformance (compile half), localization, templates + tutorial, `hwc check/fmt/build/disasm/init/l10n` |
| **Phase 2** | **Done** (session 10): `himawari.exe` (loader, VM, saves, rollback, headless playtests, windowed player with layered sprites, rule wipes, EN/JA), bytecode 1.0 frozen, 2.38 MB release |
| **Phase 3** | **Done** (session 11): `@himawari/tools` (22 tools) + `himawari-mcp` (spec 2026-07-28, SDK v2), agent guide, `hwc run/playtest/graph/report/ai setup`, `build --release` packaging; **M1 reached** (`examples/festival-eve`) |
| **Phase 4** | **Built** (session 13): Himawari Studio (Electron), docked preview, Screenplay and Script views, panels, AI proposals, Mode A live sync, Mode B. M2 hallway test pending |
| **Phase 5** | **Done** (session 14): macros, extension statements, NVL, themes (bytecode 1.1); config, accessibility, gamepad, gallery, music room; `.hwp` packs and patches; JPEG/WebP; crash reports; budgets met; `examples/sunflower-demo` in English, Japanese, and Simplified Chinese; golden images |
| **Phase 6** | **Built** (session 15): theme 2.0 (layout, shapes, presets, rfcs/0010), a data-driven runtime UI, Studio's **UI Designer**, and Studio's light/dark/system themes. Hallway test pending. Next: Phase 7 AI depth and polish, Phase 8 launch |
| **Phase 7** | **Built** (session 17): review notes, continuity hints, the glossary and "Translate with AI", recipes, MCP Apps views (experimental), the eval suite |
| **Phase 8** | **In progress** (sessions 18–24): the finalization plan and most of it built (quiet AI, one language by default, local history and the Recycle Bin, forms for every stage direction, `himawari-tools.exe`, branded exports, writer hints, the usual Windows installer, single-file games; the runtime's idle redraw, software fallback, and autosave); the launch documents; the rename to Moeko Works (session 20); breaking it on purpose (sessions 21–23: 14 findings, 13 fixed). Next: usability rounds, then the launch |
| **Testing** | `corepack pnpm check` (532 tests), Studio e2e and the Studio monkey, ctest (debug, ASan, fuzz), seven fuzz targets, golden images, generated stories; the map is [tests/README.md](../tests/README.md) |
| **Owner** | Moeko Works (GitHub: `PastelSalt`) |
| **Repo** | **https://github.com/PastelSalt/himawari-c** (public) |

---

## Session 1: 2026-10-15 · Initial concept → plan v0.1
**Machine:** Linux (Ubuntu-based), project folder `~/Desktop/Moesoft/himawari-c` (empty; the brand was later renamed to Moeko Works on 2026-10-21).

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
- `gh` 2.46.0, logged in as **`PastelSalt`** ("Moesoft: Moeko Software and Technologies" then; renamed to Moeko Works on 2026-10-21). Token scopes: `repo`, `workflow`, `gist`, `read:org`.
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
**Machine:** Windows 11 Pro, project folder `C:\Users\Myaako\Documents\Moesoft\himawari-c` (kept instead of `C:\dev\himawari`; now `C:\Users\Myaako\Documents\MoekoWorks\himawari-c` after the rename to Moeko Works on 2026-10-21).

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
- ✅ **Phase 3 complete** (plan §18): the registry, all tools on spec 2026-07-28, `llm-reference`, `agent-guide.md` v1, resources, prompts, `render_line`, setup docs and `hwc ai setup`, CLI polish, **M1**. **Deferred:** the tasks extension (TypeScript SDK v2.3.1 has no server-side helper for `io.modelcontextprotocol/tasks`, and its 2026-era codec strips the old `taskSupport` fields; long calls use the plan's synchronous fallback, and playtests take milliseconds today) and the optional MCP Apps UI (`ui://himawari/story-graph`, `scene-preview`). README updated (it still said Phase 0). `corepack pnpm check`: 241 tests.
- 📦 **Committed and pushed** at your request: `694aef7` "Phase 3: MCP v1 and CLI polish (M1 reached)". While staging, a cache file showed up: the root `.gitignore` pattern `.himawari/cache/` only matched at the repo root (a slash in the middle anchors it); now `**/.himawari/cache/`.

---

## Session 12: 2026-10-18 · Cleanup audit of Phases 0–3
**You asked:** double-check and clean up any mess left in the previous phases before Phase 4.

- **CI:** the run on `a8d7a17` (`39033367836`) is green in every job, ASan/UBSan and fuzzing included. Its only annotation was the Node 20 deprecation for `actions/upload-artifact@v4`; now `@v7` (same zip-by-default behavior).
- **Docs that had fallen behind the code:**
  - `spec/language.md`: the status line, and §5 rewritten from "open questions" into the decisions made: grammar in `grammar.ebnf`; `return` with no caller is warning `HW0310` and ends the story; int overflow wraps in every build; speaker attributes persist; macros get their own RFC in Phase 5. The int type note and the `return` row now say the same. `spec/bytecode.md` states that overflow wraps in every build.
  - `DETAILED_PLAN.md`: the status line says Phases 0–3 are done; §5.4 (the pre-spec bytecode outline: fixed-width ISA, per-language `LOCx`, separate `MUSIC`/`SFX`/`VOICE` ops) gets an "as built" note pointing to `spec/bytecode.md` 1.0.
  - RFC 0001: the asan/fuzz and size checkboxes are ticked (verified in sessions 9 and 10). RFC 0002: the self-test points to `runtime/src/app/hw_rulewipe.c`, plus a note that Vulkan is off on Windows (D26).
  - `runtime/CMakeLists.txt`: the `HW_SANITIZE`/`HW_FUZZ` descriptions no longer say "to verify".
  - New `spec/README.md`: an index of the spec documents and their versions.
- **TypeScript:** the CLI had its own project loader that duplicated `@himawari/tools` `loadInput` (and an unused `scripts` parameter); `loadProject` now delegates to it, so the CLI, MCP, and the coming Studio read projects the same way. Removed `stmtSource` from Core (never called). An export scan found no other dead values; the remaining unreferenced exports are public API types.
- **Runtime:** removed an empty `if` block left in `render()` and two UI strings nothing shows (`UI_QUICK_SAVE`/`UI_QUICK_LOAD`: quick save and load are keys only; the slot list uses `UI_QUICK_SLOT`). Functions declared in headers but only used in their own module (`hw_rng_*`, `hw_history_pop`, `hw_fonts_*`, `hw_write_file`) stay public.
- **Checks:** `corepack pnpm check` (typecheck, lint, 241 tests, i18n) passes; runtime `win64-debug` and `win64-release` build with all 8 ctest tests passing. ASan was not rerun locally (the C changes are removals only); CI runs it on the next push.

---

## Session 13: 2026-10-18 · Phase 4: Studio MVP
**You asked:** continue with Phase 4. Committed and pushed first: the cleanup audit (`a69cbe4`; CI green in all four jobs). This entry is updated after each milestone.

**Work order (plan §18 Phase 4):** the preview link in the runtime → the Electron shell and first-run flow → Screenplay and Script views → live preview with play-as-you-write → story graph, characters, sprite composer and PSD/ORA import, assets and placeholders, variables, localization, build → proposals and Mode A live sync → the built-in assistant (Mode B) → search, undo, packaging, e2e.

- ✅ **Milestone 13a: the shell and the core loop** (write → autosave → rebuild → the docked game reloads in place).
  - **Stack check (plan §11.1):** Electron **44.8.0** (pinned one patch behind 44.9.0: pnpm's release-age gate flagged the day-old release and auto-added an exclusion, which I removed rather than bypass the gate), electron-vite 6 (Vite 8), React 19.3, react-intl 12, Zustand 5, CodeMirror 6, React Flow 12 + elkjs, ag-psd, fflate, Noto Sans + Noto Sans JP via Fontsource, Playwright 1.64 for Electron e2e. Everything is bundled (main and preload included), so the packaged app ships no `node_modules`. pnpm blocks install scripts; `pnpm-workspace.yaml` says no to `electron-winstaller` (Squirrel isn't used; Electron fetches its binary on first use).
  - **Runtime: the Studio debug pipe** (`--link`, plan §4.1). JSON lines on stdin (`bounds`, `reload`, `warp`, `restart`, `next_menu`, `advance`, `lang`, `quit`) and stdout (`ready`, `state` with the current line ID / waiting / at a choice / error, `reloaded` exact|remapped|fallback|failed, `warp`). A small JSON reader in `core/hw_json.c` (pure, unit-tested with malformed input). Closing stdin quits the runtime, so a preview never outlives Studio. **Docking:** `--parent-window HWND` makes the SDL window a borderless child of Studio's window (the approach Unity uses with `-parentHWND`); Studio sends the pane's bounds in device pixels. `--warp` and the pipe share one `warp_to()`; skip-to-next-choice plays on without sound effects or voices.
  - **Studio main process:** the security checklist (contextIsolation, sandbox, no nodeIntegration, a strict CSP sent as a header, permissions denied, navigation and new windows blocked, the renderer served from `app://studio` instead of `file://`, every IPC call checked for its sender and arguments). One typed bridge (`src/shared/api.ts`) that main implements and the preload exposes. The project service autosaves text files through the sandboxed `ProjectFs`, rebuilds `build/game.hwb` 60 ms after the last save, and watches for outside changes (told apart from its own writes by content hash). Project assets reach the renderer through a `himawari-asset://` protocol limited to `assets/`.
  - **Renderer:** Welcome (New Project, Open, the tutorial, samples, recent projects, the UI language), the New Project wizard (name and folder, template, languages, §2.1), the workspace (activity bar, explorer, center, preview and assistant column, Problems / AI Proposals / Output / History, status bar), the **Script view** (CodeMirror 6: highlighting from Core's lexer; **line IDs hidden and atomic**, Enter never splits a line from its ID, copy/paste never carries one; new lines get IDs on autosave; ▶ gutter and Ctrl+Enter play from a line; the preview's line highlighted green/yellow; Core diagnostics in the UI language with one-click fixes; completion, hover, F12/Ctrl+click definitions, F2 rename), and the **Screenplay view** (a row per statement; speaker dropdown and expression chips; inline text with Enter for the next line and Ctrl+D to duplicate; stage directions as compact rows that open as text; choices with options; drag to reorder; add bar). Every Screenplay edit rewrites only its own lines.
  - **Core:** `ids.ts` uses Web Crypto instead of `node:crypto`, so Core runs in the renderer as-is. **Renames moved into Core** (`planRename`, `splitFrontmatter`): Studio's F2 and the MCP `rename` tool share one implementation. **Templates moved into `@himawari/tools`** (`init.ts`): `hwc init` and the wizard share it.
  - **Localization:** 246 messages in EN and JA. The 48 diagnostics come from Core's catalog (`scripts/sync-diagnostic-messages.mjs` converts them to ICU), with hand-written Japanese. The i18n check now also fails when the source uses a message key that isn't in `en.json`. A pseudo-locale (`en-XA`: accents and ~30% padding) is offered in development builds. Some diagnostic parameters are English phrases (`{reason}`, `{expected}`), so a Japanese message can still contain an English fragment.
  - **Verified on this PC** (Playwright drives Studio; screenshots capture only Studio's own window): the tutorial opens, the game docks into the preview pane, the current line is highlighted in the Screenplay, and typing a new line autosaves, rebuilds in 7 ms, and the game shows the new text on the same line. One automated screenshot early on grabbed the screen region instead of the window and caught another app in front; it was deleted, and captures now use `PrintWindow`, while test runs open Studio without taking focus.
  - `corepack pnpm check` now typechecks Studio (main and renderer) too: 250 tests, lint, i18n all pass.

- ✅ **Milestone 13b: the project panels** (plan §11.3).
  - **Story graph:** React Flow with an ELK layered layout, conditional edges dashed and calls dotted, choice labels on the edges, entry/ending/unreachable badges, the scene being played outlined; click a scene to open it.
  - **Characters:** a form for the frontmatter (names per language, color; edits go through the `yaml` Document API so comments survive), the bible editor, F2-style ID rename, new characters (silhouette in their color until there's art, P5).
  - **Sprite composer** (§6.4): the composite drawn by **Core's new `applySpriteWords`/`spriteLayers`**, a TypeScript port of the runtime's attribute merge (rfcs/0005), unit-tested on the plan's Hana example. Toggle attributes, apply and save presets, delete presets, test blinking and lip-flap, drag a preset into the script as a `show` line. **PSD/ORA import** (ag-psd; OpenRaster unzipped with fflate) with a **mapping preview**: rename groups and attributes, set always/multiple/default, untick layers, then it writes full-canvas PNG layers to `assets/sprites/<id>/<group>/<attr>.png` and the `sprite:` block. Not yet tried on a real artist's PSD.
  - **Assets:** thumbnails, audio preview, unused and missing flags (from Core's refs), drag into the Script view, add files, and the **procedural placeholder maker** (no AI, §1.5): labeled cards for backgrounds and event pictures, and a layered placeholder character (body, eyes with blink frames, mouths with lip-flap frames) that the composer and the runtime both use.
  - **Variables:** declarations with plain-language types, where each is read and written (click to jump), add, rename (Core `planRename`), delete when unused.
  - **Localization:** lines × language with status filters (not translated, needs review, source changed), cell editing refused when placeholders don't match (Core `parityProblems`), mark reviewed, sync, CSV/XLIFF export and import, add a language, ▶ plays a line in that language.
  - **Build:** Windows export as a folder or a zip, shown in Explorer.
  - **Settings:** UI language, the Claude app setup (Mode A, wired in 13e), the API key and model choices (Mode B, 13f), per-tool auto-accept (off by default).
  - **Search** (double Shift or Ctrl+P, P11): scenes, every dialogue line and option, characters, assets, and commands, fuzzy-ranked.
  - The i18n check now also catches message ids in new namespaces; 432 messages in EN and JA. Checked on screen with the Festival Eve sample (graph, Hana's composite, the Japanese table with its AI badges, the missing-art list).
  - `corepack pnpm check`: 254 tests, lint, i18n pass.

- ✅ **Milestone 13c: AI proposals, Mode A live sync, and the built-in assistant (Mode B)** (plan §4.2, §10.7–§10.9, §11.4).
  - **One gate for every AI write.** `ToolContext.propose` (in `@himawari/tools`): when set, a validated write isn't written; it becomes a proposal and the tool waits for the person's decision. Results the AI sees: *accepted*, *rejected* with the reason they typed, or *pending* after 90 s ("don't send it again"). Write tools gained an optional **`rationale`** argument: the AI's one-line explanation is the proposal's headline (P12). The agent guide is now **1.1** (proposals and `rationale`).
  - **Studio's proposal queue:** diff per file (line IDs hidden), the AI's rationale, warnings, Accept / Reject with an optional reason; a new proposal brings the AI Proposals tab forward. If the file changed since the AI read it, the change is merged by context; if the same lines changed, nothing is written and the AI is told to read the file again (your edits are never overwritten). Accepted changes enter the unified history as the AI's. Per-tool auto-accept in Settings, off by default.
  - **Mode A live sync** (plan §4.2): Studio serves the same himawari-mcp server over HTTP on 127.0.0.1 (`himawari-mcp/http`: random bearer token, Host-header check, SDK v2 `createMcpHandler`) and writes `.himawari/session.json`; the stdio himawari-mcp that Claude Code or the desktop app runs finds it and forwards **write** tools there (reads, dry runs, and exec tools stay local; a stale file or an unreachable Studio falls back to writing directly). In Studio the proposal review is the confirmation, so wide-impact renames don't ask twice. Settings shows the `claude mcp add` command and the desktop config, and can write `.mcp.json` after you confirm. **Verified in the real Studio:** a Claude-app stand-in sent `patch_scene`, the proposal appeared with its diff, Accept wrote the file, the Screenplay and the docked game updated, and the AI got "Accepted in Studio". Tests: 6 live-sync cases (accept with rationale, reject with reason, pending, local dry runs, stale session, no token → 401).
  - **Mode B, the built-in assistant** (Anthropic TypeScript SDK 0.135, checked against the current Claude API docs): the tool runner streaming, the **same registry as `betaZodTool` tools** (minus `build`, which stays the Build panel's), `eager_input_streaming`, adaptive thinking with summaries shown as "Working…", effort from Settings (quality → `high`, speed → `low`), **server-side refusal fallbacks** (`fallbacks: "default"`) on Opus 5.5 and Sonnet 5.5, refusal and truncated-tool-input stop reasons checked before tools run. Models: Claude Opus 5.5 (default), Sonnet 5.5, Haiku 5.5. **Prompt caching** as planned: tools (fixed order) → engine guide → llm-reference → AGENTS.md and the character bibles (one breakpoint), conversation cached by the top-level breakpoint; open file, selection, @mentions, and the reply language only in the newest user turn. **Cost meter** per answer and per session from the usage fields (cache reads and writes priced). The **key** is encrypted with `safeStorage` and used only in main. @scene/@character mentions, "Ask AI about this" from a Script view selection, Stop, New chat. Writes go through the same proposal gate as Mode A.
  - **Not verified live:** no Anthropic API key on this PC, so the assistant hasn't talked to the API here; the plan's prompt-cache check (`assistant-core.test.ts`: the second turn must read the cache) runs when `ANTHROPIC_API_KEY` is set and is skipped otherwise. The agent loop runs in Studio's main process rather than a utility process (it's network-bound; tool runs take milliseconds); revisit if the UI ever stutters during long turns. Server-side compaction for very long chats isn't wired; New chat starts fresh.
  - Fix found on the way: bundled code couldn't find `spec/agent-guide.md` relative to itself; Studio now sets `HIMAWARI_SPEC_DIR` to its own copy.
  - `corepack pnpm check`: 264 tests (+1 skipped live test), lint, i18n (453 messages) pass.

- ✅ **Milestone 13d: packaging, end-to-end tests, CI, docs.**
  - **Windows packages** (plan §14.5): `corepack pnpm --filter @himawari/studio package` builds, stages, and packs an **NSIS installer** and a **portable exe** (`Himawari-Studio-Setup-0.4.0.exe` / `…-portable.exe`, about 128 MB each). Shipped beside the app: the release runtime, templates, the tutorial and both samples, `spec/`, and himawari-mcp bundled into one `himawari-mcp.mjs` (what a Claude app runs with `node`). **Electron fuses** set (no run-as-Node, no `NODE_OPTIONS`/`--inspect`, the app only from its integrity-checked asar, no extra `file://` privileges). electron-builder's pnpm module collector fails on this workspace; Studio ships no `node_modules`, so a `beforeBuild` hook tells it to skip them. Not code-signed (planned before v1.0); default Electron icon. **The packaged app was run here**: Welcome found the bundled tutorial and runtime, and opening the tutorial (via Windows UI Automation, since the fuses rightly block Playwright's inspector) played it docked in the preview.
  - **E2E** (plan §14.6 `e2e` + `ux-budget`): `packages/studio/e2e/studio.e2e.ts` drives the built app with Playwright: New Project through the wizard → the first line plays (**1.5 s**, budget 60 s), an edit reaches the running game (**0.32 s**, budget 1 s), export a Windows game folder, switch the UI to Japanese. Test-only hooks exist only with `HIMAWARI_STUDIO_TEST_HOME` (a throwaway home; the folder picker answers with a test path) or in development builds (the store on `window.__studio`).
  - **CI:** a new `studio` job (after `runtime-win`, reusing its release runtime): e2e, then the installers uploaded as an artifact. `runtime-asan` fuzzes the debug-pipe JSON reader too (`fuzz_json`; 700 000 runs locally, no findings). The `ts` job passes the `ANTHROPIC_API_KEY` secret to the tests, so the assistant's prompt-cache check runs once you add that secret. Locally: ASan/UBSan, debug, and release runtime builds pass all 9 ctest tests.
  - **UI languages checked on screen:** Japanese (workspace, Characters, diagnostics rendered in Japanese) and the pseudo-locale (every piece of chrome accented and padded; only project content stays plain, so nothing is hard-coded; no truncation at +30%). Not automated as a screenshot diff yet (plan §14.6 `i18n`).
  - **Docs:** `spec/debug-protocol.md` (version 1) and **RFC 0006** (Studio's docked preview, the debug protocol, the proposal gate, Mode A live sync), `spec/agent-guide.md` 1.1, `docs/ai-setup.md` (proposals while Studio is open), README, CLAUDE.md, and the plan's status lines.
- ✅ **Phase 4 built** (plan §18): shell and first-run flow, Explorer, Screenplay and Script views, live preview with play-as-you-write and two-way line sync, story graph, characters, sprite composer with PSD/ORA import, assets with the placeholder maker, variables, localization table, build panel, AI Proposals with Mode A live sync, unified and selective history, double-Shift search, the Mode B assistant, EN + JA UI with the pseudo-locale, Windows packages, export verified. **Not done or not verified:** the **M2 hallway test** (a non-programmer, in either UI language, with an AI contributing through both modes) needs a person; Mode B has not talked to the API on this PC (no key); PSD/ORA import has only been exercised by code, not with a real artist's file; the Screenplay view has no block palette or multi-select yet (both "later" in §11.3); the agent loop runs in the main process, not a utility process.


## Session 14: 2026-10-18 · Phase 5: runtime feature-complete
**You asked:** continue with Phase 5. Phase 4 was committed and pushed first (`1a9d326`, CI green). This entry is updated after each milestone.

**Work order (plan §18 Phase 5):** the language and bytecode contract in Core (macros, extension statements, `textbox`, themes; bytecode 1.1) → the runtime VM (NVL, themes, the extension registry, saves v2) → UI screens and accessibility (config, first-launch accessibility prompt, gallery, music room, backlog voice replay, save thumbnails, gamepad and remapping) → `.hwp` packs with patches, JPG/WebP → the Windows manifest, crash dumps, performance budgets → `sunflower-demo` in 3 languages, golden images, docs.

- ✅ **Milestone 14a: the contract in Core** (rfcs/0007, rfcs/0008).
  - **Macros** (`define statement enter(who: character, side: position = left):`): typed parameters, whole-token substitution, expanded by the checker (`ProjectCheck.expanded`) for flow checks, reachability, the story graph, and the compiler, while the AST and every editor keep the call as written. Arguments are checked as real references at the argument (`hanna` → "did you mean hana?" with a quick fix); problems inside a body are reported at the call with a "from a macro" note. No dialogue, narration, or menus in a body (each line needs its own ID); no recursion.
  - **Extension statements:** `extensions/<name>.schema.json` declares a statement (typed parameters, defaults, word enums, `blocking`, at most one translatable `text`); calls use the macro syntax. A call with a quoted text gets a line ID (formatter, `addLineIds`, Studio autosave), appears in translation tables with kind `call`, and can be edited by line ID.
  - **`textbox adv|nvl|clear|hide|show`** (new keyword `textbox`) and **themes** (`theme/theme.json`: colors, textbox with nine-slice, text size, fonts, title and menu art and music, default transition time, per-language UI strings; unknown settings are warnings with suggestions).
  - **Bytecode 1.1:** `TEXTBOX`, `XCALL`, `XTNS`, `THEM`, and a `LINE` call flag; the reader validates all of it. Writers emit the **lowest minor that holds the module**, so every existing conformance file is byte-identical and games without the new features still load in 1.0 players. A new conformance case `extend` covers all of it (macro, NVL, two extensions, a theme, Japanese).
  - Specs: language 0.3.0-draft (§2.6–§2.9), grammar, bytecode 1.1, AST schema 1.1, new `extension.schema.json` and `theme.schema.json` (checked against Core in tests), llm-reference. `project_info` lists macro and extension signatures for AI tools. CLI, MCP tools, and Studio load `extensions/` and `theme/`.
  - **Diagnostics added:** HW0120 (bad extension schema), HW0130/HW0131 (theme), HW0220–HW0230 (calls and macros).
  - `corepack pnpm check`: 286 tests (+1 skipped live test), lint, i18n pass. The C runtime doesn't read 1.1 yet (next milestone), so the `extend` case has no runtime transcript yet.

- ✅ **Milestone 14b: the runtime reads bytecode 1.1.**
  - **Loader:** `XTNS`, `THEM`, `TEXTBOX`, and `XCALL` with the same checks as the reference reader (a 1.0 file can't use 1.1 ops; its 1.1 sections are skipped as unknown). **VM:** textbox mode, the NVL page (line indices, kept in the saved state; a page too tall for the screen starts over with its newest line), and four saved state words per extension statement. Transcripts print `textbox nvl` and `phone(from=hana, message="…")`; the `extend` case's transcript matches in English and Japanese.
  - **Saves v2:** a thumbnail blob, the textbox mode and NVL page (by line ID), and extension state (by statement name). Version-1 saves still load.
  - **Extension statements** (`hw_ext.h`): `hw_register_statement()` with begin/update/click/finish/restore/draw callbacks, typed value accessors, and a registration list CMake generates from `HW_EXTENSIONS`. Blocking statements hold the story until they finish; skipping, rewinding, and loading end them. A missing handler is logged (and shown in dev builds) and the statement is skipped. Sample: `screen_tint` in `runtime/ext/`.
  - **Themes** (`hw_theme.c`): palette, textbox opacity/height/padding, nine-slice textbox image (`SDL_RenderTexture9Grid`), text size, nameplate font, title background and music, menu background, default transition time, and per-language UI strings. A themed string that is a format (`Slot %d`) must keep its placeholder; the runtime ignores it otherwise, and Core reports it (HW0130).
  - **The player was split:** `hw_game.c` (the story, saves, the Studio link, the main loop), `hw_screens.c` (drawing and input), `hw_game_int.h` (shared internals). No behavior change; done before Phase 5's screens land.
  - Checked: debug, ASan/UBSan (all 9 ctest tests), new loader refusals and a save-v2 round trip in the C tests, and a windowed run of the `extend` case showing the NVL page in the theme's colors.

- ✅ **Milestone 14c: the player's screens and the accessibility baseline** (plan §8.10, §13).
  - **Config:** language, text speed, auto speed, text size (100–150 %), line spacing (1.0–1.5×), font (the game's, or "easy to read": Verdana with UD Digi Kyokasho for Japanese, both shipped with Windows), textbox opacity, high contrast, reduce motion and flashes, skip unread text, full screen, four volumes, and Controls. Every row works with the mouse, the keyboard, or a gamepad (left/right change the focused row).
  - **First-launch accessibility prompt** ("Before you start"): language, text size, font, line spacing, high contrast, reduce motion, text speed. Never shown in unattended runs or Studio's preview.
  - **Input:** 13 actions, each with a key and a gamepad button, remappable on the Controls screen (Esc or Start cancels; a key taken from another action moves). Fixed alternatives (Enter, Space, Z, arrows, Esc, Start) always work, so a bad remap can't lock a player out. Gamepads hot-plug. New: hide the textbox (Delete / Back).
  - **Reduce motion** turns off shake and flash and makes every transition a gentle dissolve (≥ 0.3 s). **High contrast** is an opaque black textbox, white text, and a yellow accent. Toggle states in the quick bar are underlined, not shown by color alone.
  - **Extras:** a CG gallery (unlocked when a CG is shown; full-screen view) and a music room (unlocked when a track plays; Stop). Unlocks live in global data by asset name and survive reloads.
  - **History voice replay:** a ▶ button on lines that have a voice file.
  - **Save thumbnails:** a 384-pixel PNG of the scene (without the textbox) in each save; the save screen shows them and reads the slots once instead of every frame.
  - **Global data v2** (settings, bindings by action, unlocks); version 1 still loads.
  - **UI strings:** 48 new, English and Japanese (Japanese written by the AI; needs review with the rest). `tests/theme-keys.test.ts` checks that Core's themable keys are exactly the runtime's, that every string has Japanese, and that translations keep their placeholders.
  - **Dev flags** for smoke tests and golden images: `--screen NAME`, `--unlock-all` (in memory only), `--save-to FILE`.
  - Checked: debug and ASan/UBSan ctest; every new screen and a play-through run under ASan; screenshots of Config, Controls, the prompt, Extras, the gallery, and the music room; a save written with `--save-to` holds a valid PNG thumbnail. **Not verified:** a real gamepad (none attached here; the code paths are SDL's standard ones), and the readable font on a PC without the optional Japanese UD fonts (it falls back to Yu Gothic).

- ✅ **Milestone 14d: packs, images, Windows integration, budgets** (plan §8.1, §8.8, §8.13, rfcs/0009).
  - **`.hwp` packs** (`spec/pack.md` 1.0): xxHash64-keyed TOC at the end of the file (CRC-checked), entries stored or LZ4, removed entries for patches, the game id's hash so patches stay with their game, optional obfuscation documented as not DRM. Core has the packer (`writePack`, `readPack`, `diffForPatch`, xxHash64, an LZ4 compressor); the runtime's TOC parser and LZ4 decoder are in `core/hw_pack.c`, tested against packs the TS packer wrote (`tests/packs/`, an obfuscated base and a patch) and fuzzed (`fuzz_pack`: 21.9 M inputs in 5 min, nothing found; in CI too).
  - **Runtime file system** (`hw_vfs`): `data.hwp` and `patch*.hwp` by priority, else loose files in development; stored entries stream from the pack (music isn't loaded whole). Images, audio, fonts, and `game.hwb` all read through it; the player and headless playtests accept a `.hwp`, and a shipped game finds `data.hwp` beside its `.exe`.
  - **Exports:** `<Game>.exe`, `data.hwp`, `CREDITS.txt` (third-party notices; FreeType requires the credit). `hwc build --release --patch` writes `patch<N>.hwp` with only what changed (and nothing when nothing did); `hwc disasm` lists a pack. Checked by hand: a patched line and a removed background show up in the shipped folder.
  - **Images:** JPEG (stb_image) and WebP (libwebp's decoder), pinned by SHA-256 like the other dependencies, with a 16384-pixel limit. Release `.exe`: 2.58 MB (budget 4 MB).
  - **Windows:** a manifest (per-monitor-v2 DPI, the UTF-8 code page, long paths) and version information via windres; `himawari --version` reports whether the UTF-8 code page is active. **Crash reports:** a minidump (`crash-<date>.dmp`, dbghelp loaded only on a crash) and `himawari.log` in the save folder; a message box tells the player where. Tested with the dev-only `--crash-test`.
  - **Budgets** (`--perf FILE`, plan §8.1), release build on this PC: first frame **135 ms** (≤ 250), frame CPU p95 **0.2 ms** (≤ 2), peak memory **106 MB** with a 4K JPEG on screen, 35 MB for a plain scene (≤ 150), `.hwb` load **3.6 ms per MB** (≤ 5). Getting there: gamepads start after the first frame (enumerating them took 210 ms), fonts stream through FreeType instead of loading 20 MB of system fonts twice, and the GPU renderer (≈ 200 ms to create) is used only by games with rule wipes and in development. **Not met:** a shipped game that uses rule wipes starts in about 350 ms. CI checks the `.exe` size and memory as hard limits and reports startup and frame time (runners have no GPU).
  - `corepack pnpm check` (296 tests), Studio e2e (export now checks `data.hwp`), debug and ASan ctest (10 tests each) pass.

- ✅ **Milestone 14e: `sunflower-demo` and golden images** (the Phase 5 exit).
  - **`examples/sunflower-demo` ("Sunflower Days")**: a short story that uses every feature in **English, Japanese, and Spanish**: layered sprites (presets, attribute removal, a `multiple` group, a rule, blink, lip-flap), two macros, the `screen_tint` extension statement, novel mode, every menu form, every flow statement, all variable kinds, every text tag (ruby in Japanese), every transition including two rule masks, shake/flash/wait, all audio channels (silent until the files exist), CGs and music for the gallery and music room, and a theme. The runtime ships English and Japanese UI text; **the Spanish UI (81 strings) comes from the demo's theme**, which shows what themed strings are for. Art from `make-art.mjs` (simple shapes, no AI images). The script and the ja/es translations are AI-written; translations are `needs-review`. Playtest: every ending reached, **27 of 27 lines, 5 of 5 options** (the first menu got its own scene so the `once` option can lead back to it).
  - **Golden images** (`tests/golden/`, 11 moments: sprites, a menu, two characters, a CG under the sepia tint, the river under the night tint in Spanish, ruby and the NVL page in Japanese, the title, Config, the gallery, the Spanish accessibility prompt). The runtime's new `--compare FILE` scales the frame to 960 px and allows 0.5 % of pixels to differ by more than 24/255 (font antialiasing, GPU filtering); `HW_UPDATE_GOLDEN=1` rewrites the references. Unattended runs now ignore the real mouse pointer and the player's saved settings, so frames don't depend on the PC. Stable over repeated runs here; in CI (the Studio job, D3D11 on a GPU-less runner) **not yet verified**, and the Japanese cases skip where Yu Gothic is missing.
  - **Fixed on the way: extension state after a warp.** The demo showed the river without its night tint when played from that line: warps rebuild state by running the VM headlessly, so the handler's saved state words were never written. Now the **VM remembers each extension statement's most recent call** (its first 8 values) in the display state, saves keep it by name with typed values, and `restore()` receives that call. Handlers keep no state of their own (rfcs/0007 updated; D37).
  - Studio: the 14 new diagnostics in Japanese (473 UI messages in sync), Screenplay rows for `textbox` and macro/extension calls, and calls with text highlight and play from their line.
  - `corepack pnpm check`: **311 tests** (+1 skipped live test), lint, i18n; Studio e2e; debug and ASan ctest (10 each); golden suite 12/12.
- ✅ **Phase 5 done** (plan §18): backlog voice replay, auto/skip, config, gallery, music room, quick save; rule transitions, NVL, themes, gamepad and remapping; the accessibility baseline; `.hwp` packs and patches; JPEG and WebP; crash reports; extension statements; macros. **Exit criteria:** `sunflower-demo` covers every feature in 3 languages ✅; the golden-image suite is green ✅ (locally; CI pending); performance budgets met ✅ for games without rule wipes (a game with rule wipes starts in ≈ 350 ms, over the 250 ms budget, because the GPU renderer takes ≈ 200 ms to create). **Not verified:** a real gamepad, the golden suite and budgets on CI's GPU-less runners, Japanese UD fonts on PCs without them. Nothing from session 14 is committed.

### Session 14b: 2026-10-18 · Phase 5 audit
**You asked:** why Spanish is in the tests (the plan's Phase 5 exit asks for 3 languages; English and Japanese were given, Spanish was my pick, and it is the one language whose whole UI comes from a theme, which two golden images check), and to double-check everything and fix bugs before Phase 6.

**Bugs found and fixed:**
- **Core: errors inside macro bodies were swallowed.** A nested macro call with a bad argument was silently dropped from the expansion; a nested extension call with one compiled a value the runtime then refused (the whole game failed to load); unknown names inside bodies were never reported; names written in a body and passed to an inner call were never checked. All are now reported at the outermost call with an "inside the macro …" note (no quick fix, which would edit the wrong text), without double reports.
- **Core: defaults weren't type-checked.** An extension parameter's `default` of the wrong type (a word for an int) compiled to garbage; a text parameter could have a default. A macro parameter's default was only checked when used. Both are checked where written now (HW0120, HW0223).
- **Core (since Phase 1): the compiler could write files the runtime refuses.** An instruction holds at most 255 arguments: a menu with 127+ options or a line changing 249+ sprite attributes compiled without a word and failed to load. New errors HW0332 and HW0333, a 253-parameter cap for extensions, and the compiler now stops instead of writing such a file.
- **Core: a theme with a non-ASCII language name under `strings`** sorted differently in TS (UTF-16) and C (bytes), so the runtime would refuse the game; language names must be language tags now. A malformed `textbox.slice` gets a clear message.
- **Packer: memory.** LZ4 collected its output in a JS array (8+ bytes per byte), so a 100 MB WAV needed ~800 MB; now a byte buffer (64 MB in 0.3 s).
- **Studio: the window's snapshot left out `extensions/` and `theme/`**, so opening a project with extension statements showed every call as an error; now included, with a unit test against Sunflower Days. The theme and extension schemas are listed in the Explorer (they weren't reachable).
- **Player:** changing the language during novel mode left the earlier lines of the page untranslated; `textbox hide` didn't hide a novel-mode page; on the Controls screen a mouse-only player who clicked a gamepad cell couldn't cancel (only Esc did; a click does now); a held key repeated toggles (quick save every frame, skip flickering); F5 reload didn't pick up a changed theme font.
- **Golden images on CI (9 of 12 failed, 0.6–1.3 % of pixels):** frames were drawn at the window's size, which depends on the display. With `--compare` the player now draws into a canvas of the game's own size; WARP (the software rasterizer CI runners use) and this PC's GPU now give the same pixels (0.000 % differ). Frames that don't match are kept as `*.actual.png` and uploaded by CI. **The fix isn't on CI yet** (needs a push); a remaining risk is different Windows font versions on the runner.

**Checked, no problems found:** the formatter on the new syntax (`hwc fmt --check`), the 1.1 loader and the VM's new ops, saves v2 (including rewinding through a novel page, now a C test), pack mounting and patches, the packaged Sunflower Days (headless: 27/27 lines; windowed from `data.hwp`), libFuzzer on the loader (2.1 M inputs) and on saves (4.4 M), both seeded with 1.1 files, nothing found; the runtime under ASan, Studio e2e. `corepack pnpm check`: 317 tests.

---

### Session 14c: 2026-10-18 · Mandarin instead of Spanish, and the UI Designer in the plan (v0.6)
**You asked:** to make the demo's third language Mandarin instead of Spanish, and to plan a way to customize the game's look in Studio (move buttons, change colors, shrink the text area, presets, a color wheel, "everything a user may possibly need"). Nothing is committed yet, as you asked.

**Mandarin (Simplified Chinese, `zh-Hans`):**
- Sunflower Days now ships English, Japanese, and Simplified Chinese (the written form of Mandarin used in mainland China and Singapore, and by most Mandarin learners). `locales/es.json` is gone; `locales/zh-Hans.json` holds the 34 lines, and the theme holds the whole Chinese UI (81 strings), since the runtime ships only English and Japanese. Characters: 小花 (Hana) and 阿莲 (Ren). All AI-written, marked `needs-review`. `hwc check`: clean; headless playtest in Chinese: 27/27 lines.
- **Fonts: Chinese text needs a Chinese font first.** Chinese and Japanese share code points but draw many of them differently, and Japanese fonts lack many simplified characters. The player now picks the CJK fallback order by language: Microsoft YaHei first for Simplified Chinese, JhengHei for Traditional (`zh-Hant`, `-TW`, `-HK`, `-MO`), Yu Gothic and Meiryo for everything else; it reopens the fonts when the language changes. Missing fonts are skipped.
- **Bug found on the way:** the text renderer kept at most 4 font faces, so with a game font and the readable font on, the CJK fallbacks were silently dropped (tofu boxes). Now 10.
- Golden images: the three Spanish cases became `zh-river-night`, `zh-two-characters`, and `zh-accessibility-prompt` (they skip without YaHei, like the Japanese ones without Yu Gothic). All 13 images were regenerated and looked at; the suite passes 3 runs in a row.

**The UI Designer (plan v0.6, §11.6, new Phase 6):** a Studio panel to restyle every part of the game's built-in UI by hand on the live preview:
- **Layout:** drag and resize the textbox, nameplate, choices, quick bar, title buttons, save slots, and every menu, with snapping, guides, and safe areas; padding and text-area margins; positions as fractions of the canvas.
- **Look:** fills, gradients, borders, corner radius, shadows, button states, nine-slice images (the user's own art).
- **Text:** fonts per language, size, color, outline, spacing.
- **Motion and sound:** show/hide animations, hover and click sounds.
- **Colors:** a color wheel (HSV, hex/RGB, opacity), an eyedropper, palette tokens, harmonies, swatches.
- **Presets:** Classic ADV, Modern minimal, Novel, Dark, Pastel, Retro, High contrast, plus palette-only presets and shareable theme packs.
- **Guards:** a contrast check with a one-click fix, a color-blindness preview, overflow checks per language, undo and reset.
- **AI:** may propose theme changes as ordinary proposals, but never images.
- **Underneath:** theme schema 2.0 compiled into `THEM`, a data-driven runtime UI (today's look becomes the Classic ADV preset), and debug-protocol commands. All of that goes through an RFC first.
- It takes ≈ 4 weeks, so AI depth and polish becomes Phase 7, the launch Phase 8, and the total is ≈ 37 weeks (D40).

**Not re-verified on CI yet:** the golden fix and the Chinese cases (the runner may lack YaHei, in which case those three skip).

---

### Session 14d: 2026-10-18 · Docs and code cross-check
**You asked:** to double-check the documentation and the code for hallucinations and inconsistencies, and fix what I find. I checked every claim I could test against the code: commands and flags, versions, diagnostic codes, tool and prompt names, protocol fields, file formats, counts, and cross-references.

**A real bug:** Studio's preview label had no text for the seven screens Phase 5 added (Config, Controls, Accessibility, Extras, Gallery, a CG, Music room), so it would have shown a raw message ID. Added in English and Japanese, with a generic label for any future screen.

**Docs that said something untrue, now fixed:**
- `spec/language.md`: an empty menu option is `HW0005`, not `HW0330` (which doesn't exist). The keyword list lacked `textbox` and listed `statement` and `me`, which aren't reserved (the grammar was right).
- `spec/debug-protocol.md`: the `state` event's screen list lacked the Phase 5 screens.
- The plan:
  - `--debug-pipe` (§8.12 and the diagram) is really `--link`.
  - §10.3 listed a `patch_scene` operation `add_menu_option` that was never built, and missed `insert_before` and `append_to_scene`.
  - §8.10 promised theme positions and animations (they come with the UI Designer).
  - §8.11 didn't say that `>`, F4, and the console aren't built.
  - Phase 5's heading wasn't marked done.
  - Phase 8 listed `hwc report ai-content`, which exists since Phase 3.
- My own v0.6 text:
  - It said "debug protocol 2", but additive commands keep version 1 per the spec.
  - It cited P6 (errors teach) for "no code".
- `README.md` still said "Phases 0–4", described Studio as "UI message catalogs", gave the runtime size as 2.4 MB (it's 2.6), and left out Sunflower Days, stb_image, and libwebp.
- `CLAUDE.md`'s RFC list stopped at 0006, its runtime row lacked stb_image and libwebp, and its `hwc` command list was garbled.
- The player's `--help` listed half its flags and said it plays `game.hwb` by default (it plays `data.hwp` first).
- `hwc --version` and `project_info` didn't report the extension, theme, and pack spec versions.
- The agent guide's `patch_scene` list missed two operations.
- The `adv` template's `assets/README.md` didn't say which file formats work.
- LOG's Phase 1 row still said "Next: Phase 2".

**Checked, nothing wrong:**
- Bytecode opcodes and sections against Core.
- The pack format (48-byte header, xxHash64, codecs) in the spec, Core, and the runtime.
- The 22 tools and 5 prompts against the plan.
- The resources and their templates.
- The 81 UI string keys in Core, the runtime, and the Chinese theme.
- The diagnostic codes cited in the LLM reference.
- The runtime's `core/` (no SDL, no I/O) and `text/hw_layout.c` (no SDL, no font library) rules.
- The roadmap total (37 weeks).

`corepack pnpm check`: 318 tests, 483 locale messages in sync. Runtime debug tests 10/10. Studio e2e 4/4.

---

## Session 15: 2026-10-18–19 · Phase 6: the UI Designer, and Studio's new look
**You asked:** to continue with Phase 6; to make Studio look less AI-generated, with ease of use and a comfortable, intuitive UI first; rounded corners and soft pastel colors that are easy on the eyes; and a white background by default, with black or the Windows theme as options. (Studio was dark only: its colors were fixed in the stylesheet, with no setting.)

**Studio's look:**
- **Three themes:** Light (the default), Dark, and Match Windows, under Settings → Studio and on the Welcome screen.
- **One set of colors per theme.** Every color is a token defined once per theme, and no component uses a raw color, so both themes stay complete. The main process sets Windows' theme source to the same choice, so menus, scrollbars, and the window frame match.
- **A calmer style:**
  - The light theme uses near-white panels, warm grays, and a pastel sunflower accent. The dark theme is a warm charcoal, not black.
  - Corners are rounder (7–16 px), and panels have soft shadows.
- **Removed the things that read as "AI-made":** the glowing gradient behind the Welcome card, the sunflower emoji as the logo (now a small drawn mark), the sparkles icon for the assistant (now a speech bubble), and tiny uppercase section labels (now normal sentence case).
- **Sunflower Days is offered as a sample** on the Welcome screen.

**Theme 2.0 (rfcs/0010, D41):**
- **What a theme can now hold:** the layout of every built-in screen (textbox, text area, name plate, choices, quick buttons, novel page, title, title and game menus), shapes (corner radius, border, shadow, how a pointed-at button shows it), text outline, choice animations, and hover and click sounds.
- **Presets and palettes:** a theme can start from one of 7 presets (himawari, pastel, minimal, paper, night, retro, high contrast). There are also 9 color-only palettes.
- **Checks:** Core validates every value. It warns about elements past the edge of the screen (HW0132) and text below 4.5:1 contrast (HW0133); HW0133 suggests a readable color.
- **No bytecode change:** these are new `THEM` keys, so bytecode stays 1.1.
- **Tests:** every preset and palette is tested to pass its own contrast check. The schema and Core are tested to know the same settings.
- **The contrast check found two real problems:** the Sunflower Days accent was slightly too dim on hovered choices (4.4:1, now fixed), and so was the conformance fixture's accent. Their expected outputs were regenerated.

**The runtime draws the UI from the theme:**
- Every screen is placed from the theme's layout.
- Panels can be rounded, bordered, and shadowed.
- A game without the new keys looks exactly as before: the 13 earlier golden images still match.
- Accessibility settings still win over any design: high contrast forces borders and outlines, and reduce motion turns off choice animations.
- New on the debug pipe: a `screen` command (show any screen) and an `overflow` event (a label too long for its button).
- **Two bugs found and fixed while checking the presets:**
  - Rounded panels drew without blending whenever the last blend mode set elsewhere was "none".
  - The golden comparison ignored alpha, so it couldn't catch that. Now alpha is compared too.
- On light themes, the title screen faintly showed through menus opened from it. Those menus are fully opaque now.

**The UI Designer** (the palette icon in the left bar):
- **Mock screens:** five editable mock screens (dialogue, choices, novel page, title, game menu), drawn from the theme over the game's own background.
- **Editing:**
  - Drag to move. Drag a corner to resize.
  - Moves snap to the center, the 5% safe area, and other elements. Hold Alt to place freely. Arrow keys nudge.
  - Number fields hold the exact values, with a Reset for each element.
- **Looks:** preset and palette cards, the 15 named colors with contrast badges, and sliders for corners, border, shadow, opacity, text size, and outline. You can also choose how choices appear and pick sounds from `assets/sfx/`.
- **The color wheel:** a hue ring around a saturation and brightness square, hex and RGB input, the Windows eyedropper, harmonies (opposite, neighbors, triad, shades), the game's own colors, and "Make it readable".
- **Readability and accessibility:** a readability list, a color-blindness preview (three types), and labels the real game reports as too long (switch the preview's language to check translations).
- **Theme packs:** export and import; the project keeps its own UI text.
- **The real game updates too:**
  - Every change is an ordinary file edit, so undo, history, autosave, and the live preview all work.
  - While you drag, it's one undo step.
  - The docked game switches to the screen you're designing.
- **More room:** the project tree hides while designing.

**Checked:**
- `corepack pnpm check`: 359 tests and 624 locale messages in sync (English and Japanese).
- Runtime tests: debug 10/10 and ASan 10/10. Conformance transcripts and pack fixtures were regenerated.
- **Golden images: 19 of 19,** stable over 3 runs. That includes 12 new ones for the presets, which I looked at.
- **Studio e2e: 5 of 5.** The new e2e test applies a preset, drags the title buttons, and checks that the game rebuilds.

**Not done:**
- The hallway test (a non-programmer restyling a game in 15 minutes).
- The mock uses Windows UI fonts, not the game's own fonts or languages; the docked game beside it does.
- New projects still start with the himawari look; the wizard could offer a look.

---

## Session 16: 2026-10-19 · Stress test: big projects
**You asked:** to stress test the whole app the way real games grow (tens of thousands of lines, hundreds of assets), fix what breaks, and make sure a big project stays easy to work in: no endless scrolling to reach another route.

**The test project.** `scripts/stress/make-project.mjs` generates a realistic big game:
- 36,655 lines in 134 files: 12 routes of 10 chapters, a common folder, and one 6,000-line file.
- 1,123 scenes, a menu in every scene, and 52 variables.
- 368 procedural images: layered sprites for 12 characters, 200 backgrounds, and 60 CGs.
- A Japanese table with 33,300 translations.

`scripts/stress/tools.mjs` and `scripts/stress/studio.mjs` time the AI tools and Studio on it. `tests/scale.test.ts` keeps the fixes in place.

**Broken at this size, now fixed:**
- **`hwc build` crashed** with "Maximum call stack size exceeded": the bytecode writer spread arrays of over a million words into function arguments. Big arrays are now appended in loops (`pushAll`) in the writer and the checker.
- **The playtest called 11 of 12 endings unreachable.** Its depth-first search spent the whole 50,000-step budget inside route 0.
  - A **coverage pass** now runs first: every menu once, then every option no path has chosen yet. It reaches every route in about one read-through.
  - The exhaustive search then uses the rest of the budget, which now grows with the story (40 events per line, 50,000 to 20 million).
  - A step limit after full coverage is no longer reported as a problem.
  - The stress game: 12 of 12 endings, all 32,202 lines and 3,342 choices, in 2.4 s.
- **"Play from here" on a late route failed** for the same reason (warps used the same search). It now finds any line in under a second.
- **Editing a translated line was refused** ("would add errors") when its old translation's markup no longer matched. A stale translation is now flagged as needing review (HW0403), and its markup is checked again after review.
- **Translations with an unknown status** (a hand-edited "done" or "translated") counted as not translated. With text, they now count as needing review.
- **`hwc check` took 10 minutes 26 seconds** when there were thousands of problems. Every diagnostic re-indexed its whole file.
  - Now: one index per file. It also shows the first 20 of each kind of problem, then "and N more" (`--all` shows everything).
  - The same 3,840 problems take 1.2 s.
- **Renaming a script inside a folder** moved it to `script/`. It stays in its folder now.

**Faster:**
- Core caches each file's parse and each translation table, keyed by their exact text. The first check of the stress project takes 0.65 s; a check after an edit takes 0.12 s.
- The AI tools reuse the last check while no file changed: read tools take 0.08–0.13 s instead of 0.7 s.

**Studio with the big project** (longest freeze, before → after):

| Action | Before | After |
|---|---|---|
| Opening the 6,000-line file (Screenplay) | 27 s | 0.04 s |
| Localization | froze | 0.1 s |
| Story graph | 6.2 s | 0.07 s |
| Opening the project | 1.9 s | 1.1 s (after the workspace is on screen, with "Checking the project…") |
| Typing (Script or Screenplay) | — | ≤ 0.17 s |

Renderer memory went from 562 to 197 MB.

How each surface handles size now:
- **Screenplay:** only scenes near the screen are drawn. A **"Go to a scene" bar** appears in files with more than 3 scenes. Revealing a place (Explorer, search, story graph, go to definition) now scrolls the Screenplay too; only the Script view used to.
- **Explorer:** scripts are grouped by **folder** (one per route). With more than 20 scripts, folders start closed and files show their scenes when opened (except files with over 30 scenes, which have the "go to" bar). There's a **find box** for files and scenes, and **Fold everything**.
- **Localization:** pages of 100, a **"which lines" filter** (a route folder or a file), and a **search** over both languages. Lookups by ID instead of a scan; it had been comparing 36,655 × 36,655 entries.
- **Story graph:** a big story opens as an **overview**: one box per folder (route), or per file in smaller projects. Click a box for its scenes. **Find a scene** shows it and its neighbors. "Every scene" is still there.
- **Problems:** pages of 100. **Assets:** a search box, and big folders start folded.
- **AI tools:**
  - `list_scenes` lists one line per file past 200 scenes, with `file` and `query` filters (60,000 → 9,000 characters).
  - `get_story_graph` has `scene` (and `depth`) and `file`, and an overview past 150 scenes (121,000 → 1,300 characters).

**Measured and fine already:**
- Runtime: loads 4.4 MB of bytecode in 14 ms, peaks at 113 MB, and starts in 0.65 s from a 2.2 MB `data.hwp` (369 files).
- Release export: 3.3 s.
- CSV and XLIFF export of 36,655 lines: 1.2 s each.
- Search (Ctrl+P): 0.06 s.

**Checked:** `corepack pnpm check` (364 tests, 643 messages in both languages), Studio e2e 5/5, runtime debug 10/10 and ASan 10/10, golden images 19/19.

## Session 17: 2026-10-19 · Phase 7: AI depth and polish
**You asked:** to add the big-project notes to the plan (now §16.5 and a "Scale" row in §16.1), then to go on with Phase 7.

**Review notes** (rfcs/0011). The AI can now point at a problem without rewriting your work:
- Notes live in `.himawari/notes.json` and are anchored on a line ID (or a scene or file). Kinds: continuity, character, style, translation, to-do.
- Three new tools: `add_note`, `list_notes`, `resolve_note` (25 tools now). Notes are written directly, not as proposals, because they change no game file.
- Studio: a **Notes** tab (with a count, "show resolved", and click to go to the line), a note badge on lines in the Screenplay, and **Add a note** on any line for your own to-dos.

**Continuity hints** (info, with every check):
- `HW0340`: a character speaks after being hidden earlier in the scene. Branches are followed: after a menu or `if`, a character counts as hidden only if hidden on every branch that carries on.
- `HW0341`: a variable is set but nothing reads it. Global counters (endings seen) are left alone.
- `HW0342`: a variable is used in a condition but never set, so that condition can never change. A name only shown in text (`[player_name]`) is just a constant and isn't flagged.
- These hints are about stories, not the language, so the conformance cases leave them out.

**Route balance and the story graph:**
- `analyze` lists each ending's own lines, its shared lines, and the choices into it. A route under half the median length is flagged.
- The graph can color scenes **by route** or **by playtest**. "Playtest every path" adds coverage bars and "not reached" badges.
- The graph is editable. Drag from one scene to another: the scene ends in a jump, or in a choice that keeps the old way as a second option. **New scene** adds one. Both are ordinary edits with undo.

**The glossary and "Translate with AI":**
- `glossary.json` at the project root holds the game's own words and their translations. It isn't in `locales/`, where every file is a string table.
- `HW0407` notes a translation that doesn't use the agreed word. `search_dialogue` with a language lists the glossary, and MCP serves it as `himawari://project/glossary`. Localization has a glossary editor, and a hint appears under any translation that misses a term.
- **Translate with AI** (Localization) takes the untranslated lines shown, narrowed by route or search first. It uses Claude Haiku 5.5 by default, or Sonnet 5.5 for more care.
  - About 40 lines per request, with structured outputs, low effort, and a cached prompt (the rules, character names, the glossary, and `AGENTS.md`).
  - A dialog shows the count, the model, and the estimated cost before anything is sent.
  - Each batch is one undo step and lands as needs-review, marked as AI-written. Cancel keeps what came back.
  - It uses the assistant's stored key.

**Recipes:** one set of instructions (`packages/tools/src/recipes.ts`) behind both the MCP prompts and the assistant's new **slash commands**: `/write`, `/continuity`, `/branches`, `/translate`, `/sprites`, `/proofread`, `/balance`, `/playtest`.
- Type `/` for a menu. A missing argument is named in plain words.
- The reviewing recipes leave notes; the fixing ones propose edits.

**MCP Apps (experimental):** `get_story_graph` and `render_line` point at two self-contained views, `ui://himawari/story-graph` and `ui://himawari/scene-preview`.
- I checked the graph view in a stand-in host, in light and dark.
- Hosts without MCP Apps ignore it.

**The eval suite** (`packages/evals`): five tasks on copies of Festival Eve:
- write a scene
- find a planted contradiction
- translate with a glossary
- fix an unreachable ending
- proofread planted typos

Each run gets deterministic scores: the task itself, no errors afterwards, every ending reached in a headless playtest, and the character rules kept in new lines.
- `run` (Claude, needs `ANTHROPIC_API_KEY`, costs money) saves JSON results by date, and `trend --write` writes `TREND.md`.
- The tests check that the built-in reference answers score 100 % and that doing nothing scores 0.
- **No real run yet:** this PC has no key in the environment.

**Fixed along the way:**
- Studio didn't load `.himawari/notes.json` when opening a project (only on later changes).
- Route balance missed scenes inside loops (a hub scene that menus return to): reach is now found by searching backwards from each ending.
- After a menu where every branch hid a character, HW0340 forgot she was hidden.

**Malformed line tags** (added after the session's first report, at your request): a comment that starts with `#line:` but isn't a valid ID (`#line:evl001`, uppercase, too short or long) was silently read as an ordinary comment, so the line got a new ID on save. It's now a warning, `HW0022`, unless it sits behind a real tag (where tools leave the old text). The Phase 7 codes HW0340–HW0342 and HW0407 were also missing from Studio's messages, so the Japanese UI showed them in English; all five are now in both languages. HW0342 now reads "used in a condition but never set", which matches what it checks.

**Checked:** `corepack pnpm check` (396 tests, 725 messages in both languages); the MCP server tests (prompts, the glossary resource, the MCP Apps views); the eval harness with the reference and do-nothing agents; screenshots of the glossary editor, the translate dialog, and the slash-command menu (with a throwaway home and a fake key; nothing was sent). Studio e2e 5/5. No runtime C code changed this session, so ctest and the golden images weren't rerun.

## Session 18: 2026-10-20 · The finalization plan
**You asked:** for a finalization plan, `FINALIZATION.md`, with "human-like common sense" in how the app behaves. The AI should be an assistant, not the center; translation should be optional; and the plan should list what you might have forgotten, after fresh research on how to test it.

**Your answers:**
- AI is **present but quiet**.
- Projects are **one language by default**.
- Finalization is **merged into the launch phase**.
- All four kinds of common sense count: safety nets, writer-aware hints, smart defaults, and player-side polish.

**What the plan contains** ([FINALIZATION.md](FINALIZATION.md)):
- Eight finalization principles (F1–F8), such as "your work is never lost" and "ask only before what can't be undone".
- The quiet-AI and optional-translation changes.
- About 50 concrete items, each marked as working, partly there, or new.
- A "you might have forgotten" list: privacy, Windows realities, updates, shipping, help, Studio's own accessibility, and project hygiene.
- A test plan: expert review, three usability rounds, torture tests, clean machines, accessibility, players, and dogfooding.
- The order of work, exit criteria, and seven questions for you.

**Research** (RESEARCH §17, v1.3) covers:
- Small repeated usability rounds (NN/g), SEQ and SUS benchmarks (MeasuringU).
- Nielsen's heuristics and cognitive walkthroughs.
- Atomic writes and local history.
- Windows pitfalls: OneDrive, CJK user names, long paths.
- Windows Sandbox, SmartScreen and signing in 2026, axe-core for accessibility, and Ren'Py's player defaults.

**Found while checking the current state:**
- The assistant panel opens by default.
- Deletes in Studio are permanent.
- There's no on-disk history, and nothing stops a second Studio window from opening the same project.
- The per-project "AI off" switch promised in plan §10.9 was never built (FINALIZATION.md, question 1).
- Already right: the game skips only read text, asks before quitting, has Continue, and hides the language menu in one-language games.

**Then you added the core concept**, to be written into every related document:
- Studio should be so easy that nobody needs to code; everything can be done in the UI. You'd noticed parts that still need code.
- It must still serve people who code, at the same time.
- Games are in C so they run on any PC.
- Studio installs in one click with everything it needs, and a game runs by double-clicking its exe.

It's now:
- FINALIZATION.md v0.2: §1 (the concept, and two kinds of users on one project), §3 (no code needed, code welcome), §4 (any Windows PC), and §5 (one click).
- Principles P13–P15 in the plan, plus its vision, budgets, export, and packaging sections.
- The README's opening, CLAUDE.md's non-negotiables, and RESEARCH §17.7.

**Where Studio still needs code** (checked in the source):
- Stage directions, jumps, variable changes, and conditions show as rows, but editing them means typing script syntax.
- Text styling (bold, color, furigana, pauses) is typed as markup.
- Macros and extension calls are edited as text.
- Project settings are raw `himawari.json`.

**Already right for "any PC":** a static 2.6 MB exe with no DLLs, the UTF-8 code page, long paths, and per-monitor DPI in its manifest.

**Not yet:**
- The game redraws every frame while waiting for a click (battery).
- The software-rendering fallback is untested.
- The installer isn't one-click.
- `hwc` and the MCP server need Node.

Phase 8 is now about 16–17 weeks. Nothing in the code changed this session.

**Your answers to FINALIZATION.md §13** (same day):
- A per-project AI-off switch, with "present but quiet" as the default.
- Sonnet 5.5 as the assistant's default model.
- CC0 template content, but with Himawari credited.
- Autosave on quit and at choices.
- No Windows 7 or 8.1.
- Folder export by default.
- A one-click installer.

**The credit:** you suggested asking before export, with the window title ("[title] created using Himawari Studio") as the default. The runtime is zlib-licensed, so credit can be a default but not a requirement. FINALIZATION.md OC-10 now has three choices, asked once per project. My suggestion was a small title-screen line as the default. **Your decision:** make it optional, so nobody is annoyed. The default shows nothing in the game; the title-screen line and the window title are opt-ins. You agreed with the rest and asked to start executing finalization.

## Session 19: 2026-10-20 · Finalization, executed (stages A–D, F, and release tests)
**You asked:** make crediting optional, use my suggestions for the open questions (testers, signing), install with the usual Windows setup wizard, and carry out the finalization. Two side sessions ran alongside: the runtime's part (`claude/adoring-euler-1f2243`) and the launch documents (`claude/zen-liskov-d64142`). Neither is merged yet.

**Stage A, AI present but quiet, translation optional** (FINALIZATION.md §6, §7):
- A per-project switch, `"aiHelp": false` in `himawari.json` (schema, Core's `aiHelpAllowed`). With it off, Studio hides the assistant and every AI button, and `himawari-mcp` refuses all tools with a plain message.
- The assistant starts closed; the AI Proposals tab appears only once there's a proposal; Settings has one "AI help (optional)" section; Sonnet 5.5 is the default model.
- New projects ask for one language. Localization appears with a second language; "Translate this game…" is in the Explorer and Settings; "Stop translating into X…" removes a language (the table goes to the Recycle Bin, with Undo).
- The agent guide (1.3) asks AI helpers to use Studio's words with writers.

**Stage B, never losing work** (§8.1):
- Saves are atomic, and both reads and writes now retry while antivirus or OneDrive holds a file.
- Local history on disk (outside the project): changes merged over 10 s, 50 versions per file, a Versions dialog per file, Deleted files, and restore points before big changes (three or more files at once, such as accepted proposals).
- Deletes go to the Recycle Bin, with Undo instead of a confirmation.
- A change made outside Studio is never overwritten: Studio asks which to keep.
- One Studio per project; after a crash, the Welcome screen says so. OneDrive conflict copies are explained. Export refuses with under 200 MB free.

**Stage C, no code needed** (§3):
- Every stage direction opens as a form: backgrounds and CGs with thumbnails, characters with expressions and positions, sound with ▶, waits, textbox modes, jumps and visits, remembering values (new ones from the same form), and conditions built from dropdowns with and/or.
- Options have "Only once" and "Only if…" toggles. Extension statements and macro calls get forms from their signatures.
- A text toolbar: bold, italic, color, size, pauses, speed, shake, furigana, remembered values, with a styled preview.
- Settings → This game edits the manifest (name, version, start scene, screen size, icon, credit, languages); project files stay hidden unless Settings → Advanced shows them.
- The UI Designer edits the game UI's own words.

**Stage D, any PC and the usual setup** (§4, §5):
- `himawari-tools.exe`: a Node single executable with `hwc` and the MCP server inside Studio. No Node needed; Settings → Advanced can put `hwc` on PATH (only when you click).
- Exported exes carry the game's icon, its version, and "Made with Himawari" in their file properties (`resedit`).
- The first export asks once how to credit Himawari (default: credits only, D60); "Play it" runs the exported game.
- The NSIS installer is the usual wizard (D61); the built Setup is 152 MB.
- `scripts/release/clean-machine.mjs` prepares a Windows Sandbox test for you to run once Sandbox is enabled.

**Stage F, common sense** (§8.2, §8.3):
- Writer hints HW0350–HW0359, all suggestions and never errors:
  - a one-option menu, or two options with the same text;
  - a line pasted twice, doubled spaces, or an unclosed bracket;
  - a silent character, or file names that differ only in case;
  - a line too long for the textbox;
  - a background far bigger than the game, or the wrong shape (new today: sizes come from file headers only).
- "Don't point this out again" mutes a kind of hint per project.
- New projects default to Documents\Himawari, and the wizard remembers the last folder.
- Windows keys: Ctrl+S says it's saved automatically, Ctrl+Z undoes the last change, and F5 plays from the start. They're listed in Settings.
- A "Story" button returns to the script from any tool (the UI Designer hides the Explorer). Problems say "start, line 5"; the code is in the tooltip.
- Assets has "Gallery and music room": what will unlock, where it first appears, and a button to show that screen in the preview.

**Release tests** (§11):
- The e2e suite now has a **no-code test**: it adds a line, a choice, and all 17 kinds of stage direction from menus and forms (the Script view is never opened), then checks there are no errors and the game builds.
- An **axe check**: no serious WCAG 2 A/AA problems on five main screens. It found low contrast on badges, so the light theme's muted, success, warning, and error colors are slightly darker.
- **Torture tests** (`src/main/torture.test.ts`): a Japanese path, a 300-character path, the clock moved backwards, a file held by another program, and a save cut off half way.

**Bugs the new tests found:**
- Typing a line and then clicking "Choice" lost the choice: the text toolbar appeared and disappeared, moving the button between mouse-down and mouse-up. The toolbar now floats above the line.
- A save failed outright while another program held the file, because Studio's read before saving (to spot outside changes) wasn't retried.

**The runtime branch** (side session, committed on `claude/adoring-euler-1f2243`, not merged):
- No redrawing while idle (CPU 89–96 % → 0–0.2 %); a software-renderer fallback.
- Autosave on quit, at menus, and on going to the title; window place remembered; "Mute in the background".
- A pack appended to the exe (single-file games, `appendPackToExe`); the title-screen and window-title credit.

**Then, on your go-ahead, the merge:**
- Both side branches are merged into main: `claude/adoring-euler-1f2243` (runtime) and `claude/zen-liskov-d64142` (launch documents). These are two merge commits; the session's own work is still uncommitted on top.
- The only overlap was `spec/manifest.schema.json`, where the branch's copy was ours plus `credit`.
- **Single-file export (OC-6)** now works end to end:
  - `packageGame({ singleFile })` brands the exe first, then appends the pack (rewriting resources after would drop it).
  - It removes a stale `data.hwp`, which would otherwise win over the pack inside.
  - Patches diff against the pack inside the exe.
  - In `hwc`: `build --release --single-file`. In Studio: Build → "Put the whole game in one file", remembered with the zip choice (OC-5).

Verified on the merged tree:
- `corepack pnpm check`: 485 tests, including a new packaging test that exports a single-file game, plays it, and patches it. 1 013 messages are in sync.
- ctest (debug): 10 of 10.
- Golden images: 22 of 22.
- Studio's e2e: 7 of 7. The export test now also makes a single-file game.

Not run: the ASan build. The installer wasn't re-packaged. Session 19's own changes are not committed.

## Session 20: 2026-10-21 · Renamed to Moeko Works
**Why:** the brand "Moesoft" (also "Moeko Software and Technologies") belongs to an established company, so it's now **Moeko Works** (https://moekoworks.vercel.app), done the same way as the Kotoha, Hanon, and Aqua Iro Archive sites. The repo folder moved to `C:\Users\Myaako\Documents\MoekoWorks\himawari-c`.

**What changed:**
- **Names:** the copyright holder in `LICENSE-MIT`, `LICENSE-zlib`, and `spec/LICENSE.md` (and its attribution line); GOVERNANCE.md; the docs' home pages (EN/JA); CLAUDE.md; the plan; the RFC author lines; Studio's `package.json` author and installer copyright; the runtime exe's `CompanyName`; its Windows manifest (`MoekoWorks.Himawari.Runtime`).
- **IDs:** `dev.moesoft.*` became `dev.moekoworks.*`, with no migration or alias, because nothing was ever released or published (no npm packages, no GitHub releases, no update channel). That covers:
  - Studio's `appId`: a new install sits beside an old local test install rather than upgrading it. Studio's settings are keyed by its product name, so they're unaffected.
  - The example games' IDs: their save folders under `%APPDATA%\Himawari\` change.
  - The test fixtures: the conformance `expected.hwb` and `.disasm` (only the ID line changed; each file grew 4 bytes), the pack fixtures, and the C pack test.
- **Worktrees:** the two Claude worktrees' links were repaired with `git worktree repair` after the folder move.
- **Runtime build folders:** the old path in the stale FetchContent sub-build caches was cleared, and both presets were reconfigured.

**Kept on purpose:**
- Three history notes in this log (the old folders and the old `gh` display name), each now saying when the name changed.
- The authors of past commits.
- The fuzz regression input `runtime/fuzz/regressions/hwb/top-level-return-ending.bin`, a recorded crash input whose bytes must stay as found.

Verified: `corepack pnpm check` (485 tests), ctest (debug, 10 of 10), the golden images (22), Studio's e2e (7 of 7), and `… package` (installer and portable build).

**Found, not changed:** Studio's packaged exe still shows Electron's own file properties, because `electron-builder.yml` has `signAndEditExecutable: false`. Its name, company, and icon come with code signing (plan §14.5).

## Session 21: 2026-10-21 · Cleanup, and the break-it plan
**You asked:** remove and clean up the old worktrees, then plan how to break Studio and the engine on purpose to find bugs and room for improvement.

**Cleanup:**
- Both Claude worktrees were removed (`adoring-euler-1f2243`, `zen-liskov-d64142`; both clean and fully merged). Their branches were deleted locally; they were never pushed.
- The folders needed Windows' long-path prefix to delete: `node_modules` paths are too long for `git worktree remove`.

**The plan** ([BREAK_IT.md](BREAK_IT.md), v0.1):
- **Oracles first:**
  - no crash and no lost work;
  - same input, same output;
  - round trips (save → load → continue, parse → print);
  - plain-word failures, the sandbox, and budgets.
- **Engine:**
  - new fuzz targets for images, fonts, text layout, audio, the debug protocol, and decompression bombs;
  - fast-check property tests on Core (never throws, lossless, format idempotent, minimal form edits, deterministic builds);
  - a story generator that plays random valid games headless and checks save, rollback, old saves, and patches;
  - a runtime input monkey, an 8-hour soak, and weak machines.
- **Studio:**
  - a seeded Playwright chaos runner (random UI, edit and undo storms, outside edits, an 8-hour soak);
  - `HW_FAULTS` fault injection in the file layer;
  - a nasty-project generator (Unicode, scale, broken JSON, odd paths, symlink and zip escapes, folders changing underneath);
  - preview, export, and installer abuse;
  - an Electron and IPC security audit;
  - hostile MCP arguments and prompt injection.
- **People:** two 2-hour break-it sessions with charters ("make Studio lose your work").
- **Every finding:** a severity, a minimal repro, and a failing test before the fix.
- **Order:** about 3 weeks; the cheapest, highest-yield attacks (property tests, the security audit, the new fuzz targets) come first.

**Already noticed while surveying:**
- Nothing fuzzes the image, font, audio, or layout code, or the Studio–runtime protocol.
- Core has no randomized tests. FINALIZATION.md C-1 says "property-tested", but no property-test library is in the repo, so that claim needs either the tests or a correction.
- CI fuzzes 60 s per target.
- The `win64-asan` and `win64-fuzz` build folders still hold the old `Documents\Moesoft` path. Reconfigure them like the debug and release ones (delete `_deps/*-subbuild` and the cache) before the first fuzz run.

Four questions are open in BREAK_IT.md §9: where findings live, the AI cost of the prompt-injection evals, overnight runs on this PC, and whether you join the break-it sessions. Nothing in the code changed this session.

## Session 22: 2026-10-21 · Break-it, week 1
**Your answers to BREAK_IT.md §9** went in as decisions:
- findings stay in the file until v1.0;
- a few paid prompt-injection runs are OK;
- overnight runs are OK on this PC;
- you join the break-it sessions.

**Built:**
- **Property tests (fast-check):** Core never throws on any text, parsing is lossless, format is idempotent and never changes the compiled bytes, and builds are deterministic in any file order. All passed at 1 000 runs. In Studio, the Screenplay's form edits touch only their own line, and whatever is typed into a line comes back.
- **New runtime fuzz targets:**
  - `fuzz_image`, for JPEG and WebP. Their decoding moved to an SDL-free `hw_decode.c`, so the game and the fuzzer run the same code.
  - `fuzz_layout`, for line breaking, kinsoku, and ruby, with named invariants.
  - The SDL-free libraries moved to `cmake/HimawariCodecs.cmake`, so the fuzz build has them.
  - Seeds live in `runtime/fuzz/seeds/`. CI runs both targets for 60 s.
- **An e2e test** that sends every safe IPC method garbage, plus the security audit (S-19 to S-22).
- **`scripts/break/overnight.mjs`:** every fuzz target in turn with kept corpora, then the property tests at 20 000 runs, and a morning report in `runtime/build/break/`.

**Found and fixed** (BREAK_IT.md §8):
- **B-1, B-2:** typing an unclosed `{` or a final `\` into a Screenplay line broke the file. Both now round-trip while typing.
- **B-3 (S1):** a junction inside a project let the shared file layer (Studio, `hwc`, export, MCP) read and write outside it. Paths are now checked by where they really lead.
- **B-4:** "starts with `assets/`" checks accepted `assets/..`, so a compromised renderer could trash the whole project or plant a git hook. The sandbox now refuses `.` and `..` parts.
- **B-6 (S1):** libunibreak 8.0 wrote before its buffer on some Brahmic-script text (three Cham letters) and on invalid UTF-8. It's patched at download, and the layout now feeds it re-encoded UTF-8. Regression inputs are in `runtime/fuzz/regressions/layout/` and `test_layout.c`.
- **B-7:** a wrong comment about `reveal_count`.

**Open:**
- **B-5:** a 16 384 × 16 384 image needs about 2 GB while loading. Decoding at display size (RA-5) is the real fix.
- The libunibreak bug should be reported upstream. That's a public issue, so it waits for your OK.

**Verified:**
- `corepack pnpm check`: 499 tests.
- ctest: debug 10 of 10, ASan 10 of 10, fuzz 9 of 9 (with both regression sets).
- Golden images: 22. Studio e2e: 8 of 8.
- The first 8-hour overnight run started at the end of the session.

## Session 23: 2026-10-21 · Break-it, weeks 2 and 3
**You said:** skip the 8-hour run (it's noted as optional, before a release, on request), then carry on with the rest of the testing.

**Built:**
- **`scripts/break/stories.mjs`:** random valid stories, played for real. The runtime explores every path, and `test_saveany` (new; also in ctest on the conformance cases) saves and rolls back at every line and loads saves into edited stories. Patched releases are checked to play like fresh builds. 200 stories, nothing found: the VM, saves, rollback, and patches held.
- **The Studio monkey** (`… chaos`, `e2e/monkey.chaos.ts`): random clicks, typing, keys, tool switches, and outside edits, checking for errors and that the disk matches Studio.
- **`HW_FAULTS`:** disk-fault injection in the file layer, for the torture tests.
- **Hostile tests:** for projects (`hostile.test.ts`), the preview's process (`preview.test.ts`), and every AI tool (`tools/hostile.test.ts`).

**Found and fixed** (BREAK_IT.md §8):
- **B-8:** reserved Windows names (`CON`, `NUL`, …) and over-long titles in export names. The file layer now refuses reserved names.
- **B-9:** a moved or deleted project folder got recreated by the next autosave.
- **B-10:** builds were quadratic in scenes per file: 2.5 s down to 13 ms at 5 000 scenes.
- **B-11 (S1, lost work):** saves could overwrite an outside change the watcher had already taken in, an outside change could silently replace an unsaved edit, and a second conflict dropped the first. Saves now carry a fingerprint of their starting text, and conflicts queue.
- **B-12:** Studio's Copy buttons never worked (no clipboard permission). Copying now goes through the main process.
- **B-13:** re-export while the game runs now says so at once.
- **B-14 (S1):** the preview's game dying mid-command crashed Studio's main process with `EPIPE`.

**Open:**
- E-2 and E-4 (fuzzing fonts and audio need SDL in the fuzz build).
- Abusing a running game, weak machines, the installer, and a 2 GB single-file game: for the break-it sessions and the clean-machine test.
- S-25: needs `ANTHROPIC_API_KEY`.
- B-5: big images.

**Verified:**
- `corepack pnpm check`: 532 tests.
- Studio e2e: 8 of 8. The monkey: 6 seeds × 500 actions.
- ctest: debug 11 of 11, ASan 11 of 11.
- Golden images: 22.
- 200 generated stories.

## Session 24: 2026-10-21 · Housekeeping: pushes, the repo layout, and the log
**You asked:** to push everything, then to clean up and organize the workspace without deleting any testing code, and to make sure the log is complete since the rename.

**Pushed** (not logged until now):
- `fe18e49`: the rename to Moeko Works, with the six commits before it (session 20).
- `764aad3` and `d4eb60f`: break-it weeks 1–3 (sessions 22–23).

`main` matches GitHub.

**Organized:**
- The five planning documents moved to `planning/` with `git mv`, so their history follows them: the plan, finalization, break-it, research, and this log. Every relative link in the repo's 72 Markdown files was rewritten and checked.
- The root keeps `README.md`, `CLAUDE.md`, the licenses, and GitHub's community files.
- Test code stays where its tools look for it: unit tests beside the code, `tests/`, `packages/studio/e2e/`, `runtime/tests/`, and `runtime/fuzz/`. Three new READMEs signpost it:
  - `tests/README.md` maps every test and how to run it;
  - `scripts/README.md` covers `break/`, `stress/`, and `release/`;
  - `runtime/fuzz/README.md` covers the targets, seeds, and regressions.
- `scripts/check-links.mjs` checks every relative Markdown link, and is now part of `corepack pnpm check`.
- CLAUDE.md has a "Repository layout" section. The README's status was "Phases 0–6 built" and now reflects Phases 7–8.
- About 890 MB of regenerable output was removed: old installer builds (`packages/studio/release/`), the generated test stories (`runtime/build/break/`), and the examples' `build/` folders. Build outputs the tests use were kept.

**The log, caught up:**
- This overview now covers Phases 7–8, the rename, and the testing.
- The header lists the current document versions.
- The decision register gained D68–D73, from sessions 22–24.
- The next steps are rewritten (the old list still said to commit session 19).

## Session 25: 2026-10-21 · Removing what isn't used
**You asked:** to remove unneeded or unused files, keeping all testing code.

**How it was found:**
- **knip,** run with the packages' real entry points (Electron's main, preload, and renderer; the CLI and MCP entries; tests; scripts), for unused files, exports, and dependencies.
- A scan of Studio's 1 014 UI messages and 376 CSS classes against the code, counting dynamic prefixes like `` `tool.${name}` `` as used.
- A scan of the runtime's public C functions for ones nothing calls.

Each candidate was checked by hand before removing.

**Removed:**
- **`runtime/spikes/`** (the Phase 0 prototypes A, B, and C), their CMake targets, and their CI steps. Their questions were settled in rfcs/0001–0003, and the real runtime replaced them. The CI artifact that carried them is now `runtime-windows-x64` (it still carries `himawari.exe` to the later jobs). The code stays in git history; the RFCs say so.
- **The SDL3_ttf dependency.** Only `spike_c_ttf` used it, and the runtime draws text with FreeType directly. This closes rfcs/0003's to-do, and every runtime build stops downloading and compiling it (38 MB of build files cleared).
- **Dead code:**
  - `hw_fonts_open` (a font wrapper nothing called; fonts come from packs through `hw_fonts_open_sources`);
  - `exprSource` (an unused Studio export);
  - `CreditMode` (an unused Core type);
  - `ajv-formats` (an unused dev dependency).

**Kept on purpose** (they looked unused, but aren't):
- `hw_ext_bool` and `hw_ext_text`: the public C extension API for game developers (rfcs/0007).
- `axe-core`: the accessibility test loads it by file path.
- `env.d.ts`: types for CSS imports.
- The CodeMirror and React Flow CSS hooks.
- The examples' `make-art.mjs`: how their placeholder art is made.
- All test code.

No UI message was unused.

**Verified:**
- Debug and release runtimes rebuilt; ctest 11 of 11.
- The game exe is still 2.6 MB, with only Windows system DLLs.
- `corepack pnpm check`: 532 tests, 72 Markdown files' links.
- Golden images: 22.

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
| D29 | Studio stack: Electron 44 + electron-vite 6 (Vite 8) + React 19 + react-intl + Zustand + CodeMirror 6 + React Flow/ELK; everything bundled (no `node_modules` ship); renderer on `app://` with a CSP header; fuses set; NSIS + portable, unsigned until v1.0 | session 13 | ✅ Active |
| D30 | The preview is the real runtime docked as a child window (`--parent-window`), driven over a JSON-lines pipe (`spec/debug-protocol.md` 1, rfcs/0006); autosave → rebuild → reload in place | session 13 | ✅ Active |
| D31 | One gate for AI writes: `ToolContext.propose`; while Studio is open, Mode A writes are forwarded to Studio's localhost MCP endpoint (`.himawari/session.json`) and become proposals; write tools take a `rationale` (rfcs/0006) | session 13 | ✅ Active |
| D32 | Mode B: Anthropic TypeScript SDK tool runner (streaming) over the same registry, Claude Opus 5.5 by default, refusal fallbacks on, prompt cache prefix as planned; BYOK key in `safeStorage`; runs in Studio's main process for now | session 13 | ✅ Active |
| D33 | Macros are typed and expanded at compile time by whole-token substitution; bodies hold no lines (rfcs/0008) | session 14 | ✅ Active |
| D34 | Extension statements: a JSON signature in `extensions/` plus a C handler in a custom runtime build; one call syntax with macros; a missing handler is skipped, never a crash (rfcs/0007) | session 14 | ✅ Active |
| D35 | Bytecode 1.1 adds `TEXTBOX`, `XCALL`, `XTNS`, `THEM`; writers emit the lowest minor a module needs; themes are compiled by Core, never read as JSON by the runtime (rfcs/0007) | session 14 | ✅ Active |
| D36 | Shipped games read `data.hwp` + `patch*.hwp` (spec/pack.md 1.0, rfcs/0009): xxHash64 TOC, store/LZ4, tombstones, game-id binding, obfuscation documented as not DRM; entries stream through `hw_vfs`; exports are `<Game>.exe`, `data.hwp`, `CREDITS.txt` | session 14 | ✅ Active |
| D37 | The VM remembers each extension statement's most recent call as display state (saved by name); `restore()` receives it, so extensions survive loads, rewinds, reloads, and warps without state of their own | session 14 | ✅ Active |
| D38 | The GPU renderer is created only for games that use rule wipes (and in development); others start on D3D11 to meet the 250 ms start budget. Gamepads start after the first frame | session 14 | ✅ Active |
| D39 | Sunflower Days' third language is Simplified Chinese (`zh-Hans`, Mandarin), replacing Spanish; the player orders CJK fallback fonts by language (YaHei for zh-Hans, JhengHei for zh-Hant, Yu Gothic otherwise) | session 14c | ✅ Active |
| D40 | Plan v0.6: a Studio **UI Designer** (§11.6) becomes Phase 6 (≈ 4 weeks): every built-in UI element movable, resizable, and restylable on the live preview, with a color wheel, palette tokens, presets, and accessibility guards; theme schema 2.0 compiled into `THEM`; AI depth becomes Phase 7, the launch Phase 8 | session 14c | ✅ Active |
| D41 | Theme 2.0 (rfcs/0010): layout, shapes, motion, sounds, presets, and palettes in `theme/theme.json`, compiled into new `THEM` keys (bytecode stays 1.1); the runtime falls back to the himawari look; contrast (HW0133) and edge (HW0132) warnings | session 15 | ✅ Active |
| D42 | Studio has light (default), dark, and match-Windows themes; colors are CSS tokens per theme and components never use raw colors; the main process mirrors the choice in `nativeTheme.themeSource` | session 15 | ✅ Active |
| D43 | The UI Designer edits a mock of each screen beside the real docked game (HTML can't draw over the native preview window); changes are ordinary edits of theme.json, one undo step per drag | session 15 | ✅ Active |
| D44 | Playtests and warps run a coverage pass first (every menu once, every unchosen option), then every combination with the rest of the budget, which scales with the story (40 events per line, 50 000–20 000 000); a step limit after full coverage isn't a problem | session 16 | ✅ Active |
| D45 | Big projects in Studio: the Screenplay draws only nearby scenes, the Explorer folds folders, long lists page by 100, the story graph opens as a folder or file overview past 150 scenes; Core caches parses and tables by exact text; the AI tools summarize past 200 scenes or 150 graph nodes | session 16 | ✅ Active |
| D46 | Review notes (`.himawari/notes.json`, rfcs/0011) anchored on line IDs; written directly (not proposals) because they change no game file; the AI's reviewing recipes leave notes instead of edits | session 17 | ✅ Active |
| D47 | Continuity hints are info and deliberately narrow: HW0340 per scene with branch joins; HW0341 for save-scoped variables only; HW0342 only for variables used in conditions. Conformance compile cases ignore these story hints | session 17 | ✅ Active |
| D48 | The glossary is `glossary.json` at the project root (not `locales/glossary.<lang>.json` as plan §7 first said); HW0407 (info) notes a translation that doesn't use it | session 17 | ✅ Active |
| D49 | "Translate with AI" runs in Studio's main process with the assistant's key: Claude Haiku 5.5 by default (Sonnet 5.5 optional), structured outputs, about 40 lines per request, low effort, cached instructions; each batch is one undo step and lands as needs-review | session 17 | ✅ Active |
| D50 | Recipes are defined once in `@himawari/tools` and served as both MCP prompts and the assistant's slash commands | session 17 | ✅ Active |
| D51 | MCP Apps views (story graph, scene preview) are experimental and always advertised through `_meta.ui` (the SDK has no capability negotiation for them yet) | session 17 | ✅ Active |
| D53 | AI is **present but quiet**: the assistant panel starts closed, AI controls are secondary, every AI feature has a human path, and AI never acts unless asked (FINALIZATION.md §2) | session 18 | ✅ Active |
| D54 | Projects are **one language by default**; Localization and translation tools appear only once a second language is added (FINALIZATION.md §3) | session 18 | ✅ Active |
| D55 | Finalization is merged into Phase 8, now "Finalization and open-source launch" (≈ 16–17 weeks with the core concept); its plan is FINALIZATION.md | session 18 | ✅ Active |
| D56 | **No code needed, code welcome** (P13): every language feature gets a UI path (forms, pickers, plain-word conditions, text styling without markup), enforced by a no-code e2e test; text, `hwc`, git, and C extensions stay first-class on the same files | session 18 | ✅ Active |
| D57 | **Runs on any Windows PC** (P14): Windows 10 and 11 x64 (Arm through emulation); integrated graphics, 4 GB RAM, software fallback; redraw only on change; Windows 7 and 8.1 not supported (pending your answer) | session 18 | ✅ Active |
| D59 | FINALIZATION.md answers: a per-project AI-off switch ("present but quiet" stays the default); Sonnet 5.5 as the assistant's default model; CC0 template and example content; games autosave on quit and at choices; no Windows 7/8.1; folder export by default; a one-click installer | session 18 | ✅ Active |
| D60 | Crediting Himawari is **optional** (the runtime stays zlib): asked once per project at the first export. The default shows nothing in the game; `CREDITS.txt` and the exe's properties carry it. Opt-ins: a small title-screen line, or the window title | session 18 | ✅ Active |
| D61 | Studio installs with **the usual Windows setup wizard** (replacing "one click" in D58): per-user or all-users, a folder choice, and "Run Himawari Studio" at the end; everything inside, nothing else to install | session 19 | ✅ Active |
| D62 | Writer hints (HW0350–HW0359) are suggestions only, worded like an editor's margin notes; a project mutes a kind with `"quietHints"`; errors and warnings can't be muted. Image hints read only file headers (more than 2× the game's size in either direction, or a shape more than 10 % off) | session 19 | ✅ Active |
| D63 | `hwc` and `himawari-mcp` ship inside Studio as `himawari-tools.exe`, a Node single executable (Electron's run-as-Node fuse stays off). `hwc` goes on PATH only when you click it in Settings → Advanced | session 19 | ✅ Active |
| D64 | Local history lives outside the project, in Studio's user data: edits merged over 10 s, 50 versions per file, restore points before changes to three or more files; deletes go to the Recycle Bin with Undo instead of a confirmation | session 19 | ✅ Active |
| D65 | Studio's e2e suite gates releases on a no-code test (every kind of step from menus and forms) and on axe (no serious or critical WCAG 2 A/AA problems on the main screens) | session 19 | ✅ Active |
| D66 | The gallery and music room follow the story (`cg` and `music` lines unlock them); Studio lists what will unlock instead of adding switches | session 19 | ✅ Active |
| D67 | The maker is **Moeko Works** (renamed from Moesoft on 2026-10-21); IDs use `dev.moekoworks.*`, with no alias for the old ones (nothing was released) | session 20 | ✅ Active |
| D68 | Break-it findings live in [BREAK_IT.md](BREAK_IT.md) §8 until v1.0 (security ones stay out of public issues until fixed); every fix comes with a test that failed before it | session 22 | ✅ Active |
| D69 | Long unattended runs (the overnight fuzz run, multi-hour soaks) are optional, run before a release on request; CI fuzzes every target for 60 s | session 23 | ✅ Active |
| D70 | Studio's saves carry a fingerprint of the text they started from; if the disk moved on, the main process refuses and Studio asks which to keep; an outside change over an unsaved edit asks too; conflicts queue (BREAK_IT.md B-11) | session 23 | ✅ Active |
| D71 | The shared file layer (`ProjectFs`) is the sandbox for Studio, `hwc`, export, and MCP: paths are checked by where they really lead (links), never with `.` or `..` parts, never with reserved device names, and a missing project folder is never recreated | sessions 22–23 | ✅ Active |
| D72 | libunibreak 8.0 is patched at download (`runtime/cmake/patch-libunibreak.cmake`) until upstream fixes the out-of-bounds write (BREAK_IT.md B-6); the layout always passes it valid UTF-8 | session 22 | ✅ Active |
| D73 | Planning documents live in `planning/`; the root holds the README, CLAUDE.md, the licenses, and GitHub's community files; [tests/README.md](../tests/README.md) maps every test | session 24 | ✅ Active |
| D74 | The Phase 0 spikes (`runtime/spikes/`) and the SDL3_ttf dependency are retired: the real runtime and its tests cover what they proved (rfcs/0001–0003); the code stays in git history | session 25 | ✅ Active |
| D58 | **One click** (P15): ~~a one-click per-user Studio installer~~ (the installer is D61) with everything inside (`hwc` and `himawari-mcp` run through Studio's executable, no Node); export is one button; an optional single-file game | session 18 | ✅ Active |
| D52 | AI quality is measured by `packages/evals`: deterministic scores, JSON results by date, `TREND.md`; real runs are started by hand with a key (never by default in CI) | session 17 | ✅ Active |

Also: **D13** (games export for Windows x64 only) stays active; its "internal Linux runtime" clause is superseded by D21.

## Open Items (non-blocking)
- Who reviews the Japanese Studio UI strings before v1.0.
- GitHub Sponsors: yes or no.
- ~~Verify at Phase 1 start: ASan/UBSan and libFuzzer in MSYS2 CLANG64 (plan §14.3).~~ ✅ Verified in session 9 (`win64-asan`, `win64-fuzz`).

---

## Next Steps (after session 25)

1. **Usability rounds 1–3** ([FINALIZATION.md](FINALIZATION.md) §11.2) with five or six writers each; the M2 and Phase 6 hallway tests can be round 1.
2. **The two break-it sessions with you** ([BREAK_IT.md](BREAK_IT.md) §4). They also cover what machines can't:
   - abusing a running game (E-17 to E-21);
   - weak machines (E-23);
   - the installer (S-18).
3. **The clean-machine test** once Windows Sandbox is on: re-package the installer first (`corepack pnpm --filter @himawari/studio package`), then run `node scripts/release/clean-machine.mjs`.
4. **Break-it leftovers:**
   - S-25 (prompt injection; set `ANTHROPIC_API_KEY`; a few cents a run);
   - fonts and audio fuzzing (E-2, E-4; SDL in the fuzz build);
   - B-5 (decode big images at display size);
   - report libunibreak's bug upstream (a public issue, on your OK).
5. **Finalization items still open** ([FINALIZATION.md](FINALIZATION.md)):
   - "Save these steps as…" (NC-9);
   - a volume slider (NC-3);
   - "he/she/they by a choice" (NC-8);
   - per-row "Show as script" (C-3) and "Show line IDs" (C-7);
   - W-12 and W-14;
   - Ctrl+Y outside text boxes, D-3, and OC-9;
   - a real Studio icon.
6. The first real eval runs (`node packages/evals/dist/main.js run --model claude-haiku-5-5`, then Sonnet and Opus; a few cents to a dollar each), then `trend --write`.
7. Human review of the Japanese UI (1 014 messages) and of AI-written Japanese in the examples.
8. Before v1.0: code signing (Azure Artifact Signing or an OV certificate); betas ship unsigned with a SmartScreen explanation.
