/* Spike C backend: FreeType directly. */
#include "glyphs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_GLYPH_H
#include FT_STROKER_H

#define MAX_FONTS 4

const char *const GLYPHS_BACKEND = "freetype";

static FT_Library library;
static FT_Face faces[2][MAX_FONTS]; /* [role][fallback index] */
static int face_count;
static FT_Stroker stroker;
static uint8_t *scratch;
static size_t scratch_size;
static char version[32];

/* First face in the fallback chain that has `cp`; falls back to face 0 (tofu). */
static FT_Face face_for(uint32_t cp, HwFontRole role, FT_UInt *index)
{
    for (int i = 0; i < face_count; i++) {
        FT_UInt idx = FT_Get_Char_Index(faces[role][i], cp);
        if (idx != 0) {
            *index = idx;
            return faces[role][i];
        }
    }
    *index = 0;
    return faces[role][0];
}

bool glyphs_init(const char *const *fonts, int font_count, int base_px, int ruby_px, int outline_px)
{
    if (FT_Init_FreeType(&library) != 0) {
        return false;
    }
    face_count = font_count < MAX_FONTS ? font_count : MAX_FONTS;
    for (int role = 0; role < 2; role++) {
        for (int i = 0; i < face_count; i++) {
            if (FT_New_Face(library, fonts[i], 0, &faces[role][i]) != 0) {
                fprintf(stderr, "freetype: cannot open %s\n", fonts[i]);
                return false;
            }
            FT_Set_Pixel_Sizes(faces[role][i], 0, (FT_UInt)(role == HW_FONT_BASE ? base_px : ruby_px));
        }
    }
    if (FT_Stroker_New(library, &stroker) != 0) {
        return false;
    }
    FT_Stroker_Set(stroker, (FT_Fixed)outline_px * 64, FT_STROKER_LINECAP_ROUND, FT_STROKER_LINEJOIN_ROUND, 0);

    FT_Int major, minor, patch;
    FT_Library_Version(library, &major, &minor, &patch);
    snprintf(version, sizeof version, "FreeType %d.%d.%d", major, minor, patch);
    return true;
}

float glyphs_advance(uint32_t cp, HwFontRole role)
{
    FT_UInt idx;
    FT_Face face = face_for(cp, role, &idx);
    if (FT_Load_Glyph(face, idx, FT_LOAD_DEFAULT) != 0) {
        return 0.0f;
    }
    return (float)face->glyph->advance.x / 64.0f;
}

static bool copy_bitmap(const FT_Bitmap *bm, int left, int top, GlyphBitmap *out)
{
    size_t need = (size_t)bm->width * bm->rows;
    if (need > scratch_size) {
        uint8_t *p = (uint8_t *)realloc(scratch, need);
        if (!p) {
            return false;
        }
        scratch = p;
        scratch_size = need;
    }
    for (unsigned row = 0; row < bm->rows; row++) {
        memcpy(scratch + (size_t)row * bm->width, bm->buffer + (ptrdiff_t)row * bm->pitch, bm->width);
    }
    out->w = (int)bm->width;
    out->h = (int)bm->rows;
    out->pitch = (int)bm->width;
    out->left = left;
    out->top = top;
    out->alpha = scratch;
    return true;
}

bool glyphs_render(uint32_t cp, HwFontRole role, bool outline, GlyphBitmap *out)
{
    FT_UInt idx;
    FT_Face face = face_for(cp, role, &idx);
    if (FT_Load_Glyph(face, idx, FT_LOAD_DEFAULT) != 0) {
        return false;
    }
    if (!outline) {
        if (FT_Render_Glyph(face->glyph, FT_RENDER_MODE_NORMAL) != 0) {
            return false;
        }
        return copy_bitmap(&face->glyph->bitmap, face->glyph->bitmap_left, face->glyph->bitmap_top, out);
    }

    FT_Glyph glyph;
    if (FT_Get_Glyph(face->glyph, &glyph) != 0) {
        return false;
    }
    bool ok = FT_Glyph_StrokeBorder(&glyph, stroker, 0, 1) == 0 &&
              FT_Glyph_To_Bitmap(&glyph, FT_RENDER_MODE_NORMAL, NULL, 1) == 0;
    if (ok) {
        FT_BitmapGlyph bg = (FT_BitmapGlyph)glyph;
        ok = copy_bitmap(&bg->bitmap, bg->left, bg->top, out);
    }
    FT_Done_Glyph(glyph);
    return ok;
}

const char *glyphs_version(void)
{
    return version;
}

void glyphs_quit(void)
{
    FT_Stroker_Done(stroker);
    for (int role = 0; role < 2; role++) {
        for (int i = 0; i < face_count; i++) {
            FT_Done_Face(faces[role][i]);
        }
    }
    FT_Done_FreeType(library);
    free(scratch);
}
