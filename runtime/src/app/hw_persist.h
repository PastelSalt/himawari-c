/*
 * Himawari-C: files in the player's save folder (plan §8.9), under
 * SDL_GetPrefPath("Himawari", <game id>):
 *   slot1.hwsav … slot6.hwsav, quick.hwsav    saves (hw_save.h)
 *   global.dat                                 global variables, read lines, settings
 * Every write goes to a temporary file first and is then renamed over the old
 * one, so a crash never leaves a half-written save.
 */
#ifndef HW_PERSIST_H
#define HW_PERSIST_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "hw_hwb.h"
#include "hw_vm.h"

#define HW_SLOTS 6
#define HW_SLOT_QUICK 0 /* slot 0 is the quick save; 1..HW_SLOTS are the save screen */

typedef struct hw_settings {
    char language[16]; /* "" = not chosen yet */
    float cps;         /* text speed, characters per second */
    float volume[4];   /* music, ambient, sfx, voice */
    bool fullscreen;
} hw_settings;

typedef struct hw_persist {
    char dir[1024]; /* with a trailing separator; "" when there is no writable folder */
} hw_persist;

bool hw_persist_open(hw_persist *p, const char *game_id);
void hw_persist_slot_path(const hw_persist *p, int slot, char *out, size_t cap);
/* Atomic write (temporary file + rename). */
bool hw_persist_write(const char *path, const void *data, size_t size);

/*
 * Global data: settings, global variables (by name), and read lines (by line
 * ID, as a per-line flag array of m->line_count). Missing or damaged files
 * leave the defaults.
 */
void hw_global_load(const hw_persist *p, const hw_module *m, hw_vm *vm, uint8_t *read_lines, hw_settings *s);
bool hw_global_save(const hw_persist *p, const hw_module *m, const hw_vm *vm, const uint8_t *read_lines, const hw_settings *s);

#endif
