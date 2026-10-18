/*
 * Himawari-C: the windowed player's internals, shared by hw_game.c (the story,
 * saves, the Studio link, the main loop) and hw_screens.c (drawing the
 * screens, input). Not a public interface.
 */
#ifndef HW_GAME_INT_H
#define HW_GAME_INT_H

#include <SDL3/SDL.h>

#include <stdbool.h>
#include <stdint.h>

#include "hw_assets.h"
#include "hw_audio.h"
#include "hw_ext.h"
#include "hw_hwb.h"
#include "hw_input.h"
#include "hw_link.h"
#include "hw_persist.h"
#include "hw_rulewipe.h"
#include "hw_save.h"
#include "hw_text_draw.h"
#include "hw_theme.h"
#include "hw_ui_text.h"
#include "hw_vm.h"

/* ---- types ---- */

typedef enum screen {
    SCR_TITLE, SCR_PLAY, SCR_SYSMENU, SCR_SLOTS, SCR_HISTORY, SCR_CONFIRM_QUIT, SCR_END, SCR_ERROR,
    SCR_CONFIG, SCR_CONTROLS, SCR_A11Y, SCR_EXTRAS, SCR_GALLERY, SCR_CG_VIEW, SCR_MUSIC
} screen;
typedef enum block { B_NONE, B_SAY, B_MENU, B_WAIT, B_TRANS, B_EXT, B_DONE } block;
typedef enum trans_kind { T_FADE, T_DISSOLVE, T_SLIDE_LEFT, T_SLIDE_RIGHT, T_SLIDE_UP, T_SLIDE_DOWN, T_WIPE, T_RULE } trans_kind;

#define BACKLOG 100
#define MAX_HITS 64
#define HISTORY_DEPTH 256

typedef struct backlog_entry {
    char name[64];
    char text[400];
    uint32_t line_id;  /* for voice replay; HW_NONE without one */
    bool has_voice;    /* a voice file existed when the line was shown */
} backlog_entry;

typedef struct hit {
    SDL_FRect r;
    int id;
} hit;

/* Button ids. Ranges: menu options 1000 + index, slots 2000 + slot, config rows 3000 + row,
 * key bindings 4000 + action, gamepad bindings 4100 + action, gallery pictures 5000 + index,
 * music tracks 6000 + index, history voice replay 7000 + backlog index. */
enum {
    BTN_START = 1, BTN_LOAD, BTN_LANGUAGE, BTN_QUIT, BTN_RESUME, BTN_SAVE, BTN_HISTORY, BTN_TITLE,
    BTN_BACK, BTN_AUTO, BTN_SKIP, BTN_MENU, BTN_ROLLBACK, BTN_YES, BTN_NO,
    BTN_CONFIG, BTN_EXTRAS, BTN_GALLERY, BTN_MUSIC, BTN_CONTINUE, BTN_RESET_CONTROLS, BTN_STOP_MUSIC,
    BTN_OPTION = 1000, BTN_SLOT = 2000, BTN_CFG = 3000, BTN_BIND_KEY = 4000, BTN_BIND_PAD = 4100,
    BTN_CG = 5000, BTN_TRACK = 6000, BTN_VOICE = 7000
};

typedef struct game {
    SDL_Window *win;
    SDL_Renderer *ren;
    SDL_GPUDevice *gpu;   /* set when the GPU renderer is in use */
    hw_rulewipe *wipe;    /* rule wipes, or NULL (they dissolve) */
    char trans_mask[128]; /* the rule's mask image */
    float W, H, S; /* canvas size and UI scale (H / 1080) */
    hw_fonts *fonts;
    hw_vfs *vfs;          /* packs and loose files (hw_vfs.h) */
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
    const char *compare;   /* --compare: check the last frame against this golden image (plan §16.1) */
    SDL_Texture *canvas_tex; /* with --compare: frames are drawn here at the game's size, then shown */
    bool compare_failed;
    float cps_override; /* --text-speed: this run only, never saved */

    /* Auto-blink per stage slot (plan §6.1): when the next blink starts. */
    double blink_at[HW_VM_MAX_STAGE];

    /* The Studio debug pipe (--link), and the last state reported on it. */
    hw_link *link;
    char link_state[512];
    bool fast_forward; /* skipping to the next menu: no sound effects or voices on the way */

    /* The theme (THEM) and extension statements (XTNS), bound to the module at startup and on reload. */
    hw_palette pal;
    float tb_alpha, text_px; /* textbox opacity (0-1) and text size (px at 1080p) */
    hw_ui_layout ui;         /* where the UI's elements are and how they look (theme 2.0, rfcs/0010) */
    double menu_t0;          /* when the current menu appeared (choice animations) */
    int hover_id;            /* the button under the pointer or focus last frame (hover sounds), -1 = none */
    uint32_t overflow_seen[32]; /* labels already reported as too long for their button (debug pipe) */
    int overflow_count;
    int32_t trans_ms;                           /* duration of transitions written without one */
    hw_fonts *name_fonts;                       /* theme font.name for the nameplate, or NULL */
    int fonts_font;                             /* the font setting g->fonts was opened with (-1 = none yet) */
    int fonts_group;                            /* the CJK font order it was opened with (see cjk_group) */
    const hw_ext_statement **ext_of;            /* per XTNS index: its handler, or NULL */
    const hw_ext_statement *ext_active;         /* the blocking statement the story waits for */
    bool title_music;                           /* the theme's title music is playing */

    /* NVL (textbox nvl): the page's lines, laid out (follows the VM's page). */
    hw_rich_text page_text[HW_VM_MAX_PAGE];
    uint32_t page_built;                        /* page entries laid out in page_text */

    /* Phase 5 screens and input (plan §8.10, §13). */
    hw_unlocks unlocks;          /* gallery and music room */
    SDL_Gamepad *pad;
    bool ui_hidden;              /* the player hid the textbox to look at the picture */
    int rebind;                  /* the action waiting for a new key or button, or -1 */
    uint32_t cg_view;            /* the gallery picture shown full screen */
    uint32_t music_track;        /* the music room's track (index into unlocks.music), or HW_NONE */
    int scroll;                  /* first row shown in the gallery */
    bool slots_cached;           /* the save screen's slots were read */
    bool slot_used[HW_SLOTS + 1];
    hw_save_info slot_info[HW_SLOTS + 1]; /* thumb is not kept: see slot_thumb */
    SDL_Texture *slot_thumb[HW_SLOTS + 1];
    const char *save_to;         /* --save-to: a save of the last frame goes here (tests) */

    /* --perf (plan §8.1 budgets). */
    uint64_t present_at;         /* when this frame's drawing was done, before waiting for vsync */
    double perf_load_ms, perf_read_ms;
    size_t perf_hwb_bytes;
} game;

/* An unattended run (--frames: smoke tests, render_line) never writes the player's data. */
extern bool unattended;

static inline float sc(const game *g, float v) { return v * g->S; }
static inline SDL_Color col(uint32_t rgb) { return (SDL_Color){ (Uint8)(rgb >> 16), (Uint8)(rgb >> 8), (Uint8)rgb, 255 }; }
static inline const char *ui(const game *g, hw_ui_string id) { return hw_theme_ui(&g->m, g->lang, id); }
static inline bool point_in(float x, float y, SDL_FRect r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }

void fill(game *g, SDL_FRect r, uint32_t rgb, float a);
/* A rectangle with rounded corners of radius `rad` (screen px); a plain fill when rad is 0. */
void rounded(game *g, SDL_FRect r, float rad, uint32_t rgb, float a);
/* A panel in the theme's shape: shadow, rounded corners, and border (shape.*). */
void panel(game *g, SDL_FRect r, uint32_t rgb, float a);
/* How a hovered or focused button shows it (shape.hover). */
void hover_mark(game *g, SDL_FRect r);
/* The ADV textbox's rectangle on screen. */
SDL_FRect textbox_rect(const game *g);
/* Plays a UI sound from the theme (sound.hover, sound.click), if it has one. */
void ui_sound(game *g, const char *name);
void gradient(game *g, SDL_FRect r, uint32_t top, uint32_t bottom, float a);
void label(game *g, const char *s, float px, float x, float y, int align, SDL_Color c);
void save_global(game *g);
void button(game *g, SDL_FRect r, const char *text, int id, float px, bool active);
void render_scene(game *g, const hw_display *d, SDL_Texture *target);
void compose_scene(game *g);
void end_story(game *g);
void pump(game *g);
void advance(game *g);
bool finish_reveal(game *g);
void choose(game *g, uint32_t k);
void start_story(game *g);
void rollback(game *g);
void save_slot(game *g, int slot);
bool load_slot(game *g, int slot);
void next_language(game *g);
void reload(game *g);
void render(game *g);
void proceed(game *g);
void on_event(game *g, SDL_Event *e);

/* hw_game.c */
void apply_settings(game *g);    /* after a settings change: colors, sizes, fonts, volumes, layouts */
void open_fonts(game *g);
void stop_title_music(game *g);
void choose_language(game *g, const char *lang);
/* hw_screens.c */
void dim_background(game *g, float a);
void activate(game *g, int id);
/* hw_menus.c: config, controls, the accessibility prompt, extras, gallery, music room */
void draw_config(game *g);
void draw_controls(game *g);
void draw_a11y(game *g);
void draw_extras(game *g);
void draw_gallery(game *g);
void draw_cg_view(game *g);
void draw_music(game *g);
/* Handles a button of those screens; returns false when `id` isn't theirs. */
bool menus_activate(game *g, int id);
/* Left/right on a focused config row: changes its value. Returns false when `id` isn't one. */
bool menus_adjust(game *g, int id, int dir);

#endif
