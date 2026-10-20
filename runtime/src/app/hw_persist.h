/*
 * Himawari-C: files in the player's save folder (plan §8.9), under
 * SDL_GetPrefPath("Himawari", <game id>):
 *   slot1.hwsav … slot6.hwsav, quick.hwsav    saves (hw_save.h)
 *   auto.hwsav                                 the autosave: on quit and at each choice (P-2)
 *   global.dat                                 settings, global variables, read lines, gallery and music unlocks
 * Every write goes to a temporary file first and is then renamed over the old
 * one, so a crash never leaves a half-written save.
 */
#ifndef HW_PERSIST_H
#define HW_PERSIST_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "hw_hwb.h"
#include "hw_input.h"
#include "hw_vm.h"

#define HW_SLOTS 6
#define HW_SLOT_QUICK 0 /* slot 0 is the quick save; 1..HW_SLOTS are the save screen */
#define HW_SLOT_AUTO (HW_SLOTS + 1) /* the autosave: loaded from the save screen ("Auto"), never chosen as a target */
#define HW_SLOT_COUNT (HW_SLOTS + 2)

typedef struct hw_settings {
    char language[16]; /* "" = not chosen yet */
    float cps;         /* text speed, characters per second */
    float volume[4];   /* music, ambient, sfx, voice */
    bool fullscreen;
    /* Version 2 (Phase 5): accessibility and input (plan §13). */
    uint8_t auto_speed;      /* 1 (slow) to 5 (fast) */
    uint8_t text_size;       /* 0-3: 100, 115, 130, 150 % */
    uint8_t line_spacing;    /* 0-2: 1.0, 1.25, 1.5 */
    uint8_t font;            /* 0 the game's, 1 a readable one */
    int8_t textbox_opacity;  /* percent; -1 = the theme's */
    bool high_contrast, reduce_motion, skip_unread;
    bool a11y_prompted;      /* the first-launch accessibility prompt has been shown */
    hw_bindings bindings;
    /* Trailing fields of version 2 (older players stop reading before them). */
    bool mute_background;    /* silence while another window has the focus (P-7) */
    int32_t win_x, win_y, win_w, win_h; /* the window as last placed, neither full screen nor maximized; win_w 0 = never */
    bool win_maximized;
} hw_settings;

/* The defaults every new player starts with. */
void hw_settings_default(hw_settings *s);

/* Gallery and music room: every CG and music track the scripts use, and which ones the player has seen or heard. */
typedef struct hw_unlocks {
    uint32_t cg_count, music_count;
    uint32_t *cgs, *music;   /* string indices, in first-use order */
    uint8_t *cg_seen, *music_heard;
} hw_unlocks;

bool hw_unlocks_build(hw_unlocks *u, const hw_module *m);
void hw_unlocks_free(hw_unlocks *u);
/* Marks an asset (string index) as unlocked; returns true if it was locked before. */
bool hw_unlock(hw_unlocks *u, bool music, uint32_t asset);

typedef struct hw_persist {
    char dir[1024]; /* with a trailing separator; "" when there is no writable folder */
} hw_persist;

bool hw_persist_open(hw_persist *p, const char *game_id);
void hw_persist_slot_path(const hw_persist *p, int slot, char *out, size_t cap);
/* Atomic write (temporary file + rename). */
bool hw_persist_write(const char *path, const void *data, size_t size);

/*
 * Global data: settings, global variables (by name), read lines (by line ID,
 * as a per-line flag array of m->line_count), and unlocks (by asset name).
 * Missing or damaged files leave the defaults; version-1 files load.
 * With m == NULL only the settings are read (before the window opens).
 */
void hw_global_load(const hw_persist *p, const hw_module *m, hw_vm *vm, uint8_t *read_lines, hw_unlocks *u, hw_settings *s);
bool hw_global_save(const hw_persist *p, const hw_module *m, const hw_vm *vm, const uint8_t *read_lines, const hw_unlocks *u,
                    const hw_settings *s);

#endif
