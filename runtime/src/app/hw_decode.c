#include "hw_decode.h"

#include <webp/decode.h>

/* stb_image: JPEG only, from memory, with a size limit so a damaged file can't ask for gigabytes. */
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#define STBI_MAX_DIMENSIONS HW_DECODE_MAX_SIDE
#include <stb_image.h>

uint8_t *hw_decode_rgba(const uint8_t *data, size_t size, HwDecodeKind kind, int *w, int *h, const char **why)
{
    *w = *h = 0;
    *why = NULL;
    if (kind == HW_DECODE_WEBP) {
        if (!WebPGetInfo(data, size, w, h) || *w <= 0 || *h <= 0 || *w > HW_DECODE_MAX_SIDE || *h > HW_DECODE_MAX_SIDE) {
            *why = "not a WebP image, or too large";
            return NULL;
        }
        uint8_t *rgba = WebPDecodeRGBA(data, size, w, h);
        if (!rgba) *why = "the WebP image is damaged";
        return rgba;
    }
    if (size > 0x7fffffff) {
        *why = "the JPEG file is too large";
        return NULL;
    }
    int n = 0;
    uint8_t *rgba = stbi_load_from_memory(data, (int)size, w, h, &n, 4);
    if (!rgba) *why = stbi_failure_reason();
    return rgba;
}

void hw_decode_free(HwDecodeKind kind, uint8_t *pixels)
{
    if (!pixels) return;
    if (kind == HW_DECODE_WEBP) WebPFree(pixels);
    else stbi_image_free(pixels);
}
