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
#include "hw_game_int.h"

#include <SDL3/SDL.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_assets.h"
#include "hw_crash.h"
#include "hw_audio.h"
#include "hw_headless.h"
#include "hw_hwb.h"
#include "hw_json.h"
#include "hw_link.h"
#include "hw_persist.h"
#include "hw_play.h"
#include "hw_rulewipe.h"
#include "hw_save.h"
#include "hw_text_draw.h"
#include "hw_ui_text.h"
#include "hw_vm.h"

/* An unattended run (--frames: smoke tests, render_line) never writes the player's data. */
bool unattended = false;

/* ---- small helpers ---- */

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

void fill(game *g, SDL_FRect r, uint32_t rgb, float a)
{
    SDL_FColor c = fcol(rgb, a);
    SDL_SetRenderDrawBlendMode(g->ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColorFloat(g->ren, c.r, c.g, c.b, c.a);
    SDL_RenderFillRect(g->ren, &r);
}

void gradient(game *g, SDL_FRect r, uint32_t top, uint32_t bottom, float a)
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

void label(game *g, const char *s, float px, float x, float y, int align, SDL_Color c)
{
    hw_text_draw(g->fonts, s, sc(g, px), 0, x, y, align, c, col(g->pal.ink), sc(g, px) > 20 ? 2.0f : 0.0f);
}

static void notify(game *g, const char *msg)
{
    snprintf(g->notice, sizeof g->notice, "%s", msg);
    g->notice_until = g->now + 4.0;
}

/* Global data: settings, read lines, global variables. */
void save_global(game *g)
{
    if (!unattended) hw_global_save(&g->persist, &g->m, &g->vm, g->read_lines, &g->unlocks, &g->settings);
}

/* Draws a button and registers it for clicks this frame. */
void button(game *g, SDL_FRect r, const char *text, int id, float px, bool active)
{
    int index = g->hit_count;
    if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, id };
    bool hover = point_in(g->mx, g->my, r) || g->focus == index;
    fill(g, r, hover ? g->pal.choice_hover : g->pal.panel, hover ? 0.95f : 0.85f);
    if (active) fill(g, (SDL_FRect){ r.x, r.y, sc(g, 6), r.h }, g->pal.accent, 1.0f);
    label(g, text, px, r.x + r.w / 2, r.y + r.h / 2 + sc(g, px) * 0.36f, 1, hover ? col(g->pal.accent) : col(g->pal.text));
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
    label(g, text, 44, g->W / 2, g->H * 0.42f, 1, col(g->pal.text));
    if (g->dev && why) {
        snprintf(text, sizeof text, "assets/%s/%s.png %s", folder, name, why);
        label(g, text, 24, g->W / 2, g->H * 0.42f + sc(g, 44), 1, col(g->pal.dim));
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
    label(g, ci ? hw_str(&g->m, ci->name) : id, 34, cx, base - h * 0.55f, 1, col(g->pal.text));
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
    if (attrs[0]) label(g, attrs, 24, cx, base - h * 0.55f + sc(g, 40), 1, col(g->pal.dim));
}

void render_scene(game *g, const hw_display *d, SDL_Texture *target)
{
    SDL_Texture *before = SDL_GetRenderTarget(g->ren); /* the window, or the --compare canvas */
    SDL_SetRenderTarget(g->ren, target);
    SDL_SetRenderDrawColor(g->ren, 0, 0, 0, 255);
    SDL_RenderClear(g->ren);
    if (d->bg) draw_backdrop(g, "bg", hw_str(&g->m, d->bg), "bg");
    for (uint32_t i = 0; i < d->stage_count; i++) draw_character(g, &d->stage[i], d == &g->shown ? (int)i : -1);
    if (d->cg) draw_backdrop(g, "cg", hw_str(&g->m, d->cg), "CG");
    SDL_SetRenderTarget(g->ren, before);
}

void compose_scene(game *g)
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

float text_width(const game *g) { return g->W * 0.84f - sc(g, 2 * g->tb_pad); }

static void layout_line(game *g)
{
    hw_rich_build(&g->text, &g->vm, hw_vm_line_text(&g->vm, g->line));
    hw_rich_layout(&g->text, g->fonts, text_width(g), sc(g, g->text_px), g->lang);
}

/* NVL: lays out the page's lines not laid out yet; a page too tall for the screen starts over with its newest line. */
void layout_page(game *g)
{
    const hw_display *d = &g->vm.s.display;
    if (g->page_built > d->page_count) g->page_built = 0;
    for (uint32_t i = g->page_built; i < d->page_count; i++) {
        hw_rich_build(&g->page_text[i], &g->vm, hw_vm_line_text(&g->vm, d->page[i]));
        hw_rich_layout(&g->page_text[i], g->fonts, g->W * 0.76f, sc(g, g->text_px), g->lang);
    }
    g->page_built = d->page_count;
    float h = 0;
    for (uint32_t i = 0; i < d->page_count; i++) h += g->page_text[i].layout.height + sc(g, g->text_px * 0.6f);
    if (h > g->H * 0.80f && d->page_count > 1) {
        hw_vm_page_restart(&g->vm);
        g->page_built = 0;
        layout_page(g);
    }
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
static bool may_skip_line(const game *g) { return skipping(g) && (g->line_was_read || g->dev || g->settings.skip_unread); }

static void show_line(game *g, uint32_t line, bool is_prompt)
{
    g->have_line = true;
    g->line = line;
    const char *name = is_prompt ? "" : hw_vm_speaker_name(&g->vm, line);
    snprintf(g->speaker, sizeof g->speaker, "%s", name);
    const hw_char_info *ci = char_info(g, g->m.lines[line].speaker);
    g->speaker_color = ci && ci->color != HW_NONE ? ci->color : g->pal.accent;
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
    backlog_entry *e = &g->backlog[slot];
    snprintf(e->name, sizeof e->name, "%.63s", g->speaker);
    plain_text(&g->text, e->text, sizeof e->text);
    e->line_id = g->m.lines[g->line].line_id;
    e->has_voice = false;
    if (e->line_id != HW_NONE) {
        static const char *const exts[] = { ".ogg", ".wav", ".mp3", ".flac", ".opus", NULL };
        char folder[64], id[7], path[1100];
        hw_line_id_format(e->line_id, id);
        snprintf(folder, sizeof folder, "voice/%s", g->lang);
        e->has_voice = hw_assets_find(g->assets, folder, id, exts, path, sizeof path);
    }
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
        if (g->settings.reduce_motion) g->trans = T_DISSOLVE; /* no slides, wipes, or fades through black (§13) */
        snprintf(g->trans_mask, sizeof g->trans_mask, "%s", hw_str(&g->m, ev->trans.mask));
        g->trans_dur = (ev->trans.ms >= 0 ? ev->trans.ms : g->trans_ms) / 1000.0;
        if (g->trans_dur < 0.01) g->trans_dur = 0.01;
        if (g->settings.reduce_motion && g->trans_dur < 0.3) g->trans_dur = 0.3;
        g->trans_t0 = g->now;
        g->trans_active = true;
        g->blk = B_TRANS;
    }
    g->shown = g->vm.s.display;
}

/* ---- extension statements (rfcs/0007) ---- */

static void run_extension(game *g, const hw_event *ev)
{
    const hw_ext_statement *h = g->ext_of ? g->ext_of[ev->subject] : NULL;
    if (!h) return; /* not in this player: skipped (reported when the game was loaded) */
    hw_ext_call call = { &g->vm, ev->subject, ev->add, ev->add_count };
    if (h->begin) h->begin(h->user, &call);
    bool blocking = (g->m.exts[ev->subject].flags & HW_XTNS_BLOCKING) && h->update;
    if (!blocking) return;
    if (skipping(g) || g->fast_forward) {
        if (h->finish) h->finish(h->user);
        return;
    }
    g->ext_active = h;
    g->blk = B_EXT;
}

/* Ends a blocking statement early (skip, rewind, load, title). */
static void ext_stop(game *g)
{
    if (g->ext_active && g->ext_active->finish) g->ext_active->finish(g->ext_active->user);
    g->ext_active = NULL;
}

/* Every statement shows its saved state again (after a load, a rewind, a reload, or a new start). */
static void ext_restore_all(game *g)
{
    const hw_display *d = &g->vm.s.display;
    for (uint32_t i = 0; g->ext_of && i < g->m.ext_count; i++) {
        const hw_ext_statement *h = g->ext_of[i];
        if (!h || !h->restore) continue;
        bool called = i < HW_VM_MAX_EXT && ((d->ext_called >> i) & 1u);
        uint32_t n = g->m.exts[i].param_count < HW_VM_EXT_VALUES ? g->m.exts[i].param_count : HW_VM_EXT_VALUES;
        hw_ext_call last = { &g->vm, i, called ? d->ext_last[i] : NULL, called ? n : 0 };
        h->restore(h->user, called ? &last : NULL);
    }
}

/* Matches the module's extension statements to this player's handlers; reports the missing ones. */
static void bind_extensions(game *g)
{
    SDL_free(g->ext_of);
    g->ext_of = g->m.ext_count ? SDL_calloc(g->m.ext_count, sizeof *g->ext_of) : NULL;
    char missing[256] = "";
    size_t n = 0;
    for (uint32_t i = 0; g->ext_of && i < g->m.ext_count; i++) {
        const char *name = hw_str(&g->m, g->m.exts[i].name);
        g->ext_of[i] = hw_ext_find(name);
        if (!g->ext_of[i] && n + 1 < sizeof missing) n += (size_t)snprintf(missing + n, sizeof missing - n, "%s%s", n ? ", " : "", name);
    }
    if (missing[0]) {
        SDL_Log("extension statements this player doesn't have (skipped): %s", missing);
        if (g->dev) {
            char msg[320];
            snprintf(msg, sizeof msg, "Skipped extension statements (not in this player): %s", missing);
            notify(g, msg);
        }
    }
}

/* Theme settings with the default theme's values as fallbacks. */
static void bind_theme(game *g)
{
    hw_theme_palette(&g->m, &g->pal);
    g->tb_alpha = (float)hw_theme_int(&g->m, "textbox.opacity", 82) / 100.0f;
    g->tb_height = (float)hw_theme_int(&g->m, "textbox.height", 27) / 100.0f;
    g->tb_pad = (float)hw_theme_int(&g->m, "textbox.padding", 44);
    g->text_px = (float)hw_theme_int(&g->m, "text.size", 40);
    g->trans_ms = hw_theme_int(&g->m, "transition.ms", 500);
    if (g->name_fonts) hw_fonts_close(g->name_fonts);
    g->name_fonts = NULL;
    const char *name_font = hw_theme_str(&g->m, "font.name");
    char path[1100];
    static const char *const exts[] = { ".ttf", ".otf", ".ttc", NULL };
    if (name_font && hw_assets_find(g->assets, "", name_font, exts, path, sizeof path)) {
        hw_font_source src = { NULL, hw_vfs_open(g->vfs, path) };
        if (src.io) g->name_fonts = hw_fonts_open_sources(g->ren, &src, 1);
    }
}

void end_story(game *g)
{
    hw_audio_stop_all(g->audio);
    g->title_music = false;
    save_global(g);
}

static void handle(game *g, const hw_event *ev)
{
    const hw_module *m = &g->m;
    switch (ev->kind) {
    case HW_EV_SAY: {
        hw_audio_stop(g->audio, HW_CHANNEL_VOICE, 0);
        show_line(g, ev->line, false);
        if (g->vm.s.display.textbox == HW_TEXTBOX_NVL) layout_page(g);
        add_backlog(g);
        if (m->lines[ev->line].line_id != HW_NONE && !may_skip_line(g) && !g->fast_forward) {
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
        if (ev->kind == HW_EV_CG && hw_unlock(&g->unlocks, false, ev->subject)) save_global(g); /* the gallery */
        stage_change(g, ev);
        break;
    case HW_EV_AUDIO:
        if (ev->channel == HW_CHANNEL_MUSIC && hw_unlock(&g->unlocks, true, ev->subject)) save_global(g); /* the music room */
        if (g->fast_forward && (ev->channel == HW_CHANNEL_SFX || ev->channel == HW_CHANNEL_VOICE)) break;
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
        if (g->settings.reduce_motion) break; /* no shaking or flashing (§13) */
        if (ev->effect == 0) {
            g->shake_dur = (ev->ms >= 0 ? ev->ms : 500) / 1000.0;
            g->shake_until = g->now + g->shake_dur;
        } else {
            g->flash_dur = (ev->ms >= 0 ? ev->ms : 300) / 1000.0;
            g->flash_until = g->now + g->flash_dur;
        }
        break;
    case HW_EV_TEXTBOX:
        if (ev->effect == HW_TEXTBOX_ADV || ev->effect == HW_TEXTBOX_NVL || ev->effect == HW_TEXTBOX_CLEAR) {
            g->page_built = 0;
            g->have_line = false;
        }
        break;
    case HW_EV_XCALL:
        run_extension(g, ev);
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
void pump(game *g)
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

void advance(game *g)
{
    if (g->blk != B_SAY) return;
    hw_audio_stop(g->audio, HW_CHANNEL_VOICE, 0);
    g->blk = B_NONE;
    pump(g);
}

/* Shows everything at once (a click while the text is still appearing). */
bool finish_reveal(game *g)
{
    if (g->reveal >= (float)g->text.chars) return false;
    g->reveal = (float)g->text.chars + 1;
    g->next_pause = g->text.pause_count;
    g->pause_until = 0;
    return true;
}

void choose(game *g, uint32_t k)
{
    if (g->blk != B_MENU || k >= g->option_count) return;
    if (!hw_vm_choose(&g->vm, k)) return;
    g->blk = B_NONE;
    g->have_line = false;
    pump(g);
}

static void reset_presentation(game *g)
{
    ext_stop(g);
    g->blk = B_NONE;
    g->page_built = 0;
    g->trans_active = false;
    g->shake_until = g->flash_until = 0;
    g->have_line = false;
    g->option_count = 0;
    g->shown = g->vm.s.display;
    ext_restore_all(g);
    if (g->vm.s.display.textbox == HW_TEXTBOX_NVL) layout_page(g);
}

void start_story(game *g)
{
    hw_history_clear(&g->hist);
    hw_audio_stop_all(g->audio);
    g->title_music = false;
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

void rollback(game *g)
{
    if (g->scr != SCR_PLAY || !hw_rollback(&g->vm, &g->hist)) return;
    reset_presentation(g);
    if (g->backlog_count > 0) g->backlog_count--;
    sync_audio(g);
    pump(g);
}

/* ---- saves ---- */

/* A small PNG of the scene as last drawn (without the textbox), for the save screen (plan §8.9). */
static bool thumbnail(game *g, void **png, size_t *size)
{
    SDL_Texture *prev = SDL_GetRenderTarget(g->ren);
    SDL_SetRenderTarget(g->ren, g->scene_tex);
    SDL_Surface *full = SDL_RenderReadPixels(g->ren, NULL);
    SDL_SetRenderTarget(g->ren, prev);
    if (!full) return false;
    int w = 384, h = (int)(384.0f * g->H / g->W);
    SDL_Surface *small = SDL_ScaleSurface(full, w, h, SDL_SCALEMODE_LINEAR);
    SDL_DestroySurface(full);
    if (!small) return false;
    SDL_IOStream *io = SDL_IOFromDynamicMem();
    bool ok = io && SDL_SavePNG_IO(small, io, false);
    SDL_DestroySurface(small);
    if (ok) {
        Sint64 n = SDL_GetIOSize(io);
        const void *data = SDL_GetPointerProperty(SDL_GetIOProperties(io), SDL_PROP_IOSTREAM_DYNAMIC_MEMORY_POINTER, NULL);
        *png = n > 0 && data ? SDL_malloc((size_t)n) : NULL;
        if (*png) {
            memcpy(*png, data, (size_t)n);
            *size = (size_t)n;
        }
        ok = *png != NULL;
    }
    if (io) SDL_CloseIO(io);
    return ok;
}

void save_slot(game *g, int slot)
{
    const void *snap = hw_history_peek(&g->hist, 0);
    if (!snap || (slot >= 0 && !g->persist.dir[0])) return;
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
    void *png = NULL;
    size_t png_size = 0;
    if (thumbnail(g, &png, &png_size)) {
        info.thumb = png;
        info.thumb_size = (uint32_t)png_size;
    }
    hw_buf out = { 0 };
    char path[1100];
    if (slot >= 0) hw_persist_slot_path(&g->persist, slot, path, sizeof path);
    else snprintf(path, sizeof path, "%s", g->save_to);
    bool ok = hw_save_write(&g->vm, snap, pcs, n, &info, &out) && hw_persist_write(path, out.data, out.len);
    hw_buf_free(&out);
    SDL_free(png);
    g->slots_cached = false;
    save_global(g);
    notify(g, ok ? ui(g, UI_SAVED) : SDL_GetError());
}

bool load_slot(game *g, int slot)
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

static int cjk_group(const char *lang);

static void set_language(game *g, const char *lang)
{
    snprintf(g->lang, sizeof g->lang, "%s", lang);
    snprintf(g->settings.language, sizeof g->settings.language, "%s", lang);
    hw_vm_set_language(&g->vm, lang);
    if (g->fonts && g->fonts_group != cjk_group(lang)) open_fonts(g); /* Chinese and Japanese prefer different fonts */
    if (g->have_line) {
        float reveal = g->reveal;
        bool prompt = g->blk == B_MENU;
        show_line(g, g->line, prompt);
        g->reveal = reveal;
    }
    if (g->blk == B_MENU) layout_menu(g);
    /* An NVL page shows earlier lines too: lay them all out in the new language. */
    g->page_built = 0;
    if (g->vm_ready && g->vm.s.display.textbox == HW_TEXTBOX_NVL) layout_page(g);
}

void next_language(game *g)
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
    uint64_t t0 = SDL_GetTicksNS();
    size_t size = 0;
    bool packed = hw_vfs_pack_count(g->vfs) > 0;
    uint8_t *bytes = packed ? hw_vfs_load(g->vfs, "game.hwb", &size) : hw_read_file(g->game_path, &size);
    if (!bytes) {
        snprintf(err, cap, "can't read %s: %s", packed ? "game.hwb in the pack" : g->game_path, SDL_GetError());
        return false;
    }
    uint64_t t1 = SDL_GetTicksNS();
    bool ok = hw_module_load(out, bytes, size, err, cap);
    g->perf_load_ms = (double)(SDL_GetTicksNS() - t1) / 1e6;
    g->perf_read_ms = (double)(t1 - t0) / 1e6;
    g->perf_hwb_bytes = size;
    SDL_free(bytes);
    return ok;
}

static void link_reloaded(game *g, const char *result, const char *message)
{
    if (!g->link) return;
    hw_buf b = { 0 };
    hw_buf_printf(&b, "{\"ev\":\"reloaded\",\"result\":\"%s\",\"message\":", result);
    hw_json_put_str(&b, message);
    hw_buf_put(&b, "}", 1);
    if (b.data) hw_link_send(g->link, b.data);
    hw_buf_free(&b);
    g->link_state[0] = 0; /* report the state again, even if it looks the same */
}

void reload(game *g)
{
    char err[200], msg[300];
    hw_module fresh;
    if (!load_module(g, &fresh, err, sizeof err)) {
        snprintf(msg, sizeof msg, ui(g, UI_RELOAD_FAILED), err);
        notify(g, msg);
        link_reloaded(g, "failed", err);
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
        link_reloaded(g, "failed", "out of memory");
        return;
    }
    /* Read lines and globals survive by line ID and name. */
    for (uint32_t l = 0; l < g->m.line_count; l++) {
        if (!g->read_lines[l] || g->m.lines[l].line_id == HW_NONE) continue;
        for (uint32_t k = 0; k < fresh.line_count; k++) {
            if (fresh.lines[k].line_id == g->m.lines[l].line_id) read[k] = 1;
        }
    }
    /* Unlocks survive by asset name. */
    hw_unlocks unlocks;
    if (!hw_unlocks_build(&unlocks, &fresh)) memset(&unlocks, 0, sizeof unlocks);
    for (int list = 0; list < 2; list++) {
        uint32_t n = list ? g->unlocks.music_count : g->unlocks.cg_count;
        for (uint32_t i = 0; i < n; i++) {
            if (!(list ? g->unlocks.music_heard[i] : g->unlocks.cg_seen[i])) continue;
            uint32_t asset = hw_module_find_string(&fresh, hw_str(&g->m, list ? g->unlocks.music[i] : g->unlocks.cgs[i]));
            if (asset != HW_NONE) hw_unlock(&unlocks, list == 1, asset);
        }
    }
    hw_unlocks_free(&g->unlocks);
    g->unlocks = unlocks;
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
    bind_theme(g);
    bind_extensions(g);
    g->fonts_font = -1; /* the theme's font may have changed: open the fonts again */
    apply_settings(g);
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
    if (!g->link) notify(g, msg); /* Studio shows its own status */
    link_reloaded(g, !in_story ? "title" : r == HW_SAVE_EXACT ? "exact" : r == HW_SAVE_REMAPPED ? "remapped"
                     : r == HW_SAVE_FALLBACK ? "fallback" : "restarted",
                  r == HW_SAVE_BAD ? err : "");
}

/* ---- dev: warp, skip to the next menu, and the Studio link ---- */

/* Plays from `where` (a scene, file:line, or #lineid) with a state reconstructed along a real path. */
static bool warp_to(game *g, const char *where, char *msg, size_t cap)
{
    uint32_t target = hw_warp_target(&g->m, where);
    uint8_t *snap = SDL_malloc(hw_vm_snapshot_size(&g->vm));
    bool ok = target != HW_NONE && snap && hw_warp(&g->m, target, (uint64_t)SDL_GetTicksNS(), 0, snap);
    if (ok) {
        start_story(g); /* resets the presentation; then jump to the reconstructed state */
        hw_vm_restore(&g->vm, snap);
        hw_history_clear(&g->hist);
        reset_presentation(g);
        sync_audio(g);
        pump(g);
        SDL_Log("warp: %s", where);
    } else {
        snprintf(msg, cap, target == HW_NONE ? "warp: no line at %s" : "warp: no path reaches %s", where);
        SDL_Log("%s", msg);
    }
    SDL_free(snap);
    return ok;
}

/* Plays on, without waiting, until the next menu or the end. */
static void skip_to_menu(game *g)
{
    if (g->scr != SCR_PLAY) return;
    g->fast_forward = true;
    for (int i = 0; i < 20000 && g->scr == SCR_PLAY && g->blk != B_MENU && g->blk != B_DONE; i++) {
        if (g->blk == B_SAY) {
            finish_reveal(g);
            advance(g);
        } else if (g->blk == B_TRANS) {
            g->trans_active = false;
            g->blk = B_NONE;
            pump(g);
        } else if (g->blk == B_WAIT) {
            g->blk = B_NONE;
            pump(g);
        } else {
            pump(g);
        }
    }
    g->fast_forward = false;
    sync_audio(g);
}

static const char *screen_name(screen s)
{
    switch (s) {
    case SCR_TITLE: return "title";
    case SCR_PLAY: return "play";
    case SCR_SYSMENU: return "menu";
    case SCR_SLOTS: return "slots";
    case SCR_HISTORY: return "history";
    case SCR_CONFIRM_QUIT: return "confirm";
    case SCR_END: return "end";
    case SCR_ERROR: return "error";
    case SCR_CONFIG: return "config";
    case SCR_CONTROLS: return "controls";
    case SCR_A11Y: return "accessibility";
    case SCR_EXTRAS: return "extras";
    case SCR_GALLERY: return "gallery";
    case SCR_CG_VIEW: return "cg";
    case SCR_MUSIC: return "music";
    }
    return "play";
}

/* Sends {"ev":"state"} when what the player sees changes: the screen, the line, or waiting for a click. */
static void link_report(game *g)
{
    if (!g->link) return;
    hw_buf b = { 0 };
    hw_buf_printf(&b, "{\"ev\":\"state\",\"screen\":\"%s\",\"line\":", screen_name(g->scr));
    bool story = g->scr != SCR_TITLE;
    if (story && g->have_line && g->line < g->m.line_count && g->m.lines[g->line].line_id != HW_NONE) {
        char id[7];
        hw_line_id_format(g->m.lines[g->line].line_id, id);
        hw_buf_printf(&b, "\"%s\"", id);
    } else {
        hw_buf_put(&b, "null", 4);
    }
    bool waiting = (g->blk == B_SAY && g->reveal >= (float)g->text.chars) || g->blk == B_MENU;
    hw_buf_printf(&b, ",\"waiting\":%s,\"choice\":%s", story && waiting ? "true" : "false",
                  story && g->blk == B_MENU ? "true" : "false");
    if (g->scr == SCR_ERROR) {
        hw_buf_put(&b, ",\"error\":", 9);
        hw_json_put_str(&b, g->error);
    }
    hw_buf_put(&b, "}", 1);
    if (b.data && strcmp(b.data, g->link_state) != 0) {
        snprintf(g->link_state, sizeof g->link_state, "%s", b.data);
        hw_link_send(g->link, b.data);
    }
    hw_buf_free(&b);
}

/* Handles the commands Studio sent since the last frame (spec/debug-protocol.md). */
static void link_poll(game *g)
{
    char *line;
    while ((line = hw_link_poll(g->link)) != NULL) {
        char cmd[32], arg[512], msg[600];
        double x = 0, y = 0, w = 0, h = 0;
        if (!hw_json_str(line, "cmd", cmd, sizeof cmd)) {
            SDL_Log("link: ignored %.80s", line);
        } else if (strcmp(cmd, "bounds") == 0) {
            hw_json_num(line, "x", &x);
            hw_json_num(line, "y", &y);
            hw_json_num(line, "w", &w);
            hw_json_num(line, "h", &h);
            hw_link_place(g->win, (int)x, (int)y, (int)w, (int)h);
        } else if (strcmp(cmd, "reload") == 0) {
            reload(g);
        } else if (strcmp(cmd, "warp") == 0 && hw_json_str(line, "to", arg, sizeof arg)) {
            hw_buf b = { 0 };
            bool ok = warp_to(g, arg, msg, sizeof msg);
            hw_buf_printf(&b, "{\"ev\":\"warp\",\"ok\":%s,\"to\":", ok ? "true" : "false");
            hw_json_put_str(&b, arg);
            if (!ok) {
                hw_buf_put(&b, ",\"message\":", 11);
                hw_json_put_str(&b, msg);
            }
            hw_buf_put(&b, "}", 1);
            if (b.data) hw_link_send(g->link, b.data);
            hw_buf_free(&b);
        } else if (strcmp(cmd, "restart") == 0) {
            start_story(g);
        } else if (strcmp(cmd, "next_menu") == 0) {
            skip_to_menu(g);
        } else if (strcmp(cmd, "advance") == 0) {
            proceed(g);
        } else if (strcmp(cmd, "lang") == 0 && hw_json_str(line, "lang", arg, sizeof arg)) {
            char saved[sizeof g->settings.language];
            memcpy(saved, g->settings.language, sizeof saved);
            set_language(g, arg); /* for this run only, like --lang */
            memcpy(g->settings.language, saved, sizeof saved);
        } else if (strcmp(cmd, "quit") == 0) {
            g->running = false;
        } else {
            SDL_Log("link: unknown command %s", cmd);
        }
        SDL_free(line);
    }
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
    if (g->blk == B_EXT) {
        const hw_ext_statement *h = g->ext_active;
        if (!h || skip) ext_stop(g);
        else if (h->update(h->user, dt)) g->ext_active = NULL;
        if (!g->ext_active) g->blk = B_NONE;
    }
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
            static const double AUTO[5] = { 2.0, 1.5, 1.0, 0.7, 0.45 };
            double wait = (1.0 + 0.035 * t->chars) * AUTO[(g->settings.auto_speed >= 1 && g->settings.auto_speed <= 5 ? g->settings.auto_speed : 3) - 1];
            if (t->no_wait) advance(g);
            else if (may_skip_line(g) && g->now - g->done_at > 0.03) advance(g);
            else if (g->auto_mode && g->now - g->done_at > wait) advance(g);
        }
    }
    if (g->blk == B_NONE) pump(g);
}

/* ---- setup ---- */

/*
 * The text fonts: the theme's or the game's own (assets/fonts/main), then Windows fonts for
 * whatever they lack. The "easy to read" setting (§13) puts Verdana (wide, clear letterforms)
 * and UD Digi Kyokasho (Windows' universal-design Japanese font) first instead.
 */
/*
 * Which CJK font comes first: Chinese and Japanese share code points but not glyph shapes, and
 * Japanese fonts lack many simplified characters. 0 Japanese and everything else, 1 Simplified
 * Chinese, 2 Traditional Chinese.
 */
static int cjk_group(const char *lang)
{
    if (SDL_strncasecmp(lang, "zh", 2) != 0) return 0;
    return SDL_strcasestr(lang, "Hant") || SDL_strcasestr(lang, "-TW") || SDL_strcasestr(lang, "-HK") || SDL_strcasestr(lang, "-MO") ? 2 : 1;
}

void open_fonts(game *g)
{
    hw_font_source src[12];
    int n = 0;
    char own[1100], verdana[512], ud[512], segoe[512], yu[512], meiryo[512], yahei[512], jhenghei[512];
    static const char *const exts[] = { ".ttf", ".otf", ".ttc", NULL };
    const char *windir = SDL_getenv("WINDIR");
    if (!windir) windir = "C:/Windows";
    snprintf(verdana, sizeof verdana, "%s/Fonts/verdana.ttf", windir);
    snprintf(ud, sizeof ud, "%s/Fonts/UDDigiKyokashoN-R.ttc", windir);
    snprintf(segoe, sizeof segoe, "%s/Fonts/segoeui.ttf", windir);
    snprintf(yu, sizeof yu, "%s/Fonts/YuGothM.ttc", windir);
    snprintf(meiryo, sizeof meiryo, "%s/Fonts/meiryo.ttc", windir);
    snprintf(yahei, sizeof yahei, "%s/Fonts/msyh.ttc", windir);       /* Microsoft YaHei: Simplified Chinese */
    snprintf(jhenghei, sizeof jhenghei, "%s/Fonts/msjh.ttc", windir); /* Microsoft JhengHei: Traditional Chinese */
    if (g->settings.font == 1) {
        if (SDL_GetPathInfo(verdana, NULL)) src[n++] = (hw_font_source){ verdana, NULL };
        if (SDL_GetPathInfo(ud, NULL)) src[n++] = (hw_font_source){ ud, NULL };
    }
    const char *theme_font = hw_theme_str(&g->m, "font.main");
    if ((theme_font && hw_assets_find(g->assets, "", theme_font, exts, own, sizeof own)) ||
        hw_assets_find(g->assets, "fonts", "main", exts, own, sizeof own)) {
        hw_font_source s = { NULL, hw_vfs_open(g->vfs, own) }; /* the game's font may be in its pack */
        if (s.io) src[n++] = s;
    }
    src[n++] = (hw_font_source){ segoe, NULL };
    int group = cjk_group(g->lang);
    const char *const order[3][4] = { { yu, meiryo, yahei, jhenghei }, { yahei, jhenghei, yu, meiryo }, { jhenghei, yahei, yu, meiryo } };
    for (int i = 0; i < 4; i++) {
        if (SDL_GetPathInfo(order[group][i], NULL)) src[n++] = (hw_font_source){ order[group][i], NULL };
    }
    hw_fonts *f = hw_fonts_open_sources(g->ren, src, n);
    if (!f) return; /* keep the fonts we have */
    if (g->fonts) hw_fonts_close(g->fonts);
    g->fonts = f;
    g->fonts_font = g->settings.font;
    g->fonts_group = group;
}

/* The player picks a language (Config, the accessibility prompt): it's kept for next time. */
void choose_language(game *g, const char *lang)
{
    set_language(g, lang);
    save_global(g);
}

void stop_title_music(game *g)
{
    if (g->title_music && hw_theme_str(&g->m, "title.music")) hw_audio_stop(g->audio, HW_CHANNEL_MUSIC, 300);
}

/*
 * The player's settings take effect (plan §13): colors (high contrast), the textbox's opacity,
 * text size, line spacing, the font, volumes, full screen, and the language; then the text on
 * screen is laid out again.
 */
void apply_settings(game *g)
{
    const hw_settings *s = &g->settings;
    bind_theme(g);
    if (s->high_contrast) {
        g->pal = (hw_palette){ .accent = 0xffe000, .text = 0xffffff, .dim = 0xe8e8e8, .textbox = 0x000000, .nameplate = 0x000000,
                               .choice = 0x000000, .choice_hover = 0x1a3fbf, .choice_text = 0xffffff, .background = 0x000000,
                               .panel = 0x000000, .ink = 0x000000 };
        g->tb_alpha = 1.0f;
    } else if (s->textbox_opacity >= 0) {
        g->tb_alpha = (float)s->textbox_opacity / 100.0f;
    }
    static const float SIZE[4] = { 1.0f, 1.15f, 1.3f, 1.5f };
    static const float SPACING[3] = { 1.0f, 1.25f, 1.5f };
    g->text_px *= SIZE[s->text_size & 3u];
    hw_rich_set_line_spacing(SPACING[s->line_spacing % 3u]);
    if (g->fonts_font != s->font || g->fonts_group != cjk_group(g->lang)) open_fonts(g);
    for (int i = 0; i < 4; i++) hw_audio_set_volume(g->audio, i, s->volume[i]);
    static int fullscreen = -1;
    if (!g->link && fullscreen != (int)s->fullscreen) {
        SDL_SetWindowFullscreen(g->win, s->fullscreen);
        fullscreen = s->fullscreen;
    }
    if (g->have_line) {
        float reveal = g->reveal;
        layout_line(g);
        g->reveal = reveal;
    }
    if (g->blk == B_MENU) layout_menu(g);
    g->page_built = 0;
    if (g->vm_ready && g->vm.s.display.textbox == HW_TEXTBOX_NVL) layout_page(g);
}

/* Startup phases for --perf: when each one was done, in ms since the process started. */
typedef struct perf_mark { const char *name; double ms; } perf_mark;
static perf_mark marks[16];
static int mark_count;
static void mark(const char *name)
{
    if (mark_count < 16) marks[mark_count++] = (perf_mark){ name, hw_since_process_start_ms() };
}

static int cmp_double(const void *x, const void *y)
{
    double a = *(const double *)x, b = *(const double *)y;
    return a < b ? -1 : a > b;
}

/* --perf FILE: startup, frame CPU time, memory, and bytecode load time as JSON. */
static void write_perf(game *g, const char *path, double first_frame_ms, double *frame_ms, size_t n)
{
    /* The first frames include loading textures and fonts; the budget is for steady playing. */
    size_t skip = n > 30 ? 10 : 0;
    double avg = 0, p95 = 0, max = 0;
    if (n > skip) {
        for (size_t i = skip; i < n; i++) avg += frame_ms[i];
        avg /= (double)(n - skip);
        qsort(frame_ms + skip, n - skip, sizeof *frame_ms, cmp_double);
        p95 = frame_ms[skip + (size_t)((double)(n - skip - 1) * 0.95)];
        max = frame_ms[n - 1];
    }
    hw_buf b = { 0 };
    hw_buf_printf(&b,
                  "{\n  \"first_frame_ms\": %.1f,\n  \"frames\": %u,\n  \"frame_cpu_ms_avg\": %.3f,\n  \"frame_cpu_ms_p95\": %.3f,\n"
                  "  \"frame_cpu_ms_max\": %.3f,\n  \"peak_memory_mb\": %.1f,\n  \"hwb_bytes\": %u,\n  \"hwb_read_ms\": %.3f,\n"
                  "  \"hwb_load_ms\": %.3f,\n  \"gpu\": %s,\n  \"startup\": {",
                  first_frame_ms, (unsigned)(n - skip), avg, p95, max, hw_peak_memory_mb(), (unsigned)g->perf_hwb_bytes,
                  g->perf_read_ms, g->perf_load_ms, g->gpu ? "true" : "false");
    for (int i = 0; i < mark_count; i++) hw_buf_printf(&b, "%s\"%s\": %.1f", i ? ", " : "", marks[i].name, marks[i].ms);
    hw_buf_printf(&b, "}\n}\n");
    if (!b.data || !hw_write_file(path, b.data, b.len)) SDL_Log("perf: can't write %s", path);
    hw_buf_free(&b);
}

/* Whether any transition in the game is a rule wipe. */
static bool uses_rule_wipes(const hw_module *m)
{
    uint32_t rule = hw_module_find_string(m, "rule");
    if (rule == HW_NONE) return false;
    for (uint32_t pc = 0; pc < m->code_count; pc += 1 + hw_argc(m->code[pc])) {
        const uint32_t *a = &m->code[pc + 1];
        switch (hw_op(m->code[pc])) {
        case HW_OP_SHOW: case HW_OP_MOVE: if (a[2] == rule) return true; break;
        case HW_OP_HIDE: case HW_OP_BG: case HW_OP_CG: if (a[1] == rule) return true; break;
        default: break;
        }
    }
    return false;
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
    uint64_t parent = 0;
    bool link = false;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--dev") == 0) g->dev = true;
        if (strcmp(argv[i], "--frames") == 0) unattended = true;
        /* --link: the Studio debug pipe on stdin/stdout. --parent-window HWND: dock inside Studio's preview pane. */
        if (strcmp(argv[i], "--link") == 0) link = true;
        if (strcmp(argv[i], "--parent-window") == 0 && i + 1 < argc) parent = strtoull(argv[i + 1], NULL, 0);
    }
    if (project) g->dev = true; /* --project means a project folder: dev tools on */
    snprintf(g->game_path, sizeof g->game_path, "%s", game_path);

    mark("main");
    if (!SDL_Init(SDL_INIT_EVENTS | SDL_INIT_VIDEO)) return fatal(NULL, SDL_GetError());
    mark("sdl_video");
    if (!SDL_InitSubSystem(SDL_INIT_AUDIO)) SDL_Log("audio: %s", SDL_GetError());
    mark("sdl_audio");
    /* Gamepads start after the first frame (below): enumerating them takes ~200 ms (plan §8.1: start ≤ 250 ms). */
    char err[200];
    /* Files: a shipped game reads data.hwp (+ patches) beside it; otherwise loose files (spec/pack.md). */
    char dir[1100];
    snprintf(dir, sizeof dir, "%s", project ? project : game_path);
    if (!project) {
        char *slash = strrchr(dir, '/'), *bslash = strrchr(dir, '\\');
        if (bslash > slash) slash = bslash;
        if (slash) slash[1] = 0;
        else dir[0] = 0;
    }
    g->vfs = hw_vfs_create();
    if (!g->vfs) return fatal(NULL, "Out of memory.");
    size_t gl = strlen(game_path);
    if (gl > 4 && SDL_strcasecmp(game_path + gl - 4, ".hwp") == 0) {
        if (!hw_vfs_mount_packs(g->vfs, dir, err, sizeof err)) {
            char msg[400];
            snprintf(msg, sizeof msg, "Can't start the game.\n\n%s", err);
            SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, "Himawari", msg, NULL);
            SDL_Quit();
            return 2;
        }
    } else {
        hw_vfs_set_root(g->vfs, dir[0] ? dir : ".");
    }
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
    g->win = SDL_CreateWindow(hw_str(&g->m, g->m.title), ww, wh,
                              SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | (parent ? SDL_WINDOW_HIDDEN : 0));
    if (g->win && parent && !hw_link_embed(g->win, parent)) {
        SDL_Log("link: can't dock into window %llu; using a separate window", (unsigned long long)parent);
        parent = 0;
        SDL_ShowWindow(g->win);
    }
    /* The GPU renderer (~200 ms to start) is only needed for rule wipes (rfcs/0002). A shipped game that has none
     * starts on the default renderer (plan §8.1: start ≤ 250 ms); development runs always get it, so previews match. */
    bool allow_gpu = g->dev || uses_rule_wipes(&g->m);
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--no-gpu") == 0) allow_gpu = false;
        if (strcmp(argv[i], "--gpu") == 0) allow_gpu = true;
    }
    mark("window");
    g->ren = g->win ? hw_create_renderer(g->win, allow_gpu, &g->gpu) : NULL;
    mark("renderer");
    if (!g->ren) return fatal(NULL, SDL_GetError());
    SDL_SetRenderVSync(g->ren, 1);
    g->wipe = hw_rulewipe_open(g->ren, g->gpu);
    mark("rule_wipes");
    SDL_SetRenderLogicalPresentation(g->ren, (int)g->W, (int)g->H, SDL_LOGICAL_PRESENTATION_LETTERBOX);
    g->scene_tex = SDL_CreateTexture(g->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, (int)g->W, (int)g->H);
    g->prev_tex = SDL_CreateTexture(g->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, (int)g->W, (int)g->H);
    for (int i = 1; i < argc; i++) {
        /* --compare: frames are drawn at the game's own size, whatever the window, so goldens match on any PC. */
        if (strcmp(argv[i], "--compare") == 0) g->canvas_tex = SDL_CreateTexture(g->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, (int)g->W, (int)g->H);
    }
    SDL_SetTextureBlendMode(g->scene_tex, SDL_BLENDMODE_BLEND);
    SDL_SetTextureBlendMode(g->prev_tex, SDL_BLENDMODE_BLEND);

    g->assets = hw_assets_open(g->ren, g->vfs);
    g->fonts_font = -1;
    open_fonts(g);
    if (!g->assets || !g->fonts) return fatal(g->win, "No usable font was found (Segoe UI or Yu Gothic).");
    mark("fonts");
    g->audio = hw_audio_open(g->assets);
    mark("audio");

    g->read_lines = SDL_calloc(g->m.line_count > 0 ? g->m.line_count : 1, 1);
    g->option_text = SDL_calloc(HW_VM_MAX_OPTIONS, sizeof *g->option_text);
    if (!g->read_lines || !g->option_text || !hw_vm_init(&g->vm, &g->m, (uint64_t)SDL_GetTicksNS()) ||
        !hw_history_init(&g->hist, hw_vm_snapshot_size(&g->vm), HISTORY_DEPTH)) {
        return fatal(g->win, "Out of memory.");
    }
    g->vm_ready = true;
    g->vm.checkpoint = on_checkpoint;
    g->vm.checkpoint_user = g;
    hw_ext_register_all();
    bind_theme(g);
    bind_extensions(g);

    hw_settings_default(&g->settings);
    g->rebind = -1;
    g->music_track = HW_NONE;
    if (!hw_unlocks_build(&g->unlocks, &g->m)) return fatal(g->win, "Out of memory.");
    hw_persist_open(&g->persist, hw_str(&g->m, g->m.game_id));
    /* The log and crash reports go to the save folder; never for unattended runs, unless testing the crash handler. */
    bool crash_test = false;
    for (int i = 1; i < argc; i++) crash_test |= g->dev && strcmp(argv[i], "--crash-test") == 0;
    if (!unattended || crash_test) hw_crash_install(g->persist.dir, !unattended);
    /* Unattended runs (smoke tests, golden images, render_line) use the default settings, so results don't depend on this PC. */
    if (!unattended) hw_global_load(&g->persist, &g->m, &g->vm, g->read_lines, &g->unlocks, &g->settings);
    mark("global_data");
    pick_language(g);
    apply_settings(g);

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
    g->mx = g->my = -1; /* no hover until the pointer moves */
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
        /* --compare FILE: the last frame must match this golden image (HW_UPDATE_GOLDEN=1 writes it instead). */
        if (strcmp(argv[i], "--compare") == 0 && i + 1 < argc) shot = g->compare = argv[i + 1];
        /* --save-to FILE: save the last frame's state there (tests; never the player's own save folder). */
        if (strcmp(argv[i], "--save-to") == 0 && i + 1 < argc) g->save_to = argv[i + 1];
        if (strcmp(argv[i], "--start") == 0) start_story(g);
        if (strcmp(argv[i], "--warp") == 0 && i + 1 < argc) {
            char msg[600];
            if (!warp_to(g, argv[i + 1], msg, sizeof msg)) {
                notify(g, msg);
                if (unattended) warp_failed = true;
            }
        }
    }
    /* Smoke tests and golden images: --screen NAME opens a screen; --unlock-all fills the gallery and music room (in memory only). */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--unlock-all") == 0) {
            for (uint32_t k = 0; k < g->unlocks.cg_count; k++) g->unlocks.cg_seen[k] = 1;
            for (uint32_t k = 0; k < g->unlocks.music_count; k++) g->unlocks.music_heard[k] = 1;
        }
        if (strcmp(argv[i], "--screen") == 0 && i + 1 < argc) {
            static const struct { const char *name; screen scr; } SCREENS[] = {
                { "config", SCR_CONFIG }, { "controls", SCR_CONTROLS }, { "accessibility", SCR_A11Y }, { "extras", SCR_EXTRAS },
                { "gallery", SCR_GALLERY }, { "music", SCR_MUSIC }, { "load", SCR_SLOTS }, { "menu", SCR_SYSMENU }, { "history", SCR_HISTORY },
            };
            for (size_t k = 0; k < sizeof SCREENS / sizeof SCREENS[0]; k++) {
                if (strcmp(argv[i + 1], SCREENS[k].name) != 0) continue;
                g->back_to = g->scr == SCR_PLAY ? SCR_SYSMENU : SCR_TITLE;
                if (SCREENS[k].scr == SCR_SYSMENU || SCREENS[k].scr == SCR_HISTORY) g->back_to = SCR_PLAY;
                g->scr = SCREENS[k].scr;
            }
        }
    }
    /* The first-launch accessibility prompt (§13), before the title screen. Never in unattended runs or Studio's preview. */
    if (g->scr == SCR_TITLE && !g->settings.a11y_prompted && !unattended && !link) {
        g->scr = SCR_A11Y;
        g->back_to = SCR_TITLE;
    }
    if (crash_test) {
        SDL_Log("crash test: writing a crash report");
        volatile int *nowhere = NULL;
        *nowhere = 1; /* dev only: checks that a crash report gets written */
    }
    if (g->dev) SDL_Log("dev mode: F3 overlay, F5 reload %s", game_path);
    if (warp_failed) g->running = false;
    if (link) {
        g->link = hw_link_open();
        char ready[160];
        snprintf(ready, sizeof ready, "{\"ev\":\"ready\",\"protocol\":1,\"docked\":%s,\"gpu\":%s}",
                 parent ? "true" : "false", g->gpu ? "true" : "false");
        hw_link_send(g->link, ready);
    }

    /* --perf FILE: the runtime budgets of plan §8.1, measured on this run and written as JSON. */
    const char *perf = NULL;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--perf") == 0 && i + 1 < argc) perf = argv[i + 1];
    }
    double *frame_ms = perf ? SDL_calloc(100000, sizeof *frame_ms) : NULL;
    size_t frame_count = 0;
    double first_frame_ms = -1;
    while (g->running) {
        uint64_t frame_t0 = SDL_GetTicksNS();
        double t = (double)SDL_GetTicksNS() / 1e9;
        double dt = t - g->now;
        if (dt > 0.1) dt = 0.1;
        g->now = t;
        SDL_Event e;
        while (SDL_PollEvent(&e)) on_event(g, &e);
        if (g->link) link_poll(g);
        if (clicks > 0 && frames > 0 && frames % 20 == 0) {
            clicks--;
            if (g->blk == B_MENU) choose(g, pick >= 0 && (uint32_t)pick < g->option_count ? (uint32_t)pick : 0);
            else {
                finish_reveal(g);
                proceed(g);
            }
        }
        if (g->scr == SCR_TITLE && !g->title_music) {
            const char *music = hw_theme_str(&g->m, "title.music");
            if (music) hw_audio_play(g->audio, HW_CHANNEL_MUSIC, music, 500);
            g->title_music = true;
        }
        update(g, dt);
        link_report(g);
        if (shot && frames == 1) g->shot = shot;
        render(g); /* presents, which waits for vsync: CPU time is measured up to here minus that wait (see render) */
        if (frame_ms && frame_count < 100000) frame_ms[frame_count++] = (double)(g->present_at - frame_t0) / 1e6;
        if (first_frame_ms < 0) {
            first_frame_ms = hw_since_process_start_ms();
            mark("first_frame");
            /* Pads that are already connected arrive as "added" events. */
            if (!SDL_InitSubSystem(SDL_INIT_GAMEPAD)) SDL_Log("gamepads: %s", SDL_GetError());
            mark("gamepads");
        }
        if (frames == 1 && g->save_to) save_slot(g, -1);
        if (frames > 0 && --frames == 0) g->running = false;
    }

    if (perf) write_perf(g, perf, first_frame_ms, frame_ms, frame_count);
    SDL_free(frame_ms);
    save_global(g);
    hw_link_close(g->link);
    hw_crash_shutdown();
    hw_rich_free(&g->text);
    for (uint32_t i = 0; i < HW_VM_MAX_OPTIONS; i++) hw_rich_free(&g->option_text[i]);
    SDL_free(g->option_text);
    for (uint32_t i = 0; i < HW_VM_MAX_PAGE; i++) hw_rich_free(&g->page_text[i]);
    SDL_free(g->ext_of);
    if (g->name_fonts) hw_fonts_close(g->name_fonts);
    hw_unlocks_free(&g->unlocks);
    for (int s = 0; s <= HW_SLOTS; s++) {
        if (g->slot_thumb[s]) SDL_DestroyTexture(g->slot_thumb[s]);
    }
    if (g->pad) SDL_CloseGamepad(g->pad);
    SDL_free(g->read_lines);
    hw_history_free(&g->hist);
    hw_vm_free(&g->vm);
    hw_module_free(&g->m);
    hw_audio_close(g->audio);
    hw_fonts_close(g->fonts);
    hw_assets_close(g->assets);
    hw_vfs_destroy(g->vfs);
    SDL_DestroyTexture(g->scene_tex);
    SDL_DestroyTexture(g->prev_tex);
    if (g->canvas_tex) SDL_DestroyTexture(g->canvas_tex);
    hw_rulewipe_close(g->wipe);
    SDL_DestroyRenderer(g->ren);
    if (g->gpu) SDL_DestroyGPUDevice(g->gpu);
    SDL_DestroyWindow(g->win);
    SDL_Quit();
    return warp_failed ? 3 : g->compare_failed ? 4 : 0;
}
