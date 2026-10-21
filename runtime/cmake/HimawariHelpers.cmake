# Helpers for third-party dependencies (plan §8.2), pinned by tag and SHA-256.
#
# If runtime/third_party/<name>/CMakeLists.txt exists (a vendored copy), it is
# used as-is. Otherwise the pinned release tarball is downloaded once into the
# build tree. Everything is built from source and linked statically.

include(FetchContent)

function(hw_dependency name url sha256)
  set(vendored "${PROJECT_SOURCE_DIR}/third_party/${name}")
  # SYSTEM: dependency headers don't trip our -Werror warning set.
  # Extra arguments (e.g. OVERRIDE_FIND_PACKAGE) are passed through.
  if(EXISTS "${vendored}")
    FetchContent_Declare(${name} SOURCE_DIR "${vendored}" SYSTEM ${ARGN})
  else()
    FetchContent_Declare(${name} URL "${url}" URL_HASH SHA256=${sha256} SYSTEM ${ARGN})
  endif()
endfunction()

# Forces a dependency option, so the pinned recipe is the same on every machine.
macro(hw_force var value)
  set(${var} ${value} CACHE BOOL "Set by HimawariDeps.cmake" FORCE)
endmacro()
