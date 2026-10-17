# Himawari: Project Context for AI Coding Sessions

Himawari is an open-source, AI-assisted **visual novel engine** for other developers. It is made by Moesoft (GitHub: `PastelSalt`).

**Status:** **Phase 0 in progress** (scaffold and Spikes A, B, C done on Windows; WSL2/Linux half, the GitHub repo + CI, and accepting RFCs 0001–0003 still open — see the latest LOG.md session). Read these before doing anything substantial:
- [DETAILED_PLAN.md](DETAILED_PLAN.md): the plan (v0.4). Section numbers are referenced everywhere.
- [LOG.md](LOG.md): decision history, the decision register (D01–D20), and next steps.
- [RESEARCH.md](RESEARCH.md): evidence behind decisions (🔬§N in the plan = RESEARCH.md §N).

## Components
| Package | Tech | License |
|---|---|---|
| `@himawari/core` (parser, validator, compiler) | TypeScript | MIT |
| `packages/tools` (shared AI tool registry) | TypeScript + Zod | MIT |
| `himawari-mcp` | TypeScript, MCP spec 2026-07-28 | MIT |
| Himawari Studio | Electron + React + CodeMirror 6 | MIT |
| Himawari-C runtime | C11, SDL 3.4, SDL3_mixer, FreeType, libunibreak | zlib |

## Non-negotiables
- **The runtime never parses source text.** `.hws` → `.hwb` bytecode + `.hwp` pack, compiled by Core.
- **One parser:** Core is the only authority on language semantics. Studio, MCP, and CLI all use it.
- **Game output is Windows x64 only.** Studio runs on Windows + Linux. The Linux runtime build is internal (Studio preview, playtests, CI) and never exported.
- **AI is a development assistant only. No image, audio, voice, video, or other media generation, ever** (plan §1.5). Placeholders are procedural.
- AI edits are **validated proposals** anchored on **line IDs**, never line numbers or diffs.
- **Studio UI strings are never hard-coded.** ICU messages in `locales/`, English default, Japanese required (§11.5).
- Ease-of-use principles P1–P12 (§2) are acceptance criteria.
- `core/` in the runtime has no SDL and no I/O. Content errors never `abort()`.

## Environment (Windows primary)
- Windows 11: MSYS2 **UCRT64** (GCC, CMake, Ninja), Node LTS + pnpm. WSL2 Ubuntu for Linux preview builds, sanitizers, and fuzzing (§14.2, §14.7).
- Line endings: LF (`.gitattributes`).
- CMake presets: `win64-debug`, `win64-release`, `win64-asan`, `linux-debug`, `linux-preview`, `fuzz`, `win64-cross` (§14.3).

## Commands
- TS: `corepack pnpm install`, then `corepack pnpm check` (typecheck, lint, vitest, i18n). pnpm is only reachable through corepack on this PC.
- Runtime: from `runtime/`, with `C:\msys64\ucrt64\bin` on `PATH`: `cmake --preset win64-debug`, `cmake --build --preset win64-debug`, `ctest --preset win64-debug`.
- Git for Windows is at `C:\Program Files\Git\cmd` (may not be on `PATH` in older shells).
- Shaders: DXC is at `%LOCALAPPDATA%\himawari-tools\dxc-1.9.2609\bin\x64\dxc.exe`; from `runtime/`: `cmake -DDXC=<that path> -P shaders/compile-shaders.cmake`. Pixel-shader inputs must be `TEXCOORD0`/`TEXCOORD1` (rfcs/0002, finding 1).

## Working conventions
- Add a session entry to `LOG.md` after meaningful work. Update the decision register when a decision changes.
- Spec changes go through `rfcs/` (§17). Bump spec versions per §5.6.
- Commit or push only when asked.
