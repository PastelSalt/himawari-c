/*
 * Conformance suite, execution half (plan §16.2). For each case in
 * tests/conformance/cases/ with an expected.hwb (written by the TS half), play
 * every line of playthroughs.txt and compare the transcript with
 * expected.transcript.
 *
 * playthroughs.txt: one playthrough per line. Numbers are menu choices (the
 * index among the options shown), `@ja` picks a language, `seed=N` seeds the
 * RNG (default 1), and `-` alone is a playthrough with no choices. Blank lines
 * and `#` comments are ignored.
 *
 * Regenerate expected files (then review the diff!) by running this test with
 * UPDATE_CONFORMANCE=1 in the environment.
 */
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include "hw_hwb.h"
#include "hw_play.h"

static char *read_file(const char *path, size_t *size)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *p = malloc((n > 0 ? (size_t)n : 0) + 1);
    if (p && fread(p, 1, (size_t)n, f) != (size_t)n) {
        free(p);
        p = NULL;
    }
    fclose(f);
    if (p) p[n] = 0;
    *size = (size_t)n;
    return p;
}

static bool write_file(const char *path, const char *data, size_t size)
{
    FILE *f = fopen(path, "wb");
    if (!f) return false;
    bool ok = fwrite(data, 1, size, f) == size;
    return fclose(f) == 0 && ok;
}

/* Plays every playthrough of one case into `out`. */
static bool play_case(const hw_module *m, char *playthroughs, hw_buf *out)
{
    char *save = NULL;
    for (char *line = strtok_r(playthroughs, "\n", &save); line; line = strtok_r(NULL, "\n", &save)) {
        char *hash = strchr(line, '#');
        if (hash) *hash = 0;
        uint32_t choices[256];
        hw_transcript_options o = { choices, 0, NULL, 1, 0 };
        char lang[16] = "";
        bool any = false;
        char *tsave = NULL;
        for (char *tok = strtok_r(line, " \t\r", &tsave); tok; tok = strtok_r(NULL, " \t\r", &tsave)) {
            any = true;
            if (strcmp(tok, "-") == 0) {
                continue;
            } else if (tok[0] == '@') {
                snprintf(lang, sizeof lang, "%s", tok + 1);
                o.language = lang;
            } else if (strncmp(tok, "seed=", 5) == 0) {
                o.seed = strtoull(tok + 5, NULL, 10);
            } else if (o.choice_count < 256) {
                choices[o.choice_count++] = (uint32_t)strtoul(tok, NULL, 10);
            }
        }
        if (!any) continue;
        if (!hw_transcript(m, &o, out)) return false;
    }
    return true;
}

int main(void)
{
    const char *dir = HW_CONFORMANCE_DIR;
    const char *update_env = getenv("UPDATE_CONFORMANCE");
    bool update = update_env && strcmp(update_env, "1") == 0;
    int failures = 0, cases = 0;

    DIR *d = opendir(dir);
    if (!d) {
        fprintf(stderr, "can't open %s\n", dir);
        return 1;
    }
    struct dirent *e;
    while ((e = readdir(d)) != NULL) {
        if (e->d_name[0] == '.') continue;
        char hwb_path[512], plays_path[512], expected_path[512];
        snprintf(hwb_path, sizeof hwb_path, "%s/%s/expected.hwb", dir, e->d_name);
        snprintf(plays_path, sizeof plays_path, "%s/%s/playthroughs.txt", dir, e->d_name);
        snprintf(expected_path, sizeof expected_path, "%s/%s/expected.transcript", dir, e->d_name);

        size_t size;
        char *bytes = read_file(hwb_path, &size);
        if (!bytes) continue; /* a diagnostics case: nothing to run */
        cases++;

        hw_module m;
        char err[200];
        if (!hw_module_load(&m, (const uint8_t *)bytes, size, err, sizeof err)) {
            fprintf(stderr, "%s: expected.hwb doesn't load: %s\n", e->d_name, err);
            failures++;
            free(bytes);
            continue;
        }
        size_t psize;
        char *plays = read_file(plays_path, &psize);
        if (!plays) {
            fprintf(stderr, "%s: missing playthroughs.txt\n", e->d_name);
            failures++;
        } else {
            hw_buf out = { 0 };
            if (!play_case(&m, plays, &out)) {
                fprintf(stderr, "%s: out of memory\n", e->d_name);
                failures++;
            } else if (update) {
                if (!write_file(expected_path, out.data ? out.data : "", out.len)) failures++;
                printf("%s: wrote expected.transcript\n", e->d_name);
            } else {
                size_t esize;
                char *expected = read_file(expected_path, &esize);
                if (!expected) {
                    fprintf(stderr, "%s: missing expected.transcript (run with UPDATE_CONFORMANCE=1)\n", e->d_name);
                    failures++;
                } else if (esize != out.len || memcmp(expected, out.data, out.len) != 0) {
                    fprintf(stderr, "%s: transcript differs from expected.transcript. Actual:\n%s\n", e->d_name, out.data);
                    failures++;
                } else {
                    printf("%s: ok\n", e->d_name);
                }
                free(expected);
            }
            hw_buf_free(&out);
            free(plays);
        }
        hw_module_free(&m);
        free(bytes);
    }
    closedir(d);

    if (cases == 0) {
        fprintf(stderr, "no conformance cases with expected.hwb in %s\n", dir);
        return 1;
    }
    if (failures == 0) {
        printf("test_conformance: %d case(s) passed\n", cases);
        return 0;
    }
    return 1;
}
