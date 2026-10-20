#include "hw_pack.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"

static uint32_t rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static uint64_t rd64(const uint8_t *p) { return (uint64_t)rd32(p) | ((uint64_t)rd32(p + 4) << 32); }

static bool fail(char *err, size_t cap, const char *fmt, ...)
{
    if (err && cap) {
        va_list ap;
        va_start(ap, fmt);
        vsnprintf(err, cap, fmt, ap);
        va_end(ap);
    }
    return false;
}

/* ---- xxHash64 (the reference algorithm, https://github.com/Cyan4973/xxHash) ---- */

#define P1 11400714785074694791ull
#define P2 14029467366897019727ull
#define P3 1609587929392839161ull
#define P4 9650029242287828579ull
#define P5 2870177450012600261ull

static uint64_t rotl(uint64_t x, int r) { return (x << r) | (x >> (64 - r)); }
static uint64_t xround(uint64_t acc, uint64_t input) { return rotl(acc + input * P2, 31) * P1; }
static uint64_t xmerge(uint64_t acc, uint64_t val) { return (acc ^ xround(0, val)) * P1 + P4; }

uint64_t hw_xxh64(const void *data, size_t len, uint64_t seed)
{
    const uint8_t *p = data, *end = p + len;
    uint64_t h;
    if (len >= 32) {
        const uint8_t *limit = end - 32;
        uint64_t v1 = seed + P1 + P2, v2 = seed + P2, v3 = seed, v4 = seed - P1;
        do {
            v1 = xround(v1, rd64(p));
            v2 = xround(v2, rd64(p + 8));
            v3 = xround(v3, rd64(p + 16));
            v4 = xround(v4, rd64(p + 24));
            p += 32;
        } while (p <= limit);
        h = rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18);
        h = xmerge(h, v1);
        h = xmerge(h, v2);
        h = xmerge(h, v3);
        h = xmerge(h, v4);
    } else {
        h = seed + P5;
    }
    h += (uint64_t)len;
    while ((size_t)(end - p) >= 8) {
        h = rotl(h ^ xround(0, rd64(p)), 27) * P1 + P4;
        p += 8;
    }
    if ((size_t)(end - p) >= 4) {
        h = rotl(h ^ ((uint64_t)rd32(p) * P1), 23) * P2 + P3;
        p += 4;
    }
    while (p < end) {
        h = rotl(h ^ ((uint64_t)*p * P5), 11) * P1;
        p++;
    }
    h ^= h >> 33;
    h *= P2;
    h ^= h >> 29;
    h *= P3;
    h ^= h >> 32;
    return h;
}

/* ---- LZ4 block format (https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md) ---- */

bool hw_lz4_decode(const uint8_t *src, size_t n, uint8_t *dst, size_t out_size)
{
    size_t i = 0, o = 0;
    while (i < n) {
        uint8_t token = src[i++];
        size_t lit = token >> 4;
        if (lit == 15) {
            uint8_t b;
            do {
                if (i >= n) return false;
                b = src[i++];
                lit += b;
            } while (b == 255);
        }
        if (lit > n - i || lit > out_size - o) return false;
        memcpy(dst + o, src + i, lit);
        i += lit;
        o += lit;
        if (i == n) break; /* the last sequence has literals only */
        if (n - i < 2) return false;
        size_t off = (size_t)src[i] | ((size_t)src[i + 1] << 8);
        i += 2;
        if (off == 0 || off > o) return false;
        size_t len = token & 15u;
        if (len == 15) {
            uint8_t b;
            do {
                if (i >= n) return false;
                b = src[i++];
                len += b;
            } while (b == 255);
        }
        len += 4;
        if (len > out_size - o) return false;
        for (size_t k = 0; k < len; k++, o++) dst[o] = dst[o - off]; /* matches may overlap their own output */
    }
    return o == out_size;
}

/* ---- packs ---- */

bool hw_pack_normalize(const char *path, char *out, size_t cap)
{
    while (path[0] == '.' && (path[1] == '/' || path[1] == '\\')) path += 2;
    while (path[0] == '/' || path[0] == '\\') path++;
    size_t n = 0;
    for (; *path; path++) {
        char c = *path == '\\' ? '/' : *path;
        if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
        if (n + 1 >= cap) return false;
        out[n++] = c;
    }
    out[n] = 0;
    return n > 0;
}

void hw_pack_unmask(const hw_pack_header *h, uint64_t entry_hash, uint64_t at, uint8_t *bytes, size_t n)
{
    if (!(h->flags & HW_PACK_OBFUSCATED)) return;
    uint64_t k = h->key ^ entry_hash;
    for (size_t i = 0; i < n; i++) {
        uint64_t pos = at + i;
        bytes[i] ^= (uint8_t)(k >> ((pos & 7u) * 8u)) ^ (uint8_t)(pos >> 3);
    }
}

/* ---- single-file games ---- */

static const uint8_t TRAILER_MAGIC[8] = { 0x48, 0x57, 0x50, 0x45, 0x58, 0x45, 0x01, 0x00 }; /* "HWPEXE" 1 0 */

uint64_t hw_pack_trailer_end(const uint8_t *head, size_t n, uint64_t file_size)
{
    /* MZ header, PE header, optional header, then data directory 4: the certificate table (a file offset). */
    if (n < 64 || head[0] != 'M' || head[1] != 'Z') return file_size;
    uint64_t pe = rd32(head + 0x3C);
    if (pe + 26 > n || memcmp(head + pe, "PE\0\0", 4) != 0) return file_size;
    size_t opt = (size_t)pe + 24;
    unsigned magic = (unsigned)head[opt] | ((unsigned)head[opt + 1] << 8);
    size_t dirs = opt + (magic == 0x20b ? 112u : magic == 0x10b ? 96u : 0u); /* PE32+, PE32 */
    if (dirs == opt || dirs + 5 * 8 > n || rd32(head + dirs - 4) < 5) return file_size; /* NumberOfRvaAndSizes */
    uint64_t at = rd32(head + dirs + 4 * 8), size = rd32(head + dirs + 4 * 8 + 4);
    return size > 0 && at <= file_size && at + size == file_size ? at : file_size;
}

bool hw_pack_trailer_parse(const uint8_t t[HW_PACK_TRAILER], uint64_t trailer_end, uint64_t *offset, uint64_t *size)
{
    if (trailer_end < HW_PACK_TRAILER + HW_PACK_HEADER || memcmp(t + 16, TRAILER_MAGIC, 8) != 0) return false;
    uint64_t o = rd64(t), s = rd64(t + 8);
    if (s < HW_PACK_HEADER || o > trailer_end - HW_PACK_TRAILER || s != trailer_end - HW_PACK_TRAILER - o) return false;
    *offset = o;
    *size = s;
    return true;
}

bool hw_pack_header_parse(hw_pack_header *h, const uint8_t *b, size_t size, uint64_t file_size, char *err, size_t cap)
{
    memset(h, 0, sizeof *h);
    if (size < HW_PACK_HEADER || memcmp(b, "HWP\x01", 4) != 0) return fail(err, cap, "not a .hwp pack (bad magic)");
    h->major = (uint16_t)(b[4] | (b[5] << 8));
    h->minor = (uint16_t)(b[6] | (b[7] << 8));
    if (h->major != HW_PACK_MAJOR || h->minor > HW_PACK_MINOR) {
        return fail(err, cap, "unsupported pack version %u.%u (this runtime supports %u.%u)", (unsigned)h->major, (unsigned)h->minor,
                    (unsigned)HW_PACK_MAJOR, (unsigned)HW_PACK_MINOR);
    }
    h->flags = rd32(b + 8);
    h->priority = rd32(b + 12);
    h->entry_count = rd32(b + 16);
    h->toc_offset = rd32(b + 20);
    h->names_size = rd32(b + 24);
    h->toc_crc = rd32(b + 28);
    h->game = rd64(b + 32);
    h->key = rd64(b + 40);
    uint64_t toc_size = (uint64_t)h->entry_count * HW_PACK_ENTRY + h->names_size;
    if (h->toc_offset < HW_PACK_HEADER || (uint64_t)h->toc_offset + toc_size != file_size) {
        return fail(err, cap, "the pack's table of contents doesn't fit the file (damaged or cut short)");
    }
    return true;
}

bool hw_pack_parse(hw_pack *p, const hw_pack_header *h, const uint8_t *toc, size_t toc_size, uint64_t file_size, char *err, size_t cap)
{
    memset(p, 0, sizeof *p);
    p->h = *h;
    p->file_size = file_size;
    if ((uint64_t)h->entry_count * HW_PACK_ENTRY + h->names_size != toc_size) return fail(err, cap, "the table of contents has the wrong size");
    if (hw_crc32(0, toc, toc_size) != h->toc_crc) return fail(err, cap, "checksum mismatch in the pack's table of contents (the file is damaged)");
    p->entries = calloc(h->entry_count ? h->entry_count : 1, sizeof *p->entries);
    p->names = malloc((size_t)h->names_size + 1);
    if (!p->entries || !p->names) {
        hw_pack_free(p);
        return fail(err, cap, "out of memory");
    }
    memcpy(p->names, toc + (size_t)h->entry_count * HW_PACK_ENTRY, h->names_size);
    p->names[h->names_size] = 0;
    hw_pack_unmask(h, 0, 0, (uint8_t *)p->names, h->names_size);
    for (uint32_t i = 0; i < h->entry_count; i++) {
        const uint8_t *e = toc + (size_t)i * HW_PACK_ENTRY;
        hw_pack_entry *x = &p->entries[i];
        x->hash = rd64(e);
        x->name = rd32(e + 8);
        x->offset = rd32(e + 12);
        x->stored = rd32(e + 16);
        x->size = rd32(e + 20);
        x->codec = rd32(e + 24);
        x->crc = rd32(e + 28);
        const char *why = NULL;
        if (x->name >= h->names_size || !memchr(p->names + x->name, 0, h->names_size - x->name)) why = "a name runs past the names";
        else if (x->hash != hw_xxh64(p->names + x->name, strlen(p->names + x->name), 0)) why = "a name doesn't match its hash";
        else if (i > 0 && x->hash < p->entries[i - 1].hash) why = "entries aren't sorted";
        else if (x->codec > HW_CODEC_REMOVED) why = "an entry has an unknown codec";
        else if (x->codec == HW_CODEC_REMOVED ? (x->stored | x->size) != 0
                 : x->offset < HW_PACK_HEADER || (uint64_t)x->offset + x->stored > h->toc_offset) why = "an entry lies outside the data";
        else if (x->codec == HW_CODEC_STORE && x->stored != x->size) why = "a stored entry has two sizes";
        /* LZ4 expands at most 255:1 or so; anything wilder is damage, not data. */
        else if (x->codec == HW_CODEC_LZ4 && (x->stored == 0 || (uint64_t)x->size > (uint64_t)x->stored * 256u)) why = "a compressed entry has an impossible size";
        if (why) {
            hw_pack_free(p);
            return fail(err, cap, "the pack is damaged: %s", why);
        }
    }
    return true;
}

void hw_pack_free(hw_pack *p)
{
    free(p->entries);
    free(p->names);
    memset(p, 0, sizeof *p);
}

const hw_pack_entry *hw_pack_find(const hw_pack *p, const char *path)
{
    char norm[512];
    if (!hw_pack_normalize(path, norm, sizeof norm)) return NULL;
    uint64_t hash = hw_xxh64(norm, strlen(norm), 0);
    uint32_t lo = 0, hi = p->h.entry_count;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        if (p->entries[mid].hash < hash) lo = mid + 1;
        else hi = mid;
    }
    for (uint32_t i = lo; i < p->h.entry_count && p->entries[i].hash == hash; i++) {
        if (strcmp(p->names + p->entries[i].name, norm) == 0) return &p->entries[i];
    }
    return NULL;
}
