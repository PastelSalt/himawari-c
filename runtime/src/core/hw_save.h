/*
 * Himawari-C: save files and the rollback history (plan §8.9). Part of core/:
 * no SDL, no I/O; callers write the bytes (atomically) themselves.
 *
 * A save is taken at a checkpoint (just before a SAY or MENU). It stores
 * names and line IDs, not indices, so it survives script edits:
 * - The same build (CRC match) restores exactly.
 * - A different build remaps: the position by line ID (trying earlier
 *   checkpoints when the line was deleted, then the scene's start), variables
 *   by name, `once` options by line ID, and the stage by asset and character
 *   names. The result says when a fallback was needed, so the game can tell
 *   the player.
 */
#ifndef HW_SAVE_H
#define HW_SAVE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "hw_hwb.h"
#include "hw_play.h"
#include "hw_vm.h"

#define HW_SAVE_VERSION 1
#define HW_SAVE_HISTORY 16 /* checkpoint line IDs kept for remapping */

typedef struct hw_save_info {
    int64_t time;          /* seconds since 1970 (UTC), set by the caller */
    uint32_t playtime_s;
    char scene[64];        /* scene name at the checkpoint */
    char preview[160];     /* the line's text (plain), for the save screen */
    char language[16];
} hw_save_info;

/*
 * Serializes the snapshot `snap` (from hw_vm_snapshot at a checkpoint) into
 * `out`. `history` holds pcs of earlier checkpoints, newest first (from the
 * rollback history); it may be empty.
 */
bool hw_save_write(const hw_vm *vm, const void *snap, const uint32_t *history, uint32_t history_count,
                   const hw_save_info *info, hw_buf *out);

typedef enum hw_save_result {
    HW_SAVE_EXACT,     /* same build: restored exactly */
    HW_SAVE_REMAPPED,  /* another build: every line was found */
    HW_SAVE_FALLBACK,  /* another build: the saved line is gone; resumed at an earlier checkpoint or the scene start */
    HW_SAVE_BAD        /* not loadable; `err` says why */
} hw_save_result;

/* Reads only the header information (for the save screen). */
bool hw_save_peek(const uint8_t *data, size_t size, hw_save_info *info);

/* Restores a save into a VM that was set up with hw_vm_init() for the current module. */
hw_save_result hw_save_load(hw_vm *vm, const uint8_t *data, size_t size, hw_save_info *info, char *err, size_t err_size);

/* ---- rollback history: a ring of checkpoint snapshots ---- */

typedef struct hw_history {
    uint8_t *buf;
    size_t snap_size;
    uint32_t cap, start, count;
} hw_history;

bool hw_history_init(hw_history *h, size_t snap_size, uint32_t capacity);
void hw_history_free(hw_history *h);
void hw_history_clear(hw_history *h);
/* Adds a snapshot; the oldest one is dropped when full. */
void hw_history_push(hw_history *h, const void *snap);
/* The snapshot `back` steps before the newest (0 = newest), or NULL. */
const void *hw_history_peek(const hw_history *h, uint32_t back);
/* Drops the newest snapshot. */
bool hw_history_pop(hw_history *h);
/* The pc of a snapshot (its checkpoint instruction). */
uint32_t hw_snapshot_pc(const void *snap);

/*
 * Steps back one checkpoint: drops the current one, restores the previous
 * one, and leaves the VM ready to replay it with hw_vm_next() (which pushes
 * it again through the checkpoint hook). Returns false at the start of the
 * history.
 */
bool hw_rollback(hw_vm *vm, hw_history *h);

#endif
