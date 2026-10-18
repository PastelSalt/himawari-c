# RFC 0002: Rule-wipe transitions with `SDL_GPURenderState` (Spike B)

- **Status:** **Accepted** 2026-10-17 (owner accepted the recommendation; plan v0.5, D23). Verified on the dev PC (D3D12 and Vulkan); smoke-tested on CI
- **Created:** 2026-10-17
- **Affects:** runtime (`render/`), build (shader pipeline)
- **Plan references:** §5.1 (`rule(mask, ms)`), §8.5, §18 Phase 0 · RESEARCH.md §4.1, §15

## Question
Can Himawari-C draw rule/mask wipes with a custom fragment shader through SDL 3.4's GPU render state, inside the normal `SDL_Renderer`, on D3D12 and Vulkan, from a MinGW (UCRT64) build? What is the fallback when there is no GPU renderer?

## Answer: yes, on both backends, pixel-identical

| | D3D12 | Vulkan | Fallback (`--no-gpu`) |
|---|---|---|---|
| Renderer | `gpu`, driver `direct3d12` (SDL's default pick on Windows) | `gpu`, driver `vulkan` | `direct3d11`, plain crossfade |
| Shader | DXIL, 4,584 B | SPIR-V, 1,628 B | none |
| diagonal / radial / blinds at 0.5 | ✅ | ✅ identical to D3D12 (max diff 0/255 over ~102k px each) | ✅ exact 50 % blend |
| Endpoints (progress 0 and 1) | ✅ old / new scene | ✅ | n/a |
| Debug mode (`--debug`) | ✅ no errors | ✅ no errors | n/a |
| Static release `.exe` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| Avg frame, vsync off, 1080p canvas | 0.31 ms | 0.37 ms | 0.31 ms |

Test machine: Windows 11 Pro, AMD Radeon RX 580, GCC 16.2.0 UCRT64, SDL 3.4.18, DXC 1.9.2609. Screenshots: [radial (D3D12)](assets/0002-radial-d3d12.png), [diagonal and blinds (D3D12)](assets/0002-diagonal-blinds-d3d12.png).

Spike B's release `.exe` (SDL only) is **4.14 MB**, so SDL alone is about the whole 4 MB budget (see RFC 0001, finding 2). The two shaders add about 6 KB.

## Answers to the spike's questions
1. **API (3.4.18 header):** the struct is **`SDL_GPURenderStateCreateInfo`** (fragment shader, extra sampler bindings, storage textures/buffers, props). This settles the docs discrepancy in RESEARCH.md §4.1. Functions: `SDL_CreateGPURenderState`, `SDL_SetGPURenderStateFragmentUniforms(state, slot, data, len)`, `SDL_SetGPURenderState(renderer, state or NULL)`, `SDL_DestroyGPURenderState`.
2. **Renderer:** the GPU renderer is **never chosen by default** (Spike A got `direct3d11`). Himawari creates it explicitly: `SDL_CreateGPUDevice(DXIL | SPIRV, debug, NULL)` then `SDL_CreateGPURenderer(device, window)`. The app owns the device and destroys it after the renderer.
3. **Shader pipeline:** one HLSL source (`runtime/shaders/rule_wipe.frag.hlsl`) compiled offline by **DXC** to DXIL (`ps_6_0`) and SPIR-V (`-spirv -fspv-target-env=vulkan1.0`) by `runtime/shaders/compile-shaders.cmake`. The output is committed as C headers in `runtime/shaders/generated/`, so normal builds and CI need no shader compiler. SDL_shadercross is not needed.
4. **Fallback:** if `SDL_CreateGPUDevice` or `SDL_CreateGPURenderer` fails, use `SDL_CreateRenderer(window, NULL)` and degrade `rule(...)` to a crossfade. Verified working.
5. **Cost:** ~0.3 ms per frame (vsync off) for a full 1080p two-layer transition; shaders add ~6 KB.

## Findings that the runtime must respect
1. **Pixel-shader inputs must be `TEXCOORD0` (color) and `TEXCOORD1` (uv).** SDL's HLSL sources show `COLOR0`/`TEXCOORD0`, but SDL compiles them with SDL_shadercross, whose SPIR-V round-trip renames every varying to `TEXCOORDn`. Confirmed by disassembling the renderer's `tri_texture.vert` DXIL (outputs `TEXCOORD0`, `TEXCOORD1`, `SV_Position`). D3D12 links stages by semantic name, so `COLOR0` makes `CreateGraphicsPipelineState` fail with `E_INVALIDARG`. Vulkan links by location, so it worked there and hid the bug.
2. **A failed pipeline is silent.** Without debug mode, SDL's GPU renderer skips the draw and reports nothing; the call still returns success. The runtime must **self-test custom render states at startup** (draw one at progress 1 into a small target, read back a pixel) and switch to the fallback if it didn't draw. Dev builds should create the device with debug mode on.
3. **Bindings:** the drawn texture is always sampler slot 0. A render state's extra samplers start at slot 1. Uniforms come only from the state (`b0, space3` / SPIR-V set 3). SPIR-V needs `[[vk::combinedImageSampler]]` on each texture/sampler pair; DXC warns about `vk::` attributes in DXIL mode, so that pass uses `-Wno-ignored-attributes`.
4. **Uniform updates are safe mid-frame.** `SDL_SetGPURenderStateFragmentUniforms` flushes queued draws that use the state before changing its data, so one state can serve several transitions in a frame (one flush each). Sampler bindings are fixed at creation: one state per mask texture, or recreate it.
5. Mask textures are ordinary `SDL_Texture`s; the GPU texture comes from `SDL_PROP_TEXTURE_GPU_TEXTURE_POINTER`. Masks can be low resolution (the spike uses 480×270 with linear filtering).

## Decision (accepted)
- Rule transitions and future screen effects use **SDL_GPURenderState** on the GPU renderer, which the runtime requests explicitly; SDL picks the backend (D3D12 on Windows).
- Shaders are HLSL, compiled offline with DXC to DXIL + SPIR-V, and committed as headers. Pixel shaders follow finding 1.
- Fallback: default renderer + crossfade, chosen at startup by the self-test in finding 2.
- SPIR-V output is kept: Vulkan is a valid backend on Windows too, and it keeps a future Linux port (plan §18.9) cheap.

## Still to verify
- [x] CI `windows-latest` (no physical GPU, run 38997022400): SDL created the D3D12 GPU renderer (presumably the WARP software adapter) and the DXIL render state; exit 0. **Pixels were not checked on CI**, so a silent pipeline failure (finding 2) can't be ruled out there. The Phase 2 startup self-test covers this.
- [ ] An Intel or NVIDIA GPU.
- [x] The startup self-test from finding 2: `runtime/src/app/hw_rulewipe.c` (Phase 2) wipes a white texture over black through a dark mask and reads the pixel back; if it isn't white, rule wipes fall back to dissolves.
- Deferred with Linux (plan §18.9): a Linux Vulkan build and Proton checks.
- **Vulkan on Windows was switched off** for the size budget at the end of Phase 2 (`SDL_VULKAN OFF`, LOG D26): the GPU renderer uses D3D12, and the D3D11 renderer is the fallback. The committed SPIR-V header stays for the future Linux port. `spike_b --driver vulkan` no longer applies.

## Note on upstream
Finding 1 looks like a documentation gap in SDL. SDL's contribution policy (its `CLAUDE.md`) says generative AI must not be used for contributions to SDL, so any upstream report or PR has to be written by a human.
