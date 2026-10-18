#include "hw_image.h"

#include <string.h>

#include <webp/decode.h>

/* stb_image: JPEG only, from memory, with a size limit so a damaged file can't ask for gigabytes. */
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#define STBI_MAX_DIMENSIONS 16384
#define STBI_MALLOC SDL_malloc
#define STBI_REALLOC SDL_realloc
#define STBI_FREE SDL_free
#include <stb_image.h>

#define MAX_SIDE 16384

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
    SDL_Surface *s = NULL;
    if (SDL_strcasecmp(ext, ".webp") == 0) {
        int w = 0, h = 0;
        if (!WebPGetInfo(data, size, &w, &h) || w <= 0 || h <= 0 || w > MAX_SIDE || h > MAX_SIDE) {
            SDL_SetError("not a WebP image, or larger than %d pixels", MAX_SIDE);
        } else {
            uint8_t *rgba = WebPDecodeRGBA(data, size, &w, &h);
            if (rgba) s = surface_from(rgba, w, h);
            else SDL_SetError("the WebP image is damaged");
            WebPFree(rgba);
        }
    } else if (size <= 0x7fffffff) {
        int w = 0, h = 0, n = 0;
        uint8_t *rgba = stbi_load_from_memory(data, (int)size, &w, &h, &n, 4);
        if (rgba) s = surface_from(rgba, w, h);
        else SDL_SetError("the JPEG image can't be read (%s)", stbi_failure_reason());
        stbi_image_free(rgba);
    }
    SDL_free(data);
    return s;
}
