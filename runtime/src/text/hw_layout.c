#include "hw_layout.h"

#include <stdlib.h>
#include <string.h>

#include <linebreak.h>

#include "hw_utf8.h"

/* ---- JLREQ character classes (Requirements for Japanese Text Layout, appendix A) ---- */

static bool in_list(uint32_t cp, const uint32_t *list, size_t n)
{
    for (size_t i = 0; i < n; i++) {
        if (list[i] == cp) {
            return true;
        }
    }
    return false;
}

/* cl-02 closing brackets, cl-03 hyphens, cl-04 dividing punctuation, cl-05 middle
 * dots, cl-06 full stops, cl-07 commas, cl-09 iteration marks, cl-10 prolonged
 * sound mark, cl-11 small kana. "Strict" kinsoku: all of these. */
static const uint32_t NO_LINE_START[] = {
    /* cl-02 */ 0x2019, 0x201D, 0xFF09, 0x3015, 0xFF3D, 0xFF5D, 0x3009, 0x300B, 0x300D, 0x300F,
    0x3011, 0x3019, 0x3017, 0xFF60, 0x00BB, 0x0029, 0x005D, 0x007D,
    /* cl-03 */ 0x2010, 0x301C, 0x30A0, 0x2013,
    /* cl-04 */ 0xFF01, 0xFF1F, 0x203C, 0x2047, 0x2048, 0x2049, 0x0021, 0x003F,
    /* cl-05 */ 0x30FB, 0xFF1A, 0xFF1B, 0x003A, 0x003B,
    /* cl-06 */ 0x3002, 0xFF0E, 0x002E,
    /* cl-07 */ 0x3001, 0xFF0C, 0x002C,
    /* cl-09 */ 0x30FD, 0x30FE, 0x309D, 0x309E, 0x3005, 0x303B,
    /* cl-10 */ 0x30FC,
    /* cl-11 hiragana */ 0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087,
    0x308E, 0x3095, 0x3096,
    /* cl-11 katakana */ 0x30A1, 0x30A3, 0x30A5, 0x30A7, 0x30A9, 0x30C3, 0x30E3, 0x30E5, 0x30E7,
    0x30EE, 0x30F5, 0x30F6,
};

/* cl-01 opening brackets. */
static const uint32_t NO_LINE_END[] = {
    0x2018, 0x201C, 0xFF08, 0x3014, 0xFF3B, 0xFF5B, 0x3008, 0x300A, 0x300C, 0x300E,
    0x3010, 0x3018, 0x3016, 0xFF5F, 0x00AB, 0x0028, 0x005B, 0x007B,
};

/* cl-08 inseparable characters: no break between two of the same. */
static bool is_inseparable(uint32_t cp)
{
    return cp == 0x2014 || cp == 0x2026 || cp == 0x2025 || (cp >= 0x3033 && cp <= 0x3035);
}

bool hw_kinsoku_no_line_start(uint32_t cp)
{
    if (cp >= 0x31F0 && cp <= 0x31FF) { /* small katakana extensions */
        return true;
    }
    return in_list(cp, NO_LINE_START, sizeof NO_LINE_START / sizeof NO_LINE_START[0]);
}

bool hw_kinsoku_no_line_end(uint32_t cp)
{
    return in_list(cp, NO_LINE_END, sizeof NO_LINE_END / sizeof NO_LINE_END[0]);
}

bool hw_kinsoku_hangable(uint32_t cp)
{
    return cp == 0x3001 || cp == 0x3002 || cp == 0xFF0C || cp == 0xFF0E;
}

/* ---- Layout ---- */

typedef struct {
    uint32_t cp;
    int32_t group;  /* ruby group index, or -1 */
    float advance;  /* natural advance */
    float lead;     /* space before the glyph (ruby spreading), also added after */
    char brk;       /* LINEBREAK_* for the position after this item */
    uint32_t line;
    float x;        /* pen x of the glyph within its line */
    uint32_t run;   /* index of the run it came from */
} Item;

typedef struct {
    size_t first, last; /* item range, inclusive */
    const char *ruby;
    uint32_t run;
    float base_w, ruby_w;
} Group;

static bool push_glyph(HwLayout *out, HwLayoutGlyph g)
{
    if (out->count == out->capacity) {
        size_t cap = out->capacity ? out->capacity * 2 : 64;
        HwLayoutGlyph *p = (HwLayoutGlyph *)realloc(out->glyphs, cap * sizeof *p);
        if (!p) {
            return false;
        }
        out->glyphs = p;
        out->capacity = cap;
    }
    out->glyphs[out->count++] = g;
    return true;
}

static float item_width(const Item *it)
{
    return it->advance + 2.0f * it->lead;
}

static bool is_space(uint32_t cp)
{
    return cp == 0x20 || cp == 0x0A;
}

/* Index of the last item of the unit starting at `i`: a whole ruby group, or one item. */
static size_t unit_end(const Item *items, const Group *groups, size_t i)
{
    return items[i].group >= 0 ? groups[items[i].group].last : i;
}

bool hw_layout_paragraph(const HwRun *runs, size_t run_count, const HwLayoutParams *params,
                         HwAdvanceFn advance, void *user, HwLayout *out)
{
    static bool unibreak_ready = false;
    if (!unibreak_ready) {
        init_linebreak();
        unibreak_ready = true;
    }

    out->count = 0;
    out->lines = 0;
    out->reveal_count = 0;
    out->height = 0.0f;

    /* 1. Concatenate the base text, remembering which runs carry ruby. */
    size_t total = 0, group_count = 0;
    for (size_t r = 0; r < run_count; r++) {
        total += strlen(runs[r].text);
        if (runs[r].ruby) {
            group_count++;
        }
    }
    if (total == 0) {
        return true;
    }

    char *text = (char *)malloc(total);
    Item *items = (Item *)calloc(total, sizeof *items); /* at most one item per byte */
    char *brks = (char *)malloc(total);
    Group *groups = (Group *)calloc(group_count ? group_count : 1, sizeof *groups);
    bool ok = false;
    if (!text || !items || !brks || !groups) {
        goto done;
    }

    size_t n = 0, pos = 0, g = 0;
    for (size_t r = 0; r < run_count; r++) {
        size_t len = strlen(runs[r].text);
        memcpy(text + pos, runs[r].text, len);
        size_t first = n;
        for (size_t i = 0; i < len;) {
            uint32_t cp;
            i += hw_utf8_decode((const uint8_t *)runs[r].text + i, len - i, &cp);
            items[n].cp = cp;
            items[n].group = runs[r].ruby ? (int32_t)g : -1;
            items[n].run = (uint32_t)r;
            items[n].advance = cp == 0x0A ? 0.0f : advance(user, cp, HW_FONT_BASE, (uint32_t)r);
            n++;
        }
        if (runs[r].ruby && n > first) {
            groups[g].first = first;
            groups[g].last = n - 1;
            groups[g].ruby = runs[r].ruby;
            groups[g].run = (uint32_t)r;
            g++;
        } else if (runs[r].ruby) {
            groups[g].first = groups[g].last = 0;
            groups[g].ruby = NULL; /* empty base: ignore the ruby */
            g++;
        }
        pos += len;
    }
    if (n == 0) { /* unreachable while total > 0, but keeps items[n - 1] provably in bounds */
        ok = true;
        goto done;
    }

    /* 2. UAX #14 break opportunities, one per code point. */
    size_t nb = set_linebreaks_utf8_per_code_point((const utf8_t *)text, total, params->lang, brks);
    for (size_t i = 0; i < n; i++) {
        items[i].brk = i < nb ? brks[i] : LINEBREAK_ALLOWBREAK;
    }
    items[n - 1].brk = LINEBREAK_MUSTBREAK;

    /* 3. Overrides: JLREQ kinsoku, inseparables, and unbreakable ruby groups. */
    for (size_t i = 0; i + 1 < n; i++) {
        if (items[i].brk != LINEBREAK_ALLOWBREAK) {
            continue;
        }
        uint32_t a = items[i].cp, b = items[i + 1].cp;
        if (params->strict_kinsoku && (hw_kinsoku_no_line_start(b) || hw_kinsoku_no_line_end(a))) {
            items[i].brk = LINEBREAK_NOBREAK;
        }
        if (is_inseparable(a) && a == b) {
            items[i].brk = LINEBREAK_NOBREAK;
        }
        if (items[i].group >= 0 && items[i].group == items[i + 1].group) {
            items[i].brk = LINEBREAK_NOBREAK;
        }
    }

    /* 4. Ruby group widths; spread base characters when the ruby is wider (1:2:1). */
    for (size_t k = 0; k < g; k++) {
        Group *gr = &groups[k];
        if (!gr->ruby) {
            continue;
        }
        for (size_t i = gr->first; i <= gr->last; i++) {
            gr->base_w += items[i].advance;
        }
        size_t rlen = strlen(gr->ruby);
        for (size_t i = 0; i < rlen;) {
            uint32_t cp;
            i += hw_utf8_decode((const uint8_t *)gr->ruby + i, rlen - i, &cp);
            gr->ruby_w += advance(user, cp, HW_FONT_RUBY, gr->run);
        }
        if (gr->ruby_w > gr->base_w) {
            float u = (gr->ruby_w - gr->base_w) / (2.0f * (float)(gr->last - gr->first + 1));
            for (size_t i = gr->first; i <= gr->last; i++) {
                items[i].lead = u;
            }
        }
    }

    /* 5. Greedy line filling over break opportunities. */
    uint32_t line = 0;
    float pen = 0.0f;
    size_t i = 0;
    while (i < n) {
        /* The segment runs to the next break opportunity. */
        size_t end = i;
        while (items[end].brk == LINEBREAK_NOBREAK || items[end].brk == LINEBREAK_INSIDEACHAR) {
            end++;
        }
        float seg_w = 0.0f;
        for (size_t k = i; k <= end; k++) {
            seg_w += item_width(&items[k]);
        }
        float fit_w = seg_w;
        for (size_t k = end; k > i && is_space(items[k].cp); k--) {
            fit_w -= item_width(&items[k]); /* trailing spaces may overflow */
        }
        float hang_w = params->hanging_punct && hw_kinsoku_hangable(items[end].cp) ? item_width(&items[end]) : 0.0f;

        if (pen > 0.0f && pen + fit_w > params->max_width && !(hang_w > 0.0f && pen + fit_w - hang_w <= params->max_width)) {
            line++;
            pen = 0.0f;
        }

        if (pen == 0.0f && fit_w - hang_w > params->max_width) {
            /* Emergency: the segment alone is too wide (e.g. a long Latin word). Split by units. */
            for (size_t k = i; k <= end;) {
                size_t ue = unit_end(items, groups, k);
                float uw = 0.0f;
                for (size_t q = k; q <= ue; q++) {
                    uw += item_width(&items[q]);
                }
                if (pen > 0.0f && pen + uw > params->max_width) {
                    line++;
                    pen = 0.0f;
                }
                for (size_t q = k; q <= ue; q++) {
                    items[q].line = line;
                    items[q].x = pen + items[q].lead;
                    pen += item_width(&items[q]);
                }
                k = ue + 1;
            }
        } else {
            for (size_t k = i; k <= end; k++) {
                items[k].line = line;
                items[k].x = pen + items[k].lead;
                pen += item_width(&items[k]);
            }
        }

        if (items[end].brk == LINEBREAK_MUSTBREAK && end + 1 < n) {
            line++;
            pen = 0.0f;
        }
        i = end + 1;
    }

    /* 6. Emit glyphs: base characters in order, each ruby group after its last base character. */
    uint32_t reveal = 0;
    for (size_t k = 0; k < n; k++) {
        const Item *it = &items[k];
        float line_top = (float)it->line * params->line_pitch;
        if (it->cp != 0x0A) {
            HwLayoutGlyph gl = { it->cp, HW_FONT_BASE, it->x, line_top + params->ruby_area + params->base_ascent,
                                 reveal, it->line, it->run };
            if (!push_glyph(out, gl)) {
                goto done;
            }
        }
        reveal++;

        if (it->group >= 0 && groups[it->group].ruby && groups[it->group].last == k) {
            const Group *gr = &groups[it->group];
            const Item *first = &items[gr->first];
            float group_x = first->x - first->lead;
            float group_w = gr->ruby_w > gr->base_w ? gr->ruby_w : gr->base_w;
            size_t rlen = strlen(gr->ruby);
            size_t rcount = hw_utf8_count((const uint8_t *)gr->ruby, rlen);
            float u = gr->ruby_w < group_w ? (group_w - gr->ruby_w) / (2.0f * (float)rcount) : 0.0f;
            float rx = group_x + u;
            uint32_t group_reveal = reveal - (uint32_t)(gr->last - gr->first + 1);
            for (size_t q = 0; q < rlen;) {
                uint32_t cp;
                q += hw_utf8_decode((const uint8_t *)gr->ruby + q, rlen - q, &cp);
                HwLayoutGlyph rg = { cp, HW_FONT_RUBY, rx, line_top + params->ruby_ascent, group_reveal, first->line, first->run };
                if (!push_glyph(out, rg)) {
                    goto done;
                }
                rx += advance(user, cp, HW_FONT_RUBY, gr->run) + 2.0f * u;
            }
        }
    }

    out->lines = line + 1;
    out->reveal_count = reveal;
    out->height = (float)out->lines * params->line_pitch;
    ok = true;

done:
    free(text);
    free(items);
    free(brks);
    free(groups);
    return ok;
}

void hw_layout_free(HwLayout *layout)
{
    free(layout->glyphs);
    memset(layout, 0, sizeof *layout);
}
