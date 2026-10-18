/*
 * Himawari-C: the player's settings and extras screens (plan §8.10, §13):
 * Config, Controls (remapping), the first-launch accessibility prompt,
 * Extras, the CG gallery, and the music room. Everything works with the
 * mouse, the keyboard, or a gamepad: rows are buttons, and left/right change
 * the focused row's value.
 */
#include <SDL3/SDL.h>

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "hw_game_int.h"

/* ---- config rows ---- */

typedef enum cfg_row {
    CFG_LANGUAGE, CFG_TEXT_SPEED, CFG_AUTO_SPEED, CFG_TEXT_SIZE, CFG_LINE_SPACING, CFG_FONT, CFG_OPACITY, CFG_CONTRAST,
    CFG_MOTION, CFG_SKIP_UNREAD, CFG_FULLSCREEN, CFG_VOL_MUSIC, CFG_VOL_AMBIENT, CFG_VOL_SFX, CFG_VOL_VOICE, CFG_CONTROLS,
    CFG_COUNT
} cfg_row;

static const hw_ui_string CFG_LABEL[CFG_COUNT] = {
    UI_LANGUAGE, UI_TEXT_SPEED, UI_AUTO_SPEED, UI_TEXT_SIZE, UI_LINE_SPACING, UI_FONT, UI_TEXTBOX_OPACITY, UI_HIGH_CONTRAST,
    UI_REDUCE_MOTION, UI_SKIP_UNREAD, UI_FULLSCREEN, UI_VOLUME_MUSIC, UI_VOLUME_AMBIENT, UI_VOLUME_SFX, UI_VOLUME_VOICE, UI_CONTROLS,
};

static const float SPEEDS[5] = { 20, 40, 60, 100, 1000 };

static int speed_level(float cps)
{
    int k = 0;
    for (int i = 0; i < 5; i++) {
        if (SPEEDS[i] <= cps) k = i;
    }
    return k;
}

static int wrap(int v, int n) { return ((v % n) + n) % n; }

static const char *on_off(const game *g, bool on) { return ui(g, on ? UI_ON : UI_OFF); }

/* The value shown for a row. */
static void cfg_value(const game *g, cfg_row row, char *out, size_t cap)
{
    const hw_settings *s = &g->settings;
    static const char *const SIZES[4] = { "100%", "115%", "130%", "150%" };
    static const char *const SPACING[3] = { "1.0\xC3\x97", "1.25\xC3\x97", "1.5\xC3\x97" };
    switch (row) {
    case CFG_LANGUAGE: snprintf(out, cap, "%s", hw_language_name(g->lang)); break;
    case CFG_TEXT_SPEED: snprintf(out, cap, "%d / 5", speed_level(s->cps) + 1); break;
    case CFG_AUTO_SPEED: snprintf(out, cap, "%d / 5", (int)s->auto_speed); break;
    case CFG_TEXT_SIZE: snprintf(out, cap, "%s", SIZES[s->text_size & 3u]); break;
    case CFG_LINE_SPACING: snprintf(out, cap, "%s", SPACING[s->line_spacing % 3u]); break;
    case CFG_FONT: snprintf(out, cap, "%s", ui(g, s->font ? UI_FONT_READABLE : UI_FONT_DEFAULT)); break;
    case CFG_OPACITY:
        if (s->textbox_opacity < 0) snprintf(out, cap, "%s", ui(g, UI_DEFAULT));
        else snprintf(out, cap, "%d%%", (int)s->textbox_opacity);
        break;
    case CFG_CONTRAST: snprintf(out, cap, "%s", on_off(g, s->high_contrast)); break;
    case CFG_MOTION: snprintf(out, cap, "%s", on_off(g, s->reduce_motion)); break;
    case CFG_SKIP_UNREAD: snprintf(out, cap, "%s", on_off(g, s->skip_unread)); break;
    case CFG_FULLSCREEN: snprintf(out, cap, "%s", on_off(g, s->fullscreen)); break;
    case CFG_VOL_MUSIC: case CFG_VOL_AMBIENT: case CFG_VOL_SFX: case CFG_VOL_VOICE:
        snprintf(out, cap, "%d%%", (int)lroundf(s->volume[row - CFG_VOL_MUSIC] * 100.0f));
        break;
    case CFG_CONTROLS: snprintf(out, cap, "\xE2\x86\x92"); break; /* → */
    case CFG_COUNT: out[0] = 0; break;
    }
}

/* Changes a row's value by one step (dir -1 or +1; clicking a row steps forward and wraps). */
static void cfg_adjust(game *g, cfg_row row, int dir)
{
    hw_settings *s = &g->settings;
    switch (row) {
    case CFG_LANGUAGE: {
        uint32_t cur = 0, n = g->m.language_count;
        for (uint32_t i = 0; i < n; i++) {
            if (strcmp(hw_str(&g->m, g->m.languages[i]), g->lang) == 0) cur = i;
        }
        choose_language(g, hw_str(&g->m, g->m.languages[wrap((int)cur + dir, (int)n)]));
        return;
    }
    case CFG_TEXT_SPEED: s->cps = SPEEDS[wrap(speed_level(s->cps) + dir, 5)]; break;
    case CFG_AUTO_SPEED: s->auto_speed = (uint8_t)(wrap(s->auto_speed - 1 + dir, 5) + 1); break;
    case CFG_TEXT_SIZE: s->text_size = (uint8_t)wrap(s->text_size + dir, 4); break;
    case CFG_LINE_SPACING: s->line_spacing = (uint8_t)wrap(s->line_spacing + dir, 3); break;
    case CFG_FONT: s->font = (uint8_t)(s->font ? 0 : 1); break;
    case CFG_OPACITY: {
        /* Default, then 0 % to 100 % in steps of 10. */
        int step = s->textbox_opacity < 0 ? 0 : s->textbox_opacity / 10 + 1;
        step = wrap(step + dir, 12);
        s->textbox_opacity = (int8_t)(step == 0 ? -1 : (step - 1) * 10);
        break;
    }
    case CFG_CONTRAST: s->high_contrast = !s->high_contrast; break;
    case CFG_MOTION: s->reduce_motion = !s->reduce_motion; break;
    case CFG_SKIP_UNREAD: s->skip_unread = !s->skip_unread; break;
    case CFG_FULLSCREEN: s->fullscreen = !s->fullscreen; break;
    case CFG_VOL_MUSIC: case CFG_VOL_AMBIENT: case CFG_VOL_SFX: case CFG_VOL_VOICE: {
        float *v = &s->volume[row - CFG_VOL_MUSIC];
        int step = wrap((int)lroundf(*v * 10.0f) + dir, 11);
        *v = (float)step / 10.0f;
        break;
    }
    case CFG_CONTROLS:
        g->rebind = -1;
        g->scr = SCR_CONTROLS;
        g->focus = -1;
        return;
    case CFG_COUNT: return;
    }
    apply_settings(g);
    save_global(g);
}

/* One settings row: a button with the label on the left and the value on the right. */
static void cfg_button(game *g, SDL_FRect r, cfg_row row)
{
    int index = g->hit_count;
    if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, BTN_CFG + (int)row };
    bool hover = point_in(g->mx, g->my, r) || g->focus == index;
    fill(g, r, hover ? g->pal.choice_hover : g->pal.panel, hover ? 0.95f : 0.85f);
    if (hover) fill(g, (SDL_FRect){ r.x, r.y, sc(g, 6), r.h }, g->pal.accent, 1.0f);
    float base = r.y + r.h / 2 + sc(g, 28) * 0.36f;
    label(g, ui(g, CFG_LABEL[row]), 28, r.x + sc(g, 26), base, 0, hover ? col(g->pal.accent) : col(g->pal.text));
    char value[64];
    cfg_value(g, row, value, sizeof value);
    /* Not color alone: the focused row also has the bar on its left (§13). */
    label(g, value, 28, r.x + r.w - sc(g, 26), base, 2, col(g->pal.text));
}

static void back_button(game *g, int id)
{
    button(g, (SDL_FRect){ g->W / 2 - sc(g, 160), g->H - sc(g, 110), sc(g, 320), sc(g, 64) }, ui(g, id == BTN_CONTINUE ? UI_CONTINUE : UI_BACK), id,
           30, false);
}

void draw_config(game *g)
{
    dim_background(g, 0.88f);
    label(g, ui(g, UI_CONFIG), 52, g->W / 2, sc(g, 90), 1, col(g->pal.text));
    /* Two columns: reading on the left, sound and input on the right. */
    float w = g->W * 0.42f, h = sc(g, 64), gap = sc(g, 14);
    int shown = 0;
    for (int row = 0; row < CFG_COUNT; row++) {
        if (row == CFG_LANGUAGE && g->m.language_count < 2) continue;
        int column = row < CFG_MOTION ? 0 : 1;
        int slot = column == 0 ? shown : row - CFG_MOTION;
        if (column == 0) shown++;
        SDL_FRect r = { column == 0 ? g->W * 0.06f : g->W * 0.52f, sc(g, 150) + (float)slot * (h + gap), w, h };
        cfg_button(g, r, (cfg_row)row);
    }
    back_button(g, BTN_BACK);
}

void draw_a11y(game *g)
{
    dim_background(g, 0.92f);
    label(g, ui(g, UI_A11Y_PROMPT), 52, g->W / 2, sc(g, 110), 1, col(g->pal.text));
    hw_rich_text rt;
    memset(&rt, 0, sizeof rt);
    hw_rich_plain(&rt, ui(g, UI_A11Y_PROMPT_BODY));
    hw_rich_layout(&rt, g->fonts, g->W * 0.7f, sc(g, 30), g->lang);
    hw_rich_draw(g->fonts, &rt, (g->W - rt.width) / 2, sc(g, 150), 1e9f, 0, 1, col(g->pal.text), col(g->pal.ink), 2.0f);
    hw_rich_free(&rt);
    static const cfg_row rows[] = { CFG_LANGUAGE, CFG_TEXT_SIZE, CFG_FONT, CFG_LINE_SPACING, CFG_CONTRAST, CFG_MOTION, CFG_TEXT_SPEED };
    float y = sc(g, 290);
    for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
        if (rows[i] == CFG_LANGUAGE && g->m.language_count < 2) continue;
        cfg_button(g, (SDL_FRect){ g->W * 0.25f, y, g->W * 0.5f, sc(g, 64) }, rows[i]);
        y += sc(g, 78);
    }
    back_button(g, BTN_CONTINUE);
}

/* ---- controls ---- */

static const hw_ui_string ACTION_LABEL[ACT_COUNT] = {
    UI_ACTION_ADVANCE, UI_ACTION_BACK, UI_ACTION_UP, UI_ACTION_DOWN, UI_ACTION_LEFT, UI_ACTION_RIGHT, UI_ACTION_ROLLBACK,
    UI_ACTION_SKIP, UI_ACTION_AUTO, UI_ACTION_HISTORY, UI_ACTION_HIDE, UI_ACTION_QUICK_SAVE, UI_ACTION_QUICK_LOAD,
};

void draw_controls(game *g)
{
    dim_background(g, 0.9f);
    label(g, ui(g, UI_CONTROLS), 52, g->W / 2, sc(g, 80), 1, col(g->pal.text));
    float x0 = g->W * 0.12f, kx = g->W * 0.48f, px = g->W * 0.70f, cw = g->W * 0.20f, h = sc(g, 50), gap = sc(g, 8);
    float y = sc(g, 160);
    label(g, ui(g, UI_KEYBOARD), 24, kx + cw / 2, y - sc(g, 14), 1, col(g->pal.dim));
    label(g, ui(g, UI_GAMEPAD), 24, px + cw / 2, y - sc(g, 14), 1, col(g->pal.dim));
    const hw_bindings *b = &g->settings.bindings;
    for (int a = 0; a < ACT_COUNT; a++) {
        label(g, ui(g, ACTION_LABEL[a]), 26, x0, y + h / 2 + sc(g, 9), 0, col(g->pal.text));
        bool wait_key = g->rebind == a, wait_pad = g->rebind == ACT_COUNT + a;
        button(g, (SDL_FRect){ kx, y, cw, h }, wait_key ? "\xE2\x80\xA6" : hw_key_label(b->key[a]), BTN_BIND_KEY + a, 24, wait_key);
        button(g, (SDL_FRect){ px, y, cw, h }, wait_pad ? "\xE2\x80\xA6" : hw_pad_label(b->pad[a]), BTN_BIND_PAD + a, 24, wait_pad);
        y += h + gap;
    }
    if (g->rebind >= 0) {
        label(g, ui(g, UI_PRESS_KEY), 26, g->W / 2, y + sc(g, 30), 1, col(g->pal.accent));
    } else {
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 520), g->H - sc(g, 110), sc(g, 340), sc(g, 64) }, ui(g, UI_RESET_CONTROLS), BTN_RESET_CONTROLS, 26, false);
    }
    back_button(g, BTN_BACK);
}

/* ---- extras ---- */

void draw_extras(game *g)
{
    dim_background(g, 0.85f);
    label(g, ui(g, UI_EXTRAS), 56, g->W / 2, g->H * 0.25f, 1, col(g->pal.text));
    float y = g->H * 0.38f;
    if (g->unlocks.cg_count) {
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 240), y, sc(g, 480), sc(g, 70) }, ui(g, UI_GALLERY), BTN_GALLERY, 32, false);
        y += sc(g, 90);
    }
    if (g->unlocks.music_count) {
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 240), y, sc(g, 480), sc(g, 70) }, ui(g, UI_MUSIC_ROOM), BTN_MUSIC, 32, false);
    }
    back_button(g, BTN_BACK);
}

/* A picture scaled to fit `r` (cover), clipped. */
static void picture(game *g, SDL_Texture *t, SDL_FRect r)
{
    float tw, th;
    SDL_GetTextureSize(t, &tw, &th);
    float s = fmaxf(r.w / tw, r.h / th);
    SDL_FRect src = { (tw - r.w / s) / 2, (th - r.h / s) / 2, r.w / s, r.h / s };
    SDL_RenderTexture(g->ren, t, &src, &r);
}

#define GALLERY_COLUMNS 4
#define GALLERY_ROWS 3

void draw_gallery(game *g)
{
    dim_background(g, 0.92f);
    label(g, ui(g, UI_GALLERY), 52, g->W / 2, sc(g, 90), 1, col(g->pal.text));
    const hw_unlocks *u = &g->unlocks;
    float gap = sc(g, 24), cw = (g->W * 0.86f - gap * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS, ch = cw * g->H / g->W;
    int per_page = GALLERY_COLUMNS * GALLERY_ROWS;
    int max_scroll = u->cg_count > (uint32_t)per_page ? (int)((u->cg_count - (uint32_t)per_page + GALLERY_COLUMNS - 1) / GALLERY_COLUMNS) : 0;
    if (g->scroll > max_scroll) g->scroll = max_scroll;
    if (g->scroll < 0) g->scroll = 0;
    for (int k = 0; k < per_page; k++) {
        uint32_t i = (uint32_t)(g->scroll * GALLERY_COLUMNS + k);
        if (i >= u->cg_count) break;
        SDL_FRect r = { g->W * 0.07f + (float)(k % GALLERY_COLUMNS) * (cw + gap), sc(g, 140) + (float)(k / GALLERY_COLUMNS) * (ch + gap), cw, ch };
        if (!u->cg_seen[i]) {
            fill(g, r, g->pal.panel, 0.9f);
            label(g, ui(g, UI_LOCKED), 22, r.x + r.w / 2, r.y + r.h / 2 + sc(g, 8), 1, col(g->pal.dim));
            continue;
        }
        int index = g->hit_count;
        if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ r, BTN_CG + (int)i };
        bool hover = point_in(g->mx, g->my, r) || g->focus == index;
        SDL_Texture *t = hw_assets_image(g->assets, "cg", hw_str(&g->m, u->cgs[i]), NULL);
        if (t) picture(g, t, r);
        else fill(g, r, g->pal.choice, 1.0f);
        if (!t || hover) label(g, hw_str(&g->m, u->cgs[i]), 22, r.x + r.w / 2, r.y + r.h - sc(g, 14), 1, col(g->pal.text));
        if (hover) {
            SDL_FRect frame[4] = { { r.x, r.y, r.w, sc(g, 4) }, { r.x, r.y + r.h - sc(g, 4), r.w, sc(g, 4) },
                                   { r.x, r.y, sc(g, 4), r.h }, { r.x + r.w - sc(g, 4), r.y, sc(g, 4), r.h } };
            for (int f = 0; f < 4; f++) fill(g, frame[f], g->pal.accent, 1.0f);
        }
    }
    back_button(g, BTN_BACK);
}

void draw_cg_view(game *g)
{
    SDL_FRect all = { 0, 0, g->W, g->H };
    fill(g, all, 0x000000, 1.0f);
    const char *name = g->cg_view < g->unlocks.cg_count ? hw_str(&g->m, g->unlocks.cgs[g->cg_view]) : "";
    SDL_Texture *t = hw_assets_image(g->assets, "cg", name, NULL);
    if (t) picture(g, t, all);
    else label(g, name, 44, g->W / 2, g->H / 2, 1, col(g->pal.text));
    /* The whole screen is the button back to the gallery. */
    if (g->hit_count < MAX_HITS) g->hits[g->hit_count++] = (hit){ all, BTN_BACK };
}

void draw_music(game *g)
{
    dim_background(g, 0.9f);
    label(g, ui(g, UI_MUSIC_ROOM), 52, g->W / 2, sc(g, 90), 1, col(g->pal.text));
    const hw_unlocks *u = &g->unlocks;
    float y = sc(g, 150), h = sc(g, 58);
    for (uint32_t i = 0; i < u->music_count && y < g->H - sc(g, 200); i++) {
        SDL_FRect r = { g->W * 0.2f, y, g->W * 0.6f, h };
        y += h + sc(g, 10);
        if (!u->music_heard[i]) {
            fill(g, r, g->pal.panel, 0.7f);
            label(g, ui(g, UI_LOCKED), 26, r.x + sc(g, 26), r.y + h / 2 + sc(g, 9), 0, col(g->pal.dim));
            continue;
        }
        bool playing = g->music_track == i;
        char text[200];
        snprintf(text, sizeof text, "%s%s%s", hw_str(&g->m, u->music[i]), playing ? "   \xE2\x99\xAA " : "", playing ? ui(g, UI_NOW_PLAYING) : "");
        button(g, r, text, BTN_TRACK + (int)i, 26, playing);
    }
    if (g->music_track != HW_NONE) {
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 520), g->H - sc(g, 110), sc(g, 320), sc(g, 64) }, ui(g, UI_STOP), BTN_STOP_MUSIC, 28, false);
    }
    back_button(g, BTN_BACK);
}

/* ---- buttons ---- */

static void leave_music_room(game *g)
{
    if (g->music_track != HW_NONE) hw_audio_stop(g->audio, HW_CHANNEL_MUSIC, 500);
    g->music_track = HW_NONE;
    g->title_music = false; /* the title screen starts its music again */
}

bool menus_activate(game *g, int id)
{
    if (id >= BTN_CFG && id < BTN_CFG + CFG_COUNT) {
        cfg_adjust(g, (cfg_row)(id - BTN_CFG), 1);
        return true;
    }
    if (id >= BTN_BIND_KEY && id < BTN_BIND_KEY + ACT_COUNT) {
        g->rebind = id - BTN_BIND_KEY;
        return true;
    }
    if (id >= BTN_BIND_PAD && id < BTN_BIND_PAD + ACT_COUNT) {
        g->rebind = ACT_COUNT + (id - BTN_BIND_PAD);
        return true;
    }
    if (id >= BTN_CG && id < BTN_CG + (int)g->unlocks.cg_count) {
        g->cg_view = (uint32_t)(id - BTN_CG);
        g->scr = SCR_CG_VIEW;
        return true;
    }
    if (id >= BTN_TRACK && id < BTN_TRACK + (int)g->unlocks.music_count) {
        uint32_t i = (uint32_t)(id - BTN_TRACK);
        stop_title_music(g);
        hw_audio_play(g->audio, HW_CHANNEL_MUSIC, hw_str(&g->m, g->unlocks.music[i]), 300);
        g->music_track = i;
        return true;
    }
    switch (id) {
    case BTN_CONFIG:
        g->back_to = g->scr;
        g->scr = SCR_CONFIG;
        g->focus = -1;
        return true;
    case BTN_EXTRAS: g->scr = SCR_EXTRAS; g->focus = -1; return true;
    case BTN_GALLERY: g->scr = SCR_GALLERY; g->scroll = 0; g->focus = -1; return true;
    case BTN_MUSIC: g->scr = SCR_MUSIC; g->focus = -1; return true;
    case BTN_STOP_MUSIC: leave_music_room(g); return true;
    case BTN_RESET_CONTROLS:
        hw_bindings_default(&g->settings.bindings);
        save_global(g);
        return true;
    case BTN_CONTINUE:
        g->settings.a11y_prompted = true;
        save_global(g);
        g->scr = SCR_TITLE;
        g->focus = -1;
        return true;
    case BTN_BACK:
        switch (g->scr) {
        case SCR_CONFIG: g->scr = g->back_to == SCR_SYSMENU || g->back_to == SCR_TITLE ? g->back_to : SCR_TITLE; break;
        case SCR_CONTROLS: g->rebind = -1; g->scr = SCR_CONFIG; break;
        case SCR_A11Y: return menus_activate(g, BTN_CONTINUE);
        case SCR_EXTRAS: g->scr = SCR_TITLE; break;
        case SCR_GALLERY: g->scr = SCR_EXTRAS; break;
        case SCR_CG_VIEW: g->scr = SCR_GALLERY; break;
        case SCR_MUSIC: leave_music_room(g); g->scr = SCR_EXTRAS; break;
        default: return false;
        }
        g->focus = -1;
        return true;
    default:
        return false;
    }
}

bool menus_adjust(game *g, int id, int dir)
{
    if (id < BTN_CFG || id >= BTN_CFG + CFG_COUNT || id == BTN_CFG + CFG_CONTROLS) return false;
    cfg_adjust(g, (cfg_row)(id - BTN_CFG), dir);
    return true;
}
