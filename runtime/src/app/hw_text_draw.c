#include "hw_text_draw.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_GLYPH_H
#include FT_OUTLINE_H
#include FT_STROKER_H

#include "hw_utf8.h"

#define MAX_FACES 10
#define CACHE_SLOTS 8192u /* power of two */
#define PAGE_SIZE 2048
#define MAX_PAGES 4

typedef struct glyph_entry {
    uint64_t key; /* 0 = empty */
    uint8_t page;
    bool has_image;
    int16_t left, top;
    SDL_FRect src;
} glyph_entry;

typedef struct advance_entry {
    uint64_t key;
    float advance;
} advance_entry;

struct hw_fonts {
    SDL_Renderer *ren;
    FT_Library lib;
    FT_Face faces[MAX_FACES];
    int face_count;
    FT_UInt face_px[MAX_FACES];
    FT_Stroker stroker;
    FT_Fixed stroke_px; /* 26.6, the stroker's current radius */

    SDL_Texture *pages[MAX_PAGES];
    int page_count;
    int page, shelf_x, shelf_y, shelf_h;
    glyph_entry glyphs[CACHE_SLOTS];
    uint32_t glyph_count;
    advance_entry advances[CACHE_SLOTS];
    uint32_t advance_count;
    uint8_t *rgba;
    size_t rgba_size;
};

/* ---- faces ---- */

hw_fonts *hw_fonts_open(SDL_Renderer *ren, const char *const *paths, int count)
{
    hw_font_source src[MAX_FACES];
    int n = 0;
    for (int i = 0; i < count && n < MAX_FACES; i++) src[n++] = (hw_font_source){ paths[i], NULL };
    return hw_fonts_open_sources(ren, src, n);
}

/* FreeType reads faces through SDL streams: UTF-8 paths, packs, and no whole-file loads. */
static unsigned long stream_read(FT_Stream s, unsigned long offset, unsigned char *buffer, unsigned long count)
{
    SDL_IOStream *io = s->descriptor.pointer;
    if (SDL_SeekIO(io, (Sint64)offset, SDL_IO_SEEK_SET) < 0) return count ? 0 : 1; /* a seek-only call reports failure as non-zero */
    if (count == 0) return 0;
    return (unsigned long)SDL_ReadIO(io, buffer, count);
}

static void stream_close(FT_Stream s)
{
    SDL_CloseIO(s->descriptor.pointer);
    SDL_free(s);
}

static bool open_face(hw_fonts *f, SDL_IOStream *io, FT_Face *face)
{
    Sint64 size = SDL_GetIOSize(io);
    FT_Stream s = SDL_calloc(1, sizeof *s);
    if (!s || size <= 0) {
        SDL_free(s);
        SDL_CloseIO(io);
        return false;
    }
    s->size = (unsigned long)size;
    s->descriptor.pointer = io;
    s->read = stream_read;
    s->close = stream_close;
    FT_Open_Args args;
    memset(&args, 0, sizeof args);
    args.flags = FT_OPEN_STREAM;
    args.stream = s;
    /* FreeType calls close (and so frees the stream) when the face is done, or when opening fails. */
    return FT_Open_Face(f->lib, &args, 0, face) == 0;
}

hw_fonts *hw_fonts_open_sources(SDL_Renderer *ren, const hw_font_source *sources, int count)
{
    hw_fonts *f = SDL_calloc(1, sizeof *f);
    if (!f || FT_Init_FreeType(&f->lib) != 0) {
        for (int i = 0; i < count; i++) {
            if (sources[i].io) SDL_CloseIO(sources[i].io);
        }
        SDL_free(f);
        return NULL;
    }
    f->ren = ren;
    for (int i = 0; i < count; i++) {
        SDL_IOStream *io = sources[i].io ? sources[i].io : SDL_IOFromFile(sources[i].path, "rb");
        if (!io) continue;
        if (f->face_count >= MAX_FACES) {
            SDL_CloseIO(io);
            continue;
        }
        FT_Face face;
        if (open_face(f, io, &face)) f->faces[f->face_count++] = face;
    }
    if (f->face_count == 0 || FT_Stroker_New(f->lib, &f->stroker) != 0) {
        hw_fonts_close(f);
        return NULL;
    }
    return f;
}

void hw_fonts_close(hw_fonts *f)
{
    if (!f) return;
    for (int i = 0; i < f->page_count; i++) SDL_DestroyTexture(f->pages[i]);
    if (f->stroker) FT_Stroker_Done(f->stroker);
    for (int i = 0; i < f->face_count; i++) FT_Done_Face(f->faces[i]); /* closes its stream */
    if (f->lib) FT_Done_FreeType(f->lib);
    SDL_free(f->rgba);
    SDL_free(f);
}

void hw_fonts_flush(hw_fonts *f)
{
    memset(f->glyphs, 0, sizeof f->glyphs);
    f->glyph_count = 0;
    f->page = 0;
    f->shelf_x = f->shelf_y = f->shelf_h = 0;
}

static FT_Face face_for(hw_fonts *f, uint32_t cp, FT_UInt *index, int *which)
{
    for (int i = 0; i < f->face_count; i++) {
        FT_UInt idx = FT_Get_Char_Index(f->faces[i], cp);
        if (idx != 0) {
            *index = idx;
            *which = i;
            return f->faces[i];
        }
    }
    *index = 0; /* tofu from the first face */
    *which = 0;
    return f->faces[0];
}

static uint32_t clamp_px(float px)
{
    if (px < 4.0f) return 4;
    if (px > 1000.0f) return 1000;
    return (uint32_t)lroundf(px);
}

static uint64_t make_key(uint32_t cp, uint32_t px, uint32_t flags, bool outline)
{
    return ((uint64_t)(cp + 1u) & 0x1FFFFFu) | ((uint64_t)px << 21) | ((uint64_t)(flags & 3u) << 31) | ((uint64_t)outline << 33);
}

static uint32_t slot_of(uint64_t key)
{
    uint64_t h = key * 0x9E3779B97F4A7C15ull;
    return (uint32_t)(h >> 40) & (CACHE_SLOTS - 1u);
}

/* Loads `cp` at `px` into its face's glyph slot (italic shear and bold applied). */
static FT_Face load(hw_fonts *f, uint32_t cp, uint32_t px, uint32_t flags)
{
    FT_UInt idx;
    int which;
    FT_Face face = face_for(f, cp, &idx, &which);
    if (f->face_px[which] != px) {
        FT_Set_Pixel_Sizes(face, 0, px);
        f->face_px[which] = px;
    }
    FT_Matrix shear = { 0x10000, 0x3800, 0, 0x10000 };
    FT_Set_Transform(face, (flags & HW_TS_ITALIC) ? &shear : NULL, NULL);
    FT_Error e = FT_Load_Glyph(face, idx, FT_LOAD_DEFAULT | FT_LOAD_NO_BITMAP);
    FT_Set_Transform(face, NULL, NULL);
    if (e != 0) return NULL;
    if ((flags & HW_TS_BOLD) && face->glyph->format == FT_GLYPH_FORMAT_OUTLINE) {
        FT_Pos strength = (FT_Pos)(px * 64 / 24);
        FT_Outline_Embolden(&face->glyph->outline, strength);
        face->glyph->advance.x += strength;
    }
    return face;
}

float hw_fonts_advance(hw_fonts *f, uint32_t cp, float px_f, uint32_t flags)
{
    uint32_t px = clamp_px(px_f);
    uint64_t key = make_key(cp, px, flags, false);
    uint32_t h = slot_of(key);
    while (f->advances[h].key != 0 && f->advances[h].key != key) h = (h + 1) & (CACHE_SLOTS - 1u);
    if (f->advances[h].key == key) return f->advances[h].advance;
    if (f->advance_count * 4 >= CACHE_SLOTS * 3) {
        memset(f->advances, 0, sizeof f->advances);
        f->advance_count = 0;
        h = slot_of(key);
    }
    FT_Face face = load(f, cp, px, flags);
    float adv = face ? (float)face->glyph->advance.x / 64.0f : 0.0f;
    f->advances[h].key = key;
    f->advances[h].advance = adv;
    f->advance_count++;
    return adv;
}

/* Copies a coverage bitmap into the atlas. */
static bool put_bitmap(hw_fonts *f, const FT_Bitmap *bm, glyph_entry *e)
{
    int w = (int)bm->width, h = (int)bm->rows;
    if (w <= 0 || h <= 0) {
        e->has_image = false;
        return true;
    }
    if (w + 2 > PAGE_SIZE || h + 2 > PAGE_SIZE) return false;
    if (f->shelf_x + w + 1 > PAGE_SIZE) {
        f->shelf_x = 0;
        f->shelf_y += f->shelf_h + 1;
        f->shelf_h = 0;
    }
    if (f->shelf_y + h + 1 > PAGE_SIZE) {
        f->page++;
        f->shelf_x = f->shelf_y = f->shelf_h = 0;
    }
    if (f->page >= MAX_PAGES) return false; /* caller flushes and retries */
    while (f->page >= f->page_count) {
        SDL_Texture *t = SDL_CreateTexture(f->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, PAGE_SIZE, PAGE_SIZE);
        if (!t) return false;
        SDL_SetTextureBlendMode(t, SDL_BLENDMODE_BLEND);
        f->pages[f->page_count++] = t;
    }
    size_t need = (size_t)w * (size_t)h * 4u;
    if (need > f->rgba_size) {
        uint8_t *p = SDL_realloc(f->rgba, need);
        if (!p) return false;
        f->rgba = p;
        f->rgba_size = need;
    }
    for (int y = 0; y < h; y++) {
        const uint8_t *src = bm->buffer + (ptrdiff_t)y * bm->pitch;
        uint8_t *dst = f->rgba + (size_t)y * (size_t)w * 4u;
        for (int x = 0; x < w; x++) {
            dst[4 * x + 0] = dst[4 * x + 1] = dst[4 * x + 2] = 255;
            dst[4 * x + 3] = src[x];
        }
    }
    SDL_Rect r = { f->shelf_x, f->shelf_y, w, h };
    SDL_UpdateTexture(f->pages[f->page], &r, f->rgba, w * 4);
    e->page = (uint8_t)f->page;
    e->src = (SDL_FRect){ (float)r.x, (float)r.y, (float)w, (float)h };
    e->has_image = true;
    f->shelf_x += w + 1;
    if (h > f->shelf_h) f->shelf_h = h;
    return true;
}

static bool render_into(hw_fonts *f, uint32_t cp, uint32_t px, uint32_t flags, bool outline, glyph_entry *e)
{
    FT_Face face = load(f, cp, px, flags);
    if (!face) return false;
    if (!outline) {
        if (FT_Render_Glyph(face->glyph, FT_RENDER_MODE_NORMAL) != 0) return false;
        e->left = (int16_t)face->glyph->bitmap_left;
        e->top = (int16_t)face->glyph->bitmap_top;
        return put_bitmap(f, &face->glyph->bitmap, e);
    }
    FT_Fixed radius = (FT_Fixed)(px > 24 ? px * 64 / 18 : 2 * 64); /* scales with size */
    if (radius != f->stroke_px) {
        FT_Stroker_Set(f->stroker, radius, FT_STROKER_LINECAP_ROUND, FT_STROKER_LINEJOIN_ROUND, 0);
        f->stroke_px = radius;
    }
    FT_Glyph glyph;
    if (FT_Get_Glyph(face->glyph, &glyph) != 0) return false;
    bool ok = FT_Glyph_StrokeBorder(&glyph, f->stroker, 0, 1) == 0 && FT_Glyph_To_Bitmap(&glyph, FT_RENDER_MODE_NORMAL, NULL, 1) == 0;
    if (ok) {
        FT_BitmapGlyph bg = (FT_BitmapGlyph)glyph;
        e->left = (int16_t)bg->left;
        e->top = (int16_t)bg->top;
        ok = put_bitmap(f, &bg->bitmap, e);
    }
    FT_Done_Glyph(glyph);
    return ok;
}

static const glyph_entry *glyph(hw_fonts *f, uint32_t cp, float px_f, uint32_t flags, bool outline)
{
    uint32_t px = clamp_px(px_f);
    uint64_t key = make_key(cp, px, flags, outline);
    for (int attempt = 0; attempt < 2; attempt++) {
        uint32_t h = slot_of(key);
        while (f->glyphs[h].key != 0 && f->glyphs[h].key != key) h = (h + 1) & (CACHE_SLOTS - 1u);
        if (f->glyphs[h].key == key) return &f->glyphs[h];
        if (f->glyph_count * 4 < CACHE_SLOTS * 3) {
            glyph_entry e;
            memset(&e, 0, sizeof e);
            if (render_into(f, cp, px, flags, outline, &e)) {
                e.key = key;
                f->glyphs[h] = e;
                f->glyph_count++;
                return &f->glyphs[h];
            }
            if (f->page < MAX_PAGES) return NULL; /* the glyph itself failed */
        }
        hw_fonts_flush(f); /* atlas or table full: start over (glyphs re-render on demand) */
    }
    return NULL;
}

static void draw_glyph(hw_fonts *f, const glyph_entry *e, float x, float y_baseline, SDL_Color c, float alpha)
{
    if (!e || !e->has_image) return;
    SDL_Texture *t = f->pages[e->page];
    SDL_SetTextureColorMod(t, c.r, c.g, c.b);
    SDL_SetTextureAlphaModFloat(t, alpha * (float)c.a / 255.0f);
    SDL_FRect dst = { x + (float)e->left, y_baseline - (float)e->top, e->src.w, e->src.h };
    SDL_RenderTexture(f->ren, t, &e->src, &dst);
}

float hw_text_width(hw_fonts *f, const char *utf8, float px, uint32_t flags)
{
    float w = 0.0f;
    size_t len = strlen(utf8);
    for (size_t i = 0; i < len;) {
        uint32_t cp;
        i += hw_utf8_decode((const uint8_t *)utf8 + i, len - i, &cp);
        w += hw_fonts_advance(f, cp, px, flags);
    }
    return w;
}

float hw_text_draw(hw_fonts *f, const char *utf8, float px, uint32_t flags, float x, float y, int align, SDL_Color fill,
                   SDL_Color outline, float outline_px)
{
    float w = hw_text_width(f, utf8, px, flags);
    float start = align == 1 ? x - w / 2.0f : align == 2 ? x - w : x;
    size_t len = strlen(utf8);
    for (int pass = outline_px > 0.0f ? 0 : 1; pass < 2; pass++) {
        float pen = start;
        for (size_t i = 0; i < len;) {
            uint32_t cp;
            i += hw_utf8_decode((const uint8_t *)utf8 + i, len - i, &cp);
            draw_glyph(f, glyph(f, cp, px, flags, pass == 0), pen, y, pass == 0 ? outline : fill, 1.0f);
            pen += hw_fonts_advance(f, cp, px, flags);
        }
    }
    return w;
}

/* ---- rich text ---- */

static bool style_eq(const hw_text_style *a, const hw_text_style *b)
{
    return a->flags == b->flags && a->color == b->color && a->size == b->size && a->cps == b->cps;
}

static void rt_reset(hw_rich_text *rt)
{
    rt->run_count = 0;
    rt->used = 0;
    rt->pause_count = 0;
    rt->no_wait = false;
    rt->chars = 0;
    rt->width = 0.0f;
    memset(&rt->stack[0], 0, sizeof rt->stack[0]);
    rt->depth = 1;
    rt->open = false;
    rt->in_ruby = false;
    rt->ruby_reading = NULL;
    rt->ruby_run = -1;
}

/* Stores a NUL-terminated copy in the arena; returns NULL when full. */
static char *rt_store(hw_rich_text *rt, const char *s, size_t n)
{
    if (rt->used + n + 1 > sizeof rt->bytes) return NULL;
    char *p = rt->bytes + rt->used;
    memcpy(p, s, n);
    p[n] = 0;
    rt->used += n + 1;
    return p;
}

/* Appends to the last run (its text ends the arena, before its NUL). */
static bool rt_extend(hw_rich_text *rt, const char *s, size_t n)
{
    if (rt->used + n > sizeof rt->bytes) return false;
    char *end = rt->bytes + rt->used - 1; /* the last run's NUL */
    memcpy(end, s, n);
    end[n] = 0;
    rt->used += n;
    return true;
}

static void rt_run(void *user, const char *s, size_t n)
{
    hw_rich_text *rt = user;
    if (n == 0) return;
    const hw_text_style *st = &rt->stack[rt->depth - 1];
    uint32_t last = rt->run_count - 1;
    bool ok;
    if (rt->in_ruby && rt->ruby_run >= 0) {
        ok = rt_extend(rt, s, n);
    } else if (!rt->in_ruby && rt->open && rt->run_count > 0 && style_eq(&rt->styles[last], st)) {
        ok = rt_extend(rt, s, n);
    } else {
        if (rt->run_count >= HW_RICH_MAX_RUNS) return;
        char *text = rt_store(rt, s, n);
        if (!text) return;
        rt->runs[rt->run_count] = (HwRun){ text, rt->in_ruby ? rt->ruby_reading : NULL };
        rt->styles[rt->run_count] = *st;
        if (rt->in_ruby) rt->ruby_run = (int32_t)rt->run_count;
        rt->run_count++;
        rt->open = !rt->in_ruby;
        ok = true;
    }
    if (ok) rt->chars += (uint32_t)hw_utf8_count((const uint8_t *)s, n);
}

static uint32_t parse_color(const char *v, bool *ok)
{
    *ok = false;
    if (v[0] != '#') return 0;
    size_t n = strlen(v + 1);
    char *end;
    unsigned long c = strtoul(v + 1, &end, 16);
    if (*end != 0) return 0;
    if (n == 6) {
        *ok = true;
        return (uint32_t)c;
    }
    if (n == 3) {
        *ok = true;
        uint32_t r = (uint32_t)(c >> 8) & 0xF, g = (uint32_t)(c >> 4) & 0xF, b = (uint32_t)c & 0xF;
        return (r * 17) << 16 | (g * 17) << 8 | b * 17;
    }
    return 0;
}

static void rt_open(void *user, const char *tag, const char *value)
{
    hw_rich_text *rt = user;
    hw_text_style st = rt->stack[rt->depth - 1];
    if (strcmp(tag, "b") == 0) st.flags |= HW_TS_BOLD;
    else if (strcmp(tag, "i") == 0) st.flags |= HW_TS_ITALIC;
    else if (strcmp(tag, "shake") == 0) st.flags |= HW_TS_SHAKE;
    else if (strcmp(tag, "color") == 0) {
        bool ok;
        uint32_t c = parse_color(value, &ok);
        if (ok) {
            st.flags |= HW_TS_COLOR;
            st.color = c;
        }
    } else if (strcmp(tag, "size") == 0) {
        float s = strtof(value, NULL);
        if (s >= 4.0f && s <= 400.0f) st.size = s;
    } else if (strcmp(tag, "speed") == 0) {
        float s = strtof(value, NULL);
        if (s > 0.0f) st.cps = s;
    } else if (strcmp(tag, "rb") == 0 && !rt->in_ruby) {
        rt->ruby_reading = rt_store(rt, value, strlen(value));
        rt->in_ruby = rt->ruby_reading != NULL;
        rt->ruby_run = -1;
    }
    rt->open = false;
    if (rt->depth < sizeof rt->stack / sizeof rt->stack[0]) rt->stack[rt->depth++] = st;
}

static void rt_close(void *user, const char *tag)
{
    hw_rich_text *rt = user;
    if (strcmp(tag, "rb") == 0) {
        rt->in_ruby = false;
        rt->ruby_run = -1;
    }
    rt->open = false;
    if (rt->depth > 1) rt->depth--;
}

static void rt_mark(void *user, const char *tag, const char *value)
{
    hw_rich_text *rt = user;
    if (strcmp(tag, "w") == 0 && rt->pause_count < HW_RICH_MAX_PAUSES) {
        rt->pauses[rt->pause_count++] = (hw_rich_pause){ rt->chars, (int32_t)strtol(value, NULL, 10) };
    } else if (strcmp(tag, "nw") == 0) {
        rt->no_wait = true;
    }
    /* {alt=…} is for screen readers (plan §13); nothing to draw. */
}

void hw_rich_build(hw_rich_text *rt, const hw_vm *vm, uint32_t text)
{
    rt_reset(rt);
    hw_text_sink sink = { rt_run, rt_open, rt_close, rt_mark, rt };
    hw_vm_eval_text(vm, text, &sink);
}

void hw_rich_plain(hw_rich_text *rt, const char *utf8)
{
    rt_reset(rt);
    rt_run(rt, utf8, strlen(utf8));
}

typedef struct adv_ctx {
    hw_fonts *f;
    const hw_rich_text *rt;
} adv_ctx;

static float run_px(const hw_rich_text *rt, uint32_t run)
{
    float s = run < rt->run_count ? rt->styles[run].size : 0.0f;
    return s > 0.0f ? s : rt->base_px;
}

static float layout_advance(void *user, uint32_t cp, HwFontRole role, uint32_t run)
{
    adv_ctx *c = user;
    float px = run_px(c->rt, run);
    uint32_t flags = run < c->rt->run_count ? c->rt->styles[run].flags : 0;
    return hw_fonts_advance(c->f, cp, role == HW_FONT_RUBY ? px * 0.5f : px, flags);
}

static float line_spacing = 1.0f;

void hw_rich_set_line_spacing(float spacing) { line_spacing = spacing >= 0.5f && spacing <= 3.0f ? spacing : 1.0f; }

bool hw_rich_layout(hw_rich_text *rt, hw_fonts *f, float max_width, float base_px, const char *lang)
{
    rt->base_px = base_px;
    HwLayoutParams p = {
        max_width,
        base_px * 1.45f * line_spacing + base_px * 0.5f, /* line pitch includes the ruby band */
        base_px * 1.0f,                   /* base ascent below the ruby band */
        base_px * 0.5f,                   /* ruby band */
        base_px * 0.45f,                  /* ruby baseline */
        lang && lang[0] ? lang : "en",
        true,
        true,
    };
    adv_ctx c = { f, rt };
    if (!hw_layout_paragraph(rt->runs, rt->run_count, &p, layout_advance, &c, &rt->layout)) return false;

    rt->width = 0.0f;
    if (rt->layout.reveal_count > rt->reveal_cap) {
        uint32_t *r = SDL_realloc(rt->reveal_run, rt->layout.reveal_count * sizeof *r);
        if (!r) return false;
        rt->reveal_run = r;
        rt->reveal_cap = rt->layout.reveal_count;
    }
    for (uint32_t i = 0; i < rt->layout.reveal_count; i++) rt->reveal_run[i] = 0;
    for (size_t i = 0; i < rt->layout.count; i++) {
        const HwLayoutGlyph *g = &rt->layout.glyphs[i];
        if (g->role != HW_FONT_BASE) continue;
        if (g->reveal < rt->layout.reveal_count) rt->reveal_run[g->reveal] = g->run;
        float right = g->x + layout_advance(&c, g->cp, HW_FONT_BASE, g->run);
        if (right > rt->width) rt->width = right;
    }
    /* Newlines have no glyph; they take their neighbour's run. */
    for (uint32_t i = 1; i < rt->layout.reveal_count; i++) {
        if (rt->reveal_run[i] == 0 && rt->reveal_run[i - 1] != 0) rt->reveal_run[i] = rt->reveal_run[i - 1];
    }
    return true;
}

float hw_rich_cps(const hw_rich_text *rt, uint32_t at, float fallback)
{
    if (at >= rt->layout.reveal_count || !rt->reveal_run) return fallback;
    uint32_t run = rt->reveal_run[at];
    return run < rt->run_count && rt->styles[run].cps > 0.0f ? rt->styles[run].cps : fallback;
}

void hw_rich_draw(hw_fonts *f, const hw_rich_text *rt, float x, float y, float reveal, float time, float alpha, SDL_Color fill,
                  SDL_Color outline, float outline_px)
{
    for (int pass = outline_px > 0.0f ? 0 : 1; pass < 2; pass++) {
        for (size_t i = 0; i < rt->layout.count; i++) {
            const HwLayoutGlyph *g = &rt->layout.glyphs[i];
            float shown = reveal - (float)g->reveal;
            if (shown <= 0.0f) continue;
            float a = alpha * (shown < 1.0f ? shown : 1.0f);
            const hw_text_style *st = g->run < rt->run_count ? &rt->styles[g->run] : NULL;
            float px = st && st->size > 0.0f ? st->size : rt->base_px;
            if (g->role == HW_FONT_RUBY) px *= 0.5f;
            uint32_t flags = st ? st->flags : 0;
            float dx = 0.0f, dy = 0.0f;
            if (flags & HW_TS_SHAKE) {
                float seed = (float)i * 12.9898f;
                dx = sinf(time * 37.0f + seed) * px * 0.04f;
                dy = cosf(time * 41.0f + seed * 1.7f) * px * 0.04f;
            }
            SDL_Color c = fill;
            if (pass == 1 && st && (st->flags & HW_TS_COLOR)) {
                c = (SDL_Color){ (Uint8)(st->color >> 16), (Uint8)(st->color >> 8), (Uint8)st->color, fill.a };
            }
            draw_glyph(f, glyph(f, g->cp, px, flags, pass == 0), x + g->x + dx, y + g->y + dy, pass == 0 ? outline : c, a);
        }
    }
}

void hw_rich_free(hw_rich_text *rt)
{
    hw_layout_free(&rt->layout);
    SDL_free(rt->reveal_run);
    rt->reveal_run = NULL;
    rt->reveal_cap = 0;
}
