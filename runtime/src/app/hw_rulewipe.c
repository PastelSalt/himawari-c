#include "hw_rulewipe.h"

#include <string.h>

#include "rule_wipe.frag.dxil.h"
#include "rule_wipe.frag.spv.h"

#define MAX_STATES 16

/* Must match `cbuffer RuleWipe` in shaders/rule_wipe.frag.hlsl (16 bytes). */
typedef struct uniforms {
    float progress;
    float vague;
    float invert;
    float padding;
} uniforms;
SDL_COMPILE_TIME_ASSERT(rule_wipe_uniforms_size, sizeof(uniforms) == 16);

typedef struct state_entry {
    SDL_Texture *mask;
    SDL_GPURenderState *state;
} state_entry;

struct hw_rulewipe {
    SDL_Renderer *ren;
    SDL_GPUDevice *device;
    SDL_GPUShader *shader;
    SDL_GPUSampler *sampler;
    SDL_Texture *default_mask;
    state_entry states[MAX_STATES];
    int next;
};

SDL_Renderer *hw_create_renderer(SDL_Window *win, bool allow_gpu, SDL_GPUDevice **device)
{
    *device = NULL;
    if (allow_gpu) {
        /* The GPU renderer is never SDL's default, so ask for it (rfcs/0002). */
        SDL_GPUDevice *dev = SDL_CreateGPUDevice(SDL_GPU_SHADERFORMAT_DXIL | SDL_GPU_SHADERFORMAT_SPIRV, false, NULL);
        if (dev) {
            SDL_Renderer *ren = SDL_CreateGPURenderer(dev, win);
            if (ren) {
                *device = dev;
                return ren;
            }
            SDL_Log("renderer: GPU renderer failed (%s); using the default one", SDL_GetError());
            SDL_DestroyGPUDevice(dev);
        } else {
            SDL_Log("renderer: no GPU device (%s); rule wipes will dissolve", SDL_GetError());
        }
    }
    return SDL_CreateRenderer(win, NULL);
}

static SDL_GPURenderState *state_for(hw_rulewipe *w, SDL_Texture *mask)
{
    for (int i = 0; i < MAX_STATES; i++) {
        if (w->states[i].mask == mask && w->states[i].state) return w->states[i].state;
    }
    SDL_GPUTexture *gpu = (SDL_GPUTexture *)SDL_GetPointerProperty(SDL_GetTextureProperties(mask), SDL_PROP_TEXTURE_GPU_TEXTURE_POINTER, NULL);
    if (!gpu) return NULL;
    SDL_GPUTextureSamplerBinding binding = { .texture = gpu, .sampler = w->sampler };
    SDL_GPURenderStateCreateInfo info;
    SDL_zero(info);
    info.fragment_shader = w->shader;
    info.num_sampler_bindings = 1;
    info.sampler_bindings = &binding;
    SDL_GPURenderState *st = SDL_CreateGPURenderState(w->ren, &info);
    if (!st) return NULL;
    /* Masks are cached by the asset cache for the whole session, so a small ring is enough. */
    state_entry *e = &w->states[w->next];
    w->next = (w->next + 1) % MAX_STATES;
    if (e->state) SDL_DestroyGPURenderState(e->state);
    e->mask = mask;
    e->state = st;
    return st;
}

bool hw_rulewipe_draw(hw_rulewipe *w, SDL_Texture *mask, SDL_Texture *scene, const SDL_FRect *dst, float progress)
{
    if (!w || !mask) return false;
    SDL_GPURenderState *st = state_for(w, mask);
    if (!st) return false;
    uniforms u = { progress, 0.12f, 0.0f, 0.0f };
    SDL_SetGPURenderStateFragmentUniforms(st, 0, &u, sizeof u);
    SDL_SetGPURenderState(w->ren, st);
    SDL_RenderTexture(w->ren, scene, NULL, dst);
    SDL_SetGPURenderState(w->ren, NULL);
    return true;
}

SDL_Texture *hw_rulewipe_default_mask(hw_rulewipe *w)
{
    if (!w) return NULL;
    if (w->default_mask) return w->default_mask;
    const int MW = 240, MH = 135;
    SDL_Surface *s = SDL_CreateSurface(MW, MH, SDL_PIXELFORMAT_RGBA32);
    if (!s) return NULL;
    for (int y = 0; y < MH; y++) {
        Uint8 *row = (Uint8 *)s->pixels + (size_t)y * (size_t)s->pitch;
        for (int x = 0; x < MW; x++) {
            float m = ((float)x / (float)MW) * 0.6f + ((float)y / (float)MH) * 0.4f;
            Uint8 v = (Uint8)(m * 255.0f);
            row[4 * x] = row[4 * x + 1] = row[4 * x + 2] = v;
            row[4 * x + 3] = 255;
        }
    }
    w->default_mask = SDL_CreateTextureFromSurface(w->ren, s);
    SDL_DestroySurface(s);
    return w->default_mask;
}

/*
 * Self-test: wipe a white texture over black at progress 1 through an all-dark
 * mask. A working pipeline gives white; a silently failing one leaves black.
 */
static bool self_test(hw_rulewipe *w)
{
    bool ok = false;
    SDL_Texture *target = SDL_CreateTexture(w->ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, 4, 4);
    SDL_Surface *white = SDL_CreateSurface(4, 4, SDL_PIXELFORMAT_RGBA32);
    SDL_Surface *dark = SDL_CreateSurface(4, 4, SDL_PIXELFORMAT_RGBA32);
    SDL_Texture *tw = NULL, *tm = NULL;
    if (target && white && dark) {
        SDL_FillSurfaceRect(white, NULL, SDL_MapSurfaceRGBA(white, 255, 255, 255, 255));
        SDL_FillSurfaceRect(dark, NULL, SDL_MapSurfaceRGBA(dark, 0, 0, 0, 255));
        tw = SDL_CreateTextureFromSurface(w->ren, white);
        tm = SDL_CreateTextureFromSurface(w->ren, dark);
    }
    if (tw && tm) {
        SDL_Texture *before = SDL_GetRenderTarget(w->ren);
        SDL_SetRenderTarget(w->ren, target);
        SDL_SetRenderDrawColor(w->ren, 0, 0, 0, 255);
        SDL_RenderClear(w->ren);
        SDL_FRect all = { 0, 0, 4, 4 };
        if (hw_rulewipe_draw(w, tm, tw, &all, 1.0f)) {
            SDL_Surface *px = SDL_RenderReadPixels(w->ren, NULL);
            if (px) {
                Uint8 r, g, b, a;
                ok = SDL_ReadSurfacePixel(px, 1, 1, &r, &g, &b, &a) && r > 200 && g > 200 && b > 200;
                SDL_DestroySurface(px);
            }
        }
        SDL_SetRenderTarget(w->ren, before);
    }
    /* The test mask's render state goes away with its texture. */
    for (int i = 0; i < MAX_STATES; i++) {
        if (w->states[i].mask == tm && w->states[i].state) {
            SDL_DestroyGPURenderState(w->states[i].state);
            memset(&w->states[i], 0, sizeof w->states[i]);
        }
    }
    SDL_DestroyTexture(tw);
    SDL_DestroyTexture(tm);
    SDL_DestroySurface(white);
    SDL_DestroySurface(dark);
    SDL_DestroyTexture(target);
    return ok;
}

hw_rulewipe *hw_rulewipe_open(SDL_Renderer *ren, SDL_GPUDevice *device)
{
    if (!device) return NULL;
    hw_rulewipe *w = SDL_calloc(1, sizeof *w);
    if (!w) return NULL;
    w->ren = ren;
    w->device = device;
    SDL_GPUShaderFormat formats = SDL_GetGPUShaderFormats(device);
    SDL_GPUShaderCreateInfo info;
    SDL_zero(info);
    if (formats & SDL_GPU_SHADERFORMAT_DXIL) {
        info.format = SDL_GPU_SHADERFORMAT_DXIL;
        info.code = rule_wipe_frag_dxil;
        info.code_size = sizeof rule_wipe_frag_dxil;
    } else if (formats & SDL_GPU_SHADERFORMAT_SPIRV) {
        info.format = SDL_GPU_SHADERFORMAT_SPIRV;
        info.code = rule_wipe_frag_spv;
        info.code_size = sizeof rule_wipe_frag_spv;
    }
    info.entrypoint = "main";
    info.stage = SDL_GPU_SHADERSTAGE_FRAGMENT;
    info.num_samplers = 2; /* slot 0: the drawn texture, slot 1: the rule mask */
    info.num_uniform_buffers = 1;
    w->shader = info.code ? SDL_CreateGPUShader(device, &info) : NULL;
    SDL_GPUSamplerCreateInfo sinfo;
    SDL_zero(sinfo);
    sinfo.min_filter = SDL_GPU_FILTER_LINEAR;
    sinfo.mag_filter = SDL_GPU_FILTER_LINEAR;
    sinfo.mipmap_mode = SDL_GPU_SAMPLERMIPMAPMODE_NEAREST;
    sinfo.address_mode_u = sinfo.address_mode_v = sinfo.address_mode_w = SDL_GPU_SAMPLERADDRESSMODE_CLAMP_TO_EDGE;
    w->sampler = w->shader ? SDL_CreateGPUSampler(device, &sinfo) : NULL;
    if (!w->sampler || !self_test(w)) {
        SDL_Log("rule wipes: the shader path %s; using dissolves", w->sampler ? "failed its self-test" : "isn't available");
        hw_rulewipe_close(w);
        return NULL;
    }
    SDL_Log("rule wipes: GPU shader path (%s)", SDL_GetGPUDeviceDriver(device));
    return w;
}

void hw_rulewipe_close(hw_rulewipe *w)
{
    if (!w) return;
    for (int i = 0; i < MAX_STATES; i++) {
        if (w->states[i].state) SDL_DestroyGPURenderState(w->states[i].state);
    }
    SDL_DestroyTexture(w->default_mask);
    if (w->sampler) SDL_ReleaseGPUSampler(w->device, w->sampler);
    if (w->shader) SDL_ReleaseGPUShader(w->device, w->shader);
    SDL_free(w);
}
