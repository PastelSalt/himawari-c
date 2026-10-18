/*
 * Himawari-C: the windowed player (plan §8.4–§8.11).
 *
 * The VM runs until something blocks (a line, a menu, a wait, a transition);
 * every event updates what is shown. The scene (background, characters, CG)
 * is drawn into an offscreen texture each frame, so transitions blend the
 * previous scene with the new one and effects can shake the whole picture.
 * Missing art and sound become labeled placeholders and silence (P5).
 */
#include "hw_game.h"

#include <SDL3/SDL.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_assets.h"
#include "hw_audio.h"
#include "hw_headless.h"
#include "hw_hwb.h"
#include "hw_persist.h"
#include "hw_play.h"
#include "hw_rulewipe.h"
#include "hw_save.h"
#include "hw_text_draw.h"
#include "hw_ui_text.h"
#include "hw_vm.h"

/* ---- types ---- */

typedef enum screen { SCR_TITLE, SCR_PLAY, SCR_SYSMENU, SCR_SLOTS, SCR_HISTORY, SCR_CONFIRM_QUIT, SCR_END, SCR_ERROR } screen;
typedef enum block { B_NONE, B_SAY, B_MENU, B_WAIT, B_TRANS, B_DONE } block;
typedef enum trans_kind { T_FADE, T_DISSOLVE, T_SLIDE_LEFT, T_SLIDE_RIGHT, T_SLIDE_UP, T_SLIDE_DOWN, T_WIPE, T_RULE } trans_kind;

#define BACKLOG 100
#define MAX_HITS 64
#define HISTORY_DEPTH 256

typedef struct backlog_entry {
    char name[64];
    char text[400];
} backlog_entry;

typedef struct hit {
    SDL_FRect r;
    int id;
} hit;

/* Button ids. Menu options are 1000 + index; slots are 2000 + slot. */
enum {
    BTN_START = 1, BTN_LOAD, BTN_LANGUAGE, BTN_QUIT, BTN_RESUME, BTN_SAVE, BTN_HISTORY, BTN_TITLE, BTN_SPEED,
    BTN_BACK, BTN_AUTO, BTN_SKIP, BTN_MENU, BTN_ROLLBACK, BTN_YES, BTN_NO,
    BTN_OPTION = 1000, BTN_SLOT = 2000
};

typedef struct game {
    SDL_Window *win;
    SDL_Renderer *ren;
    SDL_GPUDevice *gpu;   /* set when the GPU renderer is in use */
    hw_rulewipe *wipe;    /* rule wipes, or NULL (they dissolve) */
    char trans_mask[128]; /* the rule's mask image */
    float W, H, S; /* canvas size and UI scale (H / 1080) */
    hw_fonts *fonts;
    hw_assets *assets;
    hw_audio *audio;
    hw_persist persist;
    hw_settings settings;
    bool dev;
    char game_path[1024];

    hw_module m;
    hw_vm vm;
    bool vm_ready;
    hw_history hist;
    uint8_t *read_lines; /* global: lines read in any playthrough */
    char lang[16];

    screen scr, back_to;
    block blk;
    bool running;
    double now, play_start;
    uint64_t playtime_ms;

    /* The scene as currently shown (follows the VM's display state event by event). */
    hw_display shown;
    SDL_Texture *scene_tex, *prev_tex;
    bool trans_active;
    trans_kind trans;
    double trans_t0, trans_dur;
    double shake_until, shake_dur, flash_until, flash_dur;
    double wait_until;

    /* The line being shown. */
    bool have_line;
    uint32_t line;
    char speaker[128];
    uint32_t speaker_color;
    hw_rich_text text;
    float reveal;
    uint32_t next_pause;
    double pause_until;
    bool line_was_read;
    double done_at;

    /* The menu being shown. */
    uint32_t option_count;
    uint32_t options[HW_VM_MAX_OPTIONS];
    hw_rich_text *option_text;

    bool auto_mode, skip_mode;
    int focus; /* keyboard focus among this frame's buttons, -1 = none */
    hit hits[MAX_HITS], last_hits[MAX_HITS];
    int hit_count, last_hit_count;
    float mx, my;
    bool slots_saving;
    int history_scroll;

    backlog_entry backlog[BACKLOG];
    int backlog_count, backlog_start;

    char notice[300];
    double notice_until;
    char error[300];
    bool overlay;
    const char *shot; /* save the next frame as PNG */
    float cps_override; /* --text-speed: this run only, never saved */

    /* Auto-blink per stage slot (plan §6.1): when the next blink starts. */
    double blink_at[HW_VM_MAX_STAGE];
} game;

static const SDL_Color WHITE = { 255, 255, 255, 255 };
static const SDL_Color INK = { 18, 18, 28, 255 };
static const SDL_Color DIM = { 190, 196, 214, 255 };
static const SDL_Color ACCENT = { 255, 196, 64, 255 };

/* An unattended run (--frames: smoke tests, render_line) never writes the player's data. */
static bool unattended = false;

/* ---- small helpers ---- */

static float sc(const game *g, float v) { return v * g->S; }

static uint32_t hash_str(const char *s)
{
    uint32_t h = 2166136261u;
    for (; *s; s++) h = (h ^ (uint8_t)*s) * 16777619u;
    return h;
}

static SDL_FColor fcol(uint32_t rgb, float a)
{
    return (SDL_FColor){ (float)((rgb >> 16) & 255) / 255.0f, (float)((rgb >> 8) & 255) / 255.0f, (float)(rgb & 255) / 255.0f, a };
}

static void fill(game *g, SDL_FRect r, uint32_t rgb, float a)
{
    SDL_FColor c = fcol(rgb, a);
    SDL_SetRenderDrawBlendMode(g->ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColorFloat(g->ren, c.r, c.g, c.b, c.a);
    SDL_RenderFillRect(g->ren, &r);
}

static void gradient(game *g, SDL_FRect r, uint32_t top, uint32_t bottom, float a)
{
    SDL_Vertex v[4] = {
        { { r.x, r.y }, fcol(top, a), { 0, 0 } },
        { { r.x + r.w, r.y }, fcol(top, a), { 0, 0 } },
        { { r.x + r.w, r.y + r.h }, fcol(bottom, a), { 0, 0 } },
        { { r.x, r.y + r.h }, fcol(bottom, a), { 0, 0 } },
    };
    static const int idx[6] = { 0, 1, 2, 0, 2, 3 };
    SDL_RenderGeometry(g->ren, NULL, v, 4, idx, 6);
}

/* A soft color from a name, for placeholders. */
static uint32_t name_color(const char *name, float light)
{
    uint32_t h = hash_str(name);
    float hue = (float)(h % 360u) / 60.0f;
    float x = 1.0f - fabsf(fmodf(hue, 2.0f) - 1.0f);
    float r = 0, gg = 0, b = 0;
    if (hue < 1) { r = 1; gg = x; } else if (hue < 2) { r = x; gg = 1; } else if (hue < 3) { gg = 1; b = x; }
    else if (hue < 4) { gg = x; b = 1; } else if (hue < 5) { r = x; b = 1; } else { r = 1; b = x; }
    float mix = 0.45f;
    r = (r * mix + (1 - mix) * 0.5f) * light;
    gg = (gg * mix + (1 - mix) * 0.5f) * light;
    b = (b * mix + (1 - mix) * 0.5f) * light;
    return (uint32_t)(r * 255) << 16 | (uint32_t)(gg * 255) << 8 | (uint32_t)(b * 255);
}

static void label(game *g, const char *s, float px, float x, float y, int align, SDL_Color c)
{
    hw_text_draw(g->fonts, s, sc(g, px), 0, x, y, align, c, INK, sc(g, px) > 20 ? 2.0f : 0.0f);
}

static void notify(game *g, const char *msg)
{
    snprintf(g->notice, sizeof g->notice, "%s", msg);
    g->notice_until = g->now + 4.0;
}

static const char *ui(const game *g, hw_ui_string id) { return hw_ui(g->lang, id); }

/* Global data: settings, read lines, global variables. */
static void save_global(game *g)
{
    if (!unattended) hw_global_save(&g->persist, &g->m, &g->vm, g->read_lines, &g->settings);
}

static bool point_in(float x, float y, SDL_FRect r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }

/* Draws a button and registers it for clicks this frame. */
static void button(game *g, SDL_FRect r, const char *text, int id, float px, bool active)
{
    int index = g->hit_count;
    if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, id };
    bool hover = point_in(g->mx, g->my, r) || g->focus == index;
    fill(g, r, hover ? 0x3a4466 : 0x1c2033, hover ? 0.95f : 0.85f);
    if (active) fill(g, (SDL_FRect){ r.x, r.y, sc(g, 6), r.h }, 0xffc440, 1.0f);
    label(g, text, px, r.x + r.w / 2, r.y + r.h / 2 + sc(g, px) * 0.36f, 1, hover ? ACCENT : WHITE);
}

/* ---- the scene ---- */

static void position_of(const game *g, uint32_t at, float *x, float *y)
{
    *x = 0.5f;
    *y = 1.0f;
    if (at == 0) return;
    const char *name = hw_str(&g->m, at);
    for (uint32_t i = 0; i < g->m.position_count; i++) {
        if (strcmp(hw_str(&g->m, g->m.positions[i].name), name) == 0) {
            *x = (float)g->m.positions[i].x / HW_POSITION_SCALE;
            *y = (float)g->m.positions[i].y / HW_POSITION_SCALE;
            return;
        }
    }
}

static const hw_char_info *char_info(const game *g, uint32_t id)
{
    for (uint32_t i = 0; i < g->m.char_count; i++) {
        if (g->m.chars[i].id == id) return &g->m.chars[i];
    }
    return NULL;
}

/* Draws an image filling the canvas (cover), or a labeled placeholder. */
static void draw_backdrop(game *g, const char *folder, const char *name, const char *tag)
{
    const char *why = NULL;
    SDL_Texture *t = hw_assets_image(g->assets, folder, name, &why);
    SDL_FRect all = { 0, 0, g->W, g->H };
    if (t) {
        float tw, th;
        SDL_GetTextureSize(t, &tw, &th);
        float s = fmaxf(g->W / tw, g->H / th);
        SDL_FRect dst = { (g->W - tw * s) / 2, (g->H - th * s) / 2, tw * s, th * s };
        SDL_RenderTexture(g->ren, t, NULL, &dst);
        return;
    }
    gradient(g, all, name_color(name, 0.75f), name_color(name, 0.35f), 1.0f);
    char text[256];
    snprintf(text, sizeof text, "%s: %s", tag, name);
    label(g, text, 44, g->W / 2, g->H * 0.42f, 1, WHITE);
    if (g->dev && why) {
        snprintf(text, sizeof text, "assets/%s/%s.png %s", folder, name, why);
        label(g, text, 24, g->W / 2, g->H * 0.42f + sc(g, 44), 1, DIM);
    }
}

/* The frame of a layer: blink (_half, _closed) and lip-flap (_open) when those files exist. */
static SDL_Texture *layer_image(game *g, const char *folder, const char *attr, const char *frame)
{
    if (frame) {
        char name[160];
        snprintf(name, sizeof name, "%s_%s", attr, frame);
        SDL_Texture *t = hw_assets_image(g->assets, folder, name, NULL);
        if (t) return t;
    }
    return hw_assets_image(g->assets, folder, attr, NULL);
}

/* Draws a layered sprite; returns false when none of its layers has art yet. */
static bool draw_layers(game *g, const hw_sprite *sp, const hw_stage_char *c, int slot, float cx, float base)
{
    const hw_module *m = &g->m;
    hw_layer layers[32];
    uint32_t n = hw_sprite_layers(m, sp, c, layers, 32);
    /* Blink: a 150 ms half/closed/half cycle every 2-6 s. */
    const char *blink = NULL;
    if (slot >= 0 && slot < HW_VM_MAX_STAGE) {
        if (g->blink_at[slot] == 0 || g->blink_at[slot] > g->now + 10) g->blink_at[slot] = g->now + 2.0 + SDL_randf() * 4.0;
        double t = g->now - g->blink_at[slot];
        if (t >= 0.15) g->blink_at[slot] = g->now + 2.0 + SDL_randf() * 4.0;
        else if (t >= 0) blink = t < 0.05 || t >= 0.10 ? "half" : "closed";
    }
    /* Lip-flap while this character's line appears or their voice plays. */
    bool speaking = g->have_line && g->blk == B_SAY && g->line < m->line_count && m->lines[g->line].speaker == c->id &&
                    (g->reveal < (float)g->text.chars || hw_audio_voice_playing(g->audio));
    const char *mouth = speaking && fmod(g->now, 0.24) < 0.12 ? "open" : NULL;

    SDL_Texture *tex[32];
    float w = 0, h = 0;
    uint32_t found = 0;
    for (uint32_t i = 0; i < n; i++) {
        const hw_sprite_group *gr = &m->sprite_groups[layers[i].group];
        char folder[300];
        snprintf(folder, sizeof folder, "%s/%s", hw_str(m, sp->root), hw_str(m, gr->name));
        const char *frame = (gr->flags & HW_SPRITE_BLINK) ? blink : (gr->flags & HW_SPRITE_LIPFLAP) ? mouth : NULL;
        tex[i] = layer_image(g, folder, hw_str(m, layers[i].attr), frame);
        if (tex[i] && found++ == 0) SDL_GetTextureSize(tex[i], &w, &h); /* all layers share one canvas (plan §6.2) */
    }
    if (found == 0) return false;
    float s = g->S * (float)sp->scale / HW_POSITION_SCALE;
    float ax = (float)sp->anchor_x / HW_POSITION_SCALE, ay = (float)sp->anchor_y / HW_POSITION_SCALE;
    SDL_FRect dst = { cx - w * s * ax, base - h * s * ay, w * s, h * s };
    for (uint32_t i = 0; i < n; i++) {
        if (tex[i]) SDL_RenderTexture(g->ren, tex[i], NULL, &dst);
    }
    return true;
}

static void draw_character(game *g, const hw_stage_char *c, int slot)
{
    const char *id = hw_str(&g->m, c->id);
    float px, py;
    position_of(g, c->at, &px, &py);
    float cx = px * g->W, base = py * g->H;
    const hw_sprite *sp = hw_module_sprite_of(&g->m, c->id);
    if (sp && draw_layers(g, sp, c, slot, cx, base)) return;
    SDL_Texture *t = sp ? NULL : hw_assets_image(g->assets, "sprites", id, NULL);
    if (t) {
        float tw, th;
        SDL_GetTextureSize(t, &tw, &th);
        float s = g->S; /* sprites are drawn at their size for a 1080-pixel-tall canvas */
        SDL_FRect dst = { cx - tw * s / 2, base - th * s, tw * s, th * s };
        SDL_RenderTexture(g->ren, t, NULL, &dst);
        return;
    }
    /* Placeholder: a silhouette in the character's color, with name and attributes. */
    const hw_char_info *ci = char_info(g, c->id);
    uint32_t color = ci && ci->color != HW_NONE ? ci->color : name_color(id, 0.9f);
    float w = g->H * 0.20f, h = g->H * 0.66f;
    fill(g, (SDL_FRect){ cx - w / 2, base - h, w, h }, color, 0.80f);
    float hw = g->H * 0.12f;
    fill(g, (SDL_FRect){ cx - hw / 2, base - h - hw * 1.05f, hw, hw }, color, 0.80f);
    label(g, ci ? hw_str(&g->m, ci->name) : id, 34, cx, base - h * 0.55f, 1, WHITE);
    char attrs[256] = "";
    size_t n = 0;
    if (sp) {
        /* What the sprite would show: the layers in effect. */
        hw_layer layers[32];
        uint32_t count = hw_sprite_layers(&g->m, sp, c, layers, 32);
        for (uint32_t k = 0; k < count && n + 1 < sizeof attrs; k++) {
            n += (size_t)snprintf(attrs + n, sizeof attrs - n, "%s%s", k ? " " : "", hw_str(&g->m, layers[k].attr));
        }
    } else {
        for (uint32_t k = 0; k < c->attr_count && n + 1 < sizeof attrs; k++) {
            if (c->attrs[k] & HW_ATTR_REMOVED) continue;
            n += (size_t)snprintf(attrs + n, sizeof attrs - n, "%s%s", n ? " " : "", hw_str(&g->m, c->attrs[k]));
        }
    }
    if (attrs[0]) label(g, attrs, 24, cx, base - h * 0.55f + sc(g, 40), 1, DIM);
}

static void render_scene(game *g, const hw_display *d, SDL_Texture *target)
{
    SDL_SetRenderTarget(g->ren, target);
    SDL_SetRenderDrawColor(g->ren, 0, 0, 0, 255);
    SDL_RenderClear(g->ren);
    if (d->bg) draw_backdrop(g, "bg", hw_str(&g->m, d->bg), "bg");
    for (uint32_t i = 0; i < d->stage_count; i++) draw_character(g, &d->stage[i], d == &g->shown ? (int)i : -1);
    if (d->cg) draw_backdrop(g, "cg", hw_str(&g->m, d->cg), "CG");
    SDL_SetRenderTarget(g->ren, NULL);
}

static void compose_scene(game *g)
{
    float ox = 0, oy = 0;
    if (g->now < g->shake_until) {
        float k = (float)((g->shake_until - g->now) / g->shake_dur);
        ox = sinf((float)g->now * 73.0f) * sc(g, 14) * k;
        oy = cosf((float)g->now * 91.0f) * sc(g, 10) * k;
    }
    SDL_FRect full = { ox, oy, g->W, g->H };
    if (!g->trans_active) {
        SDL_RenderTexture(g->ren, g->scene_tex, NULL, &full);
        return;
    }
    float t = (float)((g->now - g->trans_t0) / g->trans_dur);
    if (t > 1) t = 1;
    switch (g->trans) {
    case T_FADE: /* through black */
        if (t < 0.5f) {
            SDL_SetTextureAlphaModFloat(g->prev_tex, 1.0f - t * 2);
            SDL_RenderTexture(g->ren, g->prev_tex, NULL, &full);
            SDL_SetTextureAlphaModFloat(g->prev_tex, 1.0f);
        } else {
            SDL_SetTextureAlphaModFloat(g->scene_tex, (t - 0.5f) * 2);
            SDL_RenderTexture(g->ren, g->scene_tex, NULL, &full);
            SDL_SetTextureAlphaModFloat(g->scene_tex, 1.0f);
        }
        break;
    case T_DISSOLVE:
        SDL_RenderTexture(g->ren, g->scene_tex, NULL, &full);
        SDL_SetTextureAlphaModFloat(g->prev_tex, 1.0f - t);
        SDL_RenderTexture(g->ren, g->prev_tex, NULL, &full);
        SDL_SetTextureAlphaModFloat(g->prev_tex, 1.0f);
        break;
    case T_RULE: {
        SDL_RenderTexture(g->ren, g->prev_tex, NULL, &full);
        SDL_Texture *mask = hw_assets_image(g->assets, "rules", g->trans_mask, NULL);
        if (!mask) mask = hw_rulewipe_default_mask(g->wipe);
        if (!hw_rulewipe_draw(g->wipe, mask, g->scene_tex, &full, t)) {
            SDL_SetTextureAlphaModFloat(g->scene_tex, t); /* no shader path: dissolve */
            SDL_RenderTexture(g->ren, g->scene_tex, NULL, &full);
            SDL_SetTextureAlphaModFloat(g->scene_tex, 1.0f);
        }
        break;
    }
    case T_WIPE: {
        SDL_RenderTexture(g->ren, g->prev_tex, NULL, &full);
        SDL_FRect src = { 0, 0, g->W * t, g->H };
        SDL_FRect dst = { ox, oy, g->W * t, g->H };
        SDL_RenderTexture(g->ren, g->scene_tex, &src, &dst);
        break;
    }
    default: { /* slides: the new scene slides in over the old one */
        float e = 1.0f - (1.0f - t) * (1.0f - t);
        float dx = 0, dy = 0;
        if (g->trans == T_SLIDE_LEFT) dx = g->W * (1 - e);
        if (g->trans == T_SLIDE_RIGHT) dx = -g->W * (1 - e);
        if (g->trans == T_SLIDE_UP) dy = g->H * (1 - e);
        if (g->trans == T_SLIDE_DOWN) dy = -g->H * (1 - e);
        SDL_RenderTexture(g->ren, g->prev_tex, NULL, &full);
        SDL_FRect moved = { ox + dx, oy + dy, g->W, g->H };
        SDL_RenderTexture(g->ren, g->scene_tex, NULL, &moved);
        break;
    }
    }
}

/* ---- audio state follows the display state (after loads, rewinds, reloads) ---- */

static void sync_audio(game *g)
{
    const hw_display *d = &g->vm.s.display;
    if (d->music) hw_audio_play(g->audio, HW_CHANNEL_MUSIC, hw_str(&g->m, d->music), 500);
    else hw_audio_stop(g->audio, HW_CHANNEL_MUSIC, 500);
    if (d->ambient) hw_audio_play(g->audio, HW_CHANNEL_AMBIENT, hw_str(&g->m, d->ambient), 500);
    else hw_audio_stop(g->audio, HW_CHANNEL_AMBIENT, 500);
}

/* ---- the VM side ---- */

static void on_checkpoint(void *user, const hw_vm *vm)
{
    game *g = user;
    static uint8_t snap_small[16384];
    size_t n = hw_vm_snapshot_size(vm);
    if (n <= sizeof snap_small) {
        hw_vm_snapshot(vm, snap_small);
        hw_history_push(&g->hist, snap_small);
    } else {
        uint8_t *p = SDL_malloc(n);
        if (!p) return;
        hw_vm_snapshot(vm, p);
        hw_history_push(&g->hist, p);
        SDL_free(p);
    }
}

static void plain_text(const hw_rich_text *rt, char *out, size_t cap)
{
    size_t n = 0;
    out[0] = 0;
    for (uint32_t i = 0; i < rt->run_count && n + 1 < cap; i++) n += (size_t)snprintf(out + n, cap - n, "%s", rt->runs[i].text);
}

static float text_width(const game *g) { return g->W * 0.84f - sc(g, 2 * 44); }

static void layout_line(game *g)
{
    hw_rich_build(&g->text, &g->vm, hw_vm_line_text(&g->vm, g->line));
    hw_rich_layout(&g->text, g->fonts, text_width(g), sc(g, 40), g->lang);
}

static void layout_menu(game *g)
{
    for (uint32_t i = 0; i < g->option_count; i++) {
        hw_rich_build(&g->option_text[i], &g->vm, hw_vm_line_text(&g->vm, g->options[i]));
        hw_rich_layout(&g->option_text[i], g->fonts, g->W * 0.55f - sc(g, 60), sc(g, 36), g->lang);
    }
}

static bool skipping(const game *g)
{
    if (g->scr != SCR_PLAY) return false;
    bool held = (SDL_GetModState() & SDL_KMOD_CTRL) != 0;
    return held || g->skip_mode;
}

/* Skipping passes read lines (any line in dev mode). */
static bool may_skip_line(const game *g) { return skipping(g) && (g->line_was_read || g->dev); }

static void show_line(game *g, uint32_t line, bool is_prompt)
{
    g->have_line = true;
    g->line = line;
    const char *name = is_prompt ? "" : hw_vm_speaker_name(&g->vm, line);
    snprintf(g->speaker, sizeof g->speaker, "%s", name);
    const hw_char_info *ci = char_info(g, g->m.lines[line].speaker);
    g->speaker_color = ci && ci->color != HW_NONE ? ci->color : 0xffc440;
    layout_line(g);
    g->line_was_read = g->read_lines[line] != 0;
    g->read_lines[line] = 1;
    g->reveal = is_prompt ? (float)g->text.chars + 1 : 0.0f;
    g->next_pause = 0;
    g->pause_until = 0;
    g->done_at = -1;
    if (may_skip_line(g)) g->reveal = (float)g->text.chars + 1;
}

static void add_backlog(game *g)
{
    int slot = (g->backlog_start + g->backlog_count) % BACKLOG;
    if (g->backlog_count == BACKLOG) g->backlog_start = (g->backlog_start + 1) % BACKLOG;
    else g->backlog_count++;
    snprintf(g->backlog[slot].name, sizeof g->backlog[slot].name, "%.63s", g->speaker);
    plain_text(&g->text, g->backlog[slot].text, sizeof g->backlog[slot].text);
}

static trans_kind trans_from(const char *name)
{
    if (strcmp(name, "fade") == 0) return T_FADE;
    if (strcmp(name, "slide_left") == 0) return T_SLIDE_LEFT;
    if (strcmp(name, "slide_right") == 0) return T_SLIDE_RIGHT;
    if (strcmp(name, "slide_up") == 0) return T_SLIDE_UP;
    if (strcmp(name, "slide_down") == 0) return T_SLIDE_DOWN;
    if (strcmp(name, "wipe") == 0) return T_WIPE;
    if (strcmp(name, "rule") == 0) return T_RULE;
    return T_DISSOLVE;
}

static void stage_change(game *g, const hw_event *ev)
{
    if (ev->trans.type != 0 && !skipping(g)) {
        render_scene(g, &g->shown, g->prev_tex); /* the scene before this change */
        g->trans = trans_from(hw_str(&g->m, ev->trans.type));
        snprintf(g->trans_mask, sizeof g->trans_mask, "%s", hw_str(&g->m, ev->trans.mask));
        g->trans_dur = (ev->trans.ms >= 0 ? ev->trans.ms : 500) / 1000.0;
        if (g->trans_dur < 0.01) g->trans_dur = 0.01;
        g->trans_t0 = g->now;
        g->trans_active = true;
        g->blk = B_TRANS;
    }
    g->shown = g->vm.s.display;
}

static void end_story(game *g)
{
    hw_audio_stop_all(g->audio);
    save_global(g);
}

static void handle(game *g, const hw_event *ev)
{
    const hw_module *m = &g->m;
    switch (ev->kind) {
    case HW_EV_SAY: {
        hw_audio_stop(g->audio, HW_CHANNEL_VOICE, 0);
        show_line(g, ev->line, false);
        add_backlog(g);
        if (m->lines[ev->line].line_id != HW_NONE && !may_skip_line(g)) {
            char id[7];
            hw_line_id_format(m->lines[ev->line].line_id, id);
            hw_audio_line_voice(g->audio, g->lang, id);
        }
        g->blk = B_SAY;
        break;
    }
    case HW_EV_MENU:
        g->option_count = ev->option_count;
        memcpy(g->options, ev->options, ev->option_count * sizeof ev->options[0]);
        layout_menu(g);
        if (ev->line != HW_NONE) show_line(g, ev->line, true);
        else g->have_line = false;
        g->focus = -1;
        g->skip_mode = false;
        g->blk = B_MENU;
        break;
    case HW_EV_SHOW: case HW_EV_HIDE: case HW_EV_MOVE: case HW_EV_BG: case HW_EV_CG:
        if (ev->kind == HW_EV_BG) g->have_line = false; /* a new scene starts with an empty textbox */
        stage_change(g, ev);
        break;
    case HW_EV_AUDIO:
        hw_audio_play(g->audio, (int)ev->channel, hw_str(m, ev->subject), ev->ms);
        break;
    case HW_EV_STOP:
        hw_audio_stop(g->audio, (int)ev->channel, ev->ms);
        break;
    case HW_EV_WAIT:
        if (!skipping(g)) {
            g->wait_until = g->now + ev->ms / 1000.0;
            g->blk = B_WAIT;
        }
        break;
    case HW_EV_EFFECT:
        if (ev->effect == 0) {
            g->shake_dur = (ev->ms >= 0 ? ev->ms : 500) / 1000.0;
            g->shake_until = g->now + g->shake_dur;
        } else {
            g->flash_dur = (ev->ms >= 0 ? ev->ms : 300) / 1000.0;
            g->flash_until = g->now + g->flash_dur;
        }
        break;
    case HW_EV_END:
        end_story(g);
        g->blk = B_DONE;
        g->scr = SCR_END;
        break;
    case HW_EV_ERROR:
        snprintf(g->error, sizeof g->error, "%s", g->vm.error);
        SDL_Log("story error: %s", g->vm.error);
        end_story(g);
        g->blk = B_DONE;
        g->scr = SCR_ERROR;
        break;
    case HW_EV_NONE:
        break;
    }
}

/* Runs the VM until something blocks. */
static void pump(game *g)
{
    hw_event ev;
    for (int i = 0; i < 10000 && g->blk == B_NONE; i++) {
        if (!hw_vm_next(&g->vm, &ev)) {
            if (g->vm.s.status != HW_VM_RUNNING && g->vm.s.status != HW_VM_WAIT_CHOICE) g->blk = B_DONE;
            break;
        }
        handle(g, &ev);
    }
}

static void advance(game *g)
{
    if (g->blk != B_SAY) return;
    hw_audio_stop(g->audio, HW_CHANNEL_VOICE, 0);
    g->blk = B_NONE;
    pump(g);
}

/* Shows everything at once (a click while the text is still appearing). */
static bool finish_reveal(game *g)
{
    if (g->reveal >= (float)g->text.chars) return false;
    g->reveal = (float)g->text.chars + 1;
    g->next_pause = g->text.pause_count;
    g->pause_until = 0;
    return true;
}

static void choose(game *g, uint32_t k)
{
    if (g->blk != B_MENU || k >= g->option_count) return;
    if (!hw_vm_choose(&g->vm, k)) return;
    g->blk = B_NONE;
    g->have_line = false;
    pump(g);
}

static void reset_presentation(game *g)
{
    g->blk = B_NONE;
    g->trans_active = false;
    g->shake_until = g->flash_until = 0;
    g->have_line = false;
    g->option_count = 0;
    g->shown = g->vm.s.display;
}

static void start_story(game *g)
{
    hw_history_clear(&g->hist);
    hw_audio_stop_all(g->audio);
    if (!hw_vm_start(&g->vm, HW_NONE)) {
        snprintf(g->error, sizeof g->error, "%s", g->vm.error);
        g->scr = SCR_ERROR;
        return;
    }
    reset_presentation(g);
    g->backlog_count = g->backlog_start = 0;
    g->auto_mode = g->skip_mode = false;
    g->playtime_ms = 0;
    g->play_start = g->now;
    g->scr = SCR_PLAY;
    pump(g);
}

static void rollback(game *g)
{
    if (g->scr != SCR_PLAY || !hw_rollback(&g->vm, &g->hist)) return;
    reset_presentation(g);
    if (g->backlog_count > 0) g->backlog_count--;
    sync_audio(g);
    pump(g);
}

/* ---- saves ---- */

static void save_slot(game *g, int slot)
{
    const void *snap = hw_history_peek(&g->hist, 0);
    if (!snap || !g->persist.dir[0]) return;
    uint32_t pcs[HW_SAVE_HISTORY];
    uint32_t n = 0;
    for (uint32_t i = 1; i < g->hist.count && n < HW_SAVE_HISTORY; i++) pcs[n++] = hw_snapshot_pc(hw_history_peek(&g->hist, i));
    hw_save_info info;
    memset(&info, 0, sizeof info);
    SDL_Time t = 0;
    SDL_GetCurrentTime(&t);
    info.time = (int64_t)(t / SDL_NS_PER_SECOND);
    info.playtime_s = (uint32_t)((g->playtime_ms + (uint64_t)((g->now - g->play_start) * 1000)) / 1000);
    uint32_t scene = hw_module_scene_at(&g->m, hw_snapshot_pc(snap));
    snprintf(info.scene, sizeof info.scene, "%s", scene == HW_NONE ? "" : hw_str(&g->m, g->m.scenes[scene].name));
    if (g->have_line) {
        char text[400];
        plain_text(&g->text, text, sizeof text);
        if (g->speaker[0]) snprintf(info.preview, sizeof info.preview, "%.40s: %.110s", g->speaker, text);
        else snprintf(info.preview, sizeof info.preview, "%.150s", text);
    }
    snprintf(info.language, sizeof info.language, "%s", g->lang);
    hw_buf out = { 0 };
    char path[1100];
    hw_persist_slot_path(&g->persist, slot, path, sizeof path);
    bool ok = hw_save_write(&g->vm, snap, pcs, n, &info, &out) && hw_persist_write(path, out.data, out.len);
    hw_buf_free(&out);
    save_global(g);
    notify(g, ok ? ui(g, UI_SAVED) : SDL_GetError());
}

static bool load_slot(game *g, int slot)
{
    char path[1100];
    hw_persist_slot_path(&g->persist, slot, path, sizeof path);
    size_t size = 0;
    uint8_t *data = SDL_LoadFile(path, &size);
    if (!data) {
        notify(g, ui(g, UI_NO_QUICK_SAVE));
        return false;
    }
    char err[200], msg[300];
    hw_save_info info;
    hw_save_result r = hw_save_load(&g->vm, data, size, &info, err, sizeof err);
    SDL_free(data);
    if (r == HW_SAVE_BAD) {
        snprintf(msg, sizeof msg, ui(g, UI_LOAD_FAILED), err);
        notify(g, msg);
        return false;
    }
    hw_vm_set_language(&g->vm, g->lang); /* the player's language, not the save's */
    hw_history_clear(&g->hist);
    reset_presentation(g);
    g->backlog_count = g->backlog_start = 0;
    g->auto_mode = g->skip_mode = false;
    g->playtime_ms = (uint64_t)info.playtime_s * 1000;
    g->play_start = g->now;
    g->scr = SCR_PLAY;
    sync_audio(g);
    notify(g, r == HW_SAVE_EXACT ? ui(g, UI_LOADED) : r == HW_SAVE_REMAPPED ? ui(g, UI_LOAD_REMAPPED) : ui(g, UI_LOAD_FALLBACK));
    pump(g);
    return true;
}

/* ---- language ---- */

static void set_language(game *g, const char *lang)
{
    snprintf(g->lang, sizeof g->lang, "%s", lang);
    snprintf(g->settings.language, sizeof g->settings.language, "%s", lang);
    hw_vm_set_language(&g->vm, lang);
    if (g->have_line) {
        float reveal = g->reveal;
        bool prompt = g->blk == B_MENU;
        show_line(g, g->line, prompt);
        g->reveal = reveal;
    }
    if (g->blk == B_MENU) layout_menu(g);
}

static void next_language(game *g)
{
    const hw_module *m = &g->m;
    uint32_t cur = 0;
    for (uint32_t i = 0; i < m->language_count; i++) {
        if (strcmp(hw_str(m, m->languages[i]), g->lang) == 0) cur = i;
    }
    set_language(g, hw_str(m, m->languages[(cur + 1) % m->language_count]));
    save_global(g);
}

/* The settings' language, else the OS language if the game has it, else the source language. */
static void pick_language(game *g)
{
    const hw_module *m = &g->m;
    const char *want = g->settings.language;
    if (!want[0]) {
        int count = 0;
        SDL_Locale **locales = SDL_GetPreferredLocales(&count);
        for (int i = 0; locales && i < count && !want[0]; i++) {
            for (uint32_t k = 0; k < m->language_count; k++) {
                if (strcmp(hw_str(m, m->languages[k]), locales[i]->language) == 0) want = hw_str(m, m->languages[k]);
            }
        }
        SDL_free(locales);
    }
    for (uint32_t k = 0; k < m->language_count; k++) {
        if (strcmp(hw_str(m, m->languages[k]), want) == 0) {
            set_language(g, want);
            return;
        }
    }
    set_language(g, hw_str(m, m->source_language));
}

/* ---- dev: reload in place (F5) ---- */

static bool load_module(game *g, hw_module *out, char *err, size_t cap)
{
    size_t size = 0;
    uint8_t *bytes = hw_read_file(g->game_path, &size);
    if (!bytes) {
        snprintf(err, cap, "can't read %s: %s", g->game_path, SDL_GetError());
        return false;
    }
    bool ok = hw_module_load(out, bytes, size, err, cap);
    SDL_free(bytes);
    return ok;
}

static void reload(game *g)
{
    char err[200], msg[300];
    hw_module fresh;
    if (!load_module(g, &fresh, err, sizeof err)) {
        snprintf(msg, sizeof msg, ui(g, UI_RELOAD_FAILED), err);
        notify(g, msg);
        return;
    }
    /* Carry the position over through a save, which remaps by line ID. */
    hw_buf save = { 0 };
    const void *snap = hw_history_peek(&g->hist, 0);
    bool in_story = g->scr == SCR_PLAY && snap;
    if (in_story) {
        uint32_t pcs[HW_SAVE_HISTORY];
        uint32_t n = 0;
        for (uint32_t i = 1; i < g->hist.count && n < HW_SAVE_HISTORY; i++) pcs[n++] = hw_snapshot_pc(hw_history_peek(&g->hist, i));
        hw_save_info info;
        memset(&info, 0, sizeof info);
        hw_save_write(&g->vm, snap, pcs, n, &info, &save);
    }
    uint8_t *read = SDL_calloc(fresh.line_count > 0 ? fresh.line_count : 1, 1);
    hw_vm vm;
    if (!read || !hw_vm_init(&vm, &fresh, (uint64_t)SDL_GetTicksNS())) {
        SDL_free(read);
        hw_buf_free(&save);
        hw_module_free(&fresh);
        return;
    }
    /* Read lines and globals survive by line ID and name. */
    for (uint32_t l = 0; l < g->m.line_count; l++) {
        if (!g->read_lines[l] || g->m.lines[l].line_id == HW_NONE) continue;
        for (uint32_t k = 0; k < fresh.line_count; k++) {
            if (fresh.lines[k].line_id == g->m.lines[l].line_id) read[k] = 1;
        }
    }
    hw_vm_free(&g->vm);
    hw_module_free(&g->m);
    SDL_free(g->read_lines);
    hw_history_free(&g->hist);
    g->m = fresh;
    g->vm = vm;
    g->vm.m = &g->m; /* the module moved into the game struct */
    g->vm.checkpoint = on_checkpoint;
    g->vm.checkpoint_user = g;
    g->read_lines = read;
    hw_history_init(&g->hist, hw_vm_snapshot_size(&g->vm), HISTORY_DEPTH);
    hw_assets_flush(g->assets);
    SDL_free(g->option_text);
    g->option_text = SDL_calloc(HW_VM_MAX_OPTIONS, sizeof *g->option_text);
    hw_vm_set_language(&g->vm, g->lang);

    hw_save_result r = HW_SAVE_EXACT;
    if (in_story) {
        r = hw_save_load(&g->vm, (const uint8_t *)save.data, save.len, NULL, err, sizeof err);
        if (r == HW_SAVE_BAD) {
            g->scr = SCR_TITLE;
        } else {
            reset_presentation(g);
            sync_audio(g);
            pump(g);
        }
    } else if (g->scr == SCR_ERROR || g->scr == SCR_END) {
        g->scr = SCR_TITLE;
    }
    hw_buf_free(&save);
    snprintf(msg, sizeof msg, "%s%s", ui(g, UI_RELOADED),
             r == HW_SAVE_FALLBACK ? " (the current line changed; resumed a little earlier)" : "");
    notify(g, msg);
}

/* ---- drawing the screens ---- */

static void draw_textbox(game *g)
{
    SDL_FRect box = { g->W * 0.08f, g->H * 0.705f, g->W * 0.84f, g->H * 0.265f };
    fill(g, box, 0x101320, 0.82f);
    fill(g, (SDL_FRect){ box.x, box.y, box.w, sc(g, 3) }, 0xffc440, 0.7f);
    if (g->have_line) {
        if (g->speaker[0]) {
            float w = hw_text_width(g->fonts, g->speaker, sc(g, 34), HW_TS_BOLD) + sc(g, 48);
            SDL_FRect plate = { box.x + sc(g, 24), box.y - sc(g, 58), w, sc(g, 58) };
            fill(g, plate, 0x101320, 0.92f);
            fill(g, (SDL_FRect){ plate.x, plate.y + plate.h - sc(g, 4), plate.w, sc(g, 4) }, g->speaker_color, 1.0f);
            hw_text_draw(g->fonts, g->speaker, sc(g, 34), HW_TS_BOLD, plate.x + sc(g, 24), plate.y + sc(g, 42), 0,
                         WHITE, INK, 2.0f);
        }
        hw_rich_draw(g->fonts, &g->text, box.x + sc(g, 44), box.y + sc(g, 18), g->reveal, (float)g->now, 1.0f, WHITE, INK, 2.0f);
        if (g->blk == B_SAY && g->reveal >= (float)g->text.chars) {
            float a = 0.5f + 0.5f * sinf((float)g->now * 5.0f);
            fill(g, (SDL_FRect){ box.x + box.w - sc(g, 54), box.y + box.h - sc(g, 76), sc(g, 18), sc(g, 18) }, 0xffc440, a);
        }
    }
    /* Quick bar. */
    struct { int id; hw_ui_string s; bool on; } items[] = {
        { BTN_ROLLBACK, UI_ROLLBACK, false }, { BTN_HISTORY, UI_HISTORY, false }, { BTN_AUTO, UI_AUTO, g->auto_mode },
        { BTN_SKIP, UI_SKIP, g->skip_mode }, { BTN_SAVE, UI_SAVE, false }, { BTN_LOAD, UI_LOAD, false }, { BTN_MENU, UI_MENU, false },
    };
    float x = box.x + box.w - sc(g, 16);
    float y = box.y + box.h - sc(g, 14);
    for (int i = (int)(sizeof items / sizeof items[0]) - 1; i >= 0; i--) {
        const char *s = ui(g, items[i].s);
        float w = hw_text_width(g->fonts, s, sc(g, 22), 0) + sc(g, 24);
        SDL_FRect r = { x - w, y - sc(g, 34), w, sc(g, 34) };
        x -= w + sc(g, 6);
        int index = g->hit_count;
        if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, items[i].id };
        bool hover = point_in(g->mx, g->my, r) || g->focus == index;
        label(g, s, 22, r.x + r.w / 2, r.y + sc(g, 25), 1, items[i].on ? ACCENT : hover ? WHITE : DIM);
    }
}

static void draw_menu(game *g)
{
    float bw = g->W * 0.55f, bh = sc(g, 76), gap = sc(g, 18);
    float total = (float)g->option_count * (bh + gap) - gap;
    float y = g->H * 0.40f - total / 2;
    if (y < g->H * 0.05f) y = g->H * 0.05f;
    for (uint32_t i = 0; i < g->option_count; i++) {
        SDL_FRect r = { (g->W - bw) / 2, y, bw, bh };
        int index = g->hit_count;
        if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, BTN_OPTION + (int)i };
        bool hover = point_in(g->mx, g->my, r) || g->focus == index;
        fill(g, r, hover ? 0x3a4466 : 0x161a2b, hover ? 0.95f : 0.85f);
        if (hover) fill(g, (SDL_FRect){ r.x, r.y, sc(g, 6), r.h }, 0xffc440, 1.0f);
        const hw_rich_text *t = &g->option_text[i];
        float ty = r.y + (r.h - t->layout.height) / 2 - sc(g, 4);
        hw_rich_draw(g->fonts, t, r.x + (r.w - t->width) / 2, ty, 1e9f, (float)g->now, 1.0f, hover ? ACCENT : WHITE, INK, 2.0f);
        y += bh + gap;
    }
}

static void draw_title(game *g)
{
    const char *why = NULL;
    SDL_Texture *t = hw_assets_image(g->assets, "bg", "title", &why);
    if (t) {
        SDL_FRect all = { 0, 0, g->W, g->H };
        SDL_RenderTexture(g->ren, t, NULL, &all);
    } else {
        gradient(g, (SDL_FRect){ 0, 0, g->W, g->H }, 0x2b3a67, 0x0d1020, 1.0f);
    }
    hw_text_draw(g->fonts, hw_str(&g->m, g->m.title), sc(g, 88), HW_TS_BOLD, g->W / 2, g->H * 0.32f, 1, WHITE, INK, 4.0f);
    char lang[64];
    snprintf(lang, sizeof lang, "%s: %s", ui(g, UI_LANGUAGE), hw_language_name(g->lang));
    const char *labels[] = { ui(g, UI_START), ui(g, UI_LOAD), lang, ui(g, UI_QUIT) };
    int ids[] = { BTN_START, BTN_LOAD, BTN_LANGUAGE, BTN_QUIT };
    for (int i = 0; i < 4; i++) {
        if (ids[i] == BTN_LANGUAGE && g->m.language_count < 2) continue;
        SDL_FRect r = { g->W / 2 - sc(g, 220), g->H * 0.48f + (float)i * sc(g, 88), sc(g, 440), sc(g, 70) };
        button(g, r, labels[i], ids[i], 34, false);
    }
}

static void dim_background(game *g, float a) { fill(g, (SDL_FRect){ 0, 0, g->W, g->H }, 0x05060c, a); }

static void draw_sysmenu(game *g)
{
    dim_background(g, 0.7f);
    char lang[64], speed[64];
    snprintf(lang, sizeof lang, "%s: %s", ui(g, UI_LANGUAGE), hw_language_name(g->lang));
    snprintf(speed, sizeof speed, "%s: %d", ui(g, UI_TEXT_SPEED), (int)g->settings.cps);
    const char *labels[] = { ui(g, UI_RESUME), ui(g, UI_SAVE), ui(g, UI_LOAD), ui(g, UI_HISTORY), lang, speed, ui(g, UI_TITLE), ui(g, UI_QUIT) };
    int ids[] = { BTN_RESUME, BTN_SAVE, BTN_LOAD, BTN_HISTORY, BTN_LANGUAGE, BTN_SPEED, BTN_TITLE, BTN_QUIT };
    float y = g->H * 0.12f;
    for (int i = 0; i < 8; i++) {
        if (ids[i] == BTN_LANGUAGE && g->m.language_count < 2) continue;
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 260), y, sc(g, 520), sc(g, 68) }, labels[i], ids[i], 32, false);
        y += sc(g, 86);
    }
}

static void draw_slots(game *g)
{
    dim_background(g, 0.85f);
    label(g, ui(g, g->slots_saving ? UI_SAVE : UI_LOAD), 56, g->W / 2, sc(g, 100), 1, WHITE);
    float cw = g->W * 0.40f, ch = sc(g, 170);
    int first = g->slots_saving ? 1 : 0; /* the quick save can be loaded, not chosen as a target */
    for (int s = first; s <= HW_SLOTS; s++) {
        int i = s - first;
        float x = i % 2 == 0 ? g->W * 0.08f : g->W * 0.52f;
        float y = sc(g, 150) + (float)(i / 2) * (ch + sc(g, 20));
        SDL_FRect r = { x, y, cw, ch };
        int index = g->hit_count;
        if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, BTN_SLOT + s };
        bool hover = point_in(g->mx, g->my, r) || g->focus == index;
        fill(g, r, hover ? 0x3a4466 : 0x161a2b, 0.92f);
        char title[64];
        if (s == HW_SLOT_QUICK) snprintf(title, sizeof title, "%s", ui(g, UI_QUICK_SLOT));
        else snprintf(title, sizeof title, ui(g, UI_SLOT), s);
        label(g, title, 30, r.x + sc(g, 24), r.y + sc(g, 44), 0, hover ? ACCENT : WHITE);
        char path[1100];
        hw_persist_slot_path(&g->persist, s, path, sizeof path);
        size_t size = 0;
        uint8_t *data = g->persist.dir[0] ? SDL_LoadFile(path, &size) : NULL;
        hw_save_info info;
        if (data && hw_save_peek(data, size, &info)) {
            SDL_DateTime dt;
            char when[96] = "";
            if (SDL_TimeToDateTime((SDL_Time)info.time * SDL_NS_PER_SECOND, &dt, true)) {
                snprintf(when, sizeof when, "%04d-%02d-%02d %02d:%02d   %u:%02u:%02u", dt.year, dt.month, dt.day, dt.hour,
                         dt.minute, info.playtime_s / 3600, info.playtime_s / 60 % 60, info.playtime_s % 60);
            }
            label(g, when, 22, r.x + sc(g, 24), r.y + sc(g, 82), 0, DIM);
            char preview[160];
            snprintf(preview, sizeof preview, "%.60s", info.preview);
            label(g, preview, 24, r.x + sc(g, 24), r.y + sc(g, 128), 0, WHITE);
        } else {
            label(g, ui(g, UI_EMPTY_SLOT), 24, r.x + sc(g, 24), r.y + sc(g, 100), 0, DIM);
        }
        SDL_free(data);
    }
    button(g, (SDL_FRect){ g->W / 2 - sc(g, 160), g->H - sc(g, 110), sc(g, 320), sc(g, 64) }, ui(g, UI_BACK), BTN_BACK, 30, false);
}

static void draw_history(game *g)
{
    dim_background(g, 0.88f);
    label(g, ui(g, UI_HISTORY), 52, g->W / 2, sc(g, 90), 1, WHITE);
    if (g->backlog_count == 0) label(g, ui(g, UI_HISTORY_EMPTY), 30, g->W / 2, g->H / 2, 1, DIM);
    float y = g->H - sc(g, 170);
    for (int i = g->backlog_count - 1 - g->history_scroll; i >= 0 && y > sc(g, 140); i--) {
        const backlog_entry *e = &g->backlog[(g->backlog_start + i) % BACKLOG];
        if (e->name[0]) label(g, e->name, 26, g->W * 0.1f, y, 0, ACCENT);
        char text[160];
        snprintf(text, sizeof text, "%.120s", e->text);
        label(g, text, 26, g->W * 0.24f, y, 0, WHITE);
        y -= sc(g, 52);
    }
    button(g, (SDL_FRect){ g->W / 2 - sc(g, 160), g->H - sc(g, 110), sc(g, 320), sc(g, 64) }, ui(g, UI_BACK), BTN_BACK, 30, false);
}

static void draw_center_card(game *g, const char *title, const char *body, const char *detail)
{
    dim_background(g, 0.78f);
    label(g, title, 54, g->W / 2, g->H * 0.38f, 1, WHITE);
    if (body) {
        hw_rich_text rt;
        memset(&rt, 0, sizeof rt);
        hw_rich_plain(&rt, body);
        hw_rich_layout(&rt, g->fonts, g->W * 0.7f, sc(g, 30), g->lang);
        hw_rich_draw(g->fonts, &rt, (g->W - rt.width) / 2, g->H * 0.44f, 1e9f, 0, 1, WHITE, INK, 2.0f);
        hw_rich_free(&rt);
    }
    if (detail) label(g, detail, 24, g->W / 2, g->H * 0.80f, 1, DIM);
}

static void draw_overlay(game *g)
{
    SDL_FRect r = { g->W * 0.70f, sc(g, 16), g->W * 0.29f, g->H * 0.62f };
    fill(g, r, 0x000000, 0.72f);
    char line[256];
    float y = r.y + sc(g, 34);
    uint32_t pc = g->vm.s.pc;
    uint32_t scene = hw_module_scene_at(&g->m, pc);
    const char *file = "?";
    uint32_t src = 0;
    hw_module_source_at(&g->m, pc, &file, &src);
    snprintf(line, sizeof line, "scene %s   %s:%u", scene == HW_NONE ? "?" : hw_str(&g->m, g->m.scenes[scene].name), file, (unsigned)src);
    label(g, line, 20, r.x + sc(g, 14), y, 0, ACCENT);
    y += sc(g, 28);
    snprintf(line, sizeof line, "pc %u  stack %u  calls %u  rewind %u  lang %s", (unsigned)pc, (unsigned)g->vm.s.sp,
             (unsigned)g->vm.s.fp, (unsigned)g->hist.count, g->lang);
    label(g, line, 20, r.x + sc(g, 14), y, 0, WHITE);
    y += sc(g, 28);
    if (g->vm.div_by_zero) {
        snprintf(line, sizeof line, "divisions by zero: %u", (unsigned)g->vm.div_by_zero);
        label(g, line, 20, r.x + sc(g, 14), y, 0, ACCENT);
        y += sc(g, 28);
    }
    for (int c = 0; c < 4; c++) {
        static const char *const names[4] = { "music", "ambient", "sfx", "voice" };
        const char *missing = hw_audio_missing(g->audio, c);
        if (!missing || c == HW_CHANNEL_VOICE) continue;
        snprintf(line, sizeof line, "%s file %s (silence)", names[c], missing);
        label(g, line, 20, r.x + sc(g, 14), y, 0, DIM);
        y += sc(g, 28);
    }
    for (uint32_t i = 0; i < g->m.var_count && y < r.y + r.h - sc(g, 10); i++) {
        char v[64];
        hw_vm_value_text(&g->vm, i, g->vm.vars[i], v, sizeof v);
        snprintf(line, sizeof line, "%s = %s%s", hw_str(&g->m, g->m.vars[i].name), v, g->m.vars[i].scope == HW_SCOPE_GLOBAL ? "  (global)" : "");
        label(g, line, 20, r.x + sc(g, 14), y, 0, WHITE);
        y += sc(g, 26);
    }
}

static void render(game *g)
{
    g->hit_count = 0;
    SDL_SetRenderDrawColor(g->ren, 0, 0, 0, 255);
    SDL_RenderClear(g->ren);
    if (g->scr == SCR_TITLE) {
        draw_title(g);
    } else {
        render_scene(g, &g->shown, g->scene_tex);
        compose_scene(g);
        if (g->now < g->flash_until) fill(g, (SDL_FRect){ 0, 0, g->W, g->H }, 0xffffff, (float)((g->flash_until - g->now) / g->flash_dur));
        bool ui_visible = g->scr == SCR_PLAY && !g->trans_active;
        if (ui_visible && g->blk == B_MENU) draw_menu(g);
        if (ui_visible || g->scr == SCR_SYSMENU || g->scr == SCR_CONFIRM_QUIT) draw_textbox(g);
        if (g->scr != SCR_PLAY) g->hit_count = 0; /* the screens below own the clicks */
        switch (g->scr) {
        case SCR_SYSMENU: draw_sysmenu(g); break;
        case SCR_SLOTS: draw_slots(g); break;
        case SCR_HISTORY: draw_history(g); break;
        case SCR_END: draw_center_card(g, ui(g, UI_THE_END), NULL, ui(g, UI_CLICK_TO_CONTINUE)); break;
        case SCR_ERROR:
            if (g->dev) draw_center_card(g, ui(g, UI_ERROR_TITLE), g->error, "Fix the script, run hwc build, then press F5 to reload.");
            else draw_center_card(g, ui(g, UI_ERROR_TITLE), ui(g, UI_ERROR_RELEASE), ui(g, UI_CLICK_TO_CONTINUE));
            break;
        case SCR_CONFIRM_QUIT:
            draw_center_card(g, ui(g, UI_CONFIRM_QUIT), NULL, NULL);
            button(g, (SDL_FRect){ g->W / 2 - sc(g, 300), g->H * 0.5f, sc(g, 260), sc(g, 68) }, ui(g, UI_YES), BTN_YES, 32, false);
            button(g, (SDL_FRect){ g->W / 2 + sc(g, 40), g->H * 0.5f, sc(g, 260), sc(g, 68) }, ui(g, UI_NO), BTN_NO, 32, false);
            break;
        default: break;
        }
    }
    if (g->overlay && g->dev && g->scr != SCR_TITLE) draw_overlay(g);
    if (g->now < g->notice_until) {
        float w = hw_text_width(g->fonts, g->notice, sc(g, 26), 0) + sc(g, 48);
        if (w > g->W * 0.9f) w = g->W * 0.9f;
        SDL_FRect r = { (g->W - w) / 2, sc(g, 24), w, sc(g, 54) };
        fill(g, r, 0x101320, 0.92f);
        label(g, g->notice, 26, g->W / 2, r.y + sc(g, 37), 1, WHITE);
    }
    if (g->shot) {
        SDL_Surface *shot = SDL_RenderReadPixels(g->ren, NULL);
        if (!shot || !SDL_SavePNG(shot, g->shot)) SDL_Log("screenshot: %s", SDL_GetError());
        SDL_DestroySurface(shot);
        g->shot = NULL;
    }
    SDL_RenderPresent(g->ren);
    memcpy(g->last_hits, g->hits, sizeof g->hits);
    g->last_hit_count = g->hit_count;
}

/* ---- per-frame update ---- */

static void update(game *g, double dt)
{
    if (g->scr != SCR_PLAY) return;
    bool skip = skipping(g);
    if (g->blk == B_TRANS && (skip || g->now - g->trans_t0 >= g->trans_dur)) {
        g->trans_active = false;
        g->blk = B_NONE;
    }
    if (g->blk == B_WAIT && (skip || g->now >= g->wait_until)) g->blk = B_NONE;
    if (g->blk == B_SAY) {
        hw_rich_text *t = &g->text;
        if (g->reveal < (float)t->chars) {
            if (g->now >= g->pause_until) {
                float cps = hw_rich_cps(t, (uint32_t)g->reveal, g->cps_override >= 1.0f ? g->cps_override : g->settings.cps);
                g->reveal += (float)dt * (cps >= 1000.0f ? 1e6f : cps);
                if (g->next_pause < t->pause_count && g->reveal >= (float)t->pauses[g->next_pause].at) {
                    g->reveal = (float)t->pauses[g->next_pause].at;
                    g->pause_until = g->now + t->pauses[g->next_pause].ms / 1000.0;
                    g->next_pause++;
                }
            }
        } else {
            if (g->done_at < 0) g->done_at = g->now;
            double wait = 1.0 + 0.035 * t->chars;
            if (t->no_wait) advance(g);
            else if (may_skip_line(g) && g->now - g->done_at > 0.03) advance(g);
            else if (g->auto_mode && g->now - g->done_at > wait) advance(g);
        }
    }
    if (g->blk == B_NONE) pump(g);
}

/* ---- input ---- */

static void open_slots(game *g, bool saving)
{
    g->slots_saving = saving;
    if (g->scr != SCR_SLOTS) g->back_to = g->scr == SCR_SYSMENU ? SCR_SYSMENU : g->scr;
    g->scr = SCR_SLOTS;
    g->focus = -1;
}

static void activate(game *g, int id)
{
    switch (id) {
    case BTN_START: start_story(g); break;
    case BTN_LOAD: open_slots(g, false); break;
    case BTN_SAVE: if (g->vm_ready && g->hist.count > 0) open_slots(g, true); break;
    case BTN_LANGUAGE: next_language(g); break;
    case BTN_QUIT: g->back_to = g->scr; g->scr = SCR_CONFIRM_QUIT; break;
    case BTN_YES: g->running = false; break;
    case BTN_NO: g->scr = g->back_to; break;
    case BTN_RESUME: g->scr = SCR_PLAY; break;
    case BTN_MENU: g->scr = SCR_SYSMENU; break;
    case BTN_HISTORY: g->back_to = g->scr; g->history_scroll = 0; g->scr = SCR_HISTORY; break;
    case BTN_TITLE:
        end_story(g);
        g->scr = SCR_TITLE;
        break;
    case BTN_SPEED: {
        static const float speeds[] = { 20, 40, 60, 100, 1000 };
        int k = 0;
        for (int i = 0; i < 5; i++) if (speeds[i] <= g->settings.cps) k = i;
        g->settings.cps = speeds[(k + 1) % 5];
        save_global(g);
        break;
    }
    case BTN_BACK: g->scr = g->back_to == SCR_SLOTS || g->back_to == SCR_HISTORY ? SCR_PLAY : g->back_to; break;
    case BTN_AUTO: g->auto_mode = !g->auto_mode; break;
    case BTN_SKIP: g->skip_mode = !g->skip_mode; break;
    case BTN_ROLLBACK: rollback(g); break;
    default:
        if (id >= BTN_SLOT && id <= BTN_SLOT + HW_SLOTS) {
            int slot = id - BTN_SLOT;
            if (g->slots_saving) {
                save_slot(g, slot);
                g->scr = SCR_PLAY;
            } else {
                load_slot(g, slot);
            }
        } else if (id >= BTN_OPTION && id < BTN_OPTION + HW_VM_MAX_OPTIONS) {
            choose(g, (uint32_t)(id - BTN_OPTION));
        }
        break;
    }
}

/* Click or Enter in the story: finish what is moving, else go on. */
static void proceed(game *g)
{
    if (g->scr == SCR_END || g->scr == SCR_ERROR) {
        g->scr = SCR_TITLE;
        return;
    }
    if (g->scr != SCR_PLAY) return;
    g->auto_mode = false;
    if (g->blk == B_TRANS) {
        g->trans_active = false;
        g->blk = B_NONE;
        pump(g);
    } else if (g->blk == B_WAIT) {
        g->blk = B_NONE;
        pump(g);
    } else if (g->blk == B_SAY) {
        if (!finish_reveal(g)) advance(g);
    }
}

static int hit_at(const game *g, float x, float y)
{
    for (int i = g->last_hit_count - 1; i >= 0; i--) {
        if (point_in(x, y, g->last_hits[i].r)) return g->last_hits[i].id;
    }
    return 0;
}

static void escape(game *g)
{
    switch (g->scr) {
    case SCR_PLAY: g->scr = SCR_SYSMENU; g->focus = -1; break;
    case SCR_SYSMENU: g->scr = SCR_PLAY; break;
    case SCR_SLOTS: case SCR_HISTORY: activate(g, BTN_BACK); break;
    case SCR_CONFIRM_QUIT: g->scr = g->back_to; break;
    case SCR_TITLE: g->back_to = SCR_TITLE; g->scr = SCR_CONFIRM_QUIT; break;
    default: g->scr = SCR_TITLE; break;
    }
}

static void on_event(game *g, SDL_Event *e)
{
    SDL_ConvertEventToRenderCoordinates(g->ren, e);
    switch (e->type) {
    case SDL_EVENT_QUIT:
        g->running = false;
        break;
    case SDL_EVENT_MOUSE_MOTION:
        g->mx = e->motion.x;
        g->my = e->motion.y;
        g->focus = -1;
        break;
    case SDL_EVENT_MOUSE_WHEEL:
        if (g->scr == SCR_HISTORY) {
            g->history_scroll += e->wheel.y > 0 ? 1 : -1;
            if (g->history_scroll < 0) g->history_scroll = 0;
            if (g->history_scroll > g->backlog_count - 1) g->history_scroll = g->backlog_count > 0 ? g->backlog_count - 1 : 0;
        } else if (g->scr == SCR_PLAY && e->wheel.y > 0) {
            rollback(g);
        } else if (g->scr == SCR_PLAY && e->wheel.y < 0 && g->blk == B_SAY) {
            proceed(g);
        }
        break;
    case SDL_EVENT_MOUSE_BUTTON_UP: {
        if (e->button.button == SDL_BUTTON_RIGHT) {
            escape(g);
            break;
        }
        if (e->button.button != SDL_BUTTON_LEFT) break;
        int id = hit_at(g, e->button.x, e->button.y);
        if (id) activate(g, id);
        else if (g->scr == SCR_PLAY && g->blk != B_MENU) proceed(g);
        else if (g->scr == SCR_END || g->scr == SCR_ERROR) proceed(g);
        break;
    }
    case SDL_EVENT_KEY_DOWN: {
        SDL_Keycode k = e->key.key;
        if (k == SDLK_ESCAPE) escape(g);
        else if (k == SDLK_F11 || (k == SDLK_RETURN && (e->key.mod & SDL_KMOD_ALT))) {
            g->settings.fullscreen = !g->settings.fullscreen;
            SDL_SetWindowFullscreen(g->win, g->settings.fullscreen);
        } else if (k == SDLK_RETURN || k == SDLK_SPACE || k == SDLK_KP_ENTER || k == SDLK_Z) {
            if (g->focus >= 0 && g->focus < g->last_hit_count) activate(g, g->last_hits[g->focus].id);
            else proceed(g);
        } else if (k == SDLK_DOWN || (k == SDLK_TAB && !(e->key.mod & SDL_KMOD_SHIFT))) {
            if (k == SDLK_TAB && g->scr == SCR_PLAY && g->blk != B_MENU) g->skip_mode = !g->skip_mode;
            else if (g->last_hit_count > 0) g->focus = (g->focus + 1) % g->last_hit_count;
        } else if (k == SDLK_UP) {
            if (g->last_hit_count > 0) g->focus = g->focus <= 0 ? g->last_hit_count - 1 : g->focus - 1;
        } else if (k >= SDLK_1 && k <= SDLK_9 && g->scr == SCR_PLAY && g->blk == B_MENU) {
            choose(g, (uint32_t)(k - SDLK_1));
        } else if (k == SDLK_PAGEUP && g->scr == SCR_PLAY) {
            rollback(g);
        } else if (k == SDLK_A && g->scr == SCR_PLAY) {
            g->auto_mode = !g->auto_mode;
        } else if (k == SDLK_H && g->scr == SCR_PLAY) {
            activate(g, BTN_HISTORY);
        } else if (k == SDLK_F6 && g->scr == SCR_PLAY) {
            save_slot(g, HW_SLOT_QUICK);
        } else if (k == SDLK_F9 && g->vm_ready) {
            load_slot(g, HW_SLOT_QUICK);
        } else if (k == SDLK_F3 && g->dev) {
            g->overlay = !g->overlay;
        } else if (k == SDLK_F5 && g->dev) {
            reload(g);
        }
        break;
    }
    case SDL_EVENT_WINDOW_FOCUS_LOST:
        g->skip_mode = false;
        break;
    default:
        break;
    }
}

/* ---- setup ---- */

static void open_fonts(game *g)
{
    const char *paths[6];
    int n = 0;
    char own[1100], segoe[512], yu[512], meiryo[512];
    static const char *const exts[] = { ".ttf", ".otf", ".ttc", NULL };
    if (hw_assets_find(g->assets, "fonts", "main", exts, own, sizeof own)) paths[n++] = own;
    const char *windir = SDL_getenv("WINDIR");
    if (!windir) windir = "C:/Windows";
    snprintf(segoe, sizeof segoe, "%s/Fonts/segoeui.ttf", windir);
    snprintf(yu, sizeof yu, "%s/Fonts/YuGothM.ttc", windir);
    snprintf(meiryo, sizeof meiryo, "%s/Fonts/meiryo.ttc", windir);
    paths[n++] = segoe;
    paths[n++] = yu;
    paths[n++] = meiryo;
    g->fonts = hw_fonts_open(g->ren, paths, n);
}

/* A startup failure: logged, and shown in a message box unless this is an unattended (--frames) run. */
static int fatal(SDL_Window *win, const char *msg)
{
    SDL_Log("himawari: %s", msg);
    if (!unattended) SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, "Himawari", msg, win);
    return 2;
}

int hw_game_main(int argc, char **argv, const char *game_path, const char *project)
{
    static game G; /* large; zero-initialized */
    game *g = &G;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--dev") == 0) g->dev = true;
        if (strcmp(argv[i], "--frames") == 0) unattended = true;
    }
    if (project) g->dev = true; /* --project means a project folder: dev tools on */
    snprintf(g->game_path, sizeof g->game_path, "%s", game_path);

    if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_EVENTS)) return fatal(NULL, SDL_GetError());
    char err[200];
    if (!load_module(g, &g->m, err, sizeof err)) {
        char msg[400];
        snprintf(msg, sizeof msg, "Can't start the game.\n\n%s\n\n%s", game_path, err);
        SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, "Himawari", msg, NULL);
        SDL_Quit();
        return 2;
    }
    g->W = (float)g->m.width;
    g->H = (float)g->m.height;
    g->S = g->H / 1080.0f;

    /* A window that fits the screen, in the game's aspect ratio. */
    int ww = (int)g->W, wh = (int)g->H;
    const SDL_DisplayMode *dm = SDL_GetDesktopDisplayMode(SDL_GetPrimaryDisplay());
    if (dm && (float)dm->h * 0.85f < g->H) {
        wh = (int)((float)dm->h * 0.80f);
        ww = (int)((float)wh * g->W / g->H);
    }
    g->win = SDL_CreateWindow(hw_str(&g->m, g->m.title), ww, wh, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY);
    bool allow_gpu = true;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--no-gpu") == 0) allow_gpu = false;
    }
    g->ren = g->win ? hw_create_renderer(g->win, allow_gpu, &g->gpu) : NULL;
    if (!g->ren) return fatal(NULL, SDL_GetError());
    SDL_SetRenderVSync(g->ren, 1);
    g->wipe = hw_rulewipe_open(g->ren, g->gpu);
    SDL_SetRenderLogicalPresentation(g->ren, (int)g->W, (int)g->H, SDL_LOGICAL_PRESENTATION_LETTERBOX);
    g->scene_tex = SDL_CreateTexture(g->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, (int)g->W, (int)g->H);
    g->prev_tex = SDL_CreateTexture(g->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, (int)g->W, (int)g->H);
    SDL_SetTextureBlendMode(g->scene_tex, SDL_BLENDMODE_BLEND);
    SDL_SetTextureBlendMode(g->prev_tex, SDL_BLENDMODE_BLEND);

    /* Assets: <project>/assets in dev, else assets/ beside the game file. */
    char assets_dir[1100];
    if (project) {
        snprintf(assets_dir, sizeof assets_dir, "%s/assets", project);
    } else {
        snprintf(assets_dir, sizeof assets_dir, "%s", game_path);
        char *slash = strrchr(assets_dir, '/');
        char *bslash = strrchr(assets_dir, '\\');
        if (bslash > slash) slash = bslash;
        if (slash) snprintf(slash + 1, sizeof assets_dir - (size_t)(slash + 1 - assets_dir), "assets");
        else snprintf(assets_dir, sizeof assets_dir, "assets");
    }
    g->assets = hw_assets_open(g->ren, assets_dir);
    open_fonts(g);
    if (!g->assets || !g->fonts) return fatal(g->win, "No usable font was found (Segoe UI or Yu Gothic).");
    g->audio = hw_audio_open(g->assets);

    g->read_lines = SDL_calloc(g->m.line_count > 0 ? g->m.line_count : 1, 1);
    g->option_text = SDL_calloc(HW_VM_MAX_OPTIONS, sizeof *g->option_text);
    if (!g->read_lines || !g->option_text || !hw_vm_init(&g->vm, &g->m, (uint64_t)SDL_GetTicksNS()) ||
        !hw_history_init(&g->hist, hw_vm_snapshot_size(&g->vm), HISTORY_DEPTH)) {
        return fatal(g->win, "Out of memory.");
    }
    g->vm_ready = true;
    g->vm.checkpoint = on_checkpoint;
    g->vm.checkpoint_user = g;

    g->settings.cps = 40;
    for (int i = 0; i < 4; i++) g->settings.volume[i] = 1.0f;
    hw_persist_open(&g->persist, hw_str(&g->m, g->m.game_id));
    hw_global_load(&g->persist, &g->m, &g->vm, g->read_lines, &g->settings);
    for (int i = 0; i < 4; i++) hw_audio_set_volume(g->audio, i, g->settings.volume[i]);
    if (g->settings.fullscreen) SDL_SetWindowFullscreen(g->win, true);
    pick_language(g);

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--lang") == 0 && i + 1 < argc) {
            /* For this run only: the player's own choice stays in settings. */
            char saved[sizeof g->settings.language];
            memcpy(saved, g->settings.language, sizeof saved);
            set_language(g, argv[i + 1]);
            memcpy(g->settings.language, saved, sizeof saved);
        }
        /* --text-speed N: characters per second for this run (1000 = instant; render_line uses it). */
        if (strcmp(argv[i], "--text-speed") == 0 && i + 1 < argc) g->cps_override = strtof(argv[i + 1], NULL);
    }

    g->scr = SCR_TITLE;
    g->focus = -1;
    g->running = true;
    g->now = (double)SDL_GetTicksNS() / 1e9;
    /* --frames N: quit after N frames (CI smoke test). --start: skip the title screen. */
    /* --advance N: click through N times after starting, choosing option --pick K at menus (smoke tests).
     * --screenshot FILE: save the last frame as PNG. */
    long frames = -1, clicks = 0, pick = 0;
    bool warp_failed = false;
    const char *shot = NULL;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--frames") == 0 && i + 1 < argc) frames = strtol(argv[i + 1], NULL, 10);
        if (strcmp(argv[i], "--advance") == 0 && i + 1 < argc) clicks = strtol(argv[i + 1], NULL, 10);
        if (strcmp(argv[i], "--pick") == 0 && i + 1 < argc) pick = strtol(argv[i + 1], NULL, 10);
        if (strcmp(argv[i], "--screenshot") == 0 && i + 1 < argc) shot = argv[i + 1];
        if (strcmp(argv[i], "--start") == 0) start_story(g);
        if (strcmp(argv[i], "--warp") == 0 && i + 1 < argc) {
            uint32_t target = hw_warp_target(&g->m, argv[i + 1]);
            uint8_t *snap = SDL_malloc(hw_vm_snapshot_size(&g->vm));
            if (target != HW_NONE && snap && hw_warp(&g->m, target, (uint64_t)SDL_GetTicksNS(), 0, snap)) {
                start_story(g); /* resets the presentation; then jump to the reconstructed state */
                hw_vm_restore(&g->vm, snap);
                hw_history_clear(&g->hist);
                reset_presentation(g);
                sync_audio(g);
                pump(g);
                SDL_Log("warp: %s", argv[i + 1]);
            } else {
                char msg[300];
                snprintf(msg, sizeof msg, target == HW_NONE ? "warp: no line at %s" : "warp: no path reaches %s", argv[i + 1]);
                SDL_Log("%s", msg);
                notify(g, msg);
                if (unattended) warp_failed = true;
            }
            SDL_free(snap);
        }
    }
    if (g->dev) SDL_Log("dev mode: F3 overlay, F5 reload %s", game_path);
    if (warp_failed) g->running = false;

    while (g->running) {
        double t = (double)SDL_GetTicksNS() / 1e9;
        double dt = t - g->now;
        if (dt > 0.1) dt = 0.1;
        g->now = t;
        SDL_Event e;
        while (SDL_PollEvent(&e)) on_event(g, &e);
        if (clicks > 0 && frames > 0 && frames % 20 == 0) {
            clicks--;
            if (g->blk == B_MENU) choose(g, pick >= 0 && (uint32_t)pick < g->option_count ? (uint32_t)pick : 0);
            else {
                finish_reveal(g);
                proceed(g);
            }
        }
        update(g, dt);
        if (shot && frames == 1) g->shot = shot;
        render(g);
        if (frames > 0 && --frames == 0) g->running = false;
    }

    save_global(g);
    hw_rich_free(&g->text);
    for (uint32_t i = 0; i < HW_VM_MAX_OPTIONS; i++) hw_rich_free(&g->option_text[i]);
    SDL_free(g->option_text);
    SDL_free(g->read_lines);
    hw_history_free(&g->hist);
    hw_vm_free(&g->vm);
    hw_module_free(&g->m);
    hw_audio_close(g->audio);
    hw_fonts_close(g->fonts);
    hw_assets_close(g->assets);
    SDL_DestroyTexture(g->scene_tex);
    SDL_DestroyTexture(g->prev_tex);
    hw_rulewipe_close(g->wipe);
    SDL_DestroyRenderer(g->ren);
    if (g->gpu) SDL_DestroyGPUDevice(g->gpu);
    SDL_DestroyWindow(g->win);
    SDL_Quit();
    return warp_failed ? 3 : 0;
}
