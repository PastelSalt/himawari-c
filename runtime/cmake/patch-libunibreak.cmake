# Patches libunibreak 8.0's linebreak.c after download (run as FetchContent's PATCH_COMMAND).
#
# BREAK_IT.md finding B-6: for some Brahmic-script sequences (LB28a, found with
# three U+AA28 CHAM LETTER characters), libunibreak marks a pending break for
# revert without having recorded its position, then writes brks[INVALID_POS]:
# one byte before the caller's buffer. Valid story text could corrupt memory.
# Both revert sites now skip a revert with no position. Idempotent: running it
# twice leaves the file as after once. Drop this once upstream fixes it.

file(READ "${FILE}" src)
set(patched "${src}")

string(REPLACE
  "        if (lbCtx.fPendingRevert)\n        {\n            brks[lbCtx.posPending] = lbCtx.cPendingOrigBrk;"
  "        if (lbCtx.fPendingRevert && lbCtx.posPending != INVALID_POS)\n        {\n            brks[lbCtx.posPending] = lbCtx.cPendingOrigBrk;"
  patched "${patched}")
string(REPLACE
  "    case PENDING_LB28A4:\n        brks[lbCtx.posPending] = lbCtx.cPendingOrigBrk;"
  "    case PENDING_LB28A4:\n        if (lbCtx.posPending != INVALID_POS)\n            brks[lbCtx.posPending] = lbCtx.cPendingOrigBrk;"
  patched "${patched}")

if(NOT patched STREQUAL src)
  file(WRITE "${FILE}" "${patched}")
  message(STATUS "libunibreak: patched the pending-revert write (BREAK_IT.md B-6)")
elseif(NOT src MATCHES "posPending != INVALID_POS")
  message(FATAL_ERROR "libunibreak: the B-6 patch no longer applies; check linebreak.c and update cmake/patch-libunibreak.cmake")
endif()
