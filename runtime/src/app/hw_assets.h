/*
 * Himawari-C: loose-file assets (plan §8.8). Images come from
 * <root>/<folder>/<name>.png (or .bmp). Anything missing is reported once and
 * drawn as a labeled placeholder by the caller (P5): a game runs before its art
 * exists. The `.hwp` pack replaces loose files in release builds later.
 */
#ifndef HW_ASSETS_H
#define HW_ASSETS_H

#include <SDL3/SDL.h>

#include <stdbool.h>

typedef struct hw_assets hw_assets;

/* `root` is the assets folder (with or without a trailing slash). */
hw_assets *hw_assets_open(SDL_Renderer *ren, const char *root);
void hw_assets_close(hw_assets *a);
/* Forgets every cached image (dev reload). */
void hw_assets_flush(hw_assets *a);

/*
 * The image `folder/name`, or NULL when it is missing or can't be read; then
 * `why` (if given) says which. Results are cached, including misses.
 */
SDL_Texture *hw_assets_image(hw_assets *a, const char *folder, const char *name, const char **why);

/* Full path of `folder/name.ext` for the first extension that exists, or false. */
bool hw_assets_find(const hw_assets *a, const char *folder, const char *name, const char *const *exts, char *out, size_t cap);

#endif
