/*
 * Himawari-C: .hwp asset packs (spec/pack.md, rfcs/0009). Part of core/: no
 * SDL, no I/O. The caller reads the header and the table of contents and
 * passes their bytes; entries are read on demand by the app layer.
 *
 * Also here: xxHash64 (entry keys) and an LZ4 block decoder (compressed
 * entries), both bounds-checked for untrusted input.
 */
#ifndef HW_PACK_H
#define HW_PACK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define HW_PACK_MAJOR 1
#define HW_PACK_MINOR 0
#define HW_PACK_HEADER 48
#define HW_PACK_ENTRY 32
#define HW_PACK_OBFUSCATED 1u

enum { HW_CODEC_STORE = 0, HW_CODEC_LZ4 = 1, HW_CODEC_REMOVED = 2 };

typedef struct hw_pack_header {
    uint16_t major, minor;
    uint32_t flags;
    uint32_t priority;     /* 0 = the base pack (data.hwp); patches are higher, and the highest wins */
    uint32_t entry_count;
    uint32_t toc_offset;   /* the table of contents, then the names */
    uint32_t names_size;
    uint32_t toc_crc;      /* CRC-32 of the TOC and names as stored */
    uint64_t game;         /* xxHash64 of the game id: patches only apply to their own game */
    uint64_t key;          /* obfuscation key (not DRM); 0 when not obfuscated */
} hw_pack_header;

typedef struct hw_pack_entry {
    uint64_t hash;   /* xxHash64 of the normalized path */
    uint32_t name;   /* offset of the path in the names */
    uint32_t offset; /* of the stored bytes, from the start of the file */
    uint32_t stored; /* bytes in the file */
    uint32_t size;   /* bytes after decoding */
    uint32_t codec;
    uint32_t crc;    /* CRC-32 of the decoded bytes */
} hw_pack_entry;

typedef struct hw_pack {
    hw_pack_header h;
    hw_pack_entry *entries; /* sorted by hash */
    char *names;            /* NUL-terminated paths, de-obfuscated */
    uint64_t file_size;
} hw_pack;

/* Reads and checks the 48-byte header. */
bool hw_pack_header_parse(hw_pack_header *h, const uint8_t *bytes, size_t size, uint64_t file_size, char *err, size_t err_size);
/*
 * Parses and validates the table of contents and names (`toc` holds
 * entry_count × 32 bytes, then names_size bytes): the CRC, sorted hashes,
 * names inside the names and matching their hashes, entries inside the file
 * and before the TOC, and sizes that fit their codec. Never aborts.
 */
bool hw_pack_parse(hw_pack *p, const hw_pack_header *h, const uint8_t *toc, size_t toc_size, uint64_t file_size, char *err, size_t err_size);
void hw_pack_free(hw_pack *p);
/* The entry for a path (normalized here), or NULL. A removed entry is returned too (codec HW_CODEC_REMOVED). */
const hw_pack_entry *hw_pack_find(const hw_pack *p, const char *path);

/* A path as packs key it: forward slashes, ASCII lowercase, no leading "./" or "/". Returns false if it doesn't fit. */
bool hw_pack_normalize(const char *path, char *out, size_t cap);

/* Undoes (or applies) obfuscation of `n` bytes that start at byte `at` of an entry. */
void hw_pack_unmask(const hw_pack_header *h, uint64_t entry_hash, uint64_t at, uint8_t *bytes, size_t n);

uint64_t hw_xxh64(const void *data, size_t len, uint64_t seed);

/* Decodes one LZ4 block into exactly `out_size` bytes. False on any malformed input. */
bool hw_lz4_decode(const uint8_t *src, size_t n, uint8_t *dst, size_t out_size);

#endif
