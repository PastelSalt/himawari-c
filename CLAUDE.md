# Himawari: Project Context for AI Coding Sessions

Himawari is an open-source, AI-assisted **visual novel engine** for other developers. It is made by Moesoft (GitHub: `PastelSalt`). Repo: **https://github.com/PastelSalt/himawari-c** (public).

**Status:** **Phase 3 done** (2026-10-17): `@himawari/tools` (22 AI tools, defined once) and `himawari-mcp` (MCP spec 2026-07-28, SDK v2, stdio) with the agent guide, resources, and prompts; `hwc run/playtest/graph/report/ai setup`, `build --release` packaging; M1 reached with `examples/festival-eve/`. Phase 2 (the C runtime `himawari.exe`) and bytecode 1.0 (frozen) are done too. **Phase 4 built** (2026-10-18): Himawari Studio (`packages/studio`, Electron 44 + React 19 + CodeMirror 6) with the runtime docked in its preview (`spec/debug-protocol.md`), the Screenplay and Script views, the project panels, AI proposals with Mode A live sync and the Mode B assistant (rfcs/0006). **Phase 5 done** (2026-10-18): bytecode 1.1 (macros, extension statements, NVL, themes), `.hwp` packs and patches, JPEG/WebP, config/accessibility/gamepad, gallery, music room, crash reports, `examples/sunflower-demo` (EN/JA/zh-Hans), golden images (`tests/golden/`), budgets via `himawari --perf`. Next: the M2 hallway test, then Phase 6 (the Studio UI Designer, plan v0.6 §11.6) on the owner's go-ahead. See the latest LOG.md session. Read these before doing anything substantial:
- [DETAILED_PLAN.md](DETAILED_PLAN.md): the plan (v0.6). Section numbers are referenced everywhere.
- [LOG.md](LOG.md): decision history, the decision register (D01–D40), and next steps.
- [RESEARCH.md](RESEARCH.md): evidence behind decisions (🔬§N in the plan = RESEARCH.md §N).
- [rfcs/](rfcs/): accepted decisions (0001 static build, 0002 GPU transitions, 0003 text stack, 0004 bytecode before the freeze, 0005 layered sprites, 0006 Studio preview and AI live sync, 0007 extensions, textbox modes, and themes, 0008 macros, 0009 asset packs).

## Components
| Package | Tech | License |
|---|---|---|
| `@himawari/core` (parser, validator, compiler) | TypeScript | MIT |
| `@himawari/tools` (`packages/tools`, the AI tool registry) | TypeScript + Zod 4 | MIT |
| `himawari-mcp` (`packages/mcp`) | TypeScript, MCP spec 2026-07-28, SDK v2 | MIT |
| Himawari Studio | Electron + React + CodeMirror 6 | MIT |
| Himawari-C runtime | C11, SDL 3.4, SDL3_mixer, FreeType (direct), libunibreak, stb_image (JPEG), libwebp | zlib |

## Non-negotiables
- **Windows only, for everything** (plan v0.5): games, Studio, CLI, MCP, development, and CI. Linux is a future improvement (§18.9). Don't add Linux presets, jobs, or code paths, but keep `core/` and `text/` portable.
- **The runtime never parses source text.** `.hws` → `.hwb` bytecode + `.hwp` pack, compiled by Core. Even text markup like ruby reaches the runtime as pre-structured runs.
- **One parser:** Core is the only authority on language semantics. Studio, MCP, and CLI all use it.
- **AI is a development assistant only. No image, audio, voice, video, or other media generation, ever** (plan §1.5). Placeholders are procedural.
- AI edits are **validated proposals** anchored on **line IDs**, never line numbers or diffs.
- **Studio UI strings are never hard-coded.** ICU messages in `locales/`, English default, Japanese required (§11.5).
- Ease-of-use principles P1–P12 (§2) are acceptance criteria.
- `core/` in the runtime has no SDL and no I/O. `text/hw_layout.c` has no SDL and no font library. Content errors never `abort()`.

## Environment (Windows only)
- Windows 11: MSYS2 **UCRT64** (GCC, CMake, Ninja) on `PATH`, Node LTS + pnpm (via corepack), Git, GitHub CLI (logged in as `PastelSalt`).
- Line endings: LF (`.gitattributes`).
- CMake presets: `win64-debug`, `win64-release` (UCRT64 GCC), and `win64-asan` / `win64-fuzz` (MSYS2 CLANG64, verified; put `C:\msys64\clang64\bin` first on `PATH`) (§14.3).

## Commands
- TS: `corepack pnpm install`, then `corepack pnpm check` (typecheck, lint, vitest, i18n). pnpm is only reachable through corepack on this PC.
- CLI (after `corepack pnpm exec tsc -b`): `node packages/cli/dist/main.js check|fmt [--check]|build [--release]|disasm <file.hwb>|init <folder> [--template adv|blank]|l10n sync|l10n export --lang ja|l10n import <file> --lang ja|run|playtest|graph|report ai-content|ai setup`. Templates and examples must check clean and compile (`tests/projects.test.ts`).
- Conformance: `corepack pnpm vitest run tests/conformance`; regenerate expected files with `UPDATE_CONFORMANCE=1` and review the diff.
- Runtime: from `runtime/`: `cmake --preset win64-debug`, `cmake --build --preset win64-debug`, `ctest --preset win64-debug`. Regenerate C conformance transcripts with `UPDATE_CONFORMANCE=1 ./build/win64-debug/test_conformance.exe` (TS writes `expected.hwb` first).
- MCP: `node packages/mcp/dist/main.js --project <dir> [--allow-build]`; `hwc ai setup` prints client configs. Tests start the real server (`packages/mcp/src/server.test.ts`, `live-sync.test.ts`); exec-tool tests skip without a built runtime. While Studio has a project open, write tools are forwarded to it as proposals (`.himawari/session.json`).
- Studio (`packages/studio`, needs the release or debug runtime built): `corepack pnpm --filter @himawari/studio dev` (hot reload) or `… build` then `electron .` from `packages/studio`; `… e2e` (Playwright: first run, edit → preview under 1 s, export, Japanese UI); `… package` (NSIS installer and portable exe in `packages/studio/release/`). Electron fetches its binary on first use (`node packages/studio/node_modules/electron/install.js`). Studio UI messages: `packages/studio/locales/{en,ja}.json`; diagnostics' English comes from Core via `scripts/sync-diagnostic-messages.mjs`. `HIMAWARI_STUDIO_TEST_HOME` runs Studio against a throwaway folder (tests use it; never point it at real data).
- Player: `himawari --project <dir>` (dev: F3 overlay, F5 reload, `--warp scene|file:line|#lineid`, `--no-gpu`/`--gpu`), `himawari --headless --project <dir> --playtest [lang=ja]`, smoke tests with `--start --frames N --advance N --pick K --screenshot out.png`; also `--screen config|gallery|…`, `--unlock-all`, `--save-to FILE`, `--perf FILE` (plan §8.1 budgets; `runtime/tests/check_budgets.sh`), `--crash-test` (dev). A shipped game reads `data.hwp` + `patch*.hwp` beside the exe (`spec/pack.md`); `hwc build --release [--patch]` writes them, `hwc disasm x.hwp` lists one. Unattended runs (`--frames`) never write player data, use default settings, and ignore the real mouse.
- Golden images: `corepack pnpm vitest run tests/golden` (needs a built runtime; renders `examples/sunflower-demo`); regenerate with `HW_UPDATE_GOLDEN=1` and look at every image. Pack fixtures: `UPDATE_CONFORMANCE=1 … vitest run tests/packs`.
- Extension statements in a runtime build: CMake cache variable `HW_EXTENSIONS` (C files defining `hw_ext_register_<stem>()`); the stock runtime carries `runtime/ext/screen_tint.c`.
- If a build "does nothing" after edits, outputs may be future-dated (the PC clock/timezone changed): delete our future-dated objects/exes, or `packages/*/dist` + `*.tsbuildinfo` for TS.
- Git for Windows is at `C:\Program Files\Git\cmd` (may not be on `PATH` in older shells).
- Shaders: DXC is at `%LOCALAPPDATA%\himawari-tools\dxc-1.9.2609\bin\x64\dxc.exe`; from `runtime/`: `cmake -DDXC=<that path> -P shaders/compile-shaders.cmake`. Pixel-shader inputs must be `TEXCOORD0`/`TEXCOORD1` (rfcs/0002, finding 1).

## Working conventions
- Add a session entry to `LOG.md` after meaningful work. Update the decision register when a decision changes.
- Spec changes go through `rfcs/` (§17). Bump spec versions per §5.6.
- Commit or push only when asked.
