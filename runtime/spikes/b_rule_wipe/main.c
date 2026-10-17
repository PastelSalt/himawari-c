/*
 * Spike B (plan §18 Phase 0, rfcs/0002): rule/mask wipe transitions with a
 * custom fragment shader through SDL 3.4's GPU render state, inside the normal
 * SDL_Renderer, on D3D12 and Vulkan. Falls back to a plain crossfade on the
 * default renderer when no GPU device is available (plan §8.5).
 *
 * Usage: spike_b [options]
 *   --driver NAME      GPU driver: direct3d12 or vulkan (default: SDL picks)
 *   --mask NAME        diagonal | radial | blinds (default: cycles every wipe)
 *   --progress P       freeze the transition at P in [0, 1]
 *   --frames N         quit after N frames
 *   --screenshot FILE  save the first frame as a BMP
 *   --benchmark        vsync off; report average frame time
 *   --no-gpu           force the fallback path (default renderer, crossfade)
 *   --debug            GPU debug mode (validation layers, if installed)
 * Exit code 0 means every check passed.
 */
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

#include <math.h>

#include "hw_version.h"
#include "rule_wipe.frag.dxil.h"
#include "rule_wipe.frag.spv.h"

enum { CANVAS_W = 1920, CANVAS_H = 1080, MASK_W = 480, MASK_H = 270 };

typedef enum { MASK_DIAGONAL, MASK_RADIAL, MASK_BLINDS, MASK_COUNT } MaskKind;

static const char *const MASK_NAMES[MASK_COUNT] = { "diagonal", "radial", "blinds" };

/* Must match `cbuffer RuleWipe` in shaders/rule_wipe.frag.hlsl (16 bytes). */
typedef struct {
    float progress;
    float vague;
    float invert;
    float padding;
} RuleWipeUniforms;
SDL_COMPILE_TIME_ASSERT(rule_wipe_uniforms_size, sizeof(RuleWipeUniforms) == 16);

typedef struct {
    SDL_GPUDevice *device;          /* NULL on the fallback path */
    SDL_GPUShader *shader;
    SDL_GPUSampler *sampler;
    SDL_Texture *masks[MASK_COUNT];
    SDL_GPURenderState *states[MASK_COUNT];
} Wipe;

/* Procedural rule masks, 0 = revealed first. Real games load these from assets. */
static float mask_value(MaskKind kind, float u, float v)
{
    switch (kind) {
    case MASK_DIAGONAL:
        return (u * 0.6f + v * 0.4f);
    case MASK_RADIAL: {
        float dx = (u - 0.5f) * 16.0f / 9.0f, dy = v - 0.5f;
        return SDL_min(1.0f, sqrtf(dx * dx + dy * dy) / 1.02f);
    }
    case MASK_BLINDS:
    default: {
        float stripe = u * 12.0f + v * 1.5f;
        return (stripe - floorf(stripe)) * 0.85f + v * 0.15f;
    }
    }
}

static SDL_Texture *create_mask(SDL_Renderer *ren, MaskKind kind)
{
    SDL_Surface *surf = SDL_CreateSurface(MASK_W, MASK_H, SDL_PIXELFORMAT_RGBA32);
    if (!surf) {
        return NULL;
    }
    for (int y = 0; y < MASK_H; y++) {
        Uint8 *row = (Uint8 *)surf->pixels + (size_t)y * (size_t)surf->pitch;
        for (int x = 0; x < MASK_W; x++) {
            float m = mask_value(kind, ((float)x + 0.5f) / (float)MASK_W, ((float)y + 0.5f) / (float)MASK_H);
            Uint8 g = (Uint8)SDL_clamp((int)(m * 255.0f + 0.5f), 0, 255);
            row[x * 4 + 0] = g;
            row[x * 4 + 1] = g;
            row[x * 4 + 2] = g;
            row[x * 4 + 3] = 255;
        }
    }
    SDL_Texture *tex = SDL_CreateTextureFromSurface(ren, surf);
    SDL_DestroySurface(surf);
    return tex;
}

/* Draws a stand-in scene into a 1920x1080 render target. */
static SDL_Texture *create_scene(SDL_Renderer *ren, bool is_new)
{
    SDL_Texture *tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_TARGET, CANVAS_W, CANVAS_H);
    if (!tex) {
        return NULL;
    }
    SDL_SetRenderTarget(ren, tex);
    if (is_new) {
        SDL_SetRenderDrawColor(ren, 0x2e, 0x5e, 0x8c, 255);
    } else {
        SDL_SetRenderDrawColor(ren, 0xd9, 0x8a, 0x2b, 255);
    }
    SDL_RenderClear(ren);
    for (int i = 0; i < 12; i++) {
        SDL_FRect r = { (float)(i * 160), is_new ? 0.0f : 540.0f, 80.0f, 540.0f };
        if (is_new) {
            SDL_SetRenderDrawColor(ren, 0x8f, 0xc1, 0xe3, 255);
        } else {
            SDL_SetRenderDrawColor(ren, 0xf6, 0xd5, 0x5c, 255);
        }
        SDL_RenderFillRect(ren, &r);
    }
    SDL_SetRenderScale(ren, 8.0f, 8.0f);
    SDL_SetRenderDrawColor(ren, 255, 255, 255, 255);
    SDL_RenderDebugText(ren, 80.0f, 60.0f, is_new ? "NEW SCENE" : "OLD SCENE");
    SDL_SetRenderScale(ren, 1.0f, 1.0f);
    SDL_SetRenderTarget(ren, NULL);
    return tex;
}

static bool init_wipe(SDL_Renderer *ren, Wipe *w)
{
    SDL_GPUShaderFormat formats = SDL_GetGPUShaderFormats(w->device);
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
    } else {
        SDL_Log("wipe: device supports neither DXIL nor SPIR-V");
        return false;
    }
    info.entrypoint = "main";
    info.stage = SDL_GPU_SHADERSTAGE_FRAGMENT;
    info.num_samplers = 2;        /* slot 0: drawn texture, slot 1: rule mask */
    info.num_uniform_buffers = 1;
    w->shader = SDL_CreateGPUShader(w->device, &info);
    if (!w->shader) {
        SDL_Log("wipe: SDL_CreateGPUShader failed: %s", SDL_GetError());
        return false;
    }
    SDL_Log("wipe: shader format %s", info.format == SDL_GPU_SHADERFORMAT_DXIL ? "DXIL" : "SPIR-V");

    SDL_GPUSamplerCreateInfo sinfo;
    SDL_zero(sinfo);
    sinfo.min_filter = SDL_GPU_FILTER_LINEAR;
    sinfo.mag_filter = SDL_GPU_FILTER_LINEAR;
    sinfo.mipmap_mode = SDL_GPU_SAMPLERMIPMAPMODE_NEAREST;
    sinfo.address_mode_u = SDL_GPU_SAMPLERADDRESSMODE_CLAMP_TO_EDGE;
    sinfo.address_mode_v = SDL_GPU_SAMPLERADDRESSMODE_CLAMP_TO_EDGE;
    sinfo.address_mode_w = SDL_GPU_SAMPLERADDRESSMODE_CLAMP_TO_EDGE;
    w->sampler = SDL_CreateGPUSampler(w->device, &sinfo);
    if (!w->sampler) {
        SDL_Log("wipe: SDL_CreateGPUSampler failed: %s", SDL_GetError());
        return false;
    }

    for (int k = 0; k < MASK_COUNT; k++) {
        w->masks[k] = create_mask(ren, (MaskKind)k);
        SDL_GPUTexture *gpu_tex = w->masks[k]
            ? (SDL_GPUTexture *)SDL_GetPointerProperty(SDL_GetTextureProperties(w->masks[k]),
                                                       SDL_PROP_TEXTURE_GPU_TEXTURE_POINTER, NULL)
            : NULL;
        if (!gpu_tex) {
            SDL_Log("wipe: no GPU texture for mask %s: %s", MASK_NAMES[k], SDL_GetError());
            return false;
        }
        SDL_GPUTextureSamplerBinding binding = { .texture = gpu_tex, .sampler = w->sampler };
        SDL_GPURenderStateCreateInfo cinfo;
        SDL_zero(cinfo);
        cinfo.fragment_shader = w->shader;
        cinfo.num_sampler_bindings = 1;
        cinfo.sampler_bindings = &binding;
        w->states[k] = SDL_CreateGPURenderState(ren, &cinfo);
        if (!w->states[k]) {
            SDL_Log("wipe: SDL_CreateGPURenderState failed: %s", SDL_GetError());
            return false;
        }
    }
    return true;
}

static void quit_wipe(Wipe *w)
{
    for (int k = 0; k < MASK_COUNT; k++) {
        SDL_DestroyGPURenderState(w->states[k]);
        SDL_DestroyTexture(w->masks[k]);
    }
    if (w->device) {
        SDL_ReleaseGPUSampler(w->device, w->sampler);
        SDL_ReleaseGPUShader(w->device, w->shader);
    }
}

/* Draws one transition frame: the old scene, then the new scene on top. */
static void draw_transition(SDL_Renderer *ren, const Wipe *w, SDL_Texture *old_scene, SDL_Texture *new_scene,
                            MaskKind kind, float progress)
{
    SDL_RenderTexture(ren, old_scene, NULL, NULL);
    if (w->device) {
        RuleWipeUniforms u = { .progress = progress, .vague = 0.12f, .invert = 0.0f, .padding = 0.0f };
        SDL_SetGPURenderStateFragmentUniforms(w->states[kind], 0, &u, sizeof u);
        SDL_SetGPURenderState(ren, w->states[kind]);
        SDL_RenderTexture(ren, new_scene, NULL, NULL);
        SDL_SetGPURenderState(ren, NULL);
    } else {
        /* Fallback: plain crossfade. */
        SDL_SetTextureAlphaModFloat(new_scene, progress);
        SDL_RenderTexture(ren, new_scene, NULL, NULL);
        SDL_SetTextureAlphaModFloat(new_scene, 1.0f);
    }
}

int main(int argc, char *argv[])
{
    const char *driver = NULL;
    const char *screenshot_path = NULL;
    int fixed_mask = -1;
    float fixed_progress = -1.0f;
    int max_frames = 0;
    bool benchmark = false, no_gpu = false, debug = false;

    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        bool has_value = i + 1 < argc;
        if (SDL_strcmp(a, "--driver") == 0 && has_value) {
            driver = argv[++i];
        } else if (SDL_strcmp(a, "--mask") == 0 && has_value) {
            const char *name = argv[++i];
            for (int k = 0; k < MASK_COUNT; k++) {
                if (SDL_strcmp(name, MASK_NAMES[k]) == 0) {
                    fixed_mask = k;
                }
            }
        } else if (SDL_strcmp(a, "--progress") == 0 && has_value) {
            float p = (float)SDL_atof(argv[++i]); /* not inside SDL_clamp: it's a macro */
            fixed_progress = SDL_clamp(p, 0.0f, 1.0f);
        } else if (SDL_strcmp(a, "--frames") == 0 && has_value) {
            max_frames = SDL_atoi(argv[++i]);
        } else if (SDL_strcmp(a, "--screenshot") == 0 && has_value) {
            screenshot_path = argv[++i];
        } else if (SDL_strcmp(a, "--benchmark") == 0) {
            benchmark = true;
        } else if (SDL_strcmp(a, "--no-gpu") == 0) {
            no_gpu = true;
        } else if (SDL_strcmp(a, "--debug") == 0) {
            debug = true;
        } else {
            SDL_Log("unknown argument: %s", a);
            return 2;
        }
    }

    if (!SDL_Init(SDL_INIT_VIDEO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return 1;
    }
    int v = SDL_GetVersion();
    SDL_Log("Himawari-C %s spike B, SDL %d.%d.%d", HW_VERSION_STRING, SDL_VERSIONNUM_MAJOR(v),
            SDL_VERSIONNUM_MINOR(v), SDL_VERSIONNUM_MICRO(v));

    SDL_Window *win = SDL_CreateWindow("Himawari Spike B", 1280, 720, SDL_WINDOW_RESIZABLE);
    if (!win) {
        SDL_Log("window: failed: %s", SDL_GetError());
        SDL_Quit();
        return 1;
    }

    Wipe wipe;
    SDL_zero(wipe);
    SDL_Renderer *ren = NULL;
    if (!no_gpu) {
        /* The GPU renderer is never chosen by default (Spike A got direct3d11), so ask for it. */
        wipe.device = SDL_CreateGPUDevice(SDL_GPU_SHADERFORMAT_DXIL | SDL_GPU_SHADERFORMAT_SPIRV, debug, driver);
        if (wipe.device) {
            ren = SDL_CreateGPURenderer(wipe.device, win);
            if (!ren) {
                SDL_Log("gpu: SDL_CreateGPURenderer failed: %s", SDL_GetError());
                SDL_DestroyGPUDevice(wipe.device);
                wipe.device = NULL;
            }
        } else {
            SDL_Log("gpu: SDL_CreateGPUDevice(%s) failed: %s", driver ? driver : "auto", SDL_GetError());
        }
    }
    if (!ren) {
        ren = SDL_CreateRenderer(win, NULL);
        if (!ren) {
            SDL_Log("renderer: failed: %s", SDL_GetError());
            SDL_Quit();
            return 1;
        }
    }
    if (wipe.device) {
        SDL_Log("renderer: %s, GPU driver %s", SDL_GetRendererName(ren), SDL_GetGPUDeviceDriver(wipe.device));
    } else {
        SDL_Log("renderer: %s (fallback: crossfade, no shader)", SDL_GetRendererName(ren));
    }
    SDL_SetRenderLogicalPresentation(ren, CANVAS_W, CANVAS_H, SDL_LOGICAL_PRESENTATION_LETTERBOX);
    SDL_SetRenderVSync(ren, benchmark ? 0 : 1);

    int failures = 0;
    if (wipe.device && !init_wipe(ren, &wipe)) {
        failures++;
    }

    SDL_Texture *old_scene = create_scene(ren, false);
    SDL_Texture *new_scene = create_scene(ren, true);
    if (!old_scene || !new_scene) {
        SDL_Log("scenes: failed: %s", SDL_GetError());
        failures++;
    }

    const Uint64 start = SDL_GetTicksNS();
    Uint64 bench_start = start;
    int bench_frames = 0;
    bool running = failures == 0;
    int frame = 0;
    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_EVENT_QUIT || (e.type == SDL_EVENT_KEY_DOWN && e.key.key == SDLK_ESCAPE)) {
                running = false;
            }
        }

        /* A 1.5 s wipe, a 0.5 s hold, then the next mask. */
        double t = (double)(SDL_GetTicksNS() - start) / 1e9;
        int cycle = (int)(t / 2.0);
        float progress = fixed_progress >= 0.0f ? fixed_progress : (float)SDL_min(1.0, fmod(t, 2.0) / 1.5);
        MaskKind kind = (MaskKind)(fixed_mask >= 0 ? fixed_mask : cycle % MASK_COUNT);

        SDL_SetRenderDrawColor(ren, 0, 0, 0, 255);
        SDL_RenderClear(ren);
        draw_transition(ren, &wipe, old_scene, new_scene, kind, progress);

        if (screenshot_path && frame == 0) {
            SDL_Surface *shot = SDL_RenderReadPixels(ren, NULL);
            if (!shot || !SDL_SaveBMP(shot, screenshot_path)) {
                SDL_Log("screenshot: failed: %s", SDL_GetError());
                failures++;
            } else {
                SDL_Log("screenshot: %s (mask %s, progress %.2f)", screenshot_path, MASK_NAMES[kind], (double)progress);
            }
            SDL_DestroySurface(shot);
        }
        SDL_RenderPresent(ren);

        frame++;
        if (benchmark && frame == 30) {
            bench_start = SDL_GetTicksNS(); /* skip warm-up frames */
            bench_frames = 0;
        } else if (benchmark) {
            bench_frames++;
        }
        if (max_frames > 0 && frame >= max_frames) {
            running = false;
        }
    }

    if (benchmark && bench_frames > 0) {
        double ms = (double)(SDL_GetTicksNS() - bench_start) / 1e6 / bench_frames;
        SDL_Log("benchmark: %d frames, %.3f ms/frame average (vsync off, 1080p canvas)", bench_frames, ms);
    }

    SDL_DestroyTexture(old_scene);
    SDL_DestroyTexture(new_scene);
    quit_wipe(&wipe);
    SDL_DestroyRenderer(ren);
    if (wipe.device) {
        SDL_DestroyGPUDevice(wipe.device);
    }
    SDL_DestroyWindow(win);
    SDL_Quit();

    if (failures == 0) {
        SDL_Log("Spike B: OK");
        return 0;
    }
    SDL_Log("Spike B: %d check(s) failed", failures);
    return 1;
}
