# RFC 0009: Asset packs (`.hwp`) and patches

- **Status:** **Accepted** 2026-10-18 (Phase 5, under the owner's go-ahead)
- **Author:** Claude (Opus 5.5) for Moeko Works
- **Created:** 2026-10-18
- **Affects:** new `spec/pack.md` (version 1.0) · `@himawari/core` (`pack/`) · `@himawari/tools` (`packageGame`) · `hwc build --release [--patch]`, `hwc disasm` · Studio export · runtime (`core/hw_pack.c`, `app/hw_vfs.c`, `app/hw_image.c`)
- **Plan references:** §8.1, §8.2, §8.8, §14.4

## Summary
Shipped games read their files from `data.hwp` beside the `.exe`, plus patch packs that hold only what changed. The table of contents is keyed by xxHash64 of the normalized path; entries are stored or LZ4-compressed; patches can remove files; optional obfuscation is documented as not DRM. The runtime reads entries on demand: stored entries (music, pictures) stream straight from the pack.

## Motivation
Phase 4 exports were a folder of loose files: thousands of files to copy, easy to break by hand, and every update a full re-download. Plan §8.8 asks for a pack with patch mounting by priority, and §8.1 for fast starts and modest memory, which rules out reading whole packs into memory.

## Design
- **Format:** `spec/pack.md`. A 48-byte header, data, then the table of contents and names at the end, so the packer writes data in one pass and readers load only the header and the TOC (CRC-checked) at start.
- **Paths:** normalized (lowercase ASCII, forward slashes) because Windows file names are case-insensitive and authors mix cases.
- **Patches:** priority in the header, the game id's hash so a patch can't apply to another game, and tombstones (`removed`) so deleted files really disappear. `hwc build --release --patch` diffs against the merged view of the shipped packs by size and CRC.
- **Runtime:** a small virtual file system (`hw_vfs`) answers every file request: packs by priority, then loose files in development. Files open as `SDL_IOStream`s: a window onto the pack for stored entries (streaming music without loading it), decoded memory for LZ4 ones. The same streams feed images (PNG/BMP through SDL, JPEG through stb_image, WebP through libwebp), audio (`MIX_LoadAudio_IO`), and fonts (`FT_Open_Face` over a stream, which also stopped loading 10 MB system fonts into memory). `game.hwb` comes from the packs too, so patches can update the story.
- **Safety:** the TOC parser and the LZ4 decoder are in `core/` (no I/O), validated once, unit-tested against packs written by the TS packer (`tests/packs/`), and fuzzed (`fuzz_pack`).
- **Obfuscation:** an XOR keystream from a key stored in the header. It keeps casual players from browsing spoilers and nothing more; the spec says so.
- **Exports:** `<Game>.exe`, `data.hwp`, and `CREDITS.txt` with the third-party notices (FreeType's license requires the credit).

## Ease-of-use check
P6 (an export is three files; an update is one small file), P5 (a damaged pack gives a plain message, never a crash), P1 (packing is part of the same build command).

## Alternatives considered
- **Zip:** universal tooling, but central-directory parsing, ZIP64, and DEFLATE (slower than LZ4 to decode) for no gain, and no notion of patch priority or tombstones.
- **zstd instead of LZ4:** better ratios, but most VN bytes are already-compressed images and audio; LZ4 decodes faster with a far smaller decoder (plan §8.2 lists zstd as optional).
- **Reading whole packs into memory:** simplest, but breaks the memory budget for games with large music.
- **Encryption:** any key ships with the game, so it would only be obfuscation that claims to be more; the plan rules out pretending to be DRM.
