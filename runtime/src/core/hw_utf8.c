#include "hw_utf8.h"

static int is_cont(uint8_t b)
{
    return (b & 0xC0u) == 0x80u;
}

size_t hw_utf8_decode(const uint8_t *s, size_t len, uint32_t *out)
{
    if (len == 0) {
        *out = HW_UTF8_REPLACEMENT;
        return 0;
    }

    uint8_t b0 = s[0];
    size_t need;
    uint32_t cp;
    uint32_t min;

    if (b0 < 0x80u) {
        *out = b0;
        return 1;
    } else if ((b0 & 0xE0u) == 0xC0u) {
        need = 2;
        cp = b0 & 0x1Fu;
        min = 0x80u;
    } else if ((b0 & 0xF0u) == 0xE0u) {
        need = 3;
        cp = b0 & 0x0Fu;
        min = 0x800u;
    } else if ((b0 & 0xF8u) == 0xF0u) {
        need = 4;
        cp = b0 & 0x07u;
        min = 0x10000u;
    } else {
        *out = HW_UTF8_REPLACEMENT;
        return 1;
    }

    if (len < need) {
        *out = HW_UTF8_REPLACEMENT;
        return 1;
    }
    for (size_t i = 1; i < need; i++) {
        if (!is_cont(s[i])) {
            *out = HW_UTF8_REPLACEMENT;
            return 1;
        }
        cp = (cp << 6) | (s[i] & 0x3Fu);
    }

    if (cp < min || cp > 0x10FFFFu || (cp >= 0xD800u && cp <= 0xDFFFu)) {
        *out = HW_UTF8_REPLACEMENT;
        return 1;
    }
    *out = cp;
    return need;
}

size_t hw_utf8_count(const uint8_t *s, size_t len)
{
    size_t n = 0;
    uint32_t cp;
    for (size_t i = 0; i < len; n++) {
        i += hw_utf8_decode(s + i, len - i, &cp);
    }
    return n;
}
