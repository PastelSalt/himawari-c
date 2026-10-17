cmake_minimum_required(VERSION 3.25)
project(himawari_c VERSION 0.0.0 LANGUAGES C)

# Himawari-C, the runtime (plan §8). License: zlib.

option(HW_WITH_SDL "Build the SDL-based targets (spikes, later the game runtime)" ON)
option(HW_SANITIZE "Build with AddressSanitizer and UBSan" OFF)
option(HW_FUZZ "Build libFuzzer targets (clang only)" OFF)
option(HW_RELEASE_STATIC "Shipping build: LTO, fully static, GUI subsystem, stripped (plan §14.3)" OFF)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Debug)
endif()

# Flags for Himawari's own code only (plan §8.14). Dependencies keep their own.
add_library(hw_warnings INTERFACE)
target_compile_options(hw_warnings INTERFACE -Wall -Wextra -Werror -Wconversion -Wshadow -Wstrict-prototypes)

if(HW_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
endif()

if(HW_RELEASE_STATIC)
  set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ON)
  if(WIN32)
    add_link_options(-static -static-libgcc -mwindows -s)
  else()
    add_link_options(-s)
  endif()
endif()

# core/: no SDL, no I/O. Shared by the game, headless playtests, tests, and fuzzers (plan §8.3).
add_library(hw_core STATIC
  src/core/hw_utf8.c
)
target_include_directories(hw_core PUBLIC src/core)
target_link_libraries(hw_core PRIVATE hw_warnings)

enable_testing()
add_executable(test_utf8 tests/test_utf8.c)
target_link_libraries(test_utf8 PRIVATE hw_core hw_warnings)
add_test(NAME utf8 COMMAND test_utf8)

if(HW_FUZZ)
  add_executable(fuzz_utf8 fuzz/fuzz_utf8.c)
  target_compile_options(fuzz_utf8 PRIVATE -fsanitize=fuzzer,address)
  target_link_options(fuzz_utf8 PRIVATE -fsanitize=fuzzer,address)
  target_link_libraries(fuzz_utf8 PRIVATE hw_core hw_warnings)
endif()

if(HW_WITH_SDL)
  include(cmake/HimawariDeps.cmake)

  # text/: paragraph layout (line breaking, kinsoku, ruby). No SDL, no font library (rfcs/0003).
  add_library(hw_text STATIC src/text/hw_layout.c)
  target_include_directories(hw_text PUBLIC src/text)
  target_link_libraries(hw_text PUBLIC hw_core unibreak PRIVATE hw_warnings)

  add_executable(test_layout tests/test_layout.c)
  target_link_libraries(test_layout PRIVATE hw_text hw_warnings)
  if(UNIX)
    target_link_libraries(test_layout PRIVATE m)
  endif()
  add_test(NAME layout COMMAND test_layout)

  # Spike A: static SDL3 + SDL3_mixer + FreeType window, sound, and JP text (rfcs/0001).
  add_executable(spike_a spikes/a_static/main.c)
  target_link_libraries(spike_a PRIVATE
    hw_core hw_warnings
    SDL3::SDL3-static SDL3_mixer::SDL3_mixer-static freetype)
  if(UNIX)
    target_link_libraries(spike_a PRIVATE m)
  endif()

  # Spike C: JP paragraph with ruby + kinsoku; FreeType directly vs SDL3_ttf (rfcs/0003).
  # Two executables so each backend's size can be measured on its own.
  foreach(backend ft ttf)
    add_executable(spike_c_${backend} spikes/c_text/main.c spikes/c_text/glyphs_${backend}.c)
    target_link_libraries(spike_c_${backend} PRIVATE hw_text hw_warnings SDL3::SDL3-static)
  endforeach()
  target_link_libraries(spike_c_ft PRIVATE freetype)
  target_link_libraries(spike_c_ttf PRIVATE SDL3_ttf::SDL3_ttf)

  # Spike B: rule-wipe transition via SDL_GPURenderState on D3D12 / Vulkan (rfcs/0002).
  # Shaders are precompiled into shaders/generated/ by shaders/compile-shaders.cmake.
  add_executable(spike_b spikes/b_rule_wipe/main.c)
  target_include_directories(spike_b PRIVATE shaders/generated)
  target_link_libraries(spike_b PRIVATE hw_core hw_warnings SDL3::SDL3-static)
  if(UNIX)
    target_link_libraries(spike_b PRIVATE m)
  endif()
endif()
