/* Layered sprites (spec §2.9): attribute merge in the VM and the layers in effect. Uses the basic case's Hana. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_hwb.h"
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

static hw_module m;

/* "group=attr group=attr …" for the layers in effect. */
static void layers_text(const hw_stage_char *c, char *out, size_t cap)
{
    const hw_sprite *sp = hw_module_sprite_of(&m, c->id);
    hw_layer l[32];
    uint32_t n = sp ? hw_sprite_layers(&m, sp, c, l, 32) : 0;
    size_t len = 0;
    out[0] = 0;
    for (uint32_t i = 0; i < n && len + 1 < cap; i++) {
        len += (size_t)snprintf(out + len, cap - len, "%s%s=%s", i ? " " : "", hw_str(&m, m.sprite_groups[l[i].group].name),
                                hw_str(&m, l[i].attr));
    }
}

/* Runs SHOW words through the VM with a hand-written instruction stream. */
static void show(hw_vm *vm, const char *const *add, uint32_t n_add, const char *const *remove, uint32_t n_remove)
{
    uint32_t code[64];
    uint32_t n = 0;
    code[n++] = (uint32_t)HW_OP_SHOW | ((7u + n_add + n_remove) << 8);
    code[n++] = hw_module_find_string(&m, "hana");
    code[n++] = 0;
    code[n++] = 0;
    code[n++] = (uint32_t)-1;
    code[n++] = (uint32_t)-1;
    code[n++] = n_add;
    code[n++] = n_remove;
    for (uint32_t i = 0; i < n_add; i++) code[n++] = hw_module_find_string(&m, add[i]);
    for (uint32_t i = 0; i < n_remove; i++) code[n++] = hw_module_find_string(&m, remove[i]);
    code[n++] = HW_OP_END;
    uint32_t *saved = m.code;
    uint32_t saved_count = m.code_count;
    m.code = code;
    m.code_count = n;
    vm->s.pc = 0;
    vm->s.status = HW_VM_RUNNING;
    hw_event ev;
    CHECK(hw_vm_next(vm, &ev) && ev.kind == HW_EV_SHOW);
    m.code = saved;
    m.code_count = saved_count;
}

static const char *state(hw_vm *vm)
{
    static char buf[512];
    layers_text(&vm->s.display.stage[0], buf, sizeof buf);
    return buf;
}

int main(void)
{
    char path[512];
    snprintf(path, sizeof path, "%s/basic/expected.hwb", HW_CONFORMANCE_DIR);
    FILE *f = fopen(path, "rb");
    CHECK(f != NULL);
    if (!f) return 1;
    uint8_t buf[1 << 16];
    size_t size = fread(buf, 1, sizeof buf, f);
    fclose(f);
    char err[200];
    CHECK(hw_module_load(&m, buf, size, err, sizeof err));
    CHECK(m.sprite_count == 1);
    const hw_sprite *sp = &m.sprites[0];
    CHECK(sp->group_count == 6 && sp->preset_count == 4 && sp->rule_count == 1);

    hw_vm vm;
    CHECK(hw_vm_init(&vm, &m, 1));

    /* First appearance: every group shows its default (body has no art in this case). */
    show(&vm, NULL, 0, NULL, 0);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=neutral eyes=neutral mouth=neutral accessories=glasses") == 0);

    /* A preset sets several groups; the same word may live in two groups (eyes=smile, mouth=smile). */
    const char *smile[] = { "smile" };
    show(&vm, smile, 1, NULL, 0);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=neutral eyes=smile mouth=smile accessories=glasses") == 0);

    /* Another preset replaces group by group instead of piling up. */
    const char *annoyed[] = { "annoyed" };
    show(&vm, annoyed, 1, NULL, 0);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=down eyes=half mouth=flat accessories=glasses") == 0);

    /* A rule: glasses hide while "surprised" (a preset) is in effect, and come back after. */
    const char *surprised[] = { "surprised" };
    show(&vm, surprised, 1, NULL, 0);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=up eyes=wide mouth=o") == 0);
    show(&vm, smile, 1, NULL, 0);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=neutral eyes=smile mouth=smile accessories=glasses") == 0);

    /* Removing a default keeps it off until it is added again. */
    const char *glasses[] = { "glasses" };
    show(&vm, NULL, 0, glasses, 1);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=neutral eyes=smile mouth=smile") == 0);
    show(&vm, glasses, 1, NULL, 0);
    CHECK(strcmp(state(&vm), "outfit=uniform brows=neutral eyes=smile mouth=smile accessories=glasses") == 0);

    /* Removing a set attribute falls back to the group's default. */
    const char *up[] = { "up" };
    show(&vm, up, 1, NULL, 0);
    CHECK(strstr(state(&vm), "brows=up") != NULL);
    show(&vm, NULL, 0, up, 1);
    CHECK(strstr(state(&vm), "brows=neutral") != NULL);

    hw_vm_free(&vm);
    hw_module_free(&m);
    if (failures == 0) {
        printf("test_sprite: all checks passed\n");
        return 0;
    }
    return 1;
}
