/*
 * libFuzzer target for the .hwb loader and the VM (plan §16.1, Phase 2 exit:
 * "loaders survive 10 minutes of fuzzing"). Build with the `win64-fuzz`
 * preset; seed the corpus with tests/conformance/cases/ * /expected.hwb.
 *
 * The harness rewrites the header's size and CRC before loading, so mutations
 * reach the structural checks instead of stopping at the checksum. Whatever
 * loads is then played: the loader promises that a loaded module is safe to
 * run, so the VM, text evaluation, snapshots, and the playtest explorer must
 * never crash on it.
 */
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_hwb.h"
#include "hw_play.h"
#include "hw_vm.h"

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

static void play(const hw_module *m)
{
    hw_vm vm;
    if (!hw_vm_init(&vm, m, 1)) return;
    size_t snap_size = hw_vm_snapshot_size(&vm);
    uint8_t *snap = malloc(snap_size);
    char text[256];
    if (snap && hw_vm_start(&vm, HW_NONE)) {
        hw_event ev;
        for (int i = 0; i < 2000 && hw_vm_next(&vm, &ev); i++) {
            if (ev.kind == HW_EV_SAY) {
                hw_vm_line_markup(&vm, ev.line, text, sizeof text);
                (void)hw_vm_speaker_name(&vm, ev.line);
            }
            if (ev.kind == HW_EV_MENU) {
                for (uint32_t k = 0; k < ev.option_count; k++) hw_vm_line_markup(&vm, ev.options[k], text, sizeof text);
                hw_vm_snapshot(&vm, snap);
                hw_vm_restore(&vm, snap);
                vm.s.status = HW_VM_WAIT_CHOICE; /* restore clears the pending menu; re-arm it */
                vm.menu_count = ev.option_count;
                if (!hw_vm_choose(&vm, ev.pc % ev.option_count)) break;
            }
        }
    }
    free(snap);
    hw_vm_free(&vm);

    for (uint32_t l = 0; l < m->locale_count; l++) {
        if (!hw_vm_init(&vm, m, 2)) return;
        hw_vm_set_language(&vm, hw_str(m, m->locales[l].language));
        for (uint32_t i = 0; i < m->line_count; i++) hw_vm_line_markup(&vm, i, text, sizeof text);
        hw_vm_free(&vm);
    }

    hw_playtest_options o = { 1, 2000, NULL };
    hw_playtest_report r;
    if (hw_playtest(m, &o, &r)) {
        hw_buf json = { 0 };
        hw_playtest_report_json(m, &r, &json);
        hw_buf_free(&json);
        hw_playtest_report_free(&r);
    }
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size < 24 || size > (1u << 20)) return 0;
    uint8_t *b = malloc(size);
    if (!b) return 0;
    memcpy(b, data, size);
    put32(b + 16, (uint32_t)size);
    put32(b + 20, 0);
    put32(b + 20, hw_crc32(0, b, size));

    hw_module m;
    char err[200];
    if (hw_module_load(&m, b, size, err, sizeof err)) {
        play(&m);
        hw_module_free(&m);
    }
    free(b);
    return 0;
}
