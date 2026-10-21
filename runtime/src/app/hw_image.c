#include "hw_image.h"

#include <string.h>

#include "hw_decode.h"

const char *const HW_IMAGE_EXTS[] = { ".png", ".webp", ".jpg", ".jpeg", ".bmp", NULL };

/* An RGBA surface holding a copy of `pixels`. */
static SDL_Surface *surface_from(const uint8_t *pixels, int w, int h)
{
    SDL_Surface *s = SDL_CreateSurface(w, h, SDL_PIXELFORMAT_RGBA32);
    if (!s) return NULL;
    for (int y = 0; y < h; y++) memcpy((uint8_t *)s->pixels + (size_t)y * (size_t)s->pitch, pixels + (size_t)y * (size_t)w * 4, (size_t)w * 4);
    return s;
}

SDL_Surface *hw_image_load(SDL_IOStream *io, const char *ext)
{
    if (!io) return NULL;
    if (SDL_strcasecmp(ext, ".png") == 0 || SDL_strcasecmp(ext, ".bmp") == 0) return SDL_LoadSurface_IO(io, true);
    size_t size = 0;
    uint8_t *data = SDL_LoadFile_IO(io, &size, true);
    if (!data) return NULL;
    /* JPEG and WebP decode in hw_decode.c (no SDL, so the fuzz build tests the same code). */
    HwDecodeKind kind = SDL_strcasecmp(ext, ".webp") == 0 ? HW_DECODE_WEBP : HW_DECODE_JPEG;
    int w = 0, h = 0;
    const char *why = NULL;
    uint8_t *rgba = hw_decode_rgba(data, size, kind, &w, &h, &why);
    SDL_Surface *s = rgba ? surface_from(rgba, w, h) : NULL;
    if (!rgba) SDL_SetError("the %s image can't be read (%s)", kind == HW_DECODE_WEBP ? "WebP" : "JPEG", why ? why : "unknown");
    hw_decode_free(kind, rgba);
    SDL_free(data);
    return s;
}
