/*
 * Spike A (plan §18 Phase 0, RESEARCH.md §15): one statically linked
 * SDL 3.4 + SDL3_mixer + FreeType executable that opens a window, plays a
 * sound, and shows Japanese text. Results go in rfcs/0001.
 *
 * Usage: spike_a [--frames N] [--screenshot out.bmp] [font-file]
 *   --frames N         quit after N frames (CI smoke test); default runs until closed.
 *   --screenshot FILE  save the first rendered frame as a BMP.
 *   font-file          a CJK font; default tries the Japanese fonts that ship with Windows.
 * Exit code 0 means every check passed.
 */
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <SDL3_mixer/SDL_mixer.h>

#include <ft2build.h>
#include FT_FREETYPE_H

#include <math.h>
#include <stddef.h>
#include <string.h>

#include "hw_utf8.h"
#include "hw_version.h"

enum { CANVAS_W = 1920, CANVAS_H = 1080, TONE_RATE = 48000, TONE_SAMPLES = TONE_RATE / 2 };

static const char *const TEXT = "ひまわり：日本語テキストの表示テスト。漢字・かな・カナ";

static const char *const FONT_CANDIDATES[] = {
    "C:/Windows/Fonts/YuGothM.ttc",
    "C:/Windows/Fonts/meiryo.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
};

static float tone[TONE_SAMPLES];

/* Renders one line of UTF-8 text into a white-on-transparent texture. */
static SDL_Texture *render_text(SDL_Renderer *ren, FT_Face face, const char *utf8)
{
    const uint8_t *s = (const uint8_t *)utf8;
    size_t len = strlen(utf8);
    int ascent = (int)(face->size->metrics.ascender >> 6);
    int height = (int)((face->size->metrics.ascender - face->size->metrics.descender) >> 6);
    int width = 0;
    uint32_t cp;

    for (size_t i = 0; i < len;) {
        i += hw_utf8_decode(s + i, len - i, &cp);
        if (FT_Load_Char(face, cp, FT_LOAD_DEFAULT) == 0) {
            width += (int)(face->glyph->advance.x >> 6);
        }
    }
    if (width <= 0 || height <= 0) {
        return NULL;
    }

    SDL_Surface *surf = SDL_CreateSurface(width, height, SDL_PIXELFORMAT_RGBA32);
    if (!surf) {
        SDL_Log("SDL_CreateSurface failed: %s", SDL_GetError());
        return NULL;
    }
    memset(surf->pixels, 0, (size_t)surf->pitch * (size_t)height);

    int pen = 0;
    for (size_t i = 0; i < len;) {
        i += hw_utf8_decode(s + i, len - i, &cp);
        if (FT_Load_Char(face, cp, FT_LOAD_RENDER) != 0) {
            continue;
        }
        FT_GlyphSlot g = face->glyph;
        for (unsigned row = 0; row < g->bitmap.rows; row++) {
            int y = ascent - g->bitmap_top + (int)row;
            if (y < 0 || y >= height) {
                continue;
            }
            uint8_t *dst = (uint8_t *)surf->pixels + (size_t)y * (size_t)surf->pitch;
            const uint8_t *src = g->bitmap.buffer + (ptrdiff_t)row * g->bitmap.pitch;
            for (unsigned col = 0; col < g->bitmap.width; col++) {
                int x = pen + g->bitmap_left + (int)col;
                if (x < 0 || x >= width) {
                    continue;
                }
                uint8_t *px = dst + (size_t)x * 4u; /* RGBA32 is R, G, B, A in memory */
                px[0] = 255;
                px[1] = 255;
                px[2] = 255;
                if (src[col] > px[3]) {
                    px[3] = src[col];
                }
            }
        }
        pen += (int)(g->advance.x >> 6);
    }

    SDL_Texture *tex = SDL_CreateTextureFromSurface(ren, surf);
    SDL_DestroySurface(surf);
    return tex;
}

static FT_Face open_font(FT_Library ft, const char *path)
{
    FT_Face face = NULL;
    if (path) {
        if (FT_New_Face(ft, path, 0, &face) != 0) {
            SDL_Log("font: could not open %s", path);
            return NULL;
        }
        return face;
    }
    for (size_t i = 0; i < SDL_arraysize(FONT_CANDIDATES); i++) {
        if (FT_New_Face(ft, FONT_CANDIDATES[i], 0, &face) == 0) {
            SDL_Log("font: %s", FONT_CANDIDATES[i]);
            return face;
        }
    }
    SDL_Log("font: no CJK font found; pass one as an argument");
    return NULL;
}

int main(int argc, char *argv[])
{
    int max_frames = 0;
    const char *font_path = NULL;
    const char *screenshot_path = NULL;
    for (int i = 1; i < argc; i++) {
        if (SDL_strcmp(argv[i], "--frames") == 0 && i + 1 < argc) {
            max_frames = SDL_atoi(argv[++i]);
        } else if (SDL_strcmp(argv[i], "--screenshot") == 0 && i + 1 < argc) {
            screenshot_path = argv[++i];
        } else {
            font_path = argv[i];
        }
    }

    int failures = 0;

    if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return 1;
    }
    int v = SDL_GetVersion();
    SDL_Log("Himawari-C %s spike A, SDL %d.%d.%d", HW_VERSION_STRING, SDL_VERSIONNUM_MAJOR(v),
            SDL_VERSIONNUM_MINOR(v), SDL_VERSIONNUM_MICRO(v));

    SDL_Window *win = NULL;
    SDL_Renderer *ren = NULL;
    if (!SDL_CreateWindowAndRenderer("Himawari Spike A", 1280, 720, SDL_WINDOW_RESIZABLE, &win, &ren)) {
        SDL_Log("window: failed: %s", SDL_GetError());
        SDL_Quit();
        return 1;
    }
    SDL_Log("window: OK, renderer %s", SDL_GetRendererName(ren));
    SDL_SetRenderLogicalPresentation(ren, CANVAS_W, CANVAS_H, SDL_LOGICAL_PRESENTATION_LETTERBOX);
    SDL_SetRenderVSync(ren, 1);

    /* Audio: a 0.5 s 440 Hz tone with a linear fade-out, played through SDL3_mixer. */
    MIX_Mixer *mixer = NULL;
    MIX_Audio *beep = NULL;
    if (!MIX_Init()) {
        SDL_Log("audio: MIX_Init failed: %s", SDL_GetError());
        failures++;
    } else if (!(mixer = MIX_CreateMixerDevice(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, NULL))) {
        SDL_Log("audio: MIX_CreateMixerDevice failed: %s", SDL_GetError());
        failures++;
    } else {
        for (int i = 0; i < TONE_SAMPLES; i++) {
            float t = (float)i / (float)TONE_RATE;
            float env = 1.0f - (float)i / (float)TONE_SAMPLES;
            tone[i] = 0.25f * env * sinf(2.0f * 3.14159265f * 440.0f * t);
        }
        const SDL_AudioSpec spec = { .format = SDL_AUDIO_F32, .channels = 1, .freq = TONE_RATE };
        beep = MIX_LoadRawAudio(mixer, tone, sizeof tone, &spec);
        if (!beep || !MIX_PlayAudio(mixer, beep)) {
            SDL_Log("audio: could not play tone: %s", SDL_GetError());
            failures++;
        } else {
            SDL_Log("audio: OK, playing 440 Hz tone");
        }
    }

    /* Text: Japanese rendered with FreeType. */
    FT_Library ft = NULL;
    FT_Face face = NULL;
    SDL_Texture *text = NULL;
    if (FT_Init_FreeType(&ft) != 0) {
        SDL_Log("text: FT_Init_FreeType failed");
    } else {
        FT_Int ft_major, ft_minor, ft_patch;
        FT_Library_Version(ft, &ft_major, &ft_minor, &ft_patch);
        SDL_Log("text: FreeType %d.%d.%d", ft_major, ft_minor, ft_patch);
        face = open_font(ft, font_path);
        if (face && FT_Set_Pixel_Sizes(face, 0, 64) == 0) {
            text = render_text(ren, face, TEXT);
        }
    }
    if (text) {
        SDL_Log("text: OK");
    } else {
        SDL_Log("text: failed");
        failures++;
    }

    bool running = true;
    int frame = 0;
    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_EVENT_QUIT || (e.type == SDL_EVENT_KEY_DOWN && e.key.key == SDLK_ESCAPE)) {
                running = false;
            }
        }
        SDL_SetRenderDrawColor(ren, 0x2b, 0x2d, 0x42, 255);
        SDL_RenderClear(ren);
        if (text) {
            float tw = 0, th = 0;
            SDL_GetTextureSize(text, &tw, &th);
            const SDL_FRect dst = { ((float)CANVAS_W - tw) / 2.0f, ((float)CANVAS_H - th) / 2.0f, tw, th };
            SDL_RenderTexture(ren, text, NULL, &dst);
        }
        if (screenshot_path && frame == 0) {
            SDL_Surface *shot = SDL_RenderReadPixels(ren, NULL);
            if (!shot || !SDL_SaveBMP(shot, screenshot_path)) {
                SDL_Log("screenshot: failed: %s", SDL_GetError());
                failures++;
            } else {
                SDL_Log("screenshot: %s", screenshot_path);
            }
            SDL_DestroySurface(shot);
        }
        SDL_RenderPresent(ren);
        if (max_frames > 0 && ++frame >= max_frames) {
            running = false;
        }
    }

    SDL_DestroyTexture(text);
    if (face) {
        FT_Done_Face(face);
    }
    if (ft) {
        FT_Done_FreeType(ft);
    }
    if (beep) {
        MIX_DestroyAudio(beep);
    }
    if (mixer) {
        MIX_DestroyMixer(mixer);
    }
    MIX_Quit();
    SDL_DestroyRenderer(ren);
    SDL_DestroyWindow(win);
    SDL_Quit();

    if (failures == 0) {
        SDL_Log("Spike A: window, audio, and Japanese text OK");
        return 0;
    }
    SDL_Log("Spike A: %d check(s) failed", failures);
    return 1;
}
