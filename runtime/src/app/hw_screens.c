/*
 * Himawari-C: the player's screens (title, play, menus, saves, history) and
 * input. The story itself runs in hw_game.c.
 */
#include <SDL3/SDL.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_game_int.h"

/* ---- drawing the screens ---- */

/* An image a theme names by asset path ("ui/textbox"), or NULL. */
static SDL_Texture *theme_image(game *g, const char *key)
{
    const char *name = hw_theme_str(&g->m, key);
    if (!name) return NULL;
    char folder[256];
    snprintf(folder, sizeof folder, "%s", name);
    char *slash = strrchr(folder, '/');
    if (!slash) return hw_assets_image(g->assets, "", name, NULL);
    *slash = 0;
    return hw_assets_image(g->assets, folder, slash + 1, NULL);
}

/* A panel in the textbox color: the theme's nine-slice image when it has one. */
static void textbox_panel(game *g, SDL_FRect r, float alpha)
{
    SDL_Texture *img = theme_image(g, "textbox.image");
    if (img) {
        float l = (float)hw_theme_int(&g->m, "textbox.slice.left", 0), t = (float)hw_theme_int(&g->m, "textbox.slice.top", 0);
        float rr = (float)hw_theme_int(&g->m, "textbox.slice.right", 0), b = (float)hw_theme_int(&g->m, "textbox.slice.bottom", 0);
        SDL_SetTextureAlphaModFloat(img, alpha);
        SDL_RenderTexture9Grid(g->ren, img, NULL, l, rr, t, b, g->S, &r);
        SDL_SetTextureAlphaModFloat(img, 1.0f);
        return;
    }
    fill(g, r, g->pal.textbox, alpha);
}

/* The blinking "click to continue" mark. */
static void continue_mark(game *g, float x, float y)
{
    float a = 0.5f + 0.5f * sinf((float)g->now * 5.0f);
    fill(g, (SDL_FRect){ x, y, sc(g, 18), sc(g, 18) }, g->pal.accent, a);
}

/* The quick bar along the bottom right of `box`. */
static void quick_bar(game *g, SDL_FRect box)
{
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
        label(g, s, 22, r.x + r.w / 2, r.y + sc(g, 25), 1, items[i].on ? col(g->pal.accent) : hover ? col(g->pal.text) : col(g->pal.dim));
        /* "On" is shown by an underline too, not by color alone (§13). */
        if (items[i].on) fill(g, (SDL_FRect){ r.x + sc(g, 10), r.y + r.h - sc(g, 3), r.w - sc(g, 20), sc(g, 3) }, g->pal.accent, 1.0f);
    }
}

/* NVL (textbox nvl): the page's lines on a full-screen panel; the newest one types out. */
static void draw_page(game *g)
{
    const hw_display *d = &g->vm.s.display;
    SDL_FRect box = { g->W * 0.06f, g->H * 0.05f, g->W * 0.88f, g->H * 0.90f };
    textbox_panel(g, box, g->tb_alpha);
    float x = g->W * 0.12f, y = box.y + sc(g, g->tb_pad);
    uint32_t n = d->page_count < g->page_built ? d->page_count : g->page_built;
    for (uint32_t i = 0; i < n; i++) {
        const hw_rich_text *t = &g->page_text[i];
        uint32_t line = d->page[i];
        const char *name = g->m.lines[line].speaker ? hw_vm_speaker_name(&g->vm, line) : "";
        if (name[0]) {
            hw_text_draw(g->name_fonts ? g->name_fonts : g->fonts, name, sc(g, g->text_px * 0.8f), HW_TS_BOLD, x - sc(g, 12), y + sc(g, g->text_px * 0.9f), 2,
                         col(g->pal.accent), col(g->pal.ink), 2.0f);
        }
        bool newest = i + 1 == n && g->have_line && g->line == line;
        hw_rich_draw(g->fonts, t, x, y, newest ? g->reveal : 1e9f, (float)g->now, 1.0f, col(g->pal.text), col(g->pal.ink), 2.0f);
        y += t->layout.height + sc(g, g->text_px * 0.6f);
    }
    if (g->blk == B_SAY && g->reveal >= (float)g->text.chars) continue_mark(g, box.x + box.w - sc(g, 54), box.y + box.h - sc(g, 76));
    quick_bar(g, box);
}

static void draw_textbox(game *g)
{
    const hw_display *d = &g->vm.s.display;
    if (d->textbox == HW_TEXTBOX_NVL) {
        draw_page(g);
        return;
    }
    if (d->textbox_hidden && g->blk != B_MENU) return;
    float h = g->H * g->tb_height;
    SDL_FRect box = { g->W * 0.08f, g->H * 0.97f - h, g->W * 0.84f, h };
    textbox_panel(g, box, g->tb_alpha);
    if (!theme_image(g, "textbox.image")) fill(g, (SDL_FRect){ box.x, box.y, box.w, sc(g, 3) }, g->pal.accent, 0.7f);
    if (g->have_line) {
        if (g->speaker[0]) {
            hw_fonts *nf = g->name_fonts ? g->name_fonts : g->fonts;
            float w = hw_text_width(nf, g->speaker, sc(g, 34), HW_TS_BOLD) + sc(g, 48);
            SDL_FRect plate = { box.x + sc(g, 24), box.y - sc(g, 58), w, sc(g, 58) };
            fill(g, plate, g->pal.nameplate, fminf(1.0f, g->tb_alpha + 0.1f));
            fill(g, (SDL_FRect){ plate.x, plate.y + plate.h - sc(g, 4), plate.w, sc(g, 4) }, g->speaker_color, 1.0f);
            hw_text_draw(nf, g->speaker, sc(g, 34), HW_TS_BOLD, plate.x + sc(g, 24), plate.y + sc(g, 42), 0, col(g->pal.text), col(g->pal.ink), 2.0f);
        }
        hw_rich_draw(g->fonts, &g->text, box.x + sc(g, g->tb_pad), box.y + sc(g, 18), g->reveal, (float)g->now, 1.0f, col(g->pal.text), col(g->pal.ink), 2.0f);
        if (g->blk == B_SAY && g->reveal >= (float)g->text.chars) continue_mark(g, box.x + box.w - sc(g, 54), box.y + box.h - sc(g, 76));
    }
    quick_bar(g, box);
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
        fill(g, r, hover ? g->pal.choice_hover : g->pal.choice, hover ? 0.95f : 0.85f);
        if (hover) fill(g, (SDL_FRect){ r.x, r.y, sc(g, 6), r.h }, g->pal.accent, 1.0f);
        const hw_rich_text *t = &g->option_text[i];
        float ty = r.y + (r.h - t->layout.height) / 2 - sc(g, 4);
        hw_rich_draw(g->fonts, t, r.x + (r.w - t->width) / 2, ty, 1e9f, (float)g->now, 1.0f, hover ? col(g->pal.accent) : col(g->pal.choice_text), col(g->pal.ink), 2.0f);
        y += bh + gap;
    }
}

static void draw_title(game *g)
{
    SDL_Texture *t = theme_image(g, "title.background");
    if (!t) t = hw_assets_image(g->assets, "bg", "title", NULL);
    if (t) {
        SDL_FRect all = { 0, 0, g->W, g->H };
        SDL_RenderTexture(g->ren, t, NULL, &all);
    } else {
        gradient(g, (SDL_FRect){ 0, 0, g->W, g->H }, 0x2b3a67, g->pal.background, 1.0f);
    }
    hw_text_draw(g->fonts, hw_str(&g->m, g->m.title), sc(g, 88), HW_TS_BOLD, g->W / 2, g->H * 0.28f, 1, col(g->pal.text), col(g->pal.ink), 4.0f);
    char lang[64];
    snprintf(lang, sizeof lang, "%s: %s", ui(g, UI_LANGUAGE), hw_language_name(g->lang));
    const char *labels[] = { ui(g, UI_START), ui(g, UI_LOAD), ui(g, UI_CONFIG), ui(g, UI_EXTRAS), lang, ui(g, UI_QUIT) };
    int ids[] = { BTN_START, BTN_LOAD, BTN_CONFIG, BTN_EXTRAS, BTN_LANGUAGE, BTN_QUIT };
    float y = g->H * 0.40f;
    for (int i = 0; i < 6; i++) {
        if (ids[i] == BTN_LANGUAGE && g->m.language_count < 2) continue;
        if (ids[i] == BTN_EXTRAS && g->unlocks.cg_count == 0 && g->unlocks.music_count == 0) continue;
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 220), y, sc(g, 440), sc(g, 66) }, labels[i], ids[i], 32, false);
        y += sc(g, 82);
    }
}

/* Behind the menus: the theme's menu background, else the story dimmed. */
void dim_background(game *g, float a)
{
    /* Over the title screen, cover its buttons so they don't show through. */
    bool over_title = g->scr == SCR_EXTRAS || g->scr == SCR_GALLERY || g->scr == SCR_MUSIC || g->scr == SCR_A11Y ||
                      ((g->scr == SCR_CONFIG || g->scr == SCR_CONTROLS || g->scr == SCR_SLOTS || g->scr == SCR_CONFIRM_QUIT) && g->back_to == SCR_TITLE);
    if (over_title && a < 0.96f) a = 0.96f;
    SDL_Texture *t = theme_image(g, "menu.background");
    if (t) {
        SDL_FRect all = { 0, 0, g->W, g->H };
        SDL_RenderTexture(g->ren, t, NULL, &all);
        a *= 0.5f;
    }
    fill(g, (SDL_FRect){ 0, 0, g->W, g->H }, g->pal.background, a);
}

static void draw_sysmenu(game *g)
{
    dim_background(g, 0.7f);
    const char *labels[] = { ui(g, UI_RESUME), ui(g, UI_SAVE), ui(g, UI_LOAD), ui(g, UI_HISTORY), ui(g, UI_CONFIG), ui(g, UI_TITLE), ui(g, UI_QUIT) };
    int ids[] = { BTN_RESUME, BTN_SAVE, BTN_LOAD, BTN_HISTORY, BTN_CONFIG, BTN_TITLE, BTN_QUIT };
    float y = g->H * 0.14f;
    for (int i = 0; i < 7; i++) {
        button(g, (SDL_FRect){ g->W / 2 - sc(g, 260), y, sc(g, 520), sc(g, 68) }, labels[i], ids[i], 32, false);
        y += sc(g, 88);
    }
}

/* Reads every slot's header and thumbnail once, when the save screen opens or after a save. */
static void cache_slots(game *g)
{
    if (g->slots_cached) return;
    for (int s = 0; s <= HW_SLOTS; s++) {
        if (g->slot_thumb[s]) SDL_DestroyTexture(g->slot_thumb[s]);
        g->slot_thumb[s] = NULL;
        g->slot_used[s] = false;
        char path[1100];
        hw_persist_slot_path(&g->persist, s, path, sizeof path);
        size_t size = 0;
        uint8_t *data = g->persist.dir[0] ? SDL_LoadFile(path, &size) : NULL;
        hw_save_info info;
        if (data && hw_save_peek(data, size, &info)) {
            g->slot_used[s] = true;
            if (info.thumb) {
                SDL_Surface *png = SDL_LoadPNG_IO(SDL_IOFromConstMem(info.thumb, info.thumb_size), true);
                if (png) {
                    g->slot_thumb[s] = SDL_CreateTextureFromSurface(g->ren, png);
                    SDL_DestroySurface(png);
                }
            }
            info.thumb = NULL; /* it pointed into `data` */
            info.thumb_size = 0;
            g->slot_info[s] = info;
        }
        SDL_free(data);
    }
    g->slots_cached = true;
}

static void draw_slots(game *g)
{
    cache_slots(g);
    dim_background(g, 0.85f);
    label(g, ui(g, g->slots_saving ? UI_SAVE : UI_LOAD), 56, g->W / 2, sc(g, 100), 1, col(g->pal.text));
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
        fill(g, r, hover ? g->pal.choice_hover : g->pal.choice, 0.92f);
        if (hover) fill(g, (SDL_FRect){ r.x, r.y, sc(g, 6), r.h }, g->pal.accent, 1.0f);
        /* The thumbnail on the left (16:9), the text beside it. */
        float tw = ch * 16.0f / 9.0f * 0.82f, th = tw * 9.0f / 16.0f;
        SDL_FRect thumb = { r.x + sc(g, 16), r.y + (ch - th) / 2, tw, th };
        float tx = thumb.x + tw + sc(g, 20);
        char title[64];
        if (s == HW_SLOT_QUICK) snprintf(title, sizeof title, "%s", ui(g, UI_QUICK_SLOT));
        else snprintf(title, sizeof title, ui(g, UI_SLOT), s);
        if (g->slot_used[s]) {
            if (g->slot_thumb[s]) SDL_RenderTexture(g->ren, g->slot_thumb[s], NULL, &thumb);
            else fill(g, thumb, g->pal.panel, 1.0f);
            const hw_save_info *info = &g->slot_info[s];
            label(g, title, 28, tx, r.y + sc(g, 42), 0, hover ? col(g->pal.accent) : col(g->pal.text));
            SDL_DateTime dt;
            char when[96] = "";
            if (SDL_TimeToDateTime((SDL_Time)info->time * SDL_NS_PER_SECOND, &dt, true)) {
                snprintf(when, sizeof when, "%04d-%02d-%02d %02d:%02d   %u:%02u:%02u", dt.year, dt.month, dt.day, dt.hour,
                         dt.minute, info->playtime_s / 3600, info->playtime_s / 60 % 60, info->playtime_s % 60);
            }
            label(g, when, 20, tx, r.y + sc(g, 76), 0, col(g->pal.dim));
            char preview[160];
            snprintf(preview, sizeof preview, "%.34s", info->preview);
            label(g, preview, 22, tx, r.y + sc(g, 122), 0, col(g->pal.text));
        } else {
            label(g, title, 28, r.x + sc(g, 24), r.y + sc(g, 44), 0, hover ? col(g->pal.accent) : col(g->pal.text));
            label(g, ui(g, UI_EMPTY_SLOT), 24, r.x + sc(g, 24), r.y + sc(g, 100), 0, col(g->pal.dim));
        }
    }
    button(g, (SDL_FRect){ g->W / 2 - sc(g, 160), g->H - sc(g, 110), sc(g, 320), sc(g, 64) }, ui(g, UI_BACK), BTN_BACK, 30, false);
}

static void draw_history(game *g)
{
    dim_background(g, 0.88f);
    label(g, ui(g, UI_HISTORY), 52, g->W / 2, sc(g, 90), 1, col(g->pal.text));
    if (g->backlog_count == 0) label(g, ui(g, UI_HISTORY_EMPTY), 30, g->W / 2, g->H / 2, 1, col(g->pal.dim));
    float y = g->H - sc(g, 170);
    for (int i = g->backlog_count - 1 - g->history_scroll; i >= 0 && y > sc(g, 140); i--) {
        int slot = (g->backlog_start + i) % BACKLOG;
        const backlog_entry *e = &g->backlog[slot];
        /* Voice replay (plan §8.10): a button before lines that have a voice. */
        if (e->has_voice) {
            SDL_FRect r = { g->W * 0.04f, y - sc(g, 34), sc(g, 64), sc(g, 44) };
            button(g, r, "\xE2\x96\xB6", BTN_VOICE + slot, 22, false); /* ▶ */
        }
        if (e->name[0]) label(g, e->name, 26, g->W * 0.1f, y, 0, col(g->pal.accent));
        char text[160];
        snprintf(text, sizeof text, "%.120s", e->text);
        label(g, text, 26, g->W * 0.24f, y, 0, col(g->pal.text));
        y -= sc(g, 52);
    }
    button(g, (SDL_FRect){ g->W / 2 - sc(g, 160), g->H - sc(g, 110), sc(g, 320), sc(g, 64) }, ui(g, UI_BACK), BTN_BACK, 30, false);
}

static void draw_center_card(game *g, const char *title, const char *body, const char *detail)
{
    dim_background(g, 0.78f);
    label(g, title, 54, g->W / 2, g->H * 0.38f, 1, col(g->pal.text));
    if (body) {
        hw_rich_text rt;
        memset(&rt, 0, sizeof rt);
        hw_rich_plain(&rt, body);
        hw_rich_layout(&rt, g->fonts, g->W * 0.7f, sc(g, 30), g->lang);
        hw_rich_draw(g->fonts, &rt, (g->W - rt.width) / 2, g->H * 0.44f, 1e9f, 0, 1, col(g->pal.text), col(g->pal.ink), 2.0f);
        hw_rich_free(&rt);
    }
    if (detail) label(g, detail, 24, g->W / 2, g->H * 0.80f, 1, col(g->pal.dim));
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
    label(g, line, 20, r.x + sc(g, 14), y, 0, col(g->pal.accent));
    y += sc(g, 28);
    snprintf(line, sizeof line, "pc %u  stack %u  calls %u  rewind %u  lang %s", (unsigned)pc, (unsigned)g->vm.s.sp,
             (unsigned)g->vm.s.fp, (unsigned)g->hist.count, g->lang);
    label(g, line, 20, r.x + sc(g, 14), y, 0, col(g->pal.text));
    y += sc(g, 28);
    if (g->vm.div_by_zero) {
        snprintf(line, sizeof line, "divisions by zero: %u", (unsigned)g->vm.div_by_zero);
        label(g, line, 20, r.x + sc(g, 14), y, 0, col(g->pal.accent));
        y += sc(g, 28);
    }
    for (int c = 0; c < 4; c++) {
        static const char *const names[4] = { "music", "ambient", "sfx", "voice" };
        const char *missing = hw_audio_missing(g->audio, c);
        if (!missing || c == HW_CHANNEL_VOICE) continue;
        snprintf(line, sizeof line, "%s file %s (silence)", names[c], missing);
        label(g, line, 20, r.x + sc(g, 14), y, 0, col(g->pal.dim));
        y += sc(g, 28);
    }
    for (uint32_t i = 0; i < g->m.var_count && y < r.y + r.h - sc(g, 10); i++) {
        char v[64];
        hw_vm_value_text(&g->vm, i, g->vm.vars[i], v, sizeof v);
        snprintf(line, sizeof line, "%s = %s%s", hw_str(&g->m, g->m.vars[i].name), v, g->m.vars[i].scope == HW_SCOPE_GLOBAL ? "  (global)" : "");
        label(g, line, 20, r.x + sc(g, 14), y, 0, col(g->pal.text));
        y += sc(g, 26);
    }
}

/*
 * Golden images (plan §16.1): a pixel differs when any channel differs by more than 24/255; the frame
 * matches when at most 0.5 % of pixels differ. That absorbs font antialiasing and GPU filtering
 * differences between machines, and still catches real changes in layout, color, or what's drawn.
 */
static bool compare_golden(SDL_Surface *frame, const char *path)
{
    SDL_Surface *ref = SDL_LoadSurface(path);
    SDL_Surface *a = frame ? SDL_ConvertSurface(frame, SDL_PIXELFORMAT_RGBA32) : NULL;
    SDL_Surface *b = ref ? SDL_ConvertSurface(ref, SDL_PIXELFORMAT_RGBA32) : NULL;
    bool ok = false;
    if (!a || !b) {
        SDL_Log("golden: can't read %s: %s", path, SDL_GetError());
    } else if (a->w != b->w || a->h != b->h) {
        SDL_Log("golden: %s is %dx%d, the frame is %dx%d", path, b->w, b->h, a->w, a->h);
    } else {
        uint64_t differ = 0, total = 0;
        for (int y = 0; y < a->h; y++) {
            const uint8_t *pa = (const uint8_t *)a->pixels + (size_t)y * (size_t)a->pitch;
            const uint8_t *pb = (const uint8_t *)b->pixels + (size_t)y * (size_t)b->pitch;
            for (int x = 0; x < a->w * 4; x += 4) {
                int d = 0;
                for (int c = 0; c < 3; c++) {
                    int v = abs((int)pa[x + c] - (int)pb[x + c]);
                    if (v > d) d = v;
                }
                total += (uint64_t)d;
                differ += d > 24;
            }
        }
        double share = 100.0 * (double)differ / ((double)a->w * a->h);
        ok = share <= 0.5;
        SDL_Log("golden: %s: %.3f %% of pixels differ, mean difference %.2f: %s", path, share, (double)total / ((double)a->w * a->h),
                ok ? "match" : "MISMATCH");
    }
    SDL_DestroySurface(a);
    SDL_DestroySurface(b);
    SDL_DestroySurface(ref);
    return ok;
}

void render(game *g)
{
    g->hit_count = 0;
    SDL_SetRenderDrawColor(g->ren, 0, 0, 0, 255);
    SDL_RenderClear(g->ren);
    /* Screens over the story draw the scene behind them; the others draw over the title screen. */
    bool from_story = g->back_to != SCR_TITLE;
    bool story = g->scr == SCR_PLAY || g->scr == SCR_SYSMENU || g->scr == SCR_HISTORY || g->scr == SCR_END || g->scr == SCR_ERROR ||
                 ((g->scr == SCR_SLOTS || g->scr == SCR_CONFIRM_QUIT || g->scr == SCR_CONFIG || g->scr == SCR_CONTROLS) && from_story);
    if (!story) {
        draw_title(g);
        if (g->scr != SCR_TITLE) g->hit_count = 0; /* the screens below own the clicks */
        if (g->scr == SCR_CONFIRM_QUIT) {
            draw_center_card(g, ui(g, UI_CONFIRM_QUIT), NULL, NULL);
            button(g, (SDL_FRect){ g->W / 2 - sc(g, 300), g->H * 0.5f, sc(g, 260), sc(g, 68) }, ui(g, UI_YES), BTN_YES, 32, false);
            button(g, (SDL_FRect){ g->W / 2 + sc(g, 40), g->H * 0.5f, sc(g, 260), sc(g, 68) }, ui(g, UI_NO), BTN_NO, 32, false);
        }
    } else {
        render_scene(g, &g->shown, g->scene_tex);
        compose_scene(g);
        /* Extension statements draw over the scene, under the textbox. */
        for (uint32_t i = 0; g->ext_of && i < g->m.ext_count; i++) {
            const hw_ext_statement *h = g->ext_of[i];
            if (h && h->draw) h->draw(h->user, g->ren, g->W, g->H, g->now);
        }
        if (g->now < g->flash_until) fill(g, (SDL_FRect){ 0, 0, g->W, g->H }, 0xffffff, (float)((g->flash_until - g->now) / g->flash_dur));
        bool ui_visible = g->scr == SCR_PLAY && !g->trans_active && !g->ui_hidden;
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
    switch (g->scr) {
    case SCR_CONFIG: draw_config(g); break;
    case SCR_CONTROLS: draw_controls(g); break;
    case SCR_A11Y: draw_a11y(g); break;
    case SCR_EXTRAS: draw_extras(g); break;
    case SCR_GALLERY: draw_gallery(g); break;
    case SCR_CG_VIEW: draw_cg_view(g); break;
    case SCR_MUSIC: draw_music(g); break;
    default: break;
    }
    if (g->overlay && g->dev && story) draw_overlay(g);
    if (g->now < g->notice_until) {
        float w = hw_text_width(g->fonts, g->notice, sc(g, 26), 0) + sc(g, 48);
        if (w > g->W * 0.9f) w = g->W * 0.9f;
        SDL_FRect r = { (g->W - w) / 2, sc(g, 24), w, sc(g, 54) };
        fill(g, r, g->pal.panel, 0.92f);
        label(g, g->notice, 26, g->W / 2, r.y + sc(g, 37), 1, col(g->pal.text));
    }
    if (g->shot) {
        SDL_Surface *shot = SDL_RenderReadPixels(g->ren, NULL);
        if (g->compare && shot) {
            /* A fixed size, whatever the display's size and scaling. */
            SDL_Surface *fixed = SDL_ScaleSurface(shot, 960, (int)(960.0f * g->H / g->W), SDL_SCALEMODE_LINEAR);
            SDL_DestroySurface(shot);
            shot = fixed;
        }
        if (g->compare && !SDL_getenv("HW_UPDATE_GOLDEN")) {
            g->compare_failed = !compare_golden(shot, g->compare);
        } else if (!shot || !SDL_SavePNG(shot, g->shot)) {
            SDL_Log("screenshot: %s", SDL_GetError());
        }
        SDL_DestroySurface(shot);
        g->shot = NULL;
    }
    g->present_at = SDL_GetTicksNS(); /* everything up to here is CPU work; presenting waits for vsync */
    SDL_RenderPresent(g->ren);
    memcpy(g->last_hits, g->hits, sizeof g->hits);
    g->last_hit_count = g->hit_count;
}

/* ---- input ---- */

static void open_slots(game *g, bool saving)
{
    g->slots_saving = saving;
    g->slots_cached = false;
    if (g->scr != SCR_SLOTS) g->back_to = g->scr == SCR_SYSMENU ? SCR_SYSMENU : g->scr;
    g->scr = SCR_SLOTS;
    g->focus = -1;
}

void activate(game *g, int id)
{
    if (menus_activate(g, id)) return;
    switch (id) {
    case BTN_START: start_story(g); break;
    case BTN_LOAD: open_slots(g, false); break;
    case BTN_SAVE: if (g->vm_ready && g->hist.count > 0) open_slots(g, true); break;
    case BTN_LANGUAGE: next_language(g); break;
    case BTN_QUIT: g->back_to = g->scr; g->scr = SCR_CONFIRM_QUIT; break;
    case BTN_YES: g->running = false; break;
    case BTN_NO: g->scr = g->back_to; break;
    case BTN_RESUME: g->scr = SCR_PLAY; break;
    case BTN_MENU: g->scr = SCR_SYSMENU; g->focus = -1; break;
    case BTN_HISTORY: g->back_to = g->scr; g->history_scroll = 0; g->scr = SCR_HISTORY; break;
    case BTN_TITLE:
        end_story(g);
        g->scr = SCR_TITLE;
        break;
    case BTN_BACK: g->scr = g->back_to == SCR_SLOTS || g->back_to == SCR_HISTORY ? SCR_PLAY : g->back_to; break;
    case BTN_AUTO: g->auto_mode = !g->auto_mode; break;
    case BTN_SKIP: g->skip_mode = !g->skip_mode; break;
    case BTN_ROLLBACK: rollback(g); break;
    default:
        if (id >= BTN_SLOT && id <= BTN_SLOT + HW_SLOTS) {
            int slot = id - BTN_SLOT;
            if (g->slots_saving) {
                save_slot(g, slot);
                g->slots_cached = false;
                g->scr = SCR_PLAY;
            } else {
                load_slot(g, slot);
            }
        } else if (id >= BTN_OPTION && id < BTN_OPTION + HW_VM_MAX_OPTIONS) {
            choose(g, (uint32_t)(id - BTN_OPTION));
        } else if (id >= BTN_VOICE && id < BTN_VOICE + BACKLOG) {
            const backlog_entry *e = &g->backlog[id - BTN_VOICE];
            char lid[7];
            hw_line_id_format(e->line_id, lid);
            hw_audio_line_voice(g->audio, g->lang, lid);
        }
        break;
    }
}

/* Click or Enter in the story: finish what is moving, else go on. */
void proceed(game *g)
{
    if (g->scr == SCR_END || g->scr == SCR_ERROR) {
        g->scr = SCR_TITLE;
        return;
    }
    if (g->scr != SCR_PLAY) return;
    if (g->ui_hidden) {
        g->ui_hidden = false; /* the first click brings the textbox back */
        return;
    }
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
    } else if (g->blk == B_EXT && g->ext_active && g->ext_active->click) {
        g->ext_active->click(g->ext_active->user); /* the statement decides when it's done (update) */
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
    if (g->ui_hidden) {
        g->ui_hidden = false;
        return;
    }
    switch (g->scr) {
    case SCR_PLAY: g->scr = SCR_SYSMENU; g->focus = -1; break;
    case SCR_SYSMENU: g->scr = SCR_PLAY; break;
    case SCR_SLOTS: case SCR_HISTORY: activate(g, BTN_BACK); break;
    case SCR_CONFIRM_QUIT: g->scr = g->back_to; break;
    case SCR_TITLE: g->back_to = SCR_TITLE; g->scr = SCR_CONFIRM_QUIT; break;
    case SCR_CONFIG: case SCR_CONTROLS: case SCR_A11Y: case SCR_EXTRAS: case SCR_GALLERY: case SCR_CG_VIEW: case SCR_MUSIC:
        menus_activate(g, BTN_BACK);
        break;
    default: g->scr = SCR_TITLE; break;
    }
}

static void move_focus(game *g, int dir)
{
    if (g->last_hit_count <= 0) return;
    if (g->focus < 0) g->focus = dir > 0 ? 0 : g->last_hit_count - 1;
    else g->focus = (g->focus + dir + g->last_hit_count) % g->last_hit_count;
}

/* One action from the keyboard or a gamepad (plan §13: everything works with one input method). */
static void do_action(game *g, hw_action a)
{
    bool play = g->scr == SCR_PLAY;
    switch (a) {
    case ACT_ADVANCE:
        if (g->focus >= 0 && g->focus < g->last_hit_count) activate(g, g->last_hits[g->focus].id);
        else if (g->scr == SCR_CG_VIEW) escape(g);
        else proceed(g);
        break;
    case ACT_BACK: escape(g); break;
    case ACT_UP: move_focus(g, -1); break;
    case ACT_DOWN: move_focus(g, 1); break;
    case ACT_LEFT: case ACT_RIGHT: {
        int id = g->focus >= 0 && g->focus < g->last_hit_count ? g->last_hits[g->focus].id : 0;
        if (!menus_adjust(g, id, a == ACT_LEFT ? -1 : 1)) move_focus(g, a == ACT_LEFT ? -1 : 1);
        break;
    }
    case ACT_ROLLBACK: if (play) rollback(g); break;
    case ACT_SKIP:
        if (play && g->blk != B_MENU) g->skip_mode = !g->skip_mode;
        else move_focus(g, 1);
        break;
    case ACT_AUTO: if (play) g->auto_mode = !g->auto_mode; break;
    case ACT_HISTORY: if (play) activate(g, BTN_HISTORY); break;
    case ACT_HIDE: if (play) g->ui_hidden = !g->ui_hidden; break;
    case ACT_QUICK_SAVE: if (play) save_slot(g, HW_SLOT_QUICK); break;
    case ACT_QUICK_LOAD: if (g->vm_ready) load_slot(g, HW_SLOT_QUICK); break;
    case ACT_NONE: case ACT_COUNT: break;
    }
}

void on_event(game *g, SDL_Event *e)
{
    SDL_ConvertEventToRenderCoordinates(g->ren, e);
    switch (e->type) {
    case SDL_EVENT_QUIT:
        g->running = false;
        break;
    case SDL_EVENT_MOUSE_MOTION:
        if (unattended) break; /* smoke tests and golden images ignore wherever the real pointer happens to be */
        g->mx = e->motion.x;
        g->my = e->motion.y;
        g->focus = -1;
        break;
    case SDL_EVENT_MOUSE_WHEEL:
        if (g->scr == SCR_HISTORY) {
            g->history_scroll += e->wheel.y > 0 ? 1 : -1;
            if (g->history_scroll < 0) g->history_scroll = 0;
            if (g->history_scroll > g->backlog_count - 1) g->history_scroll = g->backlog_count > 0 ? g->backlog_count - 1 : 0;
        } else if (g->scr == SCR_GALLERY) {
            g->scroll += e->wheel.y > 0 ? -1 : 1;
        } else if (g->scr == SCR_PLAY && e->wheel.y > 0) {
            rollback(g);
        } else if (g->scr == SCR_PLAY && e->wheel.y < 0 && g->blk == B_SAY) {
            proceed(g);
        }
        break;
    case SDL_EVENT_MOUSE_BUTTON_UP: {
        if (g->rebind >= 0) break;
        if (e->button.button == SDL_BUTTON_RIGHT) {
            escape(g);
            break;
        }
        if (e->button.button != SDL_BUTTON_LEFT) break;
        int id = g->ui_hidden ? 0 : hit_at(g, e->button.x, e->button.y);
        if (id) activate(g, id);
        else if (g->scr == SCR_PLAY && (g->blk != B_MENU || g->ui_hidden)) proceed(g);
        else if (g->scr == SCR_END || g->scr == SCR_ERROR) proceed(g);
        break;
    }
    case SDL_EVENT_KEY_DOWN: {
        SDL_Keycode k = e->key.key;
        if (g->rebind >= 0) {
            /* Controls screen: the next key is the new binding (Esc cancels). Gamepad rows wait for a button. */
            if (k != SDLK_ESCAPE && g->rebind < ACT_COUNT) hw_bind_key(&g->settings.bindings, (hw_action)g->rebind, k);
            if (k == SDLK_ESCAPE || g->rebind < ACT_COUNT) {
                g->rebind = -1;
                save_global(g);
            }
            break;
        }
        if (k == SDLK_F11 || (k == SDLK_RETURN && (e->key.mod & SDL_KMOD_ALT))) {
            g->settings.fullscreen = !g->settings.fullscreen;
            SDL_SetWindowFullscreen(g->win, g->settings.fullscreen);
        } else if (k == SDLK_F3 && g->dev) {
            g->overlay = !g->overlay;
        } else if (k == SDLK_F5 && g->dev) {
            reload(g);
        } else if (k >= SDLK_1 && k <= SDLK_9 && g->scr == SCR_PLAY && g->blk == B_MENU) {
            choose(g, (uint32_t)(k - SDLK_1));
        } else {
            do_action(g, hw_action_for_key(&g->settings.bindings, k));
        }
        break;
    }
    case SDL_EVENT_GAMEPAD_ADDED:
        if (!g->pad) g->pad = SDL_OpenGamepad(e->gdevice.which);
        break;
    case SDL_EVENT_GAMEPAD_REMOVED:
        if (g->pad && SDL_GetGamepadID(g->pad) == e->gdevice.which) {
            SDL_CloseGamepad(g->pad);
            g->pad = NULL;
        }
        break;
    case SDL_EVENT_GAMEPAD_BUTTON_DOWN: {
        int b = e->gbutton.button;
        if (g->rebind >= 0) {
            if (g->rebind >= ACT_COUNT && b != SDL_GAMEPAD_BUTTON_START) {
                hw_bind_pad(&g->settings.bindings, (hw_action)(g->rebind - ACT_COUNT), b);
                g->rebind = -1;
                save_global(g);
            } else if (b == SDL_GAMEPAD_BUTTON_START) {
                g->rebind = -1;
            }
            break;
        }
        g->mx = g->my = -1; /* the gamepad drives the focus, not the mouse position */
        do_action(g, hw_action_for_pad(&g->settings.bindings, b));
        break;
    }
    case SDL_EVENT_WINDOW_FOCUS_LOST:
        g->skip_mode = false;
        break;
    default:
        break;
    }
}
