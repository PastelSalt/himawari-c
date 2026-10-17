/*
 * Spike C (plan §18 Phase 0, rfcs/0003): a Japanese paragraph with ruby and
 * kinsoku, laid out by src/text/hw_layout.c and rasterized either by FreeType
 * directly (spike_c_ft) or by SDL3_ttf's glyph API (spike_c_ttf).
 *
 * Usage: spike_c_ft|spike_c_ttf [options]
 *   --width PX         textbox width (default 1600)
 *   --fonts A,B,...    fallback chain (default: Segoe UI, then Yu Gothic)
 *   --no-hang          disable hanging punctuation (burasagari)
 *   --loose            UAX #14 only, no JLREQ override table
 *   --reveal N         show only the first N characters (typewriter state)
 *   --frames N         quit after N frames
 *   --screenshot FILE  save the first frame as a BMP
 * Prints timings, atlas use, and memory. Exit code 0 means every check passed.
 */
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

#include <stdio.h>
#include <string.h>

#define PSAPI_VERSION 2
#include <windows.h>
#include <psapi.h>

#include "glyphs.h"
#include "hw_layout.h"
#include "hw_version.h"

enum {
    CANVAS_W = 1920,
    CANVAS_H = 1080,
    BASE_PX = 48,
    RUBY_PX = 24, /* JLREQ: ruby is half the base size */
    OUTLINE_PX = 3,
    ATLAS_SIZE = 2048,
    CACHE_SLOTS = 4096,
};

/* What Core would compile from:
 *   放課後の{rb=きょうしつ}教室{/rb}には、まだ{rb=ゆうひ}夕日{/rb}が差し込んでいた。… */
static const HwRun PARAGRAPH[] = {
    { "放課後の", NULL },
    { "教室", "きょうしつ" },
    { "には、まだ", NULL },
    { "夕日", "ゆうひ" },
    { "が差し込んでいた。「もう帰らないの？」と", NULL },
    { "花", "はな" },
    { "が聞いた。わたしは窓の外を見たまま、小さく首を振った——", NULL },
    { "約束", "やくそく" },
    { "の時間まで、あと少しだけある。Himawari は、きっとここで待っていてくれるはずだから。", NULL },
};

static const char *const DEFAULT_FONTS[] = { "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/YuGothM.ttc" };

/* ---- Glyph atlas: one texture, shelf packing, open-addressing cache ---- */

typedef struct {
    uint32_t key; /* cp | role << 22 | outline << 23; 0 = empty */
    bool has_image;
    SDL_FRect src;
    int left, top;
} AtlasEntry;

typedef struct {
    SDL_Texture *texture;
    AtlasEntry slots[CACHE_SLOTS];
    int shelf_x, shelf_y, shelf_h;
    int glyph_count;
    long long pixels_used;
} Atlas;

static Atlas atlas;

static uint32_t atlas_key(uint32_t cp, HwFontRole role, bool outline)
{
    return (cp + 1u) | ((uint32_t)role << 22) | ((uint32_t)outline << 23);
}

static const AtlasEntry *atlas_get(uint32_t cp, HwFontRole role, bool outline)
{
    uint32_t key = atlas_key(cp, role, outline);
    uint32_t h = (key * 2654435761u) % CACHE_SLOTS;
    while (atlas.slots[h].key != 0 && atlas.slots[h].key != key) {
        h = (h + 1) % CACHE_SLOTS;
    }
    AtlasEntry *e = &atlas.slots[h];
    if (e->key == key) {
        return e;
    }

    GlyphBitmap bm;
    if (!glyphs_render(cp, role, outline, &bm)) {
        return NULL;
    }
    e->key = key;
    e->left = bm.left;
    e->top = bm.top;
    e->has_image = bm.w > 0 && bm.h > 0;
    if (!e->has_image) {
        return e;
    }

    if (atlas.shelf_x + bm.w + 1 > ATLAS_SIZE) {
        atlas.shelf_x = 0;
        atlas.shelf_y += atlas.shelf_h + 1;
        atlas.shelf_h = 0;
    }
    if (atlas.shelf_y + bm.h > ATLAS_SIZE) {
        SDL_Log("atlas: full (the runtime would add a page or evict)");
        e->has_image = false;
        return e;
    }

    /* Expand coverage to white RGBA for SDL_UpdateTexture. */
    static Uint8 rgba[256 * 256 * 4];
    if ((size_t)bm.w * (size_t)bm.h * 4u > sizeof rgba) {
        e->has_image = false;
        return e;
    }
    for (int y = 0; y < bm.h; y++) {
        for (int x = 0; x < bm.w; x++) {
            Uint8 *px = &rgba[((size_t)y * (size_t)bm.w + (size_t)x) * 4u];
            px[0] = px[1] = px[2] = 255;
            px[3] = bm.alpha[(size_t)y * (size_t)bm.pitch + (size_t)x];
        }
    }
    SDL_Rect dst = { atlas.shelf_x, atlas.shelf_y, bm.w, bm.h };
    SDL_UpdateTexture(atlas.texture, &dst, rgba, bm.w * 4);
    e->src = (SDL_FRect){ (float)dst.x, (float)dst.y, (float)dst.w, (float)dst.h };
    atlas.shelf_x += bm.w + 1;
    if (bm.h > atlas.shelf_h) {
        atlas.shelf_h = bm.h;
    }
    atlas.glyph_count++;
    atlas.pixels_used += (long long)bm.w * bm.h;
    return e;
}

/* ---- Advance cache, shared by both backends so layout timing compares fairly ---- */

typedef struct {
    uint32_t key;
    float advance;
} AdvanceEntry;

static AdvanceEntry advance_cache[CACHE_SLOTS];

static float cached_advance(void *user, uint32_t cp, HwFontRole role, uint32_t run)
{
    (void)user;
    (void)run;
    uint32_t key = atlas_key(cp, role, false);
    uint32_t h = (key * 2654435761u) % CACHE_SLOTS;
    while (advance_cache[h].key != 0 && advance_cache[h].key != key) {
        h = (h + 1) % CACHE_SLOTS;
    }
    if (advance_cache[h].key != key) {
        advance_cache[h].key = key;
        advance_cache[h].advance = glyphs_advance(cp, role);
    }
    return advance_cache[h].advance;
}

static double now_ms(void)
{
    return (double)SDL_GetTicksNS() / 1e6;
}

static void log_memory(const char *when)
{
    PROCESS_MEMORY_COUNTERS pmc;
    if (K32GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof pmc)) {
        SDL_Log("memory (%s): working set %.1f MB, peak %.1f MB, private %.1f MB", when,
                (double)pmc.WorkingSetSize / 1048576.0, (double)pmc.PeakWorkingSetSize / 1048576.0,
                (double)pmc.PagefileUsage / 1048576.0);
    }
}

static void draw_text(SDL_Renderer *ren, const HwLayout *layout, float ox, float oy, uint32_t reveal, bool outline)
{
    if (outline) {
        SDL_SetTextureColorMod(atlas.texture, 0x3a, 0x22, 0x10);
    } else {
        SDL_SetTextureColorMod(atlas.texture, 255, 255, 255);
    }
    for (size_t i = 0; i < layout->count; i++) {
        const HwLayoutGlyph *g = &layout->glyphs[i];
        if (g->reveal >= reveal) {
            continue;
        }
        const AtlasEntry *e = atlas_get(g->cp, g->role, outline);
        if (!e || !e->has_image) {
            continue;
        }
        SDL_FRect dst = { ox + g->x + (float)e->left, oy + g->y - (float)e->top, e->src.w, e->src.h };
        SDL_RenderTexture(ren, atlas.texture, &e->src, &dst);
    }
}

int main(int argc, char *argv[])
{
    float width = 1600.0f;
    const char *fonts[4];
    int font_count = 0;
    char font_arg[1024] = { 0 };
    bool hanging = true, strict = true, check_only = false;
    int reveal_limit = -1, max_frames = 0;
    const char *screenshot_path = NULL;

    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        bool has_value = i + 1 < argc;
        if (SDL_strcmp(a, "--width") == 0 && has_value) {
            width = (float)SDL_atof(argv[++i]);
        } else if (SDL_strcmp(a, "--fonts") == 0 && has_value) {
            SDL_strlcpy(font_arg, argv[++i], sizeof font_arg);
            char *save = NULL;
            for (char *tok = SDL_strtok_r(font_arg, ",", &save); tok && font_count < 4; tok = SDL_strtok_r(NULL, ",", &save)) {
                fonts[font_count++] = tok;
            }
        } else if (SDL_strcmp(a, "--no-hang") == 0) {
            hanging = false;
        } else if (SDL_strcmp(a, "--loose") == 0) {
            strict = false;
        } else if (SDL_strcmp(a, "--reveal") == 0 && has_value) {
            reveal_limit = SDL_atoi(argv[++i]);
        } else if (SDL_strcmp(a, "--frames") == 0 && has_value) {
            max_frames = SDL_atoi(argv[++i]);
        } else if (SDL_strcmp(a, "--screenshot") == 0 && has_value) {
            screenshot_path = argv[++i];
        } else if (SDL_strcmp(a, "--check-only") == 0) {
            check_only = true;
        } else {
            SDL_Log("unknown argument: %s", a);
            return 2;
        }
    }
    if (font_count == 0) {
        fonts[0] = DEFAULT_FONTS[0];
        fonts[1] = DEFAULT_FONTS[1];
        font_count = 2;
    }

    /* --check-only: layout and kinsoku checks, no window (for width sweeps). */
    if (!SDL_Init(check_only ? 0 : SDL_INIT_VIDEO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return 1;
    }
    log_memory("start");

    double t0 = now_ms();
    if (!glyphs_init(fonts, font_count, BASE_PX, RUBY_PX, OUTLINE_PX)) {
        SDL_Log("glyphs: init failed");
        return 1;
    }
    double t_init = now_ms() - t0;
    SDL_Log("Himawari-C %s spike C, backend %s (%s), fonts: %s%s%s", HW_VERSION_STRING, GLYPHS_BACKEND,
            glyphs_version(), fonts[0], font_count > 1 ? " -> " : "", font_count > 1 ? fonts[1] : "");

    /* Layout. Ascent from the base size: ~0.88 em is typical for CJK fonts. */
    HwLayoutParams params = {
        .max_width = width,
        .line_pitch = (float)BASE_PX * 1.25f + (float)RUBY_PX,
        .base_ascent = (float)BASE_PX * 0.88f,
        .ruby_area = (float)RUBY_PX,
        .ruby_ascent = (float)RUBY_PX * 0.88f,
        .lang = "ja",
        .hanging_punct = hanging,
        .strict_kinsoku = strict,
    };
    HwLayout layout = { 0 };
    t0 = now_ms();
    bool ok = hw_layout_paragraph(PARAGRAPH, SDL_arraysize(PARAGRAPH), &params, cached_advance, NULL, &layout);
    double t_layout_cold = now_ms() - t0;
    t0 = now_ms();
    for (int i = 0; ok && i < 1000; i++) {
        ok = hw_layout_paragraph(PARAGRAPH, SDL_arraysize(PARAGRAPH), &params, cached_advance, NULL, &layout);
    }
    double t_layout_warm = (now_ms() - t0) / 1000.0;
    if (!ok) {
        SDL_Log("layout: failed");
        return 1;
    }

    SDL_Log("layout: %u glyphs (%u base), %u lines, width %.0f, kinsoku %s, hanging %s", (unsigned)layout.count,
            layout.reveal_count, layout.lines, (double)width, strict ? "strict" : "UAX14 only", hanging ? "on" : "off");
    SDL_Log("timing: init %.2f ms, layout cold %.3f ms (includes glyph loading), layout warm %.4f ms", t_init,
            t_layout_cold, t_layout_warm);

    SDL_Window *win = NULL;
    SDL_Renderer *ren = NULL;
    if (!check_only) {
        if (!SDL_CreateWindowAndRenderer("Himawari Spike C", 1280, 720, SDL_WINDOW_RESIZABLE, &win, &ren)) {
            SDL_Log("window: failed: %s", SDL_GetError());
            return 1;
        }
        SDL_SetRenderLogicalPresentation(ren, CANVAS_W, CANVAS_H, SDL_LOGICAL_PRESENTATION_LETTERBOX);
        SDL_SetRenderVSync(ren, 1);
        atlas.texture = SDL_CreateTexture(ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, ATLAS_SIZE, ATLAS_SIZE);
        if (!atlas.texture) {
            SDL_Log("atlas: failed: %s", SDL_GetError());
            return 1;
        }
        SDL_SetTextureBlendMode(atlas.texture, SDL_BLENDMODE_BLEND);

        /* Rasterize every glyph (outline + fill) into the atlas once. */
        t0 = now_ms();
        for (size_t i = 0; i < layout.count; i++) {
            atlas_get(layout.glyphs[i].cp, layout.glyphs[i].role, true);
            atlas_get(layout.glyphs[i].cp, layout.glyphs[i].role, false);
        }
        double t_raster = now_ms() - t0;
        SDL_Log("raster: %d atlas glyphs (outline + fill) in %.2f ms; %.1f%% of one %dx%d page (shelf reached y=%d)",
                atlas.glyph_count, t_raster, 100.0 * (double)atlas.pixels_used / ((double)ATLAS_SIZE * (double)ATLAS_SIZE),
                ATLAS_SIZE, ATLAS_SIZE, atlas.shelf_y + atlas.shelf_h);
        log_memory("after window + raster");
    }

    /* Self-check the kinsoku rules on the real font metrics: no forbidden character at a
     * line start or end (strict mode), and only hangable punctuation past the margin. */
    int failures = 0, violations = 0, hanging_count = 0;
    for (uint32_t line = 0; line < layout.lines; line++) {
        const HwLayoutGlyph *first = NULL, *last = NULL;
        for (size_t i = 0; i < layout.count; i++) {
            const HwLayoutGlyph *g = &layout.glyphs[i];
            if (g->role != HW_FONT_BASE || g->line != line) {
                continue;
            }
            if (!first) {
                first = g;
            }
            if (g->cp != ' ') {
                last = g;
            }
            if (g->cp != ' ' && g->x + cached_advance(NULL, g->cp, HW_FONT_BASE, g->run) > width + 0.5f) {
                /* Trailing spaces may overflow by design: they are invisible. */
                if (hw_kinsoku_hangable(g->cp)) {
                    hanging_count++;
                } else {
                    SDL_Log("overflow: U+%04X on line %u is past the margin and not hangable", (unsigned)g->cp, line);
                    failures++;
                }
            }
        }
        if (line > 0 && first && hw_kinsoku_no_line_start(first->cp)) {
            SDL_Log("kinsoku: line %u starts with U+%04X", line, (unsigned)first->cp);
            violations++;
        }
        if (line + 1 < layout.lines && last && hw_kinsoku_no_line_end(last->cp)) {
            SDL_Log("kinsoku: line %u ends with U+%04X", line, (unsigned)last->cp);
            violations++;
        }
    }
    SDL_Log("check: %d kinsoku violations, %d hanging punctuation marks", violations, hanging_count);
    if (strict && violations > 0) {
        failures++;
    }

    const float box_x = ((float)CANVAS_W - width) / 2.0f;
    const float box_y = SDL_max(140.0f, (float)CANVAS_H - 120.0f - layout.height); /* bottom-anchored, always on screen */
    uint32_t reveal = reveal_limit >= 0 ? (uint32_t)reveal_limit : layout.reveal_count;
    bool running = !check_only;
    int frame = 0;
    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_EVENT_QUIT || (e.type == SDL_EVENT_KEY_DOWN && e.key.key == SDLK_ESCAPE)) {
                running = false;
            }
        }
        SDL_SetRenderDrawColor(ren, 0x55, 0x7a, 0x95, 255);
        SDL_RenderClear(ren);

        /* Textbox and its right margin, to make hanging punctuation visible. */
        SDL_FRect box = { box_x - 40.0f, box_y - 40.0f, width + 80.0f, layout.height + 80.0f };
        SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND);
        SDL_SetRenderDrawColor(ren, 0x10, 0x14, 0x20, 200);
        SDL_RenderFillRect(ren, &box);
        SDL_SetRenderDrawColor(ren, 0xff, 0x60, 0x60, 255);
        SDL_RenderLine(ren, box_x + width, box_y - 30.0f, box_x + width, box_y + layout.height + 30.0f);
        SDL_RenderLine(ren, box_x, box_y - 30.0f, box_x, box_y + layout.height + 30.0f);

        draw_text(ren, &layout, box_x, box_y, reveal, true);
        draw_text(ren, &layout, box_x, box_y, reveal, false);

        SDL_SetRenderDrawColor(ren, 255, 255, 255, 255);
        SDL_SetRenderScale(ren, 2.0f, 2.0f);
        char label[128];
        SDL_snprintf(label, sizeof label, "%s | kinsoku %s | hanging %s | width %.0f", GLYPHS_BACKEND,
                     strict ? "strict" : "UAX14", hanging ? "on" : "off", (double)width);
        SDL_RenderDebugText(ren, 40.0f, 40.0f, label);
        SDL_SetRenderScale(ren, 1.0f, 1.0f);

        if (screenshot_path && frame == 0) {
            SDL_Surface *shot = SDL_RenderReadPixels(ren, NULL);
            if (!shot || !SDL_SaveBMP(shot, screenshot_path)) {
                SDL_Log("screenshot: failed: %s", SDL_GetError());
                failures++;
            }
            SDL_DestroySurface(shot);
        }
        SDL_RenderPresent(ren);
        if (max_frames > 0 && ++frame >= max_frames) {
            running = false;
        }
    }

    hw_layout_free(&layout);
    glyphs_quit();
    if (ren) {
        SDL_DestroyTexture(atlas.texture);
        SDL_DestroyRenderer(ren);
        SDL_DestroyWindow(win);
    }
    SDL_Quit();
    if (failures == 0) {
        SDL_Log("Spike C: OK");
        return 0;
    }
    return 1;
}
