/*
 * Saves and rollback anywhere (BREAK_IT.md E-13 to E-15), on any compiled game:
 *
 *   test_saveany a.hwb [b.hwb ...]
 *
 * With no arguments it checks the conformance cases. For each game, at every
 * line (up to a limit), with menu choices picked by a fixed rule:
 *  - E-13: save, load into a fresh VM, and play on; the transcript equals
 *          restoring the same checkpoint directly and playing on;
 *  - E-14: roll back one checkpoint and play on; the transcript equals
 *          restoring that earlier checkpoint directly and playing on;
 *  - E-15: when X.edited.hwb sits beside X.hwb (the story after an edit), each
 *          save loads into it exactly, remapped, by fallback, or is refused,
 *          and play then goes on without a crash (ASan watches under win64-asan).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_hwb.h"
#include "hw_play.h"
#include "hw_save.h"
#include "hw_vm.h"

#define MAX_LINES 80 /* lines tried per game */
#define MAX_EVENTS 4000

static int failures = 0;
static const char *current = "";

#define CHECK(cond)                                                                        \
    do {                                                                                   \
        if (!(cond)) {                                                                     \
            fprintf(stderr, "%s: %s:%d: CHECK failed: %s\n", current, __FILE__, __LINE__, #cond); \
            failures++;                                                                    \
        }                                                                                  \
    } while (0)

static uint8_t *read_file(const char *path, size_t *size)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t *p = malloc(n > 0 ? (size_t)n : 1);
    if (p && fread(p, 1, (size_t)n, f) != (size_t)n) {
        free(p);
        p = NULL;
    }
    fclose(f);
    *size = (size_t)n;
    return p;
}

/* The same option every time a given menu shows the same number of options. */
static uint32_t pick(const hw_event *ev)
{
    return ev->option_count ? (ev->pc * 2654435761u) % ev->option_count : 0;
}

static void on_checkpoint(void *user, const hw_vm *vm)
{
    hw_history *h = user;
    uint8_t *snap = malloc(h->snap_size);
    if (!snap) return;
    hw_vm_snapshot(vm, snap);
    hw_history_push(h, snap);
    free(snap);
}

/* Plays on to the end (or the event limit), as a transcript with the final variables. */
static void rest(hw_vm *vm, hw_buf *out)
{
    vm->checkpoint = NULL;
    hw_event ev;
    for (int i = 0; i < MAX_EVENTS && hw_vm_next(vm, &ev); i++) {
        hw_describe_event(vm, &ev, out);
        hw_buf_put(out, "\n", 1);
        if (ev.kind == HW_EV_MENU) hw_vm_choose(vm, pick(&ev));
    }
    hw_buf_printf(out, "error=%s\n", vm->error);
    char v[64];
    for (uint32_t i = 0; i < vm->m->var_count; i++) {
        hw_vm_value_text(vm, i, vm->vars[i], v, sizeof v);
        hw_buf_printf(out, "%s=%s ", hw_str(vm->m, vm->m->vars[i].name), v);
    }
}

/* Plays until the n-th line (SAY), recording checkpoints. False when the story ends first. */
static bool play_to_say(hw_vm *vm, hw_history *h, int n)
{
    vm->checkpoint = on_checkpoint;
    vm->checkpoint_user = h;
    hw_event ev;
    int says = 0;
    for (int i = 0; i < MAX_EVENTS && hw_vm_next(vm, &ev); i++) {
        if (ev.kind == HW_EV_MENU) hw_vm_choose(vm, pick(&ev));
        if (ev.kind == HW_EV_SAY && ++says == n) return true;
    }
    return false;
}

static bool same(const hw_buf *a, const hw_buf *b)
{
    return a->len == b->len && memcmp(a->data, b->data, a->len) == 0;
}

/*
 * Plays from a snapshot in a fresh VM. Global variables (scope "global", like endings seen) are
 * not part of saves or rollback by design, so the fresh VM takes them from `globals`.
 */
static void rest_from(const hw_module *m, const void *snap, const hw_vm *globals, hw_buf *out)
{
    hw_vm v;
    if (!hw_vm_init(&v, m, 7)) return;
    for (uint32_t i = 0; globals && i < m->var_count; i++)
        if (m->vars[i].scope == HW_SCOPE_GLOBAL) v.vars[i] = globals->vars[i];
    hw_vm_restore(&v, snap);
    rest(&v, out);
    hw_vm_free(&v);
}

static void check_game(const char *path)
{
    current = path;
    size_t size = 0;
    uint8_t *bytes = read_file(path, &size);
    CHECK(bytes != NULL);
    if (!bytes) return;
    hw_module m;
    char err[200];
    bool loaded = hw_module_load(&m, bytes, size, err, sizeof err);
    free(bytes);
    CHECK(loaded);
    if (!loaded) return;

    /* The story after an edit, if there is one (E-15). */
    char edited_path[1024];
    snprintf(edited_path, sizeof edited_path, "%.*s.edited.hwb", (int)(strlen(path) > 4 ? strlen(path) - 4 : 0), path);
    hw_module edited;
    bool has_edited = false;
    uint8_t *eb = read_file(edited_path, &size);
    if (eb) {
        has_edited = hw_module_load(&edited, eb, size, err, sizeof err);
        free(eb);
    }

    int tried = 0;
    for (int k = 1; k <= MAX_LINES; k++) {
        hw_vm a;
        hw_history h;
        if (!hw_vm_init(&a, &m, 7)) break;
        hw_history_init(&h, hw_vm_snapshot_size(&a), 256);
        hw_vm_start(&a, HW_NONE);
        if (!play_to_say(&a, &h, k) || h.count == 0) {
            hw_history_free(&h);
            hw_vm_free(&a);
            break;
        }
        tried++;
        const void *snap = hw_history_peek(&h, 0);

        /* E-13: save here, load into a fresh VM, play on. */
        uint32_t pcs[HW_SAVE_HISTORY];
        uint32_t npcs = 0;
        for (uint32_t i = 1; i < h.count && npcs < HW_SAVE_HISTORY; i++) pcs[npcs++] = hw_snapshot_pc(hw_history_peek(&h, i));
        hw_save_info info;
        memset(&info, 0, sizeof info);
        hw_buf file = { 0 };
        CHECK(hw_save_write(&a, snap, pcs, npcs, &info, &file));
        hw_buf direct = { 0 }, loaded_play = { 0 };
        rest_from(&m, snap, NULL, &direct);
        hw_vm b;
        if (hw_vm_init(&b, &m, 99)) {
            hw_save_result r = hw_save_load(&b, (const uint8_t *)file.data, file.len, NULL, err, sizeof err);
            CHECK(r == HW_SAVE_EXACT);
            if (r == HW_SAVE_EXACT) {
                rest(&b, &loaded_play);
                if (!same(&direct, &loaded_play)) {
                    fprintf(stderr, "%s: E-13 at line %d: a loaded save plays differently\n", path, k);
                    failures++;
                }
            }
            hw_vm_free(&b);
        }

        /* E-14: roll back one checkpoint, play on. */
        if (h.count >= 2) {
            hw_buf earlier = { 0 }, rolled = { 0 };
            rest_from(&m, hw_history_peek(&h, 1), &a, &earlier);
            CHECK(hw_rollback(&a, &h));
            rest(&a, &rolled);
            if (!same(&earlier, &rolled)) {
                fprintf(stderr, "%s: E-14 at line %d: rolling back plays differently from that checkpoint\n", path, k);
                if (getenv("HW_SAVEANY_VERBOSE")) fprintf(stderr, "--- restored directly:\n%.*s\n--- rolled back:\n%.*s\n", (int)earlier.len, earlier.data, (int)rolled.len, rolled.data);
                failures++;
            }
            hw_buf_free(&earlier);
            hw_buf_free(&rolled);
        }

        /* E-15: the save in the edited story: loads somehow or is refused, and never crashes. */
        if (has_edited) {
            hw_vm c;
            if (hw_vm_init(&c, &edited, 3)) {
                hw_save_result r = hw_save_load(&c, (const uint8_t *)file.data, file.len, NULL, err, sizeof err);
                if (r != HW_SAVE_BAD) {
                    hw_buf after = { 0 };
                    rest(&c, &after);
                    hw_buf_free(&after);
                } else {
                    CHECK(err[0] != 0); /* a refusal says why */
                }
                hw_vm_free(&c);
            }
        }

        hw_buf_free(&file);
        hw_buf_free(&direct);
        hw_buf_free(&loaded_play);
        hw_history_free(&h);
        hw_vm_free(&a);
    }
    CHECK(tried > 0);
    if (has_edited) hw_module_free(&edited);
    hw_module_free(&m);
}

int main(int argc, char **argv)
{
    if (argc > 1) {
        for (int i = 1; i < argc; i++) check_game(argv[i]);
    } else {
#ifdef HW_CONFORMANCE_DIR
        static const char *const cases[] = { "basic", "flow", "extend", "l10n", "text" };
        for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
            char path[1024];
            snprintf(path, sizeof path, "%s/%s/expected.hwb", HW_CONFORMANCE_DIR, cases[i]);
            check_game(path);
        }
#endif
    }
    if (failures == 0) printf("test_saveany: ok\n");
    return failures == 0 ? 0 : 1;
}
