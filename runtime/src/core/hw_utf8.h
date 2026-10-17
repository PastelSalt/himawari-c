/* Himawari-C: UTF-8 decoding. Part of core/: no SDL, no I/O (plan §8.3). */
#ifndef HW_UTF8_H
#define HW_UTF8_H

#include <stddef.h>
#include <stdint.h>

#define HW_UTF8_REPLACEMENT 0xFFFDu

/*
 * Decodes one code point from `s` (at most `len` bytes) into `*out`.
 * Returns the number of bytes consumed: 1 to 4, or 0 when `len` is 0.
 * Invalid input (bad lead byte, truncated sequence, overlong form,
 * surrogate, or a value above U+10FFFF) yields U+FFFD and consumes one
 * byte, so callers always make progress. Never reads past `len`.
 */
size_t hw_utf8_decode(const uint8_t *s, size_t len, uint32_t *out);

/* Returns the number of code points in `s`, counting each invalid byte as one. */
size_t hw_utf8_count(const uint8_t *s, size_t len);

#endif
