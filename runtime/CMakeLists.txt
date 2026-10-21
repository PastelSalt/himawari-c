cmake_minimum_required(VERSION 3.25)
project(himawari_c VERSION 0.0.0 LANGUAGES C RC)

# Himawari-C, the runtime (plan §8). License: zlib.

# Windows only (plan v0.5, D21). Linux is a future improvement (plan §18.9);
# core/ and text/ stay portable so that port remains small.
if(NOT WIN32)
  message(FATAL_ERROR "Himawari-C builds for Windows only (plan v0.5). Use MSYS2 UCRT64 and a win64-* preset.")
endif()

option(HW_WITH_SDL "Build the SDL-based targets (spikes, later the game runtime)" ON)
option(HW_SANITIZE "Build with AddressSanitizer and UBSan (MSYS2 CLANG64)" OFF)
option(HW_FUZZ "Build libFuzzer targets (MSYS2 CLANG64)" OFF)
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
  # -fno-sanitize-recover: UBSan aborts instead of logging, so tests fail on undefined behavior.
  add_compile_options(-fsanitize=address,undefined -fno-sanitize-recover=undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
endif()

if(HW_RELEASE_STATIC)
  set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ON)
  add_link_options(-static -static-libgcc -mwindows -s)
endif()

# core/: no SDL, no I/O. Shared by the game, headless playtests, tests, and fuzzers (plan §8.3).
add_library(hw_core STATIC
  src/core/hw_utf8.c
  src/core/hw_crc32.c
  src/core/hw_hwb.c
  src/core/hw_vm.c
  src/core/hw_play.c
  src/core/hw_save.c
  src/core/hw_json.c
  src/core/hw_pack.c
)
target_include_directories(hw_core PUBLIC src/core)
target_link_libraries(hw_core PRIVATE hw_warnings)

enable_testing()
add_executable(test_utf8 tests/test_utf8.c)
target_link_libraries(test_utf8 PRIVATE hw_core hw_warnings)
add_test(NAME utf8 COMMAND test_utf8)

# Tests that read the conformance cases (tests/conformance/cases/*/expected.hwb, written by the TS half).
set(HW_CONFORMANCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../tests/conformance/cases")
foreach(t hwb conformance save sprite json pack)
  add_executable(test_${t} tests/test_${t}.c)
  target_link_libraries(test_${t} PRIVATE hw_core hw_warnings)
  target_compile_definitions(test_${t} PRIVATE HW_CONFORMANCE_DIR="${HW_CONFORMANCE_DIR}")
  add_test(NAME ${t} COMMAND test_${t})
endforeach()

if(HW_FUZZ)
  # MSYS2 CLANG64 ships libFuzzer, but clang rejects -fsanitize=fuzzer for MinGW
  # targets. So: instrument by hand, link the libFuzzer runtime directly, and link
  # as C++ (the runtime is C++). Verified 2026-10-17 (plan §14.3, LOG session 9).
  enable_language(CXX)
  execute_process(COMMAND ${CMAKE_C_COMPILER} --print-runtime-dir
                  OUTPUT_VARIABLE hw_clang_rt_dir OUTPUT_STRIP_TRAILING_WHITESPACE)
  set(hw_fuzz_flags -fsanitize=address -fsanitize-coverage=inline-8bit-counters,pc-table,trace-cmp)

  # Fuzzed code is compiled into each target so it gets coverage instrumentation.
  add_executable(fuzz_utf8 fuzz/fuzz_utf8.c src/core/hw_utf8.c)
  target_include_directories(fuzz_utf8 PRIVATE src/core)
  target_compile_options(fuzz_utf8 PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_utf8 PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_utf8 PRIVATE hw_warnings "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_utf8 PROPERTIES LINKER_LANGUAGE CXX)

  add_executable(fuzz_hwb fuzz/fuzz_hwb.c
    src/core/hw_utf8.c src/core/hw_crc32.c src/core/hw_hwb.c src/core/hw_vm.c src/core/hw_play.c src/core/hw_save.c)
  target_include_directories(fuzz_hwb PRIVATE src/core)
  target_compile_options(fuzz_hwb PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_hwb PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_hwb PRIVATE hw_warnings "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_hwb PROPERTIES LINKER_LANGUAGE CXX)

  add_executable(fuzz_save fuzz/fuzz_save.c
    src/core/hw_utf8.c src/core/hw_crc32.c src/core/hw_hwb.c src/core/hw_vm.c src/core/hw_play.c src/core/hw_save.c)
  target_include_directories(fuzz_save PRIVATE src/core)
  target_compile_definitions(fuzz_save PRIVATE HW_CONFORMANCE_DIR="${HW_CONFORMANCE_DIR}")
  target_compile_options(fuzz_save PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_save PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_save PRIVATE hw_warnings "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_save PROPERTIES LINKER_LANGUAGE CXX)

  add_executable(fuzz_pack fuzz/fuzz_pack.c src/core/hw_pack.c src/core/hw_crc32.c)
  target_include_directories(fuzz_pack PRIVATE src/core)
  target_compile_options(fuzz_pack PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_pack PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_pack PRIVATE hw_warnings "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_pack PROPERTIES LINKER_LANGUAGE CXX)

  # hw_json.c uses hw_buf from hw_play.c, so the play module comes along.
  add_executable(fuzz_json fuzz/fuzz_json.c
    src/core/hw_json.c src/core/hw_utf8.c src/core/hw_crc32.c src/core/hw_hwb.c src/core/hw_vm.c src/core/hw_play.c src/core/hw_save.c)
  target_include_directories(fuzz_json PRIVATE src/core)
  target_compile_options(fuzz_json PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_json PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_json PRIVATE hw_warnings "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_json PROPERTIES LINKER_LANGUAGE CXX)

  # The SDL-free libraries: line breaking and the JPEG and WebP decoders (BREAK_IT.md E-1, E-3, E-6).
  # They get the same instrumentation, so the fuzzer sees inside them too.
  include(cmake/HimawariCodecs.cmake)
  target_compile_options(unibreak PRIVATE ${hw_fuzz_flags})
  target_compile_options(webpdecoder PRIVATE ${hw_fuzz_flags})

  add_executable(fuzz_image fuzz/fuzz_image.c src/app/hw_decode.c)
  target_include_directories(fuzz_image PRIVATE src/app)
  target_compile_options(fuzz_image PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_image PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_image PRIVATE hw_warnings hw_stb hw_webp "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_image PROPERTIES LINKER_LANGUAGE CXX)

  add_executable(fuzz_layout fuzz/fuzz_layout.c src/text/hw_layout.c src/core/hw_utf8.c)
  target_include_directories(fuzz_layout PRIVATE src/text src/core)
  target_compile_options(fuzz_layout PRIVATE ${hw_fuzz_flags})
  target_link_options(fuzz_layout PRIVATE -fsanitize=address)
  target_link_libraries(fuzz_layout PRIVATE hw_warnings unibreak "${hw_clang_rt_dir}/libclang_rt.fuzzer-x86_64.a")
  set_target_properties(fuzz_layout PROPERTIES LINKER_LANGUAGE CXX)

  # Inputs that once crashed a target are replayed on every fuzz build.
  file(GLOB hw_hwb_regressions "${CMAKE_CURRENT_SOURCE_DIR}/fuzz/regressions/hwb/*")
  add_test(NAME fuzz_hwb_regressions COMMAND fuzz_hwb ${hw_hwb_regressions})
  file(GLOB hw_layout_regressions "${CMAKE_CURRENT_SOURCE_DIR}/fuzz/regressions/layout/*")
  add_test(NAME fuzz_layout_regressions COMMAND fuzz_layout ${hw_layout_regressions})
endif()

if(HW_WITH_SDL)
  include(cmake/HimawariDeps.cmake)

  # text/: paragraph layout (line breaking, kinsoku, ruby). No SDL, no font library (rfcs/0003).
  add_library(hw_text STATIC src/text/hw_layout.c)
  target_include_directories(hw_text PUBLIC src/text)
  target_link_libraries(hw_text PUBLIC hw_core unibreak PRIVATE hw_warnings)

  add_executable(test_layout tests/test_layout.c)
  target_link_libraries(test_layout PRIVATE hw_text hw_warnings)
  add_test(NAME layout COMMAND test_layout)

  # Extension statements built into this runtime (rfcs/0007): C files, each <stem>.c defining
  # hw_ext_register_<stem>(). The stock runtime carries the samples in ext/; a game's own
  # build sets its list, e.g. -DHW_EXTENSIONS="C:/my-game/ext/phone.c;C:/my-game/ext/map.c".
  set(HW_EXTENSIONS "${CMAKE_CURRENT_SOURCE_DIR}/ext/screen_tint.c" CACHE STRING "Extension statement sources (rfcs/0007)")
  set(hw_ext_calls "")
  set(hw_ext_decls "")
  foreach(src ${HW_EXTENSIONS})
    get_filename_component(stem "${src}" NAME_WE)
    string(APPEND hw_ext_decls "void hw_ext_register_${stem}(void);
")
    string(APPEND hw_ext_calls "    hw_ext_register_${stem}();
")
  endforeach()
  file(GENERATE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/hw_ext_list.c CONTENT
    "/* Generated by CMake from HW_EXTENSIONS. */
#include \"hw_ext.h\"

${hw_ext_decls}
void hw_ext_register_all(void)
{
${hw_ext_calls}}
")

  # The game runtime: windowed player and --headless playtests (plan §8).
  add_executable(himawari
    src/main.c
    src/app/hw_headless.c
    src/app/hw_game.c
    src/app/hw_screens.c
    src/app/hw_menus.c
    src/app/hw_input.c
    src/app/hw_text_draw.c
    src/app/hw_assets.c
    src/app/hw_audio.c
    src/app/hw_persist.c
    src/app/hw_ui_text.c
    src/app/hw_rulewipe.c
    src/app/hw_link.c
    src/app/hw_ext.c
    src/app/hw_theme.c
    src/app/hw_vfs.c
    src/app/hw_image.c
    src/app/hw_decode.c
    src/app/hw_crash.c
    ${HW_EXTENSIONS}
    ${CMAKE_CURRENT_BINARY_DIR}/hw_ext_list.c
    src/win/himawari.rc
  )
  # windres: the manifest and version information (plan §8.13).
  set_source_files_properties(src/win/himawari.rc PROPERTIES OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/win/himawari.manifest")
  target_include_directories(himawari PRIVATE src/win)
  target_include_directories(himawari PRIVATE src/app shaders/generated)
  target_link_libraries(himawari PRIVATE
    hw_core hw_text hw_warnings hw_stb hw_webp
    SDL3::SDL3-static SDL3_mixer::SDL3_mixer-static freetype)

  # Headless playtest of a conformance case: every ending reached, no errors.
  add_test(NAME playtest_basic
    COMMAND himawari --headless "${HW_CONFORMANCE_DIR}/basic/expected.hwb" --playtest)
  add_test(NAME playtest_flow
    COMMAND himawari --headless "${HW_CONFORMANCE_DIR}/flow/expected.hwb" --playtest)

  # Spike A: static SDL3 + SDL3_mixer + FreeType window, sound, and JP text (rfcs/0001).
  add_executable(spike_a spikes/a_static/main.c)
  target_link_libraries(spike_a PRIVATE
    hw_core hw_warnings
    SDL3::SDL3-static SDL3_mixer::SDL3_mixer-static freetype)

  # Spike B: rule-wipe transition via SDL_GPURenderState on D3D12 / Vulkan (rfcs/0002).
  # Shaders are precompiled into shaders/generated/ by shaders/compile-shaders.cmake.
  add_executable(spike_b spikes/b_rule_wipe/main.c)
  target_include_directories(spike_b PRIVATE shaders/generated)
  target_link_libraries(spike_b PRIVATE hw_core hw_warnings SDL3::SDL3-static)

  # Spike C: JP paragraph with ruby + kinsoku; FreeType directly vs SDL3_ttf (rfcs/0003).
  # Two executables so each backend's size can be measured on its own.
  foreach(backend ft ttf)
    add_executable(spike_c_${backend} spikes/c_text/main.c spikes/c_text/glyphs_${backend}.c)
    target_link_libraries(spike_c_${backend} PRIVATE hw_text hw_warnings SDL3::SDL3-static)
  endforeach()
  target_link_libraries(spike_c_ft PRIVATE freetype)
  target_link_libraries(spike_c_ttf PRIVATE SDL3_ttf::SDL3_ttf)
endif()
