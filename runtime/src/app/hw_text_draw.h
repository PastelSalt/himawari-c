/*
 * Himawari-C: drawing text (plan §8.6, rfcs/0003). FreeType directly, with a
 * fallback chain of faces, synthetic bold and italic, an outline from the
 * FreeType stroker, and a paged glyph atlas. Paragraphs are laid out by
 * src/text/hw_layout.c (line breaking, kinsoku, ruby).
 *
 * "Rich text" is a line evaluated by the VM (variables and selects resolved)
 * turned into styled runs, typewriter pauses, and a layout.
 */
#ifndef HW_TEXT_DRAW_H
#define HW_TEXT_DRAW_H

#include <SDL3/SDL.h>

#include <stdbool.h>
#include <stdint.h>

#include "hw_layout.h"
#include "hw_vm.h"

typedef struct hw_fonts hw_fonts;

/* Opens the faces of a fallback chain (the first that has a character wins). */
hw_fonts *hw_fonts_open(SDL_Renderer *ren, const char *const *paths, int count);
void hw_fonts_close(hw_fonts *f);
/* Forgets every cached glyph (for example after the window's pixel scale changed). */
void hw_fonts_flush(hw_fonts *f);

enum { HW_TS_BOLD = 1, HW_TS_ITALIC = 2, HW_TS_SHAKE = 4, HW_TS_COLOR = 8 };

typedef struct hw_text_style {
    uint32_t flags;
    uint32_t color; /* 0xRRGGBB, used with HW_TS_COLOR */
    float size;     /* px, 0 = the paragraph's base size */
    float cps;      /* characters per second, 0 = the player's setting */
} hw_text_style;

float hw_fonts_advance(hw_fonts *f, uint32_t cp, float px, uint32_t flags);

/* Plain one-line text (names, buttons). Returns the width. align: 0 left, 1 center, 2 right. */
float hw_text_width(hw_fonts *f, const char *utf8, float px, uint32_t flags);
float hw_text_draw(hw_fonts *f, const char *utf8, float px, uint32_t flags, float x, float y_baseline, int align,
                   SDL_Color fill, SDL_Color outline, float outline_px);

#define HW_RICH_MAX_RUNS 96
#define HW_RICH_MAX_BYTES 4096
#define HW_RICH_MAX_PAUSES 32

typedef struct hw_rich_pause {
    uint32_t at; /* reveal index (characters before the pause) */
    int32_t ms;
} hw_rich_pause;

typedef struct hw_rich_text {
    HwRun runs[HW_RICH_MAX_RUNS];
    hw_text_style styles[HW_RICH_MAX_RUNS];
    uint32_t run_count;
    char bytes[HW_RICH_MAX_BYTES];
    size_t used;
    hw_rich_pause pauses[HW_RICH_MAX_PAUSES];
    uint32_t pause_count;
    bool no_wait;     /* {nw}: continue by itself once shown */
    uint32_t chars;   /* code points in the text (= reveal positions) */
    float base_px;
    HwLayout layout;
    float width;      /* widest line after layout */
    uint32_t *reveal_run; /* run of each reveal position */
    uint32_t reveal_cap;

    /* Building state. */
    hw_text_style stack[16];
    uint32_t depth;
    bool open;        /* the last run can be extended */
    bool in_ruby;
    const char *ruby_reading;
    int32_t ruby_run;
} hw_rich_text;

/* Fills `rt` from text program `text` evaluated by the VM. */
void hw_rich_build(hw_rich_text *rt, const hw_vm *vm, uint32_t text);
/* From plain UTF-8 (no markup). */
void hw_rich_plain(hw_rich_text *rt, const char *utf8);
/* Lays the runs out in `max_width` px at `base_px`. */
bool hw_rich_layout(hw_rich_text *rt, hw_fonts *f, float max_width, float base_px, const char *lang);
/* Draws the first `reveal` characters (fractional: the next one fades in). `time` drives {shake}. */
void hw_rich_draw(hw_fonts *f, const hw_rich_text *rt, float x, float y, float reveal, float time, float alpha,
                  SDL_Color fill, SDL_Color outline, float outline_px);
/* Characters per second at a reveal position (the run's {speed}, or `fallback`). */
float hw_rich_cps(const hw_rich_text *rt, uint32_t at, float fallback);
void hw_rich_free(hw_rich_text *rt);

#endif
