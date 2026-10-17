/*
 * Himawari-C: rule (mask) wipes through SDL_GPURenderState (plan §8.5,
 * rfcs/0002). The runtime asks for the GPU renderer explicitly; when there is
 * no GPU device, or the startup self-test shows the custom pipeline doesn't
 * draw (a failed pipeline is silent outside debug mode), rule wipes fall back
 * to a dissolve.
 */
#ifndef HW_RULEWIPE_H
#define HW_RULEWIPE_H

#include <SDL3/SDL.h>

#include <stdbool.h>

/* The GPU renderer if possible (*device set), else the default renderer (*device NULL). */
SDL_Renderer *hw_create_renderer(SDL_Window *win, bool allow_gpu, SDL_GPUDevice **device);

typedef struct hw_rulewipe hw_rulewipe;

/* NULL when rule wipes aren't available on this renderer (the caller dissolves instead). */
hw_rulewipe *hw_rulewipe_open(SDL_Renderer *ren, SDL_GPUDevice *device);
void hw_rulewipe_close(hw_rulewipe *w);

/* A procedural diagonal mask, used when a rule's image is missing (P5). */
SDL_Texture *hw_rulewipe_default_mask(hw_rulewipe *w);

/*
 * Draws `scene` over what is already in the target, revealed through `mask`
 * (dark pixels first) at `progress` 0..1. Returns false if it couldn't (draw
 * the fallback instead).
 */
bool hw_rulewipe_draw(hw_rulewipe *w, SDL_Texture *mask, SDL_Texture *scene, const SDL_FRect *dst, float progress);

#endif
