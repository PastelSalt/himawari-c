# Himawari RFCs

Numbered proposals for changes to the Script Data Contract (`spec/`) and for engine decisions that need a written record (plan §17, modeled on MCP's SEP workflow).

## Process
1. Copy `0000-template.md` to `NNNN-short-title.md` with the next free number.
2. Open a pull request. Discussion happens on the PR.
3. The BDFL accepts or rejects it (see GOVERNANCE.md, Phase 8). Accepted RFCs are merged with status **Accepted**; the spec change follows in its own PR.
4. Spec changes bump versions per plan §5.6.

Phase 0 spike results are recorded as RFCs 0001–0003.

| RFC | Title | Status |
|---|---|---|
| [0001](0001-static-sdl3-build.md) | Static SDL 3.4 + SDL3_mixer + FreeType build (Spike A) | **Accepted** 2026-10-17 |
| [0002](0002-gpu-render-state-transitions.md) | Rule-wipe transitions with `SDL_GPURenderState` (Spike B) | **Accepted** 2026-10-17 |
| [0003](0003-text-stack.md) | Text stack: FreeType + libunibreak vs SDL3_ttf (Spike C) | **Accepted** 2026-10-17: FreeType direct |
| [0004](0004-bytecode-before-freeze.md) | Bytecode additions before the 1.0 freeze (`META`, `LOCL`, prompt IDs, loader rules, RNG) | **Accepted** 2026-10-17 |
| [0005](0005-layered-sprites-in-bytecode.md) | Layered sprites in bytecode (`SPRT`) and attribute-merge semantics | **Accepted** 2026-10-17 |
| [0006](0006-studio-preview-and-live-sync.md) | Studio's docked preview, the debug protocol, and AI live sync | **Accepted** 2026-10-18 |
| [0007](0007-extensions-textbox-themes.md) | Extension statements, textbox modes, and themes (bytecode 1.1) | **Accepted** 2026-10-18 |
| [0008](0008-macros.md) | Macros (`define statement`) | **Accepted** 2026-10-18 |
| [0009](0009-asset-packs.md) | Asset packs (`.hwp`) and patches | **Accepted** 2026-10-18 |
