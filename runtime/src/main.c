/*
 * Himawari-C, the game runtime (plan §8). One executable:
 *
 *   himawari [game.hwb]                       play (default: game.hwb beside the exe)
 *   himawari --project DIR [--dev]            play DIR/build/game.hwb with loose assets
 *   himawari --headless … --playtest | --transcript   no window (plan §8.12)
 */
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#endif

#include "hw_game.h"
#include "hw_headless.h"
#include "hw_hwb.h"
#include "hw_pack.h"
#include "hw_version.h"

static const char *USAGE =
    "Himawari-C " HW_VERSION_STRING "\n"
    "Usage:\n"
    "  himawari [game.hwb] [--lang xx]       play (default: game.hwb beside himawari.exe)\n"
    "  himawari --project DIR [--dev]        play DIR/build/game.hwb, assets from DIR/assets\n"
    "           [--no-gpu]                   use the default renderer (rule wipes become dissolves)\n"
    "           [--warp scene | file:line | #lineid]  start at that line, with a state reconstructed along a real path\n"
    "           [--text-speed N]             characters per second for this run (1000 = instant)\n"
    "  himawari --headless [game.hwb | --project DIR] --playtest [max_steps=N] [seed=N] [lang=xx] [--out report.json]\n"
    "  himawari --headless [game.hwb | --project DIR] --transcript \"0 1\" [seed=N] [lang=xx] [--out file.txt]\n"
    "  himawari --version\n";

/* Console output for --headless and --help, even from a GUI-subsystem release build. */
static void attach_console(void)
{
#ifdef _WIN32
    /* Output already redirected (to a file or a pipe) keeps going there. */
    HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE), err = GetStdHandle(STD_ERROR_HANDLE);
    bool has_out = out != NULL && out != INVALID_HANDLE_VALUE;
    bool has_err = err != NULL && err != INVALID_HANDLE_VALUE;
    if ((!has_out || !has_err) && AttachConsole(ATTACH_PARENT_PROCESS)) {
        if (!has_out) (void)freopen("CONOUT$", "w", stdout);
        if (!has_err) (void)freopen("CONOUT$", "w", stderr);
    }
    SetConsoleOutputCP(CP_UTF8);
#endif
}

int main(int argc, char **argv)
{
    bool headless = false;
    const char *project = NULL, *game = NULL;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--headless") == 0) headless = true;
        else if (strcmp(argv[i], "--project") == 0 && i + 1 < argc) project = argv[++i];
        else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            attach_console();
            fputs(USAGE, stdout);
            return 0;
        } else if (strcmp(argv[i], "--version") == 0) {
            attach_console();
            printf("himawari %s (bytecode %d.%d, packs %d.%d, %s)\n", HW_VERSION_STRING, HW_HWB_MAJOR, HW_HWB_MINOR, HW_PACK_MAJOR, HW_PACK_MINOR,
                   GetACP() == CP_UTF8 ? "UTF-8 code page" : "legacy code page: the manifest is missing");
            return 0;
        } else {
            size_t n = strlen(argv[i]);
            if (n > 4 && (SDL_strcasecmp(argv[i] + n - 4, ".hwb") == 0 || SDL_strcasecmp(argv[i] + n - 4, ".hwp") == 0)) game = argv[i];
        }
    }

    char path[1024];
    if (!game && project) {
        snprintf(path, sizeof path, "%s/build/game.hwb", project);
        game = path;
    } else if (!game) {
        /* A shipped game: data.hwp beside the exe (plan §8.12); else game.hwb with loose assets. */
        const char *base = SDL_GetBasePath();
        snprintf(path, sizeof path, "%sdata.hwp", base ? base : "");
        if (!SDL_GetPathInfo(path, NULL)) snprintf(path, sizeof path, "%sgame.hwb", base ? base : "");
        game = path;
    }

    if (headless) {
        attach_console();
        return hw_headless_main(argc, argv, game);
    }
    return hw_game_main(argc, argv, game, project);
}
