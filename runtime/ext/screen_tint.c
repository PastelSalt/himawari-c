/*
 * Sample extension statement (rfcs/0007): screen_tint(color, ms) tints the
 * whole picture: sepia for memories, night for evenings, none to clear it.
 * Declared in a game's extensions/screen_tint.schema.json:
 *   { "name": "screen_tint", "blocking": false,
 *     "params": [ { "name": "color", "type": "word", "enum": ["sepia", "night", "none"] },
 *                 { "name": "ms", "type": "int", "default": 500 } ] }
 * The player remembers the most recent call, so loads, rewinds, and warps show the tint again (restore).
 */
#include <string.h>

#include "hw_ext.h"

typedef struct tint {
    uint32_t from, to; /* 0 none, 1 sepia, 2 night */
    double start, ms;  /* the fade between them */
    double now;
} tint;

static tint T;

static const SDL_FColor COLORS[3] = { { 0, 0, 0, 0 }, { 0.44f, 0.30f, 0.12f, 0.32f }, { 0.05f, 0.08f, 0.25f, 0.42f } };

static uint32_t color_of(const hw_ext_call *call)
{
    const char *c = hw_ext_word(call, "color");
    return strcmp(c, "sepia") == 0 ? 1u : strcmp(c, "night") == 0 ? 2u : 0u;
}

static void begin(void *user, const hw_ext_call *call)
{
    tint *t = user;
    t->from = t->to;
    t->to = color_of(call);
    t->start = t->now;
    t->ms = hw_ext_int(call, "ms");
}

static void finish(void *user)
{
    tint *t = user;
    t->ms = 0;
}

static void restore(void *user, const hw_ext_call *last)
{
    tint *t = user;
    t->from = t->to = last ? color_of(last) : 0;
    t->ms = 0;
}

static void draw(void *user, SDL_Renderer *ren, float w, float h, double now)
{
    tint *t = user;
    t->now = now;
    float k = t->ms > 0 ? (float)((now - t->start) * 1000.0 / t->ms) : 1.0f;
    if (k > 1) k = 1;
    if (k < 0) k = 0;
    SDL_FColor a = COLORS[t->from], b = COLORS[t->to];
    /* Fade through the colors' own alpha, so tint to none fades out. */
    SDL_FColor c = { a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k, a.a + (b.a - a.a) * k };
    if (t->to == 0 && t->from != 0) c = (SDL_FColor){ a.r, a.g, a.b, a.a * (1 - k) };
    if (t->from == 0 && t->to != 0) c = (SDL_FColor){ b.r, b.g, b.b, b.a * k };
    if (c.a <= 0.001f) return;
    SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColorFloat(ren, c.r, c.g, c.b, c.a);
    SDL_FRect all = { 0, 0, w, h };
    SDL_RenderFillRect(ren, &all);
}

void hw_ext_register_screen_tint(void);
void hw_ext_register_screen_tint(void)
{
    hw_ext_statement s = { "screen_tint", &T, begin, NULL, NULL, finish, restore, draw };
    hw_register_statement(&s);
}
