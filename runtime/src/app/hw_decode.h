/*
 * Himawari-C: JPEG and WebP to RGBA, with no SDL (plan §8.2). hw_image.c wraps
 * this in SDL surfaces; the fuzz build calls it directly (BREAK_IT.md E-1, E-6),
 * so the code the game runs is the code the fuzzer tests.
 */
#ifndef HW_DECODE_H
#define HW_DECODE_H

#include <stddef.h>
#include <stdint.h>

typedef enum { HW_DECODE_JPEG, HW_DECODE_WEBP } HwDecodeKind;

/* Largest width or height accepted: anything bigger is refused before decoding (a damaged or hostile file). */
#define HW_DECODE_MAX_SIDE 16384

/* 32-bit RGBA pixels (free with hw_decode_free), or NULL with *why set to a short reason. */
uint8_t *hw_decode_rgba(const uint8_t *data, size_t size, HwDecodeKind kind, int *w, int *h, const char **why);

void hw_decode_free(HwDecodeKind kind, uint8_t *pixels);

#endif
