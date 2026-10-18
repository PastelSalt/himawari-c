/* Saves (exact, remapped, fallback, damaged) and rollback, on the conformance basic case. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_hwb.h"
#include "hw_play.h"
#include "hw_save.h"
#include "hw_vm.h"

static int failures = 0;

#define CHECK(cond)                                                     \
    do {                                                                \
        if (!(cond)) {                                                  \
            fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                    __LINE__, #cond);                                   \
            failures++;                                                 \
        }                                                               \
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

static void on_checkpoint(void *user, const hw_vm *vm)
{
    hw_history *h = user;
    uint8_t *snap = malloc(h->snap_size);
    hw_vm_snapshot(vm, snap);
    hw_history_push(h, snap);
    free(snap);
}

/* Plays the rest of the story (always choosing the first option) as a transcript. */
static void rest(hw_vm *vm, hw_buf *out)
{
    hw_event ev;
    for (int i = 0; i < 200 && hw_vm_next(vm, &ev); i++) {
        hw_describe_event(vm, &ev, out);
        hw_buf_put(out, "\n", 1);
        if (ev.kind == HW_EV_MENU) hw_vm_choose(vm, 0);
    }
    char v[64];
    for (uint32_t i = 0; i < vm->m->var_count; i++) {
        hw_vm_value_text(vm, i, vm->vars[i], v, sizeof v);
        hw_buf_printf(out, "%s=%s ", hw_str(vm->m, vm->m->vars[i].name), v);
    }
}

/* Plays until the n-th SAY (the VM then waits right after it), recording checkpoints. */
static void play_to_say(hw_vm *vm, hw_history *h, int n)
{
    vm->checkpoint = on_checkpoint;
    vm->checkpoint_user = h;
    hw_event ev;
    int says = 0;
    while (hw_vm_next(vm, &ev)) {
        if (ev.kind == HW_EV_MENU) hw_vm_choose(vm, 0);
        if (ev.kind == HW_EV_SAY && ++says == n) return;
    }
}

/* Saves at the newest checkpoint. */
static void save(const hw_vm *vm, const hw_history *h, hw_buf *out)
{
    uint32_t pcs[HW_SAVE_HISTORY];
    uint32_t n = 0;
    for (uint32_t i = 1; i < h->count && n < HW_SAVE_HISTORY; i++) pcs[n++] = hw_snapshot_pc(hw_history_peek(h, i));
    hw_save_info info;
    memset(&info, 0, sizeof info);
    info.time = 1760000000;
    info.playtime_s = 42;
    snprintf(info.scene, sizeof info.scene, "talk_festival");
    snprintf(info.preview, sizeof info.preview, "next week");
    CHECK(hw_save_write(vm, hw_history_peek(h, 0), pcs, n, &info, out));
}

int main(void)
{
    char path[512];
    snprintf(path, sizeof path, "%s/basic/expected.hwb", HW_CONFORMANCE_DIR);
    size_t size;
    uint8_t *bytes = read_file(path, &size);
    CHECK(bytes != NULL);
    if (!bytes) return 1;
    hw_module m;
    char err[200];
    CHECK(hw_module_load(&m, bytes, size, err, sizeof err));
    free(bytes);

    /* Reference: play to the 7th line (inside the called scene talk_festival), save, then finish. */
    hw_vm a;
    hw_history h;
    CHECK(hw_vm_init(&a, &m, 7));
    CHECK(hw_history_init(&h, hw_vm_snapshot_size(&a), 256));
    CHECK(hw_vm_start(&a, HW_NONE));
    play_to_say(&a, &h, 7);
    CHECK(a.s.fp == 1); /* inside a call */
    hw_buf file = { 0 };
    save(&a, &h, &file);
    const uint32_t saved_pc = hw_snapshot_pc(hw_history_peek(&h, 0));
    /* The save is taken at the checkpoint, before the line: replay it from there. */
    hw_vm_restore(&a, hw_history_peek(&h, 0));
    a.checkpoint = NULL;
    hw_buf expected = { 0 };
    rest(&a, &expected);

    /* HW_WRITE_SAVE=path writes this save, e.g. as a seed for fuzz_save. */
    const char *seed_path = getenv("HW_WRITE_SAVE");
    if (seed_path) {
        FILE *f = fopen(seed_path, "wb");
        if (f) {
            fwrite(file.data, 1, file.len, f);
            fclose(f);
        }
    }

    hw_save_info info;
    CHECK(hw_save_peek((const uint8_t *)file.data, file.len, &info));
    CHECK(info.playtime_s == 42 && strcmp(info.preview, "next week") == 0 && info.time == 1760000000);

    /* 1. Same build: exact. */
    hw_vm b;
    CHECK(hw_vm_init(&b, &m, 99));
    CHECK(hw_save_load(&b, (const uint8_t *)file.data, file.len, NULL, err, sizeof err) == HW_SAVE_EXACT);
    hw_buf got = { 0 };
    rest(&b, &got);
    CHECK(got.len == expected.len && memcmp(got.data, expected.data, got.len) == 0);
    hw_buf_free(&got);
    hw_vm_free(&b);

    /* 2. Another build (simulated by a different CRC): remapped by line ID, same story. */
    uint32_t crc = m.crc;
    m.crc ^= 1;
    CHECK(hw_vm_init(&b, &m, 99));
    CHECK(hw_save_load(&b, (const uint8_t *)file.data, file.len, NULL, err, sizeof err) == HW_SAVE_REMAPPED);
    rest(&b, &got);
    CHECK(got.len == expected.len && memcmp(got.data, expected.data, got.len) == 0);
    hw_buf_free(&got);
    hw_vm_free(&b);

    /* 3. The saved line was deleted: fall back to an earlier checkpoint, with a notice. */
    uint32_t say_line = m.code[saved_pc + 1];
    uint32_t id = m.lines[say_line].line_id;
    m.lines[say_line].line_id = 0x3FFFFFFFu;
    CHECK(hw_vm_init(&b, &m, 99));
    hw_save_result fr = hw_save_load(&b, (const uint8_t *)file.data, file.len, NULL, err, sizeof err);
    if (fr != HW_SAVE_FALLBACK) fprintf(stderr, "fallback case: result %d, %s\n", (int)fr, err);
    CHECK(fr == HW_SAVE_FALLBACK);
    CHECK(b.s.pc != saved_pc && hw_op(m.code[b.s.pc]) == HW_OP_SAY);
    hw_vm_free(&b);
    m.lines[say_line].line_id = id;
    m.crc = crc;

    /* 4. Damage and other games are refused without touching the VM. */
    CHECK(hw_vm_init(&b, &m, 99));
    uint8_t *bad = malloc(file.len);
    memcpy(bad, file.data, file.len);
    bad[file.len / 2] ^= 0x10;
    CHECK(hw_save_load(&b, bad, file.len, NULL, err, sizeof err) == HW_SAVE_BAD && strstr(err, "damaged"));
    CHECK(hw_save_load(&b, bad, 10, NULL, err, sizeof err) == HW_SAVE_BAD);
    CHECK(b.s.status == HW_VM_IDLE);
    free(bad);
    hw_vm_free(&b);
    uint32_t game_id = m.game_id;
    m.game_id = m.title;
    CHECK(hw_vm_init(&b, &m, 99));
    CHECK(hw_save_load(&b, (const uint8_t *)file.data, file.len, NULL, err, sizeof err) == HW_SAVE_BAD && strstr(err, "another game"));
    hw_vm_free(&b);
    m.game_id = game_id;

    /* 5. Rollback: step back one line and replay it. */
    hw_vm c;
    hw_history hc;
    CHECK(hw_vm_init(&c, &m, 1));
    CHECK(hw_history_init(&hc, hw_vm_snapshot_size(&c), 256));
    CHECK(hw_vm_start(&c, HW_NONE));
    play_to_say(&c, &hc, 3);
    uint32_t before = hc.count;
    CHECK(hw_rollback(&c, &hc));
    hw_event ev;
    CHECK(hw_vm_next(&c, &ev) && ev.kind == HW_EV_SAY);
    char text[128];
    hw_vm_line_markup(&c, ev.line, text, sizeof text);
    CHECK(strcmp(text, "Sorry, sorry...") == 0); /* the 2nd line again */
    CHECK(hc.count == before - 1);
    /* Rolling back stops at the first checkpoint. */
    while (hw_rollback(&c, &hc)) CHECK(hw_vm_next(&c, &ev));
    CHECK(hc.count == 1);

    /* The ring keeps the newest snapshots. */
    hw_history small;
    CHECK(hw_history_init(&small, sizeof(uint32_t), 3));
    for (uint32_t i = 1; i <= 5; i++) hw_history_push(&small, &i);
    uint32_t v;
    memcpy(&v, hw_history_peek(&small, 0), sizeof v);
    CHECK(v == 5 && small.count == 3);
    memcpy(&v, hw_history_peek(&small, 2), sizeof v);
    CHECK(v == 3 && hw_history_peek(&small, 3) == NULL);
    hw_history_free(&small);

    /* Warp: talk_rumor is only reachable after the festival, so the reconstructed state has heard_rumor. */
    uint32_t target = hw_warp_target(&m, "talk_rumor");
    CHECK(target != HW_NONE && target == hw_warp_target(&m, "ch1.hws:49"));
    CHECK(hw_warp_target(&m, "script/ch1.hws:48") == target);
    CHECK(hw_warp_target(&m, "#c7d8e9") == target); /* by line ID */
    CHECK(hw_warp_target(&m, "#w1x2y3") != HW_NONE && hw_op(m.code[hw_warp_target(&m, "#w1x2y3")]) == HW_OP_MENU); /* an option's menu */
    CHECK(hw_warp_target(&m, "#zzzzzz") == HW_NONE && hw_warp_target(&m, "#bad") == HW_NONE);
    CHECK(hw_warp_target(&m, "nowhere.hws:3") == HW_NONE && hw_warp_target(&m, "no_scene") == HW_NONE);
    uint8_t *warp_snap = malloc(hw_vm_snapshot_size(&c));
    CHECK(warp_snap && hw_warp(&m, target, 1, 0, warp_snap));
    hw_vm w;
    CHECK(hw_vm_init(&w, &m, 1));
    hw_vm_restore(&w, warp_snap);
    CHECK(hw_vm_next(&w, &ev) && ev.kind == HW_EV_SAY && ev.pc == target);
    CHECK(w.vars[hw_module_find_var(&m, "heard_rumor")] == 1);
    CHECK(w.s.fp == 1); /* inside the call from ch1_hub */
    hw_vm_free(&w);
    free(warp_snap);

    /* Version 2 (Phase 5): the NVL page, extension state, and a thumbnail survive a save. */
    {
        char xpath[512];
        snprintf(xpath, sizeof xpath, "%s/extend/expected.hwb", HW_CONFORMANCE_DIR);
        size_t xsize = 0;
        uint8_t *xbytes = read_file(xpath, &xsize);
        hw_module xm;
        CHECK(xbytes && hw_module_load(&xm, xbytes, xsize, err, sizeof err));
        hw_vm x;
        hw_history xh;
        CHECK(hw_vm_init(&x, &xm, 1) && hw_history_init(&xh, hw_vm_snapshot_size(&x), 64) && hw_vm_start(&x, HW_NONE));
        play_to_say(&x, &xh, 3); /* the second line of the NVL page */
        CHECK(x.s.display.textbox == HW_TEXTBOX_NVL && x.s.display.page_count == 2);
        /* The checkpoint before that line, as if screen_tint(night) had run. */
        uint8_t *snap = malloc(xh.snap_size);
        memcpy(snap, hw_history_peek(&xh, 0), xh.snap_size);
        hw_vm_core core;
        memcpy(&core, snap, sizeof core);
        uint32_t night = hw_module_find_string(&xm, "night");
        core.display.ext_called = 2u; /* screen_tint is XTNS 1 */
        core.display.ext_last[1][0] = night;
        core.display.ext_last[1][1] = 250;
        memcpy(snap, &core, sizeof core);
        static const uint8_t thumb[5] = { 'Q', 'O', 'I', 'F', 9 };
        hw_save_info xi;
        memset(&xi, 0, sizeof xi);
        xi.thumb = thumb;
        xi.thumb_size = sizeof thumb;
        hw_buf xf = { 0 };
        CHECK(hw_save_write(&x, snap, NULL, 0, &xi, &xf));
        hw_save_info peek;
        CHECK(hw_save_peek((const uint8_t *)xf.data, xf.len, &peek));
        CHECK(peek.thumb_size == sizeof thumb && memcmp(peek.thumb, thumb, sizeof thumb) == 0);
        hw_vm y;
        CHECK(hw_vm_init(&y, &xm, 5));
        CHECK(hw_save_load(&y, (const uint8_t *)xf.data, xf.len, NULL, err, sizeof err) == HW_SAVE_EXACT);
        CHECK(y.s.display.textbox == HW_TEXTBOX_NVL && y.s.display.page_count == 1 && y.s.display.ext_called == 2u &&
              y.s.display.ext_last[1][0] == night && y.s.display.ext_last[1][1] == 250);
        CHECK(hw_vm_next(&y, &ev) && ev.kind == HW_EV_SAY && y.s.display.page_count == 2);
        hw_vm_free(&y);

        /* Rewinding inside the NVL page: the page goes back to what it was before that line, then fills again. */
        CHECK(hw_rollback(&x, &xh));
        CHECK(x.s.display.textbox == HW_TEXTBOX_NVL && x.s.display.page_count == 0);
        CHECK(hw_vm_next(&x, &ev) && ev.kind == HW_EV_SAY && x.s.display.page_count == 1);
        CHECK(hw_rollback(&x, &xh)); /* back before "textbox nvl": an ordinary textbox */
        CHECK(x.s.display.textbox == HW_TEXTBOX_ADV && x.s.display.page_count == 0);
        hw_buf_free(&xf);
        free(snap);
        hw_history_free(&xh);
        hw_vm_free(&x);
        hw_module_free(&xm);
        free(xbytes);
    }

    hw_history_free(&hc);
    hw_vm_free(&c);
    hw_buf_free(&expected);
    hw_buf_free(&file);
    hw_history_free(&h);
    hw_vm_free(&a);
    hw_module_free(&m);
    if (failures == 0) {
        printf("test_save: all checks passed\n");
        return 0;
    }
    return 1;
}
