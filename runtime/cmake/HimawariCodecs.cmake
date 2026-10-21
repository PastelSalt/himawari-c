# The SDL-free third-party code: line breaking (libunibreak) and the JPEG and
# WebP decoders (stb_image, libwebp). Used by the game build (HimawariDeps.cmake)
# and by the fuzz build, which has no SDL (BREAK_IT.md E-1, E-3).

include(${CMAKE_CURRENT_LIST_DIR}/HimawariHelpers.cmake)
hw_force(BUILD_SHARED_LIBS OFF)

# Line breaking (rfcs/0003).
hw_dependency(libunibreak
  https://github.com/adah1972/libunibreak/releases/download/libunibreak_8_0/libunibreak-8.0.tar.gz
  9c4fad6e517338a098373acc9f35579ae2c325e6446666fb9ac2666ba15ceba4
  # B-6: an out-of-bounds write on some Brahmic-script text (see the script).
  PATCH_COMMAND "${CMAKE_COMMAND}" -DFILE=<SOURCE_DIR>/src/linebreak.c -P "${CMAKE_CURRENT_LIST_DIR}/patch-libunibreak.cmake")

# libunibreak ships no CMake build; compile its library sources directly.
FetchContent_MakeAvailable(libunibreak)
set(unibreak_dir "${libunibreak_SOURCE_DIR}/src")
add_library(unibreak STATIC
  ${unibreak_dir}/unibreakbase.c
  ${unibreak_dir}/unibreakdef.c
  ${unibreak_dir}/linebreak.c
  ${unibreak_dir}/linebreakdata.c
  ${unibreak_dir}/linebreakdef.c
  ${unibreak_dir}/eastasianwidthdef.c
  ${unibreak_dir}/emojidef.c
  ${unibreak_dir}/graphemebreak.c
  ${unibreak_dir}/wordbreak.c)
target_include_directories(unibreak SYSTEM PUBLIC "${unibreak_dir}")
set_target_properties(unibreak PROPERTIES C_STANDARD 99 C_EXTENSIONS ON)

# Images (plan §8.2): stb_image for JPEG, libwebp's decoder for WebP. PNG and BMP stay with SDL.
hw_dependency(stb
  https://github.com/nothings/stb/archive/2c980bb59875b0d32144a71867fbdebb2f77cd20.tar.gz
  9a955b1b49a4410088a2e0ee2a9c057c3c907d0c1d75454144cb980aca0ba515)
FetchContent_MakeAvailable(stb) # header only: no CMake build
add_library(hw_stb INTERFACE)
target_include_directories(hw_stb SYSTEM INTERFACE "${stb_SOURCE_DIR}")

hw_dependency(libwebp
  https://github.com/webmproject/libwebp/archive/refs/tags/v1.6.0.tar.gz
  93a852c2b3efafee3723efd4636de855b46f9fe1efddd607e1f42f60fc8f2136
  EXCLUDE_FROM_ALL)
hw_force(WEBP_LINK_STATIC ON)
hw_force(WEBP_USE_THREAD OFF)
foreach(tool ANIM_UTILS CWEBP DWEBP GIF2WEBP IMG2WEBP VWEBP WEBPINFO LIBWEBPMUX WEBPMUX EXTRAS)
  hw_force(WEBP_BUILD_${tool} OFF)
endforeach()
FetchContent_MakeAvailable(libwebp) # only the decoder library (webpdecoder) is linked
add_library(hw_webp INTERFACE)
target_link_libraries(hw_webp INTERFACE webpdecoder)
target_include_directories(hw_webp SYSTEM INTERFACE "${libwebp_SOURCE_DIR}/src")
