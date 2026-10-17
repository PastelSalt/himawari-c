/* Spike C backend: SDL3_ttf's glyph API. */
#include "glyphs.h"

#include <stdio.h>
#include <stdlib.h>

#include <SDL3/SDL.h>
#include <SDL3_ttf/SDL_ttf.h>

#define MAX_FONTS 4

const char *const GLYPHS_BACKEND = "sdl3_ttf";

/* [outline][role][fallback index]; index 0 is the primary, the rest are its fallbacks. */
static TTF_Font *fonts_[2][2][MAX_FONTS];
static int font_count_;
static uint8_t *scratch;
static size_t scratch_size;
static char version[32];

bool glyphs_init(const char *const *fonts, int font_count, int base_px, int ruby_px, int outline_px)
{
    if (!TTF_Init()) {
        fprintf(stderr, "sdl3_ttf: TTF_Init failed: %s\n", SDL_GetError());
        return false;
    }
    font_count_ = font_count < MAX_FONTS ? font_count : MAX_FONTS;
    for (int ol = 0; ol < 2; ol++) {
        for (int role = 0; role < 2; role++) {
            float size = (float)(role == HW_FONT_BASE ? base_px : ruby_px);
            for (int i = 0; i < font_count_; i++) {
                TTF_Font *f = TTF_OpenFont(fonts[i], size);
                if (!f) {
                    fprintf(stderr, "sdl3_ttf: cannot open %s: %s\n", fonts[i], SDL_GetError());
                    return false;
                }
                if (ol) {
                    TTF_SetFontOutline(f, outline_px);
                }
                fonts_[ol][role][i] = f;
                if (i > 0) {
                    TTF_AddFallbackFont(fonts_[ol][role][0], f);
                }
            }
        }
    }
    snprintf(version, sizeof version, "SDL3_ttf %d.%d.%d", SDL_TTF_MAJOR_VERSION, SDL_TTF_MINOR_VERSION,
             SDL_TTF_MICRO_VERSION);
    return true;
}

float glyphs_advance(uint32_t cp, HwFontRole role)
{
    int advance = 0;
    if (!TTF_GetGlyphMetrics(fonts_[0][role][0], cp, NULL, NULL, NULL, NULL, &advance)) {
        return 0.0f;
    }
    return (float)advance;
}

/* Copies the alpha channel of an ARGB8888 glyph surface into the scratch buffer. */
static bool copy_alpha(SDL_Surface *s, GlyphBitmap *out)
{
    size_t need = (size_t)s->w * (size_t)s->h;
    if (need > scratch_size) {
        uint8_t *p = (uint8_t *)realloc(scratch, need);
        if (!p) {
            return false;
        }
        scratch = p;
        scratch_size = need;
    }
    for (int y = 0; y < s->h; y++) {
        const Uint32 *row = (const Uint32 *)((const Uint8 *)s->pixels + (size_t)y * (size_t)s->pitch);
        for (int x = 0; x < s->w; x++) {
            scratch[(size_t)y * (size_t)s->w + (size_t)x] = (uint8_t)(row[x] >> 24);
        }
    }
    out->w = s->w;
    out->h = s->h;
    out->pitch = s->w;
    out->alpha = scratch;
    return true;
}

bool glyphs_render(uint32_t cp, HwFontRole role, bool outline, GlyphBitmap *out)
{
    int minx, maxx, miny, maxy;
    if (!TTF_GetGlyphMetrics(fonts_[0][role][0], cp, &minx, &maxx, &miny, &maxy, NULL)) {
        return false;
    }
    SDL_Surface *s = TTF_GetGlyphImage(fonts_[outline ? 1 : 0][role][0], cp, NULL);
    if (!s) {
        return false;
    }
    bool ok = copy_alpha(s, out);
    if (ok) {
        int fill_w = maxx - minx, fill_h = maxy - miny;
        /* The outline image is larger than the fill; center it on the fill's box rather
         * than relying on how SDL3_ttf adjusts outline metrics. */
        out->left = minx - (outline ? (s->w - fill_w) / 2 : 0);
        out->top = maxy + (outline ? (s->h - fill_h) / 2 : 0);
    }
    SDL_DestroySurface(s);
    return ok;
}

const char *glyphs_version(void)
{
    return version;
}

void glyphs_quit(void)
{
    for (int ol = 0; ol < 2; ol++) {
        for (int role = 0; role < 2; role++) {
            for (int i = 0; i < font_count_; i++) {
                TTF_CloseFont(fonts_[ol][role][i]);
            }
        }
    }
    TTF_Quit();
    free(scratch);
}
