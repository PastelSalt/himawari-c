# Third-party dependencies (plan §8.2), pinned by tag and SHA-256.
#
# If runtime/third_party/<name>/CMakeLists.txt exists (a vendored copy), it is
# used as-is. Otherwise the pinned release tarball is downloaded once into the
# build tree. Everything is built from source and linked statically.

include(${CMAKE_CURRENT_LIST_DIR}/HimawariHelpers.cmake)

hw_dependency(sdl3
  https://github.com/libsdl-org/SDL/archive/refs/tags/release-3.4.18.tar.gz
  c4b08b950bd29d83caae0ab8d884298d27046a9d30700fb42841c50992665c90)
hw_dependency(sdl3_mixer
  https://github.com/libsdl-org/SDL_mixer/archive/refs/tags/release-3.2.4.tar.gz
  f2ea848ccdf2f394cd4973ee0f6c482e04511044695cccfd46bab6dcd7f780aa)
# OVERRIDE_FIND_PACKAGE: SDL3_ttf's find_package(Freetype) resolves to this copy.
hw_dependency(freetype
  https://github.com/freetype/freetype/archive/refs/tags/VER-2-14-3.tar.gz
  dc49de6b01a266eef4876a4dd34d9842c475d3e28ff2eff63bd2fb760ab56261
  OVERRIDE_FIND_PACKAGE)
hw_dependency(sdl3_ttf
  https://github.com/libsdl-org/SDL_ttf/archive/refs/tags/release-3.2.2.tar.gz
  ff6b81d3dc39d843cc3ead6dedd68043a79513d266792ea89445547ef4e9b073)

# Never build dependencies as DLLs.
hw_force(BUILD_SHARED_LIBS OFF)

# SDL 3.4: static only.
hw_force(SDL_SHARED OFF)
hw_force(SDL_STATIC ON)
hw_force(SDL_TEST_LIBRARY OFF)
hw_force(SDL_TESTS OFF)
hw_force(SDL_EXAMPLES OFF)
hw_force(SDL_INSTALL OFF)

# Size budget (plan §8.1: <= 4 MB): only what a visual novel uses on Windows.
# Kept: video, audio (WASAPI + dummy for CI), the GPU renderer on D3D12 (rule
# wipes, rfcs/0002), the D3D11 renderer as the fallback, keyboard, mouse, and
# gamepads through XInput and raw input.
hw_force(SDL_CAMERA OFF)
hw_force(SDL_HAPTIC OFF)
hw_force(SDL_HIDAPI OFF)
hw_force(SDL_POWER OFF)
hw_force(SDL_SENSOR OFF)
hw_force(SDL_DIALOG OFF)
hw_force(SDL_TRAY OFF)
hw_force(SDL_OPENGL OFF)
hw_force(SDL_OPENGLES OFF)
hw_force(SDL_VULKAN OFF)
hw_force(SDL_RENDER_VULKAN OFF)
hw_force(SDL_RENDER_D3D OFF)
hw_force(SDL_RENDER_D3D12 OFF) # the GPU renderer already drives D3D12
hw_force(SDL_OFFSCREEN OFF)
hw_force(SDL_DISKAUDIO OFF)
hw_force(SDL_VIRTUAL_JOYSTICK OFF)

# SDL3_mixer 3.2: built-in decoders only (WAV/AIFF/VOC/AU plus the bundled
# stb_vorbis and dr_mp3). No external codec libraries, nothing loaded at runtime.
hw_force(SDLMIXER_DEPS_SHARED OFF)
hw_force(SDLMIXER_VENDORED OFF)
hw_force(SDLMIXER_STRICT ON)
hw_force(SDLMIXER_INSTALL OFF)
hw_force(SDLMIXER_TESTS OFF)
hw_force(SDLMIXER_EXAMPLES OFF)
hw_force(SDLMIXER_FLAC OFF)
hw_force(SDLMIXER_GME OFF)
hw_force(SDLMIXER_MOD OFF)
hw_force(SDLMIXER_MIDI OFF)
hw_force(SDLMIXER_OPUS OFF)
hw_force(SDLMIXER_WAVPACK OFF)
hw_force(SDLMIXER_MP3_MPG123 OFF)
hw_force(SDLMIXER_VORBIS_VORBISFILE OFF)
hw_force(SDLMIXER_VORBIS_TREMOR OFF)

# FreeType: no optional compression or PNG libraries. HarfBuzz is Tier 2 (plan §7).
hw_force(FT_DISABLE_ZLIB ON)
hw_force(FT_DISABLE_BZIP2 ON)
hw_force(FT_DISABLE_PNG ON)
hw_force(FT_DISABLE_HARFBUZZ ON)
hw_force(FT_DISABLE_BROTLI ON)
hw_force(SKIP_INSTALL_ALL ON)

# SDL3_ttf 3.2: our FreeType, no HarfBuzz (Tier 2), no PlutoSVG color emoji.
hw_force(SDLTTF_VENDORED OFF)
hw_force(SDLTTF_HARFBUZZ OFF)
hw_force(SDLTTF_PLUTOSVG OFF)
hw_force(SDLTTF_SAMPLES OFF)
hw_force(SDLTTF_INSTALL OFF)

FetchContent_MakeAvailable(sdl3 sdl3_mixer freetype)

# FreeType: register only the modules in cmake/freetype/hw_ftmodule.h; the rest
# are never referenced, so the linker drops them.
# C sources only: windres (FreeType's version resource) can't take the angle brackets.
target_compile_definitions(freetype PRIVATE "$<$<COMPILE_LANGUAGE:C>:FT_CONFIG_MODULES_H=<hw_ftmodule.h$<ANGLE-R>>")
target_include_directories(freetype PRIVATE "${PROJECT_SOURCE_DIR}/cmake/freetype")

# SDL3_ttf links Freetype::Freetype; FreeType's own build only defines `freetype`.
if(NOT TARGET Freetype::Freetype)
  add_library(Freetype::Freetype ALIAS freetype)
endif()
FetchContent_MakeAvailable(sdl3_ttf)

# Line breaking and the image decoders (SDL-free, shared with the fuzz build).
include(${CMAKE_CURRENT_LIST_DIR}/HimawariCodecs.cmake)
