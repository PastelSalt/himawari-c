#include "hw_assets.h"

#include <stdio.h>
#include <string.h>

#include "hw_image.h"

#define CACHE_SIZE 256

typedef struct entry {
    char key[160]; /* folder/name */
    SDL_Texture *tex;
    const char *why; /* set for misses */
    uint64_t used;   /* for eviction */
} entry;

struct hw_assets {
    SDL_Renderer *ren;
    hw_vfs *vfs;
    entry cache[CACHE_SIZE];
    uint64_t clock;
};

hw_assets *hw_assets_open(SDL_Renderer *ren, hw_vfs *vfs)
{
    hw_assets *a = SDL_calloc(1, sizeof *a);
    if (!a) return NULL;
    a->ren = ren;
    a->vfs = vfs;
    return a;
}

hw_vfs *hw_assets_vfs(const hw_assets *a) { return a->vfs; }

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
        snprintf(out, cap, "assets/%s%s%s%s", folder, folder[0] ? "/" : "", name, exts[i]);
        if (hw_vfs_exists(a->vfs, out)) return true;
    }
    return false;
}

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
    if (hw_assets_find(a, folder, name, HW_IMAGE_EXTS, path, sizeof path)) {
        SDL_Surface *s = hw_image_load(hw_vfs_open(a->vfs, path), strrchr(path, '.'));
        if (s) {
            e->tex = SDL_CreateTextureFromSurface(a->ren, s);
            SDL_DestroySurface(s);
        }
        if (!e->tex) {
            e->why = "can't be read";
            SDL_Log("assets: %s: %s", path, SDL_GetError());
        }
    } else {
        e->why = "missing";
    }
    if (e->tex) SDL_SetTextureScaleMode(e->tex, SDL_SCALEMODE_LINEAR);
    if (why) *why = e->why;
    return e->tex;
}
