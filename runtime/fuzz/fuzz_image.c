/*
 * libFuzzer target for the JPEG and WebP decoders (BREAK_IT.md E-1, E-6).
 * Writers drop in any downloaded picture, so a damaged or hostile file must be
 * refused, never crash the game or Studio's preview, and never decode larger
 * than HW_DECODE_MAX_SIDE (a decompression bomb). The first byte picks the
 * decoder; seed the corpus with real .jpg and .webp files.
 */
#include <stddef.h>
#include <stdint.h>

#include "hw_decode.h"

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size < 1) return 0;
    HwDecodeKind kind = (data[0] & 1) ? HW_DECODE_WEBP : HW_DECODE_JPEG;
    int w = 0, h = 0;
    const char *why = NULL;
    uint8_t *rgba = hw_decode_rgba(data + 1, size - 1, kind, &w, &h, &why);
    if (rgba) {
        if (w <= 0 || h <= 0 || w > HW_DECODE_MAX_SIDE || h > HW_DECODE_MAX_SIDE) __builtin_trap();
        /* Every pixel is readable (ASan catches a short buffer). */
        volatile uint8_t sum = 0;
        for (size_t i = 0; i < (size_t)w * (size_t)h * 4; i += 4093) sum ^= rgba[i];
        sum ^= rgba[(size_t)w * (size_t)h * 4 - 1];
        (void)sum;
    } else if (!why) {
        __builtin_trap(); /* a refusal always says why */
    }
    hw_decode_free(kind, rgba);
    return 0;
}
