# Himawari RFCs

Numbered proposals for changes to the Script Data Contract (`spec/`) and for engine decisions that need a written record (plan §17, modeled on MCP's SEP workflow).

## Process
1. Copy `0000-template.md` to `NNNN-short-title.md` with the next free number.
2. Open a pull request. Discussion happens on the PR.
3. The BDFL accepts or rejects it (see GOVERNANCE.md, Phase 7). Accepted RFCs are merged with status **Accepted**; the spec change follows in its own PR.
4. Spec changes bump versions per plan §5.6.

Phase 0 spike results are recorded as RFCs 0001–0003.

| RFC | Title | Status |
|---|---|---|
| [0001](0001-static-sdl3-build.md) | Static SDL 3.4 + SDL3_mixer + FreeType build (Spike A) | Draft: Windows half verified |
| [0002](0002-gpu-render-state-transitions.md) | Rule-wipe transitions with `SDL_GPURenderState` (Spike B) | Draft: D3D12 + Vulkan verified on Windows |
| [0003](0003-text-stack.md) | Text stack: FreeType + libunibreak vs SDL3_ttf (Spike C) | Draft: verified on Windows; proposes FreeType direct |
