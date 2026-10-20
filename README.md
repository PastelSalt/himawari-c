# Himawari 🌻

An open-source **visual novel engine** that's easy enough for anyone, open enough for coders, and light enough for any PC.

- **No code needed, code welcome.** Himawari Studio is meant to let you make a whole visual novel without writing code: lines, choices, characters, backgrounds, music, branching, and the look of your menus. Everything can be done with pickers and forms. People who code get the same project as plain text, with a command-line tool, git, and C extensions, and both ways can be mixed.
- **Runs on any Windows PC.** Games are tiny native programs written in C. They start with a double-click on any Windows 10 or 11 PC, old laptops included, with nothing to install.
- **Easy to set up.** Studio installs with a normal Windows setup and brings everything it needs; exporting a game is one button.
- **AI is an optional assistant**, never required. It never makes images, audio, or video.

Some of this is still being finished: the finalization plan, [FINALIZATION.md](FINALIZATION.md), lists what's done and what isn't.

> **Status: Phases 0–6 built.** The script language, compiler, and validator (`hwc`), the C runtime (`himawari.exe`, about 2.6 MB, feature-complete: menus, saves, config, accessibility, gamepad, gallery, music room, novel mode, themes, asset packs), the AI tools (`himawari-mcp`), and **Himawari Studio** (the editor, with the game playing beside it as you write) work. Studio's **UI Designer** restyles a game's menus and textbox by hand (move, resize, recolor, presets, a color wheel), and Studio itself comes in light (the default), dark, or Windows's own theme. The hallway tests with non-programmers (Phases 4 and 6) are still to do. See [DETAILED_PLAN.md](DETAILED_PLAN.md) for the full plan and [LOG.md](LOG.md) for progress.
>
> **Platform: Windows only.** Games, Studio, and all tooling target Windows x64. Linux support is planned as a future improvement.

## What you can do today
- **Write** scenes in `.hws`, a small Ren'Py-like language ([spec/language.md](spec/language.md)), with characters, layered sprites, menus, variables, and text markup (ruby, colors, pauses).
- **Check and build** with `hwc`: `hwc init`, `hwc check` (friendly diagnostics with fixes), `hwc fmt`, `hwc build --release` (a playable `build/windows/<Game>/` folder: the game's `.exe`, `data.hwp`, and credits; `--patch` for small updates).
- **Play** with `hwc run` (dev mode: placeholders for missing art, F3 overlay, F5 reload, `--warp` to any line), or play every path headlessly with `hwc playtest`.
- **Translate** with `hwc l10n` (CSV/XLIFF, placeholder checks); games switch language in-game.
- **Work with Claude** (Claude Code or the desktop app) through `himawari-mcp`: it reads, writes, translates, playtests, and screenshots your story, with every edit validated first. See [docs/ai-setup.md](docs/ai-setup.md).

Try the examples: [`examples/sunflower-demo`](examples/sunflower-demo) (every feature, in English, Japanese, and Simplified Chinese), [`examples/tutorial`](examples/tutorial) (English and Japanese), [`examples/layered`](examples/layered) (layered sprites), and [`examples/festival-eve`](examples/festival-eve) (a three-route chapter written by an AI agent through MCP).

## Parts

| Path | Component | License |
|---|---|---|
| [`spec/`](spec/) | Script Data Contract: language, bytecode, schemas, agent guide | CC-BY-4.0 |
| [`packages/core`](packages/core) | `@himawari/core`: parser, validator, analyzer, compiler (the one authority on semantics) | MIT |
| [`packages/cli`](packages/cli) | `hwc` command-line tool | MIT |
| [`packages/tools`](packages/tools) | `@himawari/tools`: the AI tool registry, shared by MCP and Studio | MIT |
| [`packages/mcp`](packages/mcp) | `himawari-mcp`: MCP server (spec 2026-07-28) | MIT |
| [`packages/studio`](packages/studio) | Himawari Studio: the editor (Electron), with the game docked in its preview | MIT |
| [`runtime/`](runtime/) | Himawari-C: C11 + SDL 3.4 runtime that plays compiled games | zlib |
| [`templates/`](templates/), [`examples/`](examples/) | Starter projects and examples | MIT |
| [`rfcs/`](rfcs/) | Spec-change proposals and spike results | CC-BY-4.0 |

## AI scope
AI in Himawari is a **development assistant only**: it reads, writes, validates, translates, and playtests scripts and text. Himawari never generates images, audio, voice, or video (plan §1.5), and games run no AI. AI-written text is recorded in `.himawari/provenance.json`; `hwc report ai-content` summarizes it for store disclosure.

## Building

### TypeScript (Node 24+)
```bash
corepack pnpm install
```
```bash
corepack pnpm check
```
`hwc` is then `node packages/cli/dist/main.js`, and the MCP server `node packages/mcp/dist/main.js`.

### Runtime (Windows, MSYS2 UCRT64)
Toolchain setup is in plan §14.2. With `C:\msys64\ucrt64\bin` on `PATH`, from `runtime/`:
```bash
cmake --preset win64-release
```
```bash
cmake --build --preset win64-release
```
```bash
ctest --preset win64-release
```
The first configure downloads the pinned SDL, SDL3_mixer, FreeType, libunibreak, stb_image (JPEG), libwebp, and SDL3_ttf sources (hash-checked; SDL3_ttf is only used by the Spike C comparison). Presets: `win64-debug`, `win64-release` (the shipping build: `-Os`, LTO, static), and `win64-asan` / `win64-fuzz` (MSYS2 CLANG64: ASan/UBSan and libFuzzer).

Play a project:
```bash
./build/win64-release/himawari.exe --project ../examples/tutorial
```
`hwc run`, `hwc playtest`, `hwc build --release`, and himawari-mcp find the runtime here automatically, or through `HIMAWARI_RUNTIME`.

### Shaders
Shaders are HLSL in `runtime/shaders/`, precompiled to DXIL and SPIR-V headers in `runtime/shaders/generated/` (committed). Only run this after editing a shader. It needs [DXC](https://github.com/microsoft/DirectXShaderCompiler/releases):
```bash
cmake -DDXC=path/to/dxc.exe -P shaders/compile-shaders.cmake
```
