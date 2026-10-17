/*
 * Spike C glyph backend interface (rfcs/0003). Two implementations:
 *   glyphs_ft.c   FreeType directly (FT_Load_Glyph, FT_Stroker for outlines)
 *   glyphs_ttf.c  SDL3_ttf glyph API (TTF_GetGlyphImage, TTF_SetFontOutline)
 * The layout (src/text/hw_layout.c) and the atlas (main.c) are shared.
 */
#ifndef SPIKE_C_GLYPHS_H
#define SPIKE_C_GLYPHS_H

#include <stdbool.h>
#include <stdint.h>

#include "hw_layout.h"

typedef struct {
    int w, h, pitch;
    int left, top;        /* bitmap placement: x = pen + left, y = baseline - top */
    const uint8_t *alpha; /* w x h coverage; valid until the next glyphs_render call */
} GlyphBitmap;

/* Name of this backend, for logs. */
extern const char *const GLYPHS_BACKEND;

/* `fonts` is a fallback chain, tried in order for each code point. */
bool glyphs_init(const char *const *fonts, int font_count, int base_px, int ruby_px, int outline_px);
float glyphs_advance(uint32_t cp, HwFontRole role);
bool glyphs_render(uint32_t cp, HwFontRole role, bool outline, GlyphBitmap *out);
/* Version string of the underlying library. */
const char *glyphs_version(void);
void glyphs_quit(void);

#endif
