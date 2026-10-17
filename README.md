# Himawari 🌻

An open-source, AI-assisted **visual novel engine** for developers. Write in plain text, play instantly, ship a small native Windows game.

> **Status: Phase 0 (foundations and spikes).** Nothing is usable yet. See [DETAILED_PLAN.md](DETAILED_PLAN.md) for the full plan and [LOG.md](LOG.md) for progress.

## Parts

| Path | Component | License |
|---|---|---|
| [`spec/`](spec/) | Script Data Contract: language, schemas, formats | CC-BY-4.0 |
| [`packages/core`](packages/core) | `@himawari/core`: parser, validator, compiler (the one authority on semantics) | MIT |
| [`packages/cli`](packages/cli) | `hwc` command-line tool | MIT |
| [`packages/studio`](packages/studio) | Himawari Studio (Phase 0: UI message catalogs only) | MIT |
| [`runtime/`](runtime/) | Himawari-C: C11 + SDL 3.4 runtime that plays compiled games | zlib |
| [`rfcs/`](rfcs/) | Spec-change proposals and spike results | CC-BY-4.0 |

Coming later: `packages/tools` and `packages/mcp` (Phase 3), the Studio app (Phase 4), templates and examples.

## AI scope
AI in Himawari is a **development assistant only**: it reads, writes, validates, and playtests scripts and text. Himawari never generates images, audio, voice, or video (plan §1.5).

## Building

### TypeScript (Node 24+)
```bash
corepack pnpm install
```
```bash
corepack pnpm check
```

### Runtime (Windows, MSYS2 UCRT64)
Toolchain setup is in plan §14.2. With `C:\msys64\ucrt64\bin` on `PATH`, from `runtime/`:
```bash
cmake --preset win64-debug
```
```bash
cmake --build --preset win64-debug
```
```bash
ctest --preset win64-debug
```
The first configure downloads the pinned SDL, SDL3_mixer, and FreeType sources (hash-checked). Presets: `win64-debug`, `win64-release`, `win64-asan`, `linux-debug`, `linux-preview`, `fuzz`, `win64-cross`.

Spike A (a window, a sound, and Japanese text, all statically linked):
```bash
./build/win64-debug/spike_a.exe
```
Spike B (rule-wipe transitions through the SDL GPU renderer; add `--driver vulkan` or `--driver direct3d12`):
```bash
./build/win64-debug/spike_b.exe
```

Spike C (a Japanese paragraph with ruby and kinsoku; `spike_c_ft` uses FreeType directly, `spike_c_ttf` uses SDL3_ttf; add `--width 600` or `--check-only`):
```bash
./build/win64-debug/spike_c_ft.exe
```

### Shaders
Shaders are HLSL in `runtime/shaders/`, precompiled to DXIL and SPIR-V headers in `runtime/shaders/generated/` (committed). Only run this after editing a shader. It needs [DXC](https://github.com/microsoft/DirectXShaderCompiler/releases):
```bash
cmake -DDXC=path/to/dxc.exe -P shaders/compile-shaders.cmake
```
