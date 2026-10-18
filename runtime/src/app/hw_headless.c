#include "hw_headless.h"

#include <SDL3/SDL.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_hwb.h"
#include "hw_play.h"
#include "hw_vfs.h"

uint8_t *hw_read_file(const char *path, size_t *size)
{
    /* A pack: the game's bytecode is its game.hwb entry, with patches applied (spec/pack.md). */
    size_t n = strlen(path);
    if (n > 4 && SDL_strcasecmp(path + n - 4, ".hwp") == 0) {
        char dir[1100], err[200];
        snprintf(dir, sizeof dir, "%s", path);
        char *slash = strrchr(dir, '/'), *bslash = strrchr(dir, '\\');
        if (bslash > slash) slash = bslash;
        if (slash) slash[1] = 0;
        else dir[0] = 0;
        hw_vfs *v = hw_vfs_create();
        uint8_t *bytes = NULL;
        if (v && hw_vfs_mount_packs(v, dir[0] ? dir : ".", err, sizeof err)) bytes = hw_vfs_load(v, "game.hwb", size);
        else SDL_SetError("%s", v ? err : "out of memory");
        hw_vfs_destroy(v);
        return bytes;
    }
    /* SDL_LoadFile takes UTF-8 paths, so non-ASCII user folders work (plan §8.13). */
    return SDL_LoadFile(path, size);
}

bool hw_write_file(const char *path, const void *data, size_t size)
{
    return SDL_SaveFile(path, data, size);
}

static const char *HEADLESS_USAGE =
    "Usage: himawari --headless [game.hwb | --project DIR] MODE [--out FILE]\n"
    "Modes:\n"
    "  --playtest [max_steps=N] [seed=N] [lang=xx]\n"
    "      Explore every menu choice; report endings, errors, and coverage.\n"
    "  --transcript \"0 1 2\" [seed=N] [lang=xx]\n"
    "      Play with these menu choices and print every event.\n";

/* key=value arguments after the mode. */
static const char *kv(int argc, char **argv, const char *key)
{
    size_t n = strlen(key);
    for (int i = 1; i < argc; i++) {
        if (strncmp(argv[i], key, n) == 0 && argv[i][n] == '=') return argv[i] + n + 1;
    }
    return NULL;
}

static const char *flag_value(int argc, char **argv, const char *flag)
{
    for (int i = 1; i + 1 < argc; i++) {
        if (strcmp(argv[i], flag) == 0) return argv[i + 1];
    }
    return NULL;
}

static bool has_flag(int argc, char **argv, const char *flag)
{
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], flag) == 0) return true;
    }
    return false;
}

static void print_place(const hw_module *m, uint32_t pc)
{
    uint32_t scene = hw_module_scene_at(m, pc);
    const char *file;
    uint32_t line;
    printf("%s", scene == HW_NONE ? "?" : hw_str(m, m->scenes[scene].name));
    if (hw_module_source_at(m, pc, &file, &line)) printf(" (%s:%u)", file, (unsigned)line);
}

static int playtest(const hw_module *m, int argc, char **argv, const char *game)
{
    hw_playtest_options o = { 1, 0, NULL };
    const char *v;
    if ((v = kv(argc, argv, "seed")) != NULL) o.seed = strtoull(v, NULL, 10);
    if ((v = kv(argc, argv, "max_steps")) != NULL) o.max_steps = (uint32_t)strtoul(v, NULL, 10);
    if ((v = kv(argc, argv, "lang")) != NULL) o.language = v;
    if ((v = kv(argc, argv, "strategy")) != NULL && strcmp(v, "all_paths") != 0) {
        fprintf(stderr, "himawari: unknown strategy \"%s\" (available: all_paths)\n", v);
        return 2;
    }

    hw_playtest_report r;
    if (!hw_playtest(m, &o, &r)) {
        fprintf(stderr, "himawari: out of memory during the playtest\n");
        return 2;
    }
    printf("Playtest of %s \"%s\" (seed %llu%s%s)\n", game, hw_str(m, m->title), (unsigned long long)o.seed,
           o.language ? ", language " : "", o.language ? o.language : "");
    printf("  %u path(s), %u menu state(s), %u event(s)%s\n", (unsigned)r.paths, (unsigned)r.menus, (unsigned)r.steps,
           !r.step_limit ? ""
           : r.covered ? " - every menu and option was tried; not every combination (raise max_steps for more)"
                       : " - stopped at the step limit before trying every option, raise max_steps");
    printf("  endings: %u of %u reached\n", (unsigned)r.ending_count, (unsigned)r.ending_total);
    for (uint32_t i = 0; i < r.ending_count; i++) {
        printf("    reached   ");
        print_place(m, r.endings[i].pc);
        printf(", %u path(s)\n", (unsigned)r.endings[i].hits);
    }
    for (uint32_t i = 0; i < r.unreached_count; i++) {
        printf(r.step_limit && !r.covered ? "    not reached yet (step limit) " : "    UNREACHED ");
        print_place(m, r.unreached_endings[i]);
        printf("\n");
    }
    printf("  lines: %u of %u seen; options: %u of %u chosen\n", (unsigned)r.lines_seen, (unsigned)r.lines_total,
           (unsigned)r.options_chosen, (unsigned)r.options_total);
    if (r.div_by_zero) printf("  note: %u division(s) by zero (the result was 0)\n", (unsigned)r.div_by_zero);
    for (uint32_t i = 0; i < r.error_count; i++) printf("  ERROR (%u path(s)): %s\n", (unsigned)r.errors[i].hits, r.errors[i].message);
    /* A big story has too many combinations to try them all: once every option was tried, the step limit isn't a problem. */
    bool problems = r.error_count > 0 || r.unreached_count > 0 || (r.step_limit && !r.covered);
    printf("%s\n", problems ? "Problems found." : "OK: every ending reached, no errors.");

    int code = problems ? 1 : 0;
    const char *out = flag_value(argc, argv, "--out");
    if (out) {
        hw_buf json = { 0 };
        hw_playtest_report_json(m, &r, &json);
        if (json.oom || !hw_write_file(out, json.data, json.len)) {
            fprintf(stderr, "himawari: can't write %s: %s\n", out, SDL_GetError());
            code = 2;
        }
        hw_buf_free(&json);
    }
    hw_playtest_report_free(&r);
    return code;
}

static int transcript(const hw_module *m, int argc, char **argv)
{
    const char *list = flag_value(argc, argv, "--transcript");
    uint32_t choices[1024];
    hw_transcript_options o = { choices, 0, NULL, 1, 0 };
    if (list) {
        const char *p = list;
        while (*p && o.choice_count < 1024) {
            char *end;
            unsigned long k = strtoul(p, &end, 10);
            if (end == p) {
                p++;
                continue;
            }
            choices[o.choice_count++] = (uint32_t)k;
            p = end;
        }
    }
    const char *v;
    if ((v = kv(argc, argv, "seed")) != NULL) o.seed = strtoull(v, NULL, 10);
    if ((v = kv(argc, argv, "lang")) != NULL) o.language = v;
    hw_buf out = { 0 };
    bool ok = hw_transcript(m, &o, &out);
    const char *path = flag_value(argc, argv, "--out");
    if (ok && path) ok = hw_write_file(path, out.data, out.len);
    else if (ok) fwrite(out.data, 1, out.len, stdout);
    hw_buf_free(&out);
    return ok ? 0 : 2;
}

int hw_headless_main(int argc, char **argv, const char *game)
{
    bool want_playtest = has_flag(argc, argv, "--playtest");
    bool want_transcript = has_flag(argc, argv, "--transcript");
    if (want_playtest == want_transcript) {
        fputs(HEADLESS_USAGE, stderr);
        return 2;
    }
    size_t size = 0;
    uint8_t *bytes = hw_read_file(game, &size);
    if (!bytes) {
        fprintf(stderr, "himawari: can't read %s: %s\n", game, SDL_GetError());
        return 2;
    }
    hw_module m;
    char err[200];
    if (!hw_module_load(&m, bytes, size, err, sizeof err)) {
        fprintf(stderr, "himawari: %s isn't a playable .hwb file: %s\n", game, err);
        SDL_free(bytes);
        return 2;
    }
    SDL_free(bytes);
    int code = want_playtest ? playtest(&m, argc, argv, game) : transcript(&m, argc, argv);
    hw_module_free(&m);
    return code;
}
