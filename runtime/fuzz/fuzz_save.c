/*
 * libFuzzer target for save files (plan §8.9, §16.1). Players can edit or
 * damage save files, so hw_save_load() must refuse bad input and never leave
 * the VM in a state that can crash it.
 *
 * The module is the conformance case `basic` (read once at startup). The
 * harness rewrites the save header's size and CRC, so mutations reach the
 * field checks. A loaded save is then played for a while, also with the
 * module's CRC changed so the remapping path runs too.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_hwb.h"
#include "hw_save.h"
#include "hw_vm.h"

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);
int LLVMFuzzerInitialize(int *argc, char ***argv);

static hw_module module;
static bool ready = false;

int LLVMFuzzerInitialize(int *argc, char ***argv)
{
    (void)argc;
    (void)argv;
    FILE *f = fopen(HW_CONFORMANCE_DIR "/basic/expected.hwb", "rb");
    if (!f) return 0;
    uint8_t buf[1 << 16];
    size_t n = fread(buf, 1, sizeof buf, f);
    fclose(f);
    char err[200];
    ready = hw_module_load(&module, buf, n, err, sizeof err);
    return 0;
}

static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

static void try_load(const uint8_t *b, size_t size)
{
    hw_vm vm;
    if (!hw_vm_init(&vm, &module, 1)) return;
    char err[200];
    hw_save_info info;
    if (hw_save_load(&vm, b, size, &info, err, sizeof err) != HW_SAVE_BAD) {
        hw_event ev;
        char text[128];
        for (int i = 0; i < 500 && hw_vm_next(&vm, &ev); i++) {
            if (ev.kind == HW_EV_SAY) hw_vm_line_markup(&vm, ev.line, text, sizeof text);
            if (ev.kind == HW_EV_MENU && !hw_vm_choose(&vm, 0)) break;
        }
    }
    hw_vm_free(&vm);
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (!ready || size < 16 || size > (1u << 16)) return 0;
    uint8_t *b = malloc(size);
    if (!b) return 0;
    memcpy(b, data, size);
    put32(b + 8, (uint32_t)(size - 16));
    put32(b + 12, hw_crc32(0, b + 16, size - 16));

    hw_save_info info;
    (void)hw_save_peek(b, size, &info);
    try_load(b, size);
    module.crc ^= 1; /* the same save against "another build" */
    try_load(b, size);
    module.crc ^= 1;
    free(b);
    return 0;
}
