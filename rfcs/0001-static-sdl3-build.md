# RFC 0001: Static SDL 3.4 + SDL3_mixer + FreeType build (Spike A)

- **Status:** **Accepted** 2026-10-17 (owner accepted the recommendation; plan v0.5, D22). Verified on Windows; first CI run pending
- **Created:** 2026-10-17
- **Affects:** runtime (build system, dependencies)
- **Plan references:** §8.1, §8.2, §8.13, §14.3, §18 Phase 0 · RESEARCH.md §4.5, §15 · D04, D19

## Question
Can Himawari-C ship as **one fully static Windows x64 `.exe`** built natively with MSYS2 UCRT64, containing SDL 3.4, SDL3_mixer 3.2, and FreeType, that opens a window, plays a sound, and shows Japanese text? (The original question also covered an internal Linux build; plan v0.5 made the project Windows-only, so that part is deferred to §18.9.)

## Recipe
- Sources: `runtime/cmake/HimawariDeps.cmake`. Pinned release tarballs, SHA-256 checked, built with `FetchContent` (`SYSTEM`, so our `-Werror` set doesn't apply to dependency headers). A vendored copy in `runtime/third_party/<name>/` takes precedence when present.
  - SDL `release-3.4.18`, SDL3_mixer `release-3.2.4`, FreeType `VER-2-14-3`.
- SDL: `SDL_STATIC=ON`, `SDL_SHARED=OFF`. Linked as `SDL3::SDL3-static`.
- SDL3_mixer: `BUILD_SHARED_LIBS=OFF`, `SDLMIXER_DEPS_SHARED=OFF`, `SDLMIXER_VENDORED=OFF`, external codecs off. Enabled backends: `vorbis_stb mp3_drmp3 wave aiff voc au`. Linked as `SDL3_mixer::SDL3_mixer-static`.
- FreeType: zlib, bzip2, PNG, HarfBuzz, and Brotli disabled.
- Shipping flags (`win64-release`): `-O2` + IPO/LTO, `-static -static-libgcc -mwindows -s`.
- Code: `runtime/spikes/a_static/main.c`. Accepts `--frames N` (auto-quit) and `--screenshot FILE`.

## Results on the dev PC (Windows 11 Pro, AMD Radeon RX 580, GCC 16.2.0 UCRT64, CMake 4.4.4, Ninja 1.13.2)

| Check | Result |
|---|---|
| Configure + build, `win64-debug` and `win64-release` | ✅ No warnings in our code under `-Wall -Wextra -Werror -Wconversion -Wshadow -Wstrict-prototypes` |
| Window | ✅ Default renderer `direct3d11`. Letterboxed 1920×1080 logical canvas |
| Sound | ✅ 440 Hz tone generated in memory, played through `MIX_LoadRawAudio` + `MIX_PlayAudio` |
| Japanese text | ✅ FreeType 2.14.3 renders with Yu Gothic (`YuGothM.ttc`). Screenshot: [assets/0001-spike-a-release.png](assets/0001-spike-a-release.png) |
| Fully static | ✅ Release `.exe` imports only Windows system DLLs: KERNEL32, USER32, GDI32, ADVAPI32, IMM32, ole32, OLEAUT32, SETUPAPI, SHELL32, VERSION, WINMM, and the UCRT `api-ms-win-crt-*` set (part of Windows 10+). No libgcc, winpthread, or SDL DLLs |
| GUI subsystem | ✅ `Subsystem 2 (Windows GUI)` |
| Non-ASCII paths (§8.13) | ✅ Copied to `…\ひまわり テスト\ゲーム.exe`, run from there, and wrote a screenshot to `…\画面.bmp` |
| Release size | ⚠️ **5.17 MB** (5,419,520 bytes), over the **4 MB** budget in §8.1 |
| Unit tests (`ctest`) | ✅ |

## Findings
1. **The static recipe works natively on MSYS2 UCRT64.** The fallback in plan §19 (ship SDL3 DLLs) is not needed on Windows.
2. **Size is over budget.** SDL is built with every subsystem: the D3D9, D3D11, D3D12, GPU, OpenGL, GLES2, and Vulkan renderers, joystick/HIDAPI, camera, and more. Candidates to trim: `SDL_CAMERA`, `SDL_RENDER_D3D` (D3D9), `SDL_OPENGLES`, `SDL_HIDAPI`/haptics if gamepads don't need them, SDL3_mixer's `mp3_drmp3`. Measure each before deciding (follow-up).
3. **The default renderer is D3D11, not the GPU renderer.** Resolved by RFC 0002: the runtime requests the GPU renderer explicitly. Spike B's SDL-only release `.exe` is 4.14 MB, so SDL itself is nearly the whole budget.
4. The SDL3_mixer 3.2 API matched the header exactly: `MIX_Init`, `MIX_CreateMixerDevice(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, NULL)`, `MIX_LoadRawAudio`, `MIX_PlayAudio` (fire-and-forget).

## Still to verify
- [ ] CI: `runtime-win` on `windows-latest` (the runner has no audio device, so the smoke test uses `SDL_AUDIO_DRIVER=dummy`; check which JP fonts the runner has).
- [ ] `win64-asan` / `win64-fuzz` with MSYS2 CLANG64 (Phase 1 start, plan §14.3).
- [ ] Size trimming to reach ≤ 4 MB (Phase 2).
- Deferred with Linux (plan §18.9): Linux builds and the Ubuntu cross-build check. The `win64-cross` preset and its toolchain file were removed in v0.5.

## Decision (accepted)
Adopt this recipe for the runtime: pinned tarballs + SHA-256 through `FetchContent`, fully static, built natively with MSYS2 UCRT64.
