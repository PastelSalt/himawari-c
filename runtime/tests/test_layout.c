/* Layout tests with fixed advances: CJK = 10 px, other = 5 px, ruby = 5 px. */
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "hw_layout.h"
#include "hw_utf8.h"

static int failures = 0;

#define CHECK(cond)                                                                  \
    do {                                                                             \
        if (!(cond)) {                                                               \
            fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); \
            failures++;                                                              \
        }                                                                            \
    } while (0)

static float fixed_advance(void *user, uint32_t cp, HwFontRole role)
{
    (void)user;
    if (role == HW_FONT_RUBY) {
        return 5.0f;
    }
    return cp >= 0x2E80 ? 10.0f : 5.0f;
}

static HwLayoutParams params(float width, bool hanging, bool strict)
{
    HwLayoutParams p = { width, 30.0f, 12.0f, 8.0f, 6.0f, "ja", hanging, strict };
    return p;
}

/* Appends the UTF-8 encoding of `cp` to `buf`. */
static void put_utf8(char *buf, size_t cap, uint32_t cp)
{
    size_t len = strlen(buf);
    char tmp[5] = { 0 };
    if (cp < 0x80) {
        tmp[0] = (char)cp;
    } else if (cp < 0x800) {
        tmp[0] = (char)(0xC0 | (cp >> 6));
        tmp[1] = (char)(0x80 | (cp & 0x3F));
    } else {
        tmp[0] = (char)(0xE0 | (cp >> 12));
        tmp[1] = (char)(0x80 | ((cp >> 6) & 0x3F));
        tmp[2] = (char)(0x80 | (cp & 0x3F));
    }
    if (len + strlen(tmp) < cap) {
        strcat(buf, tmp);
    }
}

/* Base text of one line, as UTF-8. */
static const char *line_text(const HwLayout *l, uint32_t line)
{
    static char buf[256];
    buf[0] = '\0';
    for (size_t i = 0; i < l->count; i++) {
        if (l->glyphs[i].role == HW_FONT_BASE && l->glyphs[i].line == line) {
            put_utf8(buf, sizeof buf, l->glyphs[i].cp);
        }
    }
    return buf;
}

static void expect_lines(const char *text, float width, bool hanging, bool strict, const char *const *want, uint32_t nwant)
{
    HwRun run = { text, NULL };
    HwLayoutParams p = params(width, hanging, strict);
    HwLayout l = { 0 };
    CHECK(hw_layout_paragraph(&run, 1, &p, fixed_advance, NULL, &l));
    bool ok = l.lines == nwant;
    for (uint32_t i = 0; ok && i < nwant; i++) {
        ok = strcmp(line_text(&l, i), want[i]) == 0;
    }
    if (!ok) {
        fprintf(stderr, "layout of \"%s\" (width %.0f): got %u lines:", text, (double)width, l.lines);
        for (uint32_t i = 0; i < l.lines; i++) {
            fprintf(stderr, " [%s]", line_text(&l, i));
        }
        fprintf(stderr, "\n");
        failures++;
    }
    hw_layout_free(&l);
}

static const HwLayoutGlyph *find(const HwLayout *l, uint32_t cp, HwFontRole role)
{
    for (size_t i = 0; i < l->count; i++) {
        if (l->glyphs[i].cp == cp && l->glyphs[i].role == role) {
            return &l->glyphs[i];
        }
    }
    return NULL;
}

static bool near(float a, float b)
{
    return fabsf(a - b) < 0.01f;
}

int main(void)
{
    /* Kinsoku classes. */
    CHECK(hw_kinsoku_no_line_start(0x3002)); /* 。 */
    CHECK(hw_kinsoku_no_line_start(0x3063)); /* っ */
    CHECK(hw_kinsoku_no_line_start(0x30FC)); /* ー */
    CHECK(hw_kinsoku_no_line_start(0x300D)); /* 」 */
    CHECK(!hw_kinsoku_no_line_start(0x3042)); /* あ */
    CHECK(hw_kinsoku_no_line_end(0x300C));   /* 「 */
    CHECK(!hw_kinsoku_no_line_end(0x300D));

    /* 。 may not start a line: it hangs (burasagari), or pushes え down when hanging is off. */
    {
        const char *hang[] = { "あいうえ。", "かき" };
        expect_lines("あいうえ。かき", 40.0f, true, true, hang, 2);
        const char *push[] = { "あいう", "え。かき" };
        expect_lines("あいうえ。かき", 40.0f, false, true, push, 2);
    }
    /* 「 may not end a line. */
    {
        const char *want[] = { "あいう", "「えお」" };
        expect_lines("あいう「えお」", 40.0f, true, true, want, 2);
    }
    /* Small kana may not start a line. */
    {
        const char *want[] = { "あい", "うっか" };
        expect_lines("あいうっか", 30.0f, true, true, want, 2);
    }
    /* —— (two em dashes, 5 px each here) never splits: the pair moves down together. */
    {
        const char *want[] = { "あいう", "——" };
        expect_lines("あいう——", 35.0f, true, true, want, 2);
    }
    /* Latin: break at spaces; a trailing space may overflow. */
    {
        const char *want[] = { "hello ", "world" };
        expect_lines("hello world", 25.0f, true, true, want, 2);
    }
    /* Emergency split of a word wider than the line. */
    {
        const char *want[] = { "abcd", "efgh", "ij" };
        expect_lines("abcdefghij", 20.0f, true, true, want, 3);
    }

    /* Ruby wider than its base: the base is spread 1:2:1 and nothing overhangs. */
    {
        HwRun runs[] = { { "\xE8\x8A\xB1", "\xE3\x81\x95\xE3\x81\x8F\xE3\x82\x89" }, { "\xE3\x81\x8C", NULL } }; /* 花(さくら)が */
        HwLayoutParams p = params(200.0f, true, true);
        HwLayout l = { 0 };
        CHECK(hw_layout_paragraph(runs, 2, &p, fixed_advance, NULL, &l));
        const HwLayoutGlyph *hana = find(&l, 0x82B1, HW_FONT_BASE);
        const HwLayoutGlyph *ga = find(&l, 0x304C, HW_FONT_BASE);
        const HwLayoutGlyph *sa = find(&l, 0x3055, HW_FONT_RUBY);
        const HwLayoutGlyph *ra = find(&l, 0x3089, HW_FONT_RUBY);
        CHECK(hana && near(hana->x, 2.5f)); /* group 15 wide, base 10: 2.5 each side */
        CHECK(sa && near(sa->x, 0.0f));
        CHECK(ra && near(ra->x, 10.0f));
        CHECK(ga && near(ga->x, 15.0f)); /* next character starts after the whole group */
        CHECK(sa && hana && sa->reveal == hana->reveal);
        CHECK(sa && near(sa->y, 6.0f) && hana && near(hana->y, 20.0f));
        hw_layout_free(&l);
    }
    /* Ruby narrower than its base: the ruby is spread 1:2:1. */
    {
        HwRun runs[] = { { "\xE6\xBC\xA2\xE5\xAD\x97", "\xE3\x81\x8B\xE3\x82\x93" } }; /* 漢字(かん) */
        HwLayoutParams p = params(200.0f, true, true);
        HwLayout l = { 0 };
        CHECK(hw_layout_paragraph(runs, 1, &p, fixed_advance, NULL, &l));
        const HwLayoutGlyph *ka = find(&l, 0x304B, HW_FONT_RUBY);
        const HwLayoutGlyph *n = find(&l, 0x3093, HW_FONT_RUBY);
        CHECK(ka && near(ka->x, 2.5f));
        CHECK(n && near(n->x, 12.5f));
        hw_layout_free(&l);
    }
    /* A ruby group never splits across lines, and its ruby follows it. */
    {
        HwRun runs[] = { { "\xE3\x81\x82\xE3\x81\x84", NULL }, { "\xE6\xBC\xA2\xE5\xAD\x97", "\xE3\x81\x8B\xE3\x82\x93\xE3\x81\x98" } };
        HwLayoutParams p = params(30.0f, true, true);
        HwLayout l = { 0 };
        CHECK(hw_layout_paragraph(runs, 2, &p, fixed_advance, NULL, &l));
        const HwLayoutGlyph *kan = find(&l, 0x6F22, HW_FONT_BASE);
        const HwLayoutGlyph *ji = find(&l, 0x5B57, HW_FONT_BASE);
        const HwLayoutGlyph *ka = find(&l, 0x304B, HW_FONT_RUBY);
        CHECK(kan && ji && kan->line == 1 && ji->line == 1);
        CHECK(kan && near(kan->x, 0.0f));
        CHECK(ka && ka->line == 1);
        CHECK(l.lines == 2);
        hw_layout_free(&l);
    }

    /* Informational: what plain UAX #14 (libunibreak, lang "ja") does without the override table. */
    {
        HwRun run = { "\xE3\x81\x82\xE3\x81\x84\xE3\x81\x86\xE3\x81\xA3\xE3\x81\x8B", NULL }; /* あいうっか */
        HwLayoutParams p = params(30.0f, false, false);
        HwLayout l = { 0 };
        hw_layout_paragraph(&run, 1, &p, fixed_advance, NULL, &l);
        printf("info: UAX #14 only, width 30: [%s]", line_text(&l, 0));
        for (uint32_t i = 1; i < l.lines; i++) {
            printf(" [%s]", line_text(&l, i));
        }
        printf("\n");
        hw_layout_free(&l);
    }

    if (failures == 0) {
        printf("test_layout: all checks passed\n");
        return 0;
    }
    return 1;
}
