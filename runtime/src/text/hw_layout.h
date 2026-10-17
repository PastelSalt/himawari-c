/*
 * Himawari-C: paragraph layout for VN text (plan §7, §8.6, rfcs/0003).
 *
 * Pure layout: no SDL, no I/O, no font library. The caller supplies glyph
 * advances through a callback, so the same layout runs over FreeType, SDL3_ttf,
 * or a fixed-width stub in tests.
 *
 * Line breaking: UAX #14 opportunities from libunibreak, then a strict JLREQ
 * kinsoku override table (no closing brackets, small kana, or punctuation at a
 * line start; no opening brackets at a line end), then greedy filling with
 * optional hanging punctuation (burasagari) for 、。，．.
 *
 * Ruby: each ruby group is unbreakable. Its width is max(base, ruby). The
 * narrower side is spread with the 1:2:1 rule (half a unit before the first
 * character and after the last, a full unit between characters), so ruby never
 * overhangs neighboring characters (W3C "Simple Placement of Japanese Ruby").
 *
 * Input is pre-structured runs, never markup: the runtime does not parse
 * source text (D01). Core compiles `{rb=…}…{/rb}` into these runs.
 */
#ifndef HW_LAYOUT_H
#define HW_LAYOUT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum { HW_FONT_BASE = 0, HW_FONT_RUBY = 1 } HwFontRole;

/* One run of base text, optionally annotated with ruby over the whole run. */
typedef struct {
    const char *text; /* UTF-8 */
    const char *ruby; /* UTF-8, or NULL */
} HwRun;

/* Returns the advance width in pixels of `cp` in the given font role, for the run it belongs to (runs may differ in size). */
typedef float (*HwAdvanceFn)(void *user, uint32_t cp, HwFontRole role, uint32_t run);

typedef struct {
    float max_width;     /* textbox width in px */
    float line_pitch;    /* distance between baselines in px (includes the ruby area) */
    float base_ascent;   /* px from line top (below the ruby area) to the base baseline */
    float ruby_area;     /* px reserved above every line for ruby */
    float ruby_ascent;   /* px from line top to the ruby baseline */
    const char *lang;    /* BCP 47, e.g. "ja"; passed to libunibreak */
    bool hanging_punct;  /* allow 、。，． to hang past max_width */
    bool strict_kinsoku; /* apply the JLREQ override table on top of UAX #14 */
} HwLayoutParams;

typedef struct {
    uint32_t cp;
    HwFontRole role;
    float x, y;      /* pen position: left edge of the advance box, baseline */
    uint32_t reveal; /* reveal order; ruby shares the index of its group's first base char */
    uint32_t line;
    uint32_t run;    /* index of the HwRun it came from (for styles: color, size, emphasis) */
} HwLayoutGlyph;

typedef struct {
    HwLayoutGlyph *glyphs;
    size_t count;
    size_t capacity;
    uint32_t lines;
    uint32_t reveal_count; /* number of base characters */
    float height;          /* lines * line_pitch */
} HwLayout;

/* Lays out `runs` into `out` (which must be zero-initialized or reused). Returns false on allocation failure. */
bool hw_layout_paragraph(const HwRun *runs, size_t run_count, const HwLayoutParams *params,
                         HwAdvanceFn advance, void *user, HwLayout *out);

void hw_layout_free(HwLayout *layout);

/* JLREQ character classes used by the override table. Exposed for tests. */
bool hw_kinsoku_no_line_start(uint32_t cp);
bool hw_kinsoku_no_line_end(uint32_t cp);
bool hw_kinsoku_hangable(uint32_t cp);

#endif
