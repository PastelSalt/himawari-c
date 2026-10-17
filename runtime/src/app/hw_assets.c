#include "hw_assets.h"

#include <stdio.h>
#include <string.h>

#define CACHE_SIZE 256

typedef struct entry {
    char key[160]; /* folder/name */
    SDL_Texture *tex;
    const char *why; /* set for misses */
    uint64_t used;   /* for eviction */
} entry;

struct hw_assets {
    SDL_Renderer *ren;
    char root[512];
    entry cache[CACHE_SIZE];
    uint64_t clock;
};

hw_assets *hw_assets_open(SDL_Renderer *ren, const char *root)
{
    hw_assets *a = SDL_calloc(1, sizeof *a);
    if (!a) return NULL;
    a->ren = ren;
    size_t n = strlen(root);
    snprintf(a->root, sizeof a->root, "%s%s", root, n > 0 && (root[n - 1] == '/' || root[n - 1] == '\\') ? "" : "/");
    return a;
}

void hw_assets_flush(hw_assets *a)
{
    for (int i = 0; i < CACHE_SIZE; i++) {
        if (a->cache[i].tex) SDL_DestroyTexture(a->cache[i].tex);
    }
    memset(a->cache, 0, sizeof a->cache);
}

void hw_assets_close(hw_assets *a)
{
    if (!a) return;
    hw_assets_flush(a);
    SDL_free(a);
}

bool hw_assets_find(const hw_assets *a, const char *folder, const char *name, const char *const *exts, char *out, size_t cap)
{
    for (int i = 0; exts[i]; i++) {
        snprintf(out, cap, "%s%s/%s%s", a->root, folder, name, exts[i]);
        if (SDL_GetPathInfo(out, NULL)) return true;
    }
    return false;
}

static const char *const LOADABLE[] = { ".png", ".bmp", NULL };
static const char *const NOT_YET[] = { ".jpg", ".jpeg", ".webp", NULL };

SDL_Texture *hw_assets_image(hw_assets *a, const char *folder, const char *name, const char **why)
{
    char key[160];
    snprintf(key, sizeof key, "%s/%s", folder, name);
    a->clock++;
    entry *free_slot = NULL, *oldest = &a->cache[0];
    for (int i = 0; i < CACHE_SIZE; i++) {
        entry *e = &a->cache[i];
        if (e->key[0] && strcmp(e->key, key) == 0) {
            e->used = a->clock;
            if (why) *why = e->why;
            return e->tex;
        }
        if (!e->key[0] && !free_slot) free_slot = e;
        if (e->used < oldest->used) oldest = e;
    }
    entry *e = free_slot ? free_slot : oldest;
    if (e->tex) SDL_DestroyTexture(e->tex);
    memset(e, 0, sizeof *e);
    snprintf(e->key, sizeof e->key, "%s", key);
    e->used = a->clock;

    char path[1024];
    if (hw_assets_find(a, folder, name, LOADABLE, path, sizeof path)) {
        SDL_Surface *s = SDL_LoadSurface(path);
        if (s) {
            e->tex = SDL_CreateTextureFromSurface(a->ren, s);
            SDL_DestroySurface(s);
        }
        if (!e->tex) {
            e->why = "can't be read";
            SDL_Log("assets: %s: %s", path, SDL_GetError());
        }
    } else if (hw_assets_find(a, folder, name, NOT_YET, path, sizeof path)) {
        e->why = "JPG/WebP aren't supported yet; use PNG";
        SDL_Log("assets: %s: %s", path, e->why);
    } else {
        e->why = "missing";
    }
    if (e->tex) SDL_SetTextureScaleMode(e->tex, SDL_SCALEMODE_LINEAR);
    if (why) *why = e->why;
    return e->tex;
}
