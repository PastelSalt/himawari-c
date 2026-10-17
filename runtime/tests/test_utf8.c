#include <stdio.h>
#include <string.h>

#include "hw_utf8.h"

static int failures = 0;

#define CHECK(cond)                                                     \
    do {                                                                \
        if (!(cond)) {                                                  \
            fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                    __LINE__, #cond);                                   \
            failures++;                                                 \
        }                                                               \
    } while (0)

static void expect_decode(const char *bytes, size_t len, uint32_t cp, size_t used)
{
    uint32_t got = 0;
    size_t n = hw_utf8_decode((const uint8_t *)bytes, len, &got);
    if (got != cp || n != used) {
        fprintf(stderr, "decode: want U+%04X/%zu, got U+%04X/%zu\n",
                (unsigned)cp, used, (unsigned)got, n);
        failures++;
    }
}

int main(void)
{
    /* Valid sequences of every length. */
    expect_decode("A", 1, 0x41, 1);
    expect_decode("\xC3\xA9", 2, 0xE9, 2);         /* é */
    expect_decode("\xE8\x8A\xB1", 3, 0x82B1, 3);   /* 花 */
    expect_decode("\xF0\x9F\x8C\xBB", 4, 0x1F33B, 4); /* 🌻 */

    /* Invalid input yields U+FFFD and consumes one byte. */
    expect_decode("\x80", 1, HW_UTF8_REPLACEMENT, 1);         /* lone continuation */
    expect_decode("\xFF", 1, HW_UTF8_REPLACEMENT, 1);         /* invalid lead */
    expect_decode("\xE8\x8A", 2, HW_UTF8_REPLACEMENT, 1);     /* truncated */
    expect_decode("\xC0\xAF", 2, HW_UTF8_REPLACEMENT, 1);     /* overlong '/' */
    expect_decode("\xE0\x80\xAF", 3, HW_UTF8_REPLACEMENT, 1); /* overlong */
    expect_decode("\xED\xA0\x80", 3, HW_UTF8_REPLACEMENT, 1); /* surrogate D800 */
    expect_decode("\xF4\x90\x80\x80", 4, HW_UTF8_REPLACEMENT, 1); /* > U+10FFFF */
    expect_decode("\xE8\x41\xB1", 3, HW_UTF8_REPLACEMENT, 1); /* bad continuation */

    /* Empty input consumes nothing. */
    expect_decode("", 0, HW_UTF8_REPLACEMENT, 0);

    /* Counting. "ひまわり" is 4 code points in 12 bytes. */
    const char *himawari = "\xE3\x81\xB2\xE3\x81\xBE\xE3\x82\x8F\xE3\x82\x8A";
    CHECK(hw_utf8_count((const uint8_t *)himawari, strlen(himawari)) == 4);
    CHECK(hw_utf8_count((const uint8_t *)"a\xFF" "b", 3) == 3);

    if (failures == 0) {
        printf("test_utf8: all checks passed\n");
        return 0;
    }
    return 1;
}
