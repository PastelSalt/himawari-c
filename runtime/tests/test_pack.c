/* Pack tests: xxHash64 and LZ4 vectors, then the packs the TS packer wrote (tests/packs/), then damaged copies. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_pack.h"

static int failures = 0;

#define CHECK(cond)                                                     \
    do {                                                                \
        if (!(cond)) {                                                  \
            fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                    __LINE__, #cond);                                   \
            failures++;                                                 \
        }                                                               \
    } while (0)

static uint8_t *read_file(const char *path, size_t *size)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t *p = malloc(n > 0 ? (size_t)n : 1);
    if (p && fread(p, 1, (size_t)n, f) != (size_t)n) {
        free(p);
        p = NULL;
    }
    fclose(f);
    *size = (size_t)n;
    return p;
}

/* Opens a whole pack from memory (the runtime reads the header and TOC from the file). */
static bool open_pack(hw_pack *p, const uint8_t *bytes, size_t size, char *err, size_t cap)
{
    hw_pack_header h;
    if (!hw_pack_header_parse(&h, bytes, size, size, err, cap)) return false;
    return hw_pack_parse(p, &h, bytes + h.toc_offset, size - h.toc_offset, size, err, cap);
}

/* An entry's decoded bytes (malloc'd), or NULL. */
static uint8_t *entry_data(const hw_pack *p, const uint8_t *bytes, const char *path, size_t *size)
{
    const hw_pack_entry *e = hw_pack_find(p, path);
    if (!e || e->codec == HW_CODEC_REMOVED) return NULL;
    uint8_t *stored = malloc(e->stored ? e->stored : 1);
    uint8_t *out = malloc(e->size ? e->size : 1);
    memcpy(stored, bytes + e->offset, e->stored);
    hw_pack_unmask(&p->h, e->hash, 0, stored, e->stored);
    bool ok = e->codec == HW_CODEC_STORE ? (memcpy(out, stored, e->size), true) : hw_lz4_decode(stored, e->stored, out, e->size);
    free(stored);
    if (!ok || hw_crc32(0, out, e->size) != e->crc) {
        free(out);
        return NULL;
    }
    *size = e->size;
    return out;
}

int main(void)
{
    /* xxHash64 reference vectors (the same as the TS tests). */
    CHECK(hw_xxh64("", 0, 0) == 0xef46db3751d8e999ull);
    CHECK(hw_xxh64("abc", 3, 0) == 0x44bc2cf5ad770999ull);
    const char *spam = "Nobody inspects the spammish repetition";
    CHECK(hw_xxh64(spam, strlen(spam), 0) == 0xfbcea83c8a378bf1ull);

    /* LZ4: a hand-made block, then malformed ones. "abcabcabcabc": 3 literals, then offset 3, length 9. */
    static const uint8_t block[] = { 0x35, 'a', 'b', 'c', 3, 0, 0x00 };
    uint8_t out[16];
    CHECK(hw_lz4_decode(block, sizeof block, out, 12) && memcmp(out, "abcabcabcabc", 12) == 0); /* a last sequence may have no literals */
    static const uint8_t block2[] = { 0x35, 'a', 'b', 'c', 3, 0, 0x10, 'x' };
    CHECK(hw_lz4_decode(block2, sizeof block2, out, 13) && memcmp(out, "abcabcabcabcx", 13) == 0);
    static const uint8_t far[] = { 0x15, 'a', 9, 0, 0x10, 'x' };
    CHECK(!hw_lz4_decode(far, sizeof far, out, 11));      /* offset past the start */
    CHECK(!hw_lz4_decode(block2, sizeof block2, out, 12)); /* more output than room */
    CHECK(!hw_lz4_decode(block2, 5, out, 13));             /* cut short */

    char norm[64];
    CHECK(hw_pack_normalize(".\\Assets\\BG/Park.PNG", norm, sizeof norm) && strcmp(norm, "assets/bg/park.png") == 0);

    /* The packs from tests/packs/ (the TS packer). */
    char path[512];
    snprintf(path, sizeof path, "%s/../../packs/data.hwp", HW_CONFORMANCE_DIR);
    size_t size = 0, psize = 0, hsize = 0, n = 0;
    uint8_t *bytes = read_file(path, &size);
    snprintf(path, sizeof path, "%s/../../packs/patch1.hwp", HW_CONFORMANCE_DIR);
    uint8_t *patch = read_file(path, &psize);
    snprintf(path, sizeof path, "%s/extend/expected.hwb", HW_CONFORMANCE_DIR);
    uint8_t *hwb = read_file(path, &hsize);
    CHECK(bytes && patch && hwb);
    if (!bytes || !patch || !hwb) return 1;

    char err[200];
    hw_pack base, up;
    CHECK(open_pack(&base, bytes, size, err, sizeof err));
    CHECK(open_pack(&up, patch, psize, err, sizeof err));
    CHECK(base.h.priority == 0 && up.h.priority == 1 && (base.h.flags & HW_PACK_OBFUSCATED));
    const char *gid = "dev.moekoworks.conformance.extend";
    CHECK(base.h.game == hw_xxh64(gid, strlen(gid), 0) && up.h.game == base.h.game);

    uint8_t *got = entry_data(&base, bytes, "game.hwb", &n);
    CHECK(got && n == hsize && memcmp(got, hwb, n) == 0);
    free(got);
    CHECK(hw_pack_find(&base, "game.hwb")->codec == HW_CODEC_LZ4);
    got = entry_data(&base, bytes, "Assets/Notes.txt", &n);
    CHECK(got && n == 35 * 50 && memcmp(got, "The lanterns float", 18) == 0);
    free(got);
    CHECK(hw_pack_find(&base, "assets/music/theme.ogg")->codec == HW_CODEC_STORE);
    CHECK(hw_pack_find(&base, "assets/missing.png") == NULL);
    /* The patch: changed notes, a new picture, the park removed. */
    got = entry_data(&up, patch, "assets/notes.txt", &n);
    CHECK(got && n == 14 && memcmp(got, "Revised notes.", 14) == 0);
    free(got);
    CHECK(hw_pack_find(&up, "assets/bg/park.png") && hw_pack_find(&up, "assets/bg/park.png")->codec == HW_CODEC_REMOVED);
    CHECK(hw_pack_find(&up, "game.hwb") == NULL); /* unchanged: only in the base */
    hw_pack_free(&base);
    hw_pack_free(&up);

    /* Damage: every truncation, and a flipped byte anywhere in the TOC, is refused without crashing. */
    hw_pack_header h;
    for (size_t cut = 0; cut < size; cut += 4) CHECK(!hw_pack_header_parse(&h, bytes, cut < 48 ? cut : 48, cut, err, sizeof err) || !open_pack(&base, bytes, cut, err, sizeof err));
    CHECK(hw_pack_header_parse(&h, bytes, size, size, err, sizeof err));
    for (size_t i = h.toc_offset; i < size; i++) {
        uint8_t *b = malloc(size);
        memcpy(b, bytes, size);
        b[i] ^= 0x40;
        hw_pack p;
        CHECK(!open_pack(&p, b, size, err, sizeof err) && strstr(err, "checksum"));
        free(b);
    }

    /* Single-file games (spec/pack.md §7): a fake PE32+ exe, the pack, the trailer; then signed (a certificate table after it). */
    {
        size_t exe_size = 1024, total = exe_size + size + HW_PACK_TRAILER;
        uint8_t *f = calloc(total + 64, 1);
        f[0] = 'M', f[1] = 'Z', f[0x3C] = 0x80;
        memcpy(f + 0x80, "PE\0\0", 4);
        f[0x80 + 24] = 0x0b, f[0x80 + 25] = 0x02; /* PE32+ */
        f[0x80 + 24 + 108] = 16;                  /* NumberOfRvaAndSizes */
        memcpy(f + exe_size, bytes, size);
        uint8_t *t = f + exe_size + size;
        for (int k = 0; k < 8; k++) t[k] = (uint8_t)((uint64_t)exe_size >> (8 * k)), t[8 + k] = (uint8_t)((uint64_t)size >> (8 * k));
        memcpy(t + 16, "HWPEXE\x01\x00", 8);
        uint64_t at = 0, len = 0;
        uint64_t end = hw_pack_trailer_end(f, 4096 < total ? 4096 : total, total);
        CHECK(end == total && hw_pack_trailer_parse(t, end, &at, &len) && at == exe_size && len == size);
        CHECK(open_pack(&base, f + at, (size_t)len, err, sizeof err));
        hw_pack_free(&base);
        CHECK(!hw_pack_trailer_parse(t, end - 1, &at, &len)); /* the pack must end right at the trailer */
        f[0x80 + 24 + 112 + 32] = (uint8_t)total, f[0x80 + 24 + 112 + 33] = (uint8_t)(total >> 8);
        f[0x80 + 24 + 112 + 34] = (uint8_t)(total >> 16), f[0x80 + 24 + 112 + 36] = 64;
        end = hw_pack_trailer_end(f, 4096, total + 64);
        CHECK(end == total && hw_pack_trailer_parse(t, end, &at, &len) && at == exe_size);
        t[16] = 'X';
        CHECK(!hw_pack_trailer_parse(t, total, &at, &len));
        uint8_t junk[64] = { 0 };
        CHECK(hw_pack_trailer_end(junk, sizeof junk, 5000) == 5000); /* not a PE file */
        free(f);
    }

    free(bytes);
    free(patch);
    free(hwb);
    if (failures == 0) {
        printf("test_pack: all checks passed\n");
        return 0;
    }
    return 1;
}
