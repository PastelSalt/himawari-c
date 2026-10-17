/* Loader tests: real .hwb files from the conformance suite, then damaged copies. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_hwb.h"
#include "hw_vm.h"

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

static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

static uint32_t get32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

/* Recomputes the header CRC so a mutation reaches the deeper validation rules. */
static void fix_crc(uint8_t *bytes, size_t size)
{
    put32(bytes + 20, 0);
    put32(bytes + 20, hw_crc32(0, bytes, size));
}

/* Byte offset of a section's content, or 0. */
static uint32_t section_at(const uint8_t *bytes, const char *tag, uint32_t *size)
{
    uint32_t count = get32(bytes + 12);
    for (uint32_t i = 0; i < count; i++) {
        const uint8_t *e = bytes + 24 + 12 * i;
        if (memcmp(e, tag, 4) == 0) {
            if (size) *size = get32(e + 8);
            return get32(e + 4);
        }
    }
    return 0;
}

static bool loads(const uint8_t *bytes, size_t size, char *err, size_t err_size)
{
    hw_module m;
    bool ok = hw_module_load(&m, bytes, size, err, err_size);
    if (ok) hw_module_free(&m);
    return ok;
}

/* Mutates one word, fixes the CRC, and expects the loader to refuse with `want` in the message. */
static void expect_refused(const uint8_t *orig, size_t size, uint32_t offset, uint32_t value, const char *want)
{
    uint8_t *b = malloc(size);
    memcpy(b, orig, size);
    put32(b + offset, value);
    fix_crc(b, size);
    char err[200];
    bool ok = loads(b, size, err, sizeof err);
    if (ok || !strstr(err, want)) {
        fprintf(stderr, "expected refusal containing \"%s\", got %s \"%s\"\n", want, ok ? "success" : "error", err);
        failures++;
    }
    free(b);
}

int main(void)
{
    const char *dir = HW_CONFORMANCE_DIR;
    char path[512];

    /* basic: every section, debug info, names. */
    snprintf(path, sizeof path, "%s/basic/expected.hwb", dir);
    size_t size = 0;
    uint8_t *bytes = read_file(path, &size);
    CHECK(bytes != NULL);
    if (!bytes) return 1;

    hw_module m;
    char err[200];
    CHECK(hw_module_load(&m, bytes, size, err, sizeof err));
    CHECK(strcmp(hw_str(&m, m.title), "Conformance: basic") == 0);
    CHECK(m.width == 1920 && m.height == 1080);
    CHECK(m.language_count == 1 && strcmp(hw_str(&m, m.languages[0]), "en") == 0);
    CHECK(m.position_count == 3);
    CHECK(m.entry_scene != HW_NONE && strcmp(hw_str(&m, m.scenes[m.entry_scene].name), "ch1_intro") == 0);
    CHECK(hw_module_find_scene(&m, "ch1_hub") != HW_NONE);
    CHECK(hw_module_find_var(&m, "hana_affection") != HW_NONE);
    CHECK(m.debug_count > 0);
    const char *file;
    uint32_t line;
    CHECK(hw_module_source_at(&m, m.scenes[m.entry_scene].entry_pc, &file, &line));
    CHECK(strcmp(file, "script/ch1.hws") == 0 && line == 3);
    char id[7];
    hw_line_id_format(m.lines[0].line_id, id);
    CHECK(strcmp(id, "k2m3n4") == 0); /* scenes compile in name order: ch1_helped's line comes first */
    uint32_t bg = HW_NONE;
    for (uint32_t pc = 0; pc < m.code_count && bg == HW_NONE; pc += 1 + hw_argc(m.code[pc])) {
        if (hw_op(m.code[pc]) == HW_OP_BG) bg = pc;
    }
    CHECK(bg != HW_NONE);
    hw_module_free(&m);

    /* Damage outside any rule the CRC covers. */
    CHECK(!loads(bytes, 10, err, sizeof err) && strstr(err, "too small"));
    {
        uint8_t *b = malloc(size);
        memcpy(b, bytes, size);
        b[size / 2] ^= 0x40;
        CHECK(!loads(b, size, err, sizeof err) && strstr(err, "checksum"));
        memcpy(b, bytes, size);
        b[0] = 'X';
        CHECK(!loads(b, size, err, sizeof err) && strstr(err, "magic"));
        memcpy(b, bytes, size);
        b[4] = 2; /* major 2 */
        fix_crc(b, size);
        CHECK(!loads(b, size, err, sizeof err) && strstr(err, "unsupported version"));
        free(b);
    }
    CHECK(!loads(bytes, size - 4, err, sizeof err) && strstr(err, "file size"));

    /* Deeper rules, with a valid CRC. */
    uint32_t code_size, scne_size, meta_size, strs_size;
    uint32_t code = section_at(bytes, "CODE", &code_size);
    uint32_t scne = section_at(bytes, "SCNE", &scne_size);
    uint32_t meta = section_at(bytes, "META", &meta_size);
    uint32_t strs = section_at(bytes, "STRS", &strs_size);
    CHECK(code && scne && meta && strs);
    /* CODE word 0 is the count; words[pc] is at code + 4 + 4 * pc. pc 0 is `JMP ch1_hub`. */
    expect_refused(bytes, size, code + 4, 0x000000FFu, "unknown opcode");
    expect_refused(bytes, size, code + 4, (uint32_t)HW_OP_JMP | (2u << 8), "wrong argument count");
    expect_refused(bytes, size, code + 4 + 4 * (bg + 1), 0xFFFFu, "string index"); /* BG asset */
    expect_refused(bytes, size, scne + 8, 1u, "isn't an instruction");        /* scene 0 entry pc */
    expect_refused(bytes, size, scne + 4, 0x7FFFFFFFu, "string index");       /* scene 0 name */
    expect_refused(bytes, size, meta + 8, 0u, "resolution");                  /* width 0 */
    expect_refused(bytes, size, meta + 24, 0u, "source language");            /* languages[0] = "" */
    expect_refused(bytes, size, strs, 0x10000000u, "truncated");              /* string count */
    expect_refused(bytes, size, 24 + 4, 2u, "misaligned");                    /* first section offset */
    expect_refused(bytes, size, 12, 0x01000000u, "section table");            /* section count */

    /* A jump into the middle of an instruction. */
    {
        hw_module mm;
        CHECK(hw_module_load(&mm, bytes, size, err, sizeof err));
        uint32_t jump = HW_NONE;
        for (uint32_t pc = 0; pc < mm.code_count; pc += 1 + hw_argc(mm.code[pc])) {
            if (hw_op(mm.code[pc]) == HW_OP_JMP) {
                jump = pc;
                break;
            }
        }
        CHECK(jump != HW_NONE);
        hw_module_free(&mm);
        /* pc jump + 1 is the jump's own argument, not an op word. */
        if (jump != HW_NONE) expect_refused(bytes, size, code + 4 + 4 * (jump + 1), jump + 1, "isn't an instruction");
    }
    free(bytes);

    /* l10n: LOCL and per-language names. */
    snprintf(path, sizeof path, "%s/l10n/expected.hwb", dir);
    bytes = read_file(path, &size);
    CHECK(bytes != NULL);
    if (bytes) {
        CHECK(hw_module_load(&m, bytes, size, err, sizeof err));
        CHECK(m.locale_count == 1);
        uint32_t ja = hw_module_find_locale(&m, "ja");
        CHECK(ja == 0);
        hw_vm vm;
        CHECK(hw_vm_init(&vm, &m, 1));
        CHECK(strcmp(hw_vm_speaker_name(&vm, 0), "Hana") == 0);
        char text[256];
        hw_vm_line_markup(&vm, 0, text, sizeof text);
        CHECK(strcmp(text, "Hello, Aoi!") == 0);
        hw_vm_set_language(&vm, "ja");
        CHECK(strcmp(hw_vm_speaker_name(&vm, 0), "\xE8\x8A\xB1") == 0); /* 花 */
        hw_vm_line_markup(&vm, 1, text, sizeof text);
        CHECK(strcmp(text, "\xE9\xA2\xA8\xE3\x81\xAF{b}\xE6\x9A\x96\xE3\x81\x8B\xE3\x81\x8B\xE3\x81\xA3\xE3\x81\x9F{/b}\xE3\x80\x82") == 0);
        /* Truncation still NUL-terminates and reports the full length. */
        size_t need = hw_vm_line_markup(&vm, 1, text, 4);
        CHECK(strlen(text) == 3 && need > 4);
        hw_vm_set_language(&vm, "fr"); /* unknown: back to the source */
        CHECK(strcmp(hw_vm_speaker_name(&vm, 0), "Hana") == 0);
        hw_vm_free(&vm);

        /* A LOCL text index past the end. */
        uint32_t locl = section_at(bytes, "LOCL", NULL);
        expect_refused(bytes, size, locl + 4 * 4, 0x00FFFFFFu, "LOCL text");
        hw_module_free(&m);
        free(bytes);
    }

    /* Every truncation of a real file is refused without crashing. */
    snprintf(path, sizeof path, "%s/text/expected.hwb", dir);
    bytes = read_file(path, &size);
    CHECK(bytes != NULL);
    if (bytes) {
        for (size_t n = 0; n < size; n += 4) {
            uint8_t *b = malloc(size);
            memcpy(b, bytes, size);
            put32(b + 16, (uint32_t)n);
            if (n >= 24) fix_crc(b, n);
            CHECK(!loads(b, n, err, sizeof err));
            free(b);
        }
        free(bytes);
    }

    if (failures == 0) {
        printf("test_hwb: all checks passed\n");
        return 0;
    }
    return 1;
}
