# Himawari Pack (`.hwp`) Specification

> **Version:** 1.1 · **Status:** draft (rfcs/0009). **1.1** (2026-10-20, FINALIZATION.md OC-6) adds single-file games (§7): a pack appended to the player exe. The pack format itself is unchanged, so writers still emit minor 0. · **License:** CC-BY-4.0.
> **Producer:** `@himawari/core` packer (`writePack`, used by `hwc build --release` and Studio's export) · **Consumer:** Himawari-C runtime (`runtime/src/core/hw_pack.c`, `runtime/src/app/hw_vfs.c`).
> Plan references: DETAILED_PLAN.md §8.8, §14.4.

A pack holds a shipped game's files: the compiled story as `game.hwb` and every asset under `assets/`. A game folder has `data.hwp` (the base pack) and, after updates, patch packs (`patch1.hwp`, …) that hold only what changed. All integers are **little-endian**; offsets are bytes from the start of the file.

## 1. Layout

```
Header (48 bytes)
Entry data (each entry 4-byte aligned)
Table of contents (entry_count × 32 bytes, sorted by hash)
Names (NUL-terminated UTF-8 paths, padded to 4 bytes)
```

### 1.1 Header

| Offset | Type | Field | Value |
|---|---|---|---|
| 0 | u8[4] | magic | `48 57 50 01` (`"HWP\x01"`) |
| 4 | u16 | major | 1 |
| 6 | u16 | minor | 0 |
| 8 | u32 | flags | bit 0: obfuscated (§4) |
| 12 | u32 | priority | 0 for the base pack; patches are higher |
| 16 | u32 | entry_count | |
| 20 | u32 | toc_offset | where the table of contents starts; the names follow it and end the file |
| 24 | u32 | names_size | bytes of names |
| 28 | u32 | toc_crc | CRC-32 (IEEE, as in zlib) of the table of contents and names, as stored |
| 32 | u64 | game | xxHash64 (seed 0) of the game id (`himawari.json` `id`) |
| 40 | u64 | key | the obfuscation key; 0 when not obfuscated |

`toc_offset + entry_count × 32 + names_size` equals the file size. A reader accepts a file whose major equals its own and whose minor is equal or lower.

### 1.2 Table of contents

`entry_count` entries of `{ u64 hash, u32 name, u32 offset, u32 stored, u32 size, u32 codec, u32 crc }`:
- `hash`: xxHash64 (seed 0) of the entry's normalized path (§2). Entries are sorted by hash (then by path), so readers binary-search; equal hashes are told apart by the path.
- `name`: the path's offset within the names.
- `offset`, `stored`: where the stored bytes are, and how many.
- `size`: the size after decoding. `crc`: CRC-32 of the decoded bytes.
- `codec`: 0 **store** (`stored == size`), 1 **lz4** (one LZ4 block, [block format](https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md), decoding to exactly `size` bytes), 2 **removed** (a patch deletes this path from the packs below it; `offset`, `stored`, and `size` are 0).

The packer stores formats that are already compressed (PNG, JPEG, WebP, Ogg, Opus, MP3, FLAC, …) and compresses the rest with LZ4 when that saves at least 5 %.

## 2. Paths

Paths use forward slashes, are relative to the pack (`game.hwb`, `assets/bg/park.png`), and are **normalized** before hashing: backslashes become `/`, ASCII letters become lowercase, and leading `./` and `/` are dropped. Lookups normalize the same way, matching Windows' case-insensitive file names.

## 3. Mounting and patches

The runtime mounts `data.hwp` (priority 0) and every `patch*.hwp` beside it, then looks a path up in the highest priority first:
- A patch whose `game` differs from `data.hwp`'s, or whose priority another pack already has, is skipped (and logged).
- The first pack that has the path answers. A **removed** entry hides the path in every lower pack.
- `game.hwb` follows the same rule, so a patch can update the story as well as assets.

`hwc build --release --patch` writes `patch<N>.hwp` (N = the highest shipped priority + 1) with the files whose size or CRC differs from the merged view of the packs already in the game folder, plus removed entries for files that are gone. A full `hwc build --release` writes a new `data.hwp` and deletes old patches.

## 4. Obfuscation (not DRM)

With flag bit 0, every stored byte at position `p` of an entry is XORed with `byte(k >> 8·(p mod 8)) XOR byte(p >> 3)`, where `k = key XOR hash` (the entry's hash; 0 for the names). This only stops casual browsing of a game's files. The key is in the file, so anyone can undo it. It is not encryption and must not be presented as protection.

## 5. Reader rules

A reader validates once, before use, and refuses the pack with a friendly error otherwise (content errors never `abort()`):
1. Magic, version, and that the table of contents fits the file exactly.
2. The CRC of the table of contents and names.
3. For every entry: the name lies inside the names and is NUL-terminated; it hashes to `hash`; hashes are sorted; the codec is known; a removed entry has no data; other entries lie between the header and the table of contents; a stored entry has `stored == size`; an LZ4 entry has `stored > 0` and `size ≤ 256 × stored`.
4. A reader that decodes a whole entry checks its CRC. Entries that are streamed (music) are checked by their decoder.

## 6. Hashes

xxHash64 is the [reference algorithm](https://github.com/Cyan4973/xxHash) with seed 0. Test vectors: `""` → `0xEF46DB3751D8E999`, `"abc"` → `0x44BC2CF5AD770999`, `"Nobody inspects the spammish repetition"` → `0xFBCEA83C8A378BF1`.

## 7. Single-file games (1.1)

A game can ship as one file: the base pack appended to the player exe, followed by a 24-byte trailer.

```
Player exe (unchanged)
Pack (exactly as data.hwp would be; its offsets are from the pack's own start)
Trailer (24 bytes)
[Authenticode certificate table, when the exe is signed afterwards]
```

| Offset in the trailer | Type | Field | Value |
|---|---|---|---|
| 0 | u64 | pack_offset | where the pack's header starts, from the start of the exe |
| 8 | u64 | pack_size | the pack's bytes; `pack_offset + pack_size` is where the trailer starts |
| 16 | u8[8] | magic | `48 57 50 45 58 45 01 00` (`"HWPEXE"`, 1, 0) |

**Where the trailer is.** It ends the file. If the exe is a PE file whose certificate table (optional header data directory 4, a file offset) ends the file, the trailer ends where that table starts instead, so an exe signed after the pack was appended still works. Sign after appending; appending after signing breaks the signature.

**Reading.** A reader checks the magic, that `pack_size ≥ 48`, and that the pack ends exactly at the trailer; then it reads the pack as in §1–§5 with every offset shifted by `pack_offset` and the pack's size as the file size.

**Mounting.** The runtime uses the pack inside its own exe when there is no `data.hwp` beside it (`data.hwp` wins, so a folder export next to a single-file exe still plays its own data). The embedded pack is the base pack (priority 0); `patch*.hwp` beside the exe apply on top of it as in §3. `himawari game.exe` (and `--headless game.exe`) plays the pack inside another exe, which tests use.

**Writing.** `appendPackToExe(exe, pack)` in `@himawari/tools` (`packages/tools/src/embed.ts`) writes exe, pack, trailer, and refuses an exe that already has a pack; `embeddedPack(exe)` reads one back.
