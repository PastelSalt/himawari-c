/*
 * Himawari-C: assets (plan §8.8): assets/<folder>/<name>.<ext> from the packs
 * or loose files (hw_vfs.h). Images are PNG, WebP, JPEG, or BMP (hw_image.h).
 * Anything missing is reported once and drawn as a labeled placeholder by the
 * caller (P5): a game runs before its art exists.
 */
#ifndef HW_ASSETS_H
#define HW_ASSETS_H

#include <SDL3/SDL.h>

#include <stdbool.h>

#include "hw_vfs.h"

typedef struct hw_assets hw_assets;

/* Assets come from `vfs` (not owned) under "assets/". */
hw_assets *hw_assets_open(SDL_Renderer *ren, hw_vfs *vfs);
hw_vfs *hw_assets_vfs(const hw_assets *a);
void hw_assets_close(hw_assets *a);
/* Forgets every cached image (dev reload). */
void hw_assets_flush(hw_assets *a);

/*
 * The image `folder/name`, or NULL when it is missing or can't be read; then
 * `why` (if given) says which. Results are cached, including misses.
 */
SDL_Texture *hw_assets_image(hw_assets *a, const char *folder, const char *name, const char **why);

/*
 * The file path of assets/`folder`/`name`.ext for the first extension in `exts`
 * that exists (`folder` may be ""), or false. Open it with hw_vfs_open/hw_vfs_load.
 */
bool hw_assets_find(const hw_assets *a, const char *folder, const char *name, const char *const *exts, char *out, size_t cap);

#endif
