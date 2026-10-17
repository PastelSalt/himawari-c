# Himawari: Project Context for AI Coding Sessions

Himawari is an open-source, AI-assisted **visual novel engine** for other developers. It is made by Moesoft (GitHub: `PastelSalt`). Repo: **https://github.com/PastelSalt/himawari-c** (public).

**Status:** **Phase 1 in progress.** Done: sanitizers verified, lexer, lossless CST parser, AST + refs index, formatter, semantic validator, `hwc check`/`fmt` (`packages/core/src/syntax/`, `format.ts`, `project/`, `packages/cli`). Next: edit API, spec docs, bytecode + compiler. The latest LOG.md session ends with the exact remaining list. Read these before doing anything substantial:
- [DETAILED_PLAN.md](DETAILED_PLAN.md): the plan (v0.5). Section numbers are referenced everywhere.
- [LOG.md](LOG.md): decision history, the decision register (D01–D24), and next steps.
- [RESEARCH.md](RESEARCH.md): evidence behind decisions (🔬§N in the plan = RESEARCH.md §N).
- [rfcs/](rfcs/): accepted spike decisions (0001 static build, 0002 GPU transitions, 0003 text stack).

## Components
| Package | Tech | License |
|---|---|---|
| `@himawari/core` (parser, validator, compiler) | TypeScript | MIT |
| `packages/tools` (shared AI tool registry) | TypeScript + Zod | MIT |
| `himawari-mcp` | TypeScript, MCP spec 2026-07-28 | MIT |
| Himawari Studio | Electron + React + CodeMirror 6 | MIT |
| Himawari-C runtime | C11, SDL 3.4, SDL3_mixer, FreeType (direct), libunibreak | zlib |

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
- CLI (after `corepack pnpm exec tsc -b`): `node packages/cli/dist/main.js check|fmt [--check] [paths]`.
- Runtime: from `runtime/`: `cmake --preset win64-debug`, `cmake --build --preset win64-debug`, `ctest --preset win64-debug`.
- Git for Windows is at `C:\Program Files\Git\cmd` (may not be on `PATH` in older shells).
- Shaders: DXC is at `%LOCALAPPDATA%\himawari-tools\dxc-1.9.2609\bin\x64\dxc.exe`; from `runtime/`: `cmake -DDXC=<that path> -P shaders/compile-shaders.cmake`. Pixel-shader inputs must be `TEXCOORD0`/`TEXCOORD1` (rfcs/0002, finding 1).

## Working conventions
- Add a session entry to `LOG.md` after meaningful work. Update the decision register when a decision changes.
- Spec changes go through `rfcs/` (§17). Bump spec versions per §5.6.
- Commit or push only when asked.
