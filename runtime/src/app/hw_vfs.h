/*
 * Himawari-C: where the player's files come from (plan §8.8). A shipped game
 * reads .hwp packs beside its .exe: data.hwp, then patch*.hwp, the highest
 * priority first (spec/pack.md, rfcs/0009). In development, loose files under
 * a root folder are read after the packs (or instead of them).
 *
 * Paths are pack paths: "game.hwb", "assets/bg/park.png". Files open as
 * SDL_IOStreams: stored entries stream straight from the pack file (music
 * isn't read into memory), compressed ones are decoded into memory first.
 */
#ifndef HW_VFS_H
#define HW_VFS_H

#include <SDL3/SDL.h>

#include <stdbool.h>
#include <stddef.h>

typedef struct hw_vfs hw_vfs;

hw_vfs *hw_vfs_create(void);
void hw_vfs_destroy(hw_vfs *v);

/*
 * Mounts `dir`/data.hwp and every `dir`/patch*.hwp. Patches of another game,
 * or with a priority another pack already has, are skipped with a log line.
 * Returns false (with a reason) when data.hwp is missing or damaged.
 */
bool hw_vfs_mount_packs(hw_vfs *v, const char *dir, char *err, size_t cap);
/* Loose files: `path` is looked up as `root`/`path` after the packs. "" turns it off. */
void hw_vfs_set_root(hw_vfs *v, const char *root);
int hw_vfs_pack_count(const hw_vfs *v);

bool hw_vfs_exists(hw_vfs *v, const char *path);
/* A stream over the file, or NULL when it's missing (or a patch removed it). The caller closes it. */
SDL_IOStream *hw_vfs_open(hw_vfs *v, const char *path);
/* The whole file (SDL_malloc'd; pack entries are checked against their CRC), or NULL. */
void *hw_vfs_load(hw_vfs *v, const char *path, size_t *size);

#endif
