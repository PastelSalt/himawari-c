/*
 * libFuzzer target for paragraph layout (BREAK_IT.md E-3): line breaking,
 * kinsoku, hanging punctuation, and ruby, on any text. Every line of every game
 * goes through hw_layout_paragraph, so any UTF-8 (valid or not), any widths
 * (zero, tiny, huge), and any textbox size must lay out without crashing, and
 * the result must make sense:
 *  - every base character and line break gets one reveal step, in order;
 *  - every glyph is on a line that exists, at a finite position;
 *  - the height is lines × line pitch.
 *
 * Input: 4 bytes of parameters, then runs separated by 0x01; inside a run, 0x02
 * starts its ruby.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "hw_layout.h"

#include <stdio.h>

/* A broken invariant says which one before stopping, so a crash file explains itself. */
#define MUST(cond, what) \
    do { \
        if (!(cond)) { \
            fprintf(stderr, "fuzz_layout: %s\n", what); \
            __builtin_trap(); \
        } \
    } while (0)

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

/* Widths from the code point, so the same input always lays out the same way; zero widths included. */
static float advance(void *user, uint32_t cp, HwFontRole role, uint32_t run)
{
    float scale = *(const float *)user;
    float w = (float)((cp * 2654435761u + run) % 9u) * scale;
    return role == HW_FONT_RUBY ? w * 0.5f : w;
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size < 4 || size > 4096) return 0;
    static const float widths[] = { 0.0f, 1.0f, 7.5f, 40.0f, 320.0f, 1600.0f, 1e9f, -10.0f };
    static const float scales[] = { 0.0f, 0.01f, 1.0f, 16.0f, 300.0f, 1e7f };
    static const char *const langs[] = { "ja", "en", "zh-Hans", "" };
    HwLayoutParams p = {
        .max_width = widths[data[0] & 7],
        .line_pitch = 48.0f,
        .base_ascent = 30.0f,
        .ruby_area = (data[1] & 1) ? 14.0f : 0.0f,
        .ruby_ascent = 10.0f,
        .lang = langs[(data[1] >> 1) & 3],
        .hanging_punct = (data[1] & 8) != 0,
        .strict_kinsoku = (data[1] & 16) != 0,
    };
    float scale = scales[data[2] % 6];
    (void)data[3];

    /* Runs: copy the rest so every run is its own NUL-terminated string. */
    size_t n = size - 4;
    char *text = malloc(n + 1);
    if (!text) return 0;
    memcpy(text, data + 4, n);
    text[n] = 0;
    HwRun runs[64];
    size_t count = 0;
    char *start = text;
    for (size_t i = 0; i <= n && count < 64; i++) {
        if (text[i] == 1 || text[i] == 0) {
            int end = text[i] == 0;
            text[i] = 0;
            char *ruby = strchr(start, 2);
            if (ruby) *ruby++ = 0;
            runs[count++] = (HwRun){ start, ruby };
            if (end) break;
            start = text + i + 1;
        }
    }

    HwLayout out = { 0 };
    if (hw_layout_paragraph(runs, count, &p, advance, &scale, &out)) {
        uint32_t base = 0, last_reveal = 0;
        for (size_t i = 0; i < out.count; i++) {
            const HwLayoutGlyph *g = &out.glyphs[i];
            MUST(isfinite(g->x) && isfinite(g->y), "a glyph position is not a finite number");
            MUST(out.lines == 0 || g->line < out.lines, "a glyph is on a line that does not exist");
            MUST(g->run < count, "a glyph names a run that does not exist");
            if (g->role == HW_FONT_BASE) {
                MUST(g->reveal >= last_reveal, "base characters reveal out of order");
                last_reveal = g->reveal;
                base++;
            }
            MUST(out.reveal_count == 0 || g->reveal < out.reveal_count, "a reveal index is past the reveal count");
        }
        /* A line break takes a reveal step but draws nothing (0x0A is never inside a UTF-8 sequence). */
        uint32_t breaks = 0;
        for (size_t r = 0; r < count; r++)
            for (const char *c = runs[r].text; *c; c++) breaks += *c == '\n';
        MUST(base + breaks == out.reveal_count, "the reveal count differs from base characters plus line breaks");
        MUST(fabsf(out.height - (float)out.lines * p.line_pitch) <= 0.01f * (float)(out.lines + 1), "the height is not lines x line pitch");
    }
    hw_layout_free(&out);
    free(text);
    return 0;
}
