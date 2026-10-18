#include "hw_vm.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Instructions the VM may run between two events before it reports an endless loop. */
#define HW_VM_BUDGET 1000000u
/* Nesting limits for text evaluation (select cases inside select cases, open tags). */
#define TEXT_DEPTH 16
#define TAG_DEPTH 32

/* ---- RNG: PCG32 XSH-RR (spec §2.7) ---- */

uint32_t hw_rng_next(uint64_t *state)
{
    uint64_t old = *state;
    *state = old * 6364136223846793005ull + 1442695040888963407ull;
    uint32_t xorshifted = (uint32_t)(((old >> 18u) ^ old) >> 27u);
    uint32_t rot = (uint32_t)(old >> 59u);
    return (xorshifted >> rot) | (xorshifted << ((32u - rot) & 31u));
}

void hw_rng_seed(uint64_t *state, uint64_t seed)
{
    *state = 0;
    (void)hw_rng_next(state);
    *state += seed;
    (void)hw_rng_next(state);
}

/* ---- setup ---- */

bool hw_vm_init(hw_vm *vm, const hw_module *m, uint64_t seed)
{
    memset(vm, 0, sizeof *vm);
    vm->m = m;
    vm->locale = HW_NONE;
    vm->vars = calloc(m->var_count > 0 ? m->var_count : 1, sizeof(int32_t));
    vm->spent = calloc(m->line_count > 0 ? m->line_count : 1, 1);
    vm->seen = calloc(m->line_count > 0 ? m->line_count : 1, 1);
    if (!vm->vars || !vm->spent || !vm->seen) {
        hw_vm_free(vm);
        return false;
    }
    for (uint32_t i = 0; i < m->var_count; i++) vm->vars[i] = m->vars[i].def;
    hw_rng_seed(&vm->s.rng, seed);
    vm->s.status = HW_VM_IDLE;
    return true;
}

void hw_vm_free(hw_vm *vm)
{
    free(vm->vars);
    free(vm->spent);
    free(vm->seen);
    memset(vm, 0, sizeof *vm);
}

bool hw_vm_start(hw_vm *vm, uint32_t scene)
{
    const hw_module *m = vm->m;
    if (scene == HW_NONE) scene = m->entry_scene;
    if (scene >= m->scene_count) {
        snprintf(vm->error, sizeof vm->error, "the game has no entry scene");
        vm->s.status = HW_VM_ERROR;
        return false;
    }
    uint64_t rng = vm->s.rng;
    memset(&vm->s, 0, sizeof vm->s);
    vm->s.rng = rng;
    for (uint32_t i = 0; i < m->var_count; i++) {
        if (m->vars[i].scope == HW_SCOPE_SAVE) vm->vars[i] = m->vars[i].def;
    }
    memset(vm->spent, 0, m->line_count > 0 ? m->line_count : 1);
    vm->menu_count = 0;
    vm->error[0] = 0;
    vm->s.pc = m->scenes[scene].entry_pc;
    vm->s.status = HW_VM_RUNNING;
    return true;
}

/* ---- errors and the stack ---- */

static bool vm_fail(hw_vm *vm, hw_event *ev, const char *fmt, ...)
{
    char msg[150];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof msg, fmt, ap);
    va_end(ap);
    const char *file;
    uint32_t line;
    if (hw_module_source_at(vm->m, vm->s.pc, &file, &line)) {
        snprintf(vm->error, sizeof vm->error, "%s:%u: %s", file, (unsigned)line, msg);
    } else {
        snprintf(vm->error, sizeof vm->error, "pc %u: %s", (unsigned)vm->s.pc, msg);
    }
    vm->s.status = HW_VM_ERROR;
    ev->kind = HW_EV_ERROR;
    return true;
}

/* ---- display state ---- */

static int stage_find(const hw_display *d, uint32_t id)
{
    for (uint32_t i = 0; i < d->stage_count; i++) {
        if (d->stage[i].id == id) return (int)i;
    }
    return -1;
}

/* Attribute entries are (attribute, group) pairs: the same word can live in several groups (eyes=smile, mouth=smile). */
static int attrs_find(const hw_stage_char *c, uint32_t attr, uint8_t group)
{
    for (uint32_t i = 0; i < c->attr_count; i++) {
        if (c->attrs[i] == attr && c->attr_group[i] == group) return (int)i;
    }
    return -1;
}

static void attrs_add(hw_stage_char *c, uint32_t attr, uint8_t group)
{
    if (attrs_find(c, attr, group) >= 0) return;
    if (c->attr_count < HW_VM_MAX_ATTRS) {
        c->attrs[c->attr_count] = attr;
        c->attr_group[c->attr_count] = group;
        c->attr_count++;
    }
}

static void attrs_remove_at(hw_stage_char *c, uint32_t i)
{
    memmove(&c->attrs[i], &c->attrs[i + 1], (c->attr_count - i - 1) * sizeof c->attrs[0]);
    memmove(&c->attr_group[i], &c->attr_group[i + 1], (c->attr_count - i - 1) * sizeof c->attr_group[0]);
    c->attr_count--;
}

static void attrs_remove(hw_stage_char *c, uint32_t attr, uint8_t group)
{
    int i = attrs_find(c, attr, group);
    if (i >= 0) attrs_remove_at(c, (uint32_t)i);
}

static bool pool_has(const hw_module *m, uint32_t first, uint32_t count, uint32_t value)
{
    for (uint32_t i = 0; i < count; i++) {
        if (m->sprite_pool[first + i] == value) return true;
    }
    return false;
}

/* The first group of the sprite that lists `attr` (absolute index), or HW_NONE. */
static uint32_t group_of(const hw_module *m, const hw_sprite *sp, uint32_t attr)
{
    for (uint32_t g = sp->group_first; g < sp->group_first + sp->group_count; g++) {
        const hw_sprite_group *gr = &m->sprite_groups[g];
        if (pool_has(m, gr->attr_first, gr->attr_count, attr) || pool_has(m, gr->default_first, gr->default_count, attr)) return g;
    }
    return HW_NONE;
}

static const hw_sprite_preset *preset_named(const hw_module *m, const hw_sprite *sp, uint32_t name)
{
    for (uint32_t p = sp->preset_first; p < sp->preset_first + sp->preset_count; p++) {
        if (m->sprite_presets[p].name == name) return &m->sprite_presets[p];
    }
    return NULL;
}

static uint8_t tag_of(const hw_sprite *sp, uint32_t g) { return (uint8_t)(g - sp->group_first + 1); }

/* Sets `attr` in group `g`: replaces the group's other attributes unless it is `multiple`. */
static void set_attr(const hw_module *m, const hw_sprite *sp, hw_stage_char *c, uint32_t g, uint32_t attr)
{
    uint8_t tag = tag_of(sp, g);
    attrs_remove(c, attr | HW_ATTR_REMOVED, tag);
    if (!(m->sprite_groups[g].flags & HW_SPRITE_MULTIPLE)) {
        for (uint32_t i = 0; i < c->attr_count;) {
            if (c->attr_group[i] == tag && !(c->attrs[i] & HW_ATTR_REMOVED) && c->attrs[i] != attr) attrs_remove_at(c, i);
            else i++;
        }
    }
    attrs_add(c, attr, tag);
}

static void unset_attr(const hw_module *m, const hw_sprite *sp, hw_stage_char *c, uint32_t g, uint32_t attr)
{
    uint8_t tag = tag_of(sp, g);
    attrs_remove(c, attr, tag);
    if (pool_has(m, m->sprite_groups[g].default_first, m->sprite_groups[g].default_count, attr)) attrs_add(c, attr | HW_ATTR_REMOVED, tag);
}

/* Applies one word of a SHOW: a preset, an attribute of a group, or (without a sprite) a plain word. */
static void apply_word(const hw_module *m, const hw_sprite *sp, hw_stage_char *c, uint32_t word, bool add)
{
    const hw_sprite_preset *p = sp ? preset_named(m, sp, word) : NULL;
    if (p) {
        for (uint32_t l = 0; l < p->layer_count; l++) {
            uint32_t g = sp->group_first + m->sprite_pool[p->layer_first + 2 * l];
            uint32_t attr = m->sprite_pool[p->layer_first + 2 * l + 1];
            if (add) set_attr(m, sp, c, g, attr);
            else unset_attr(m, sp, c, g, attr);
        }
        return;
    }
    uint32_t g = sp ? group_of(m, sp, word) : HW_NONE;
    if (g == HW_NONE) {
        if (add) attrs_add(c, word, 0);
        else attrs_remove(c, word, 0);
    } else if (add) {
        set_attr(m, sp, c, g, word);
    } else {
        unset_attr(m, sp, c, g, word);
    }
}

static bool layers_have(const hw_layer *l, uint32_t n, uint32_t attr)
{
    for (uint32_t i = 0; i < n; i++) {
        if (l[i].attr == attr) return true;
    }
    return false;
}

/* A rule's `when` word holds if it is an attribute in effect, or a preset whose attributes all are. */
static bool word_holds(const hw_module *m, const hw_sprite *sp, const hw_layer *l, uint32_t n, uint32_t word)
{
    if (layers_have(l, n, word)) return true;
    const hw_sprite_preset *p = preset_named(m, sp, word);
    if (!p || p->layer_count == 0) return false;
    for (uint32_t k = 0; k < p->layer_count; k++) {
        if (!layers_have(l, n, m->sprite_pool[p->layer_first + 2 * k + 1])) return false;
    }
    return true;
}

uint32_t hw_sprite_layers(const hw_module *m, const hw_sprite *sp, const hw_stage_char *c, hw_layer *out, uint32_t cap)
{
    hw_layer tmp[64];
    uint32_t n = 0;
    for (uint32_t g = sp->group_first; g < sp->group_first + sp->group_count && n < 64; g++) {
        const hw_sprite_group *gr = &m->sprite_groups[g];
        uint32_t before = n;
        uint8_t tag = tag_of(sp, g);
        if (gr->flags & HW_SPRITE_ALWAYS) {
            for (uint32_t k = 0; k < gr->attr_count && n < 64; k++) {
                uint32_t a = m->sprite_pool[gr->attr_first + k];
                if (attrs_find(c, a | HW_ATTR_REMOVED, tag) < 0) tmp[n++] = (hw_layer){ g, a };
            }
            continue;
        }
        for (uint32_t i = 0; i < c->attr_count && n < 64; i++) {
            if (c->attr_group[i] == tag && !(c->attrs[i] & HW_ATTR_REMOVED)) tmp[n++] = (hw_layer){ g, c->attrs[i] };
        }
        if (n == before) {
            for (uint32_t k = 0; k < gr->default_count && n < 64; k++) {
                uint32_t a = m->sprite_pool[gr->default_first + k];
                if (attrs_find(c, a | HW_ATTR_REMOVED, tag) < 0) tmp[n++] = (hw_layer){ g, a };
            }
        }
    }
    /* Rules see the layers before any rule applies. */
    bool hide[64] = { false };
    hw_layer shown[16];
    uint32_t shown_n = 0;
    for (uint32_t r = sp->rule_first; r < sp->rule_first + sp->rule_count; r++) {
        const hw_sprite_rule *rule = &m->sprite_rules[r];
        bool holds = rule->when_count > 0;
        for (uint32_t k = 0; k < rule->when_count && holds; k++) holds = word_holds(m, sp, tmp, n, m->sprite_pool[rule->when_first + k]);
        if (!holds) continue;
        for (uint32_t i = 0; i < n; i++) {
            if (rule->hide && tmp[i].attr == rule->hide) hide[i] = true;
        }
        if (rule->show && !layers_have(tmp, n, rule->show) && shown_n < 16) {
            uint32_t g = group_of(m, sp, rule->show);
            if (g != HW_NONE) shown[shown_n++] = (hw_layer){ g, rule->show };
        }
    }
    /* Output bottom to top: group order, rule-shown layers placed in their group. */
    uint32_t count = 0;
    for (uint32_t g = sp->group_first; g < sp->group_first + sp->group_count; g++) {
        for (uint32_t i = 0; i < n; i++) {
            if (tmp[i].group == g && !hide[i] && count < cap) out[count++] = tmp[i];
        }
        for (uint32_t i = 0; i < shown_n; i++) {
            if (shown[i].group == g && count < cap) out[count++] = shown[i];
        }
    }
    return count;
}

/* NVL: adds a line to the page; a full page keeps its newest lines. */
static void page_add(hw_display *d, uint32_t line)
{
    if (d->page_count == HW_VM_MAX_PAGE) {
        memmove(&d->page[0], &d->page[1], (HW_VM_MAX_PAGE - 1) * sizeof d->page[0]);
        d->page_count--;
    }
    d->page[d->page_count++] = line;
}

void hw_vm_page_restart(hw_vm *vm)
{
    hw_display *d = &vm->s.display;
    if (d->page_count > 1) {
        d->page[0] = d->page[d->page_count - 1];
        d->page_count = 1;
    }
}

static hw_transition transition(const hw_module *m, const uint32_t *a)
{
    hw_transition t = { a[0], 0, -1 };
    if (t.type != 0 && strcmp(hw_str(m, t.type), "rule") == 0) {
        t.mask = a[1];
        t.ms = (int32_t)a[2];
    } else if (t.type != 0) {
        t.ms = (int32_t)a[1];
    }
    return t;
}

/* ---- arithmetic: wraps (two's complement), never undefined behavior ---- */

static int32_t wrap(uint32_t v) { return (int32_t)v; }

static int32_t divide(hw_vm *vm, int32_t a, int32_t b, bool mod)
{
    if (b == 0) {
        vm->div_by_zero++;
        return 0;
    }
    if (a == INT32_MIN && b == -1) return mod ? 0 : INT32_MIN;
    return mod ? a % b : a / b;
}

/* ---- the interpreter ---- */

bool hw_vm_next(hw_vm *vm, hw_event *ev)
{
    memset(ev, 0, sizeof *ev);
    ev->kind = HW_EV_NONE;
    if (vm->s.status != HW_VM_RUNNING) return false;
    const hw_module *m = vm->m;
    hw_vm_core *s = &vm->s;
    hw_display *d = &s->display;

#define PUSH(v)                                                     \
    do {                                                            \
        if (s->sp >= HW_VM_STACK) return vm_fail(vm, ev, "the value stack overflowed"); \
        s->stack[s->sp++] = (v);                                    \
    } while (0)
#define POP(dst)                                                    \
    do {                                                            \
        if (s->sp == 0) return vm_fail(vm, ev, "the value stack is empty"); \
        (dst) = s->stack[--s->sp];                                  \
    } while (0)

    for (uint32_t budget = 0;; budget++) {
        if (budget >= HW_VM_BUDGET) {
            return vm_fail(vm, ev, "ran %u instructions without showing anything (an endless loop?)", (unsigned)HW_VM_BUDGET);
        }
        if (s->pc >= m->code_count) return vm_fail(vm, ev, "ran past the end of the code");
        const uint32_t pc = s->pc;
        const uint32_t op = hw_op(m->code[pc]);
        const uint32_t *a = &m->code[pc + 1];
        const uint32_t next = pc + 1 + hw_argc(m->code[pc]);
        ev->pc = pc;
        int32_t x, y;

        switch (op) {
        case HW_OP_SAY:
            if (vm->checkpoint) vm->checkpoint(vm->checkpoint_user, vm);
            vm->seen[a[0]] = 1;
            d->textbox_hidden = 0;
            if (d->textbox == HW_TEXTBOX_NVL) page_add(d, a[0]);
            ev->kind = HW_EV_SAY;
            ev->line = a[0];
            s->pc = next;
            return true;

        case HW_OP_MENU: {
            if (vm->checkpoint) vm->checkpoint(vm->checkpoint_user, vm);
            const uint32_t n = a[1];
            if (s->sp < n) return vm_fail(vm, ev, "the value stack is empty");
            const int32_t *conds = &s->stack[s->sp - n];
            vm->menu_count = 0;
            for (uint32_t i = 0; i < n; i++) {
                uint32_t line = a[2 + 2 * i];
                bool spent = (m->lines[line].flags & HW_LINE_ONCE) && vm->spent[line];
                if (conds[i] != 0 && !spent && vm->menu_count < HW_VM_MAX_OPTIONS) {
                    vm->menu_lines[vm->menu_count] = line;
                    vm->menu_targets[vm->menu_count] = a[3 + 2 * i];
                    vm->menu_count++;
                }
            }
            s->sp -= n;
            if (vm->menu_count == 0) {
                s->pc = next; /* nothing to choose: continue after the menu */
                break;
            }
            if (a[0] != HW_NONE) {
                vm->seen[a[0]] = 1;
                if (d->textbox == HW_TEXTBOX_NVL) page_add(d, a[0]);
            }
            d->textbox_hidden = 0;
            vm->menu_pc = pc;
            ev->kind = HW_EV_MENU;
            ev->line = a[0];
            ev->option_count = vm->menu_count;
            memcpy(ev->options, vm->menu_lines, vm->menu_count * sizeof ev->options[0]);
            s->status = HW_VM_WAIT_CHOICE;
            s->pc = next;
            return true;
        }

        case HW_OP_SHOW: {
            int i = stage_find(d, a[0]);
            if (i < 0) {
                if (d->stage_count >= HW_VM_MAX_STAGE) return vm_fail(vm, ev, "more than %d characters on stage", HW_VM_MAX_STAGE);
                i = (int)d->stage_count++;
                memset(&d->stage[i], 0, sizeof d->stage[i]);
                d->stage[i].id = a[0];
                uint32_t center = hw_module_find_string(m, "center");
                d->stage[i].at = center == HW_NONE ? 0 : center;
            }
            hw_stage_char *c = &d->stage[i];
            if (a[1] != 0) c->at = a[1];
            const uint32_t n_add = a[5], n_remove = a[6];
            const hw_sprite *sp = hw_module_sprite_of(m, a[0]);
            for (uint32_t k = 0; k < n_add; k++) apply_word(m, sp, c, a[7 + k], true);
            for (uint32_t k = 0; k < n_remove; k++) apply_word(m, sp, c, a[7 + n_add + k], false);
            ev->kind = HW_EV_SHOW;
            ev->subject = a[0];
            ev->at = c->at;
            ev->trans = transition(m, &a[2]);
            ev->add = &a[7];
            ev->add_count = n_add;
            ev->remove = &a[7 + n_add];
            ev->remove_count = n_remove;
            s->pc = next;
            return true;
        }

        case HW_OP_HIDE: {
            int i = stage_find(d, a[0]);
            if (i >= 0) {
                memmove(&d->stage[i], &d->stage[i + 1], (d->stage_count - (uint32_t)i - 1) * sizeof d->stage[0]);
                d->stage_count--;
            }
            ev->kind = HW_EV_HIDE;
            ev->subject = a[0];
            ev->trans = transition(m, &a[1]);
            s->pc = next;
            return true;
        }

        case HW_OP_MOVE: {
            int i = stage_find(d, a[0]);
            if (i >= 0 && a[1] != 0) d->stage[i].at = a[1];
            ev->kind = HW_EV_MOVE;
            ev->subject = a[0];
            ev->at = a[1];
            ev->trans = transition(m, &a[2]);
            s->pc = next;
            return true;
        }

        case HW_OP_BG:
        case HW_OP_CG:
            if (op == HW_OP_BG) {
                d->bg = a[0];
                d->cg = 0; /* a new background ends a CG */
            } else {
                d->cg = a[0];
            }
            ev->kind = op == HW_OP_BG ? HW_EV_BG : HW_EV_CG;
            ev->subject = a[0];
            ev->trans = transition(m, &a[1]);
            s->pc = next;
            return true;

        case HW_OP_AUDIO:
            if (a[0] == HW_CHANNEL_MUSIC) d->music = a[1];
            if (a[0] == HW_CHANNEL_AMBIENT) d->ambient = a[1];
            ev->kind = HW_EV_AUDIO;
            ev->channel = a[0];
            ev->subject = a[1];
            ev->ms = (int32_t)a[2];
            s->pc = next;
            return true;

        case HW_OP_STOP:
            if (a[0] == HW_CHANNEL_MUSIC) d->music = 0;
            if (a[0] == HW_CHANNEL_AMBIENT) d->ambient = 0;
            ev->kind = HW_EV_STOP;
            ev->channel = a[0];
            ev->ms = (int32_t)a[1];
            s->pc = next;
            return true;

        case HW_OP_WAIT:
            ev->kind = HW_EV_WAIT;
            ev->ms = (int32_t)a[0];
            s->pc = next;
            return true;

        case HW_OP_EFFECT:
            ev->kind = HW_EV_EFFECT;
            ev->effect = a[0];
            ev->ms = (int32_t)a[1];
            s->pc = next;
            return true;

        case HW_OP_TEXTBOX:
            switch (a[0]) {
            case HW_TEXTBOX_ADV: case HW_TEXTBOX_NVL:
                if (d->textbox != a[0]) d->page_count = 0;
                d->textbox = a[0];
                break;
            case HW_TEXTBOX_CLEAR: d->page_count = 0; break;
            case HW_TEXTBOX_HIDE: d->textbox_hidden = 1; break;
            default: d->textbox_hidden = 0; break;
            }
            ev->kind = HW_EV_TEXTBOX;
            ev->effect = a[0];
            s->pc = next;
            return true;

        case HW_OP_XCALL: {
            const hw_ext_info *e = &m->exts[a[0]];
            ev->kind = HW_EV_XCALL;
            ev->subject = a[0];
            ev->add = &a[2];
            ev->add_count = a[1];
            ev->line = HW_NONE;
            for (uint32_t i = 0; i < e->param_count; i++) {
                if (m->ext_params[e->param_first + i].type == HW_XP_TEXT && a[2 + i] != HW_NONE) ev->line = a[2 + i];
            }
            if (ev->line != HW_NONE) vm->seen[ev->line] = 1;
            if (a[0] < HW_VM_MAX_EXT) {
                d->ext_called |= 1u << a[0];
                memset(d->ext_last[a[0]], 0, sizeof d->ext_last[a[0]]);
                memcpy(d->ext_last[a[0]], &a[2], (a[1] < HW_VM_EXT_VALUES ? a[1] : HW_VM_EXT_VALUES) * sizeof(uint32_t));
            }
            s->pc = next;
            return true;
        }

        case HW_OP_JMP:
            s->pc = a[0];
            break;
        case HW_OP_JZ:
            POP(x);
            s->pc = x == 0 ? a[0] : next;
            break;
        case HW_OP_CALL:
            if (s->fp >= HW_VM_FRAMES) return vm_fail(vm, ev, "calls nested more than %d deep (endless recursion?)", HW_VM_FRAMES);
            s->frames[s->fp++] = next;
            s->pc = a[0];
            break;
        case HW_OP_RET:
        case HW_OP_END:
            if (op == HW_OP_RET && s->fp > 0) {
                s->pc = s->frames[--s->fp];
                break;
            }
            /* END, or a return with no caller: the story ends. */
            s->status = HW_VM_ENDED;
            ev->kind = HW_EV_END;
            return true;

        case HW_OP_PUSH:
            PUSH((int32_t)a[0]);
            s->pc = next;
            break;
        case HW_OP_LOAD:
            PUSH(vm->vars[a[0]]);
            s->pc = next;
            break;
        case HW_OP_STORE:
            POP(x);
            vm->vars[a[0]] = x;
            s->pc = next;
            break;

        case HW_OP_NEG:
        case HW_OP_NOT:
            POP(x);
            PUSH(op == HW_OP_NEG ? wrap(0u - (uint32_t)x) : (x == 0));
            s->pc = next;
            break;

        case HW_OP_RAND:
            POP(x);
            PUSH(x <= 0 ? 0 : (int32_t)(((uint64_t)hw_rng_next(&s->rng) * (uint32_t)x) >> 32));
            s->pc = next;
            break;

        case HW_OP_ADD: case HW_OP_SUB: case HW_OP_MUL: case HW_OP_DIV: case HW_OP_MOD:
        case HW_OP_EQ: case HW_OP_NE: case HW_OP_LT: case HW_OP_LE: case HW_OP_GT: case HW_OP_GE:
        case HW_OP_AND: case HW_OP_OR: {
            int32_t r = 0;
            POP(y);
            POP(x);
            switch (op) {
            case HW_OP_ADD: r = wrap((uint32_t)x + (uint32_t)y); break;
            case HW_OP_SUB: r = wrap((uint32_t)x - (uint32_t)y); break;
            case HW_OP_MUL: r = wrap((uint32_t)x * (uint32_t)y); break;
            case HW_OP_DIV: r = divide(vm, x, y, false); break;
            case HW_OP_MOD: r = divide(vm, x, y, true); break;
            case HW_OP_EQ: r = x == y; break;
            case HW_OP_NE: r = x != y; break;
            case HW_OP_LT: r = x < y; break;
            case HW_OP_LE: r = x <= y; break;
            case HW_OP_GT: r = x > y; break;
            case HW_OP_GE: r = x >= y; break;
            case HW_OP_AND: r = x != 0 && y != 0; break;
            default: r = x != 0 || y != 0; break;
            }
            PUSH(r);
            s->pc = next;
            break;
        }

        default:
            /* The loader rejects unknown opcodes, so this is unreachable for a loaded module. */
            return vm_fail(vm, ev, "unknown opcode 0x%x", (unsigned)op);
        }
    }
#undef PUSH
#undef POP
}

bool hw_vm_choose(hw_vm *vm, uint32_t k)
{
    if (vm->s.status != HW_VM_WAIT_CHOICE || k >= vm->menu_count) return false;
    uint32_t line = vm->menu_lines[k];
    if (vm->m->lines[line].flags & HW_LINE_ONCE) vm->spent[line] = 1;
    vm->seen[line] = 1;
    vm->s.pc = vm->menu_targets[k];
    vm->s.status = HW_VM_RUNNING;
    vm->menu_count = 0;
    return true;
}

/* ---- text ---- */

void hw_vm_set_language(hw_vm *vm, const char *language)
{
    vm->locale = hw_module_find_locale(vm->m, language);
}

uint32_t hw_vm_line_text(const hw_vm *vm, uint32_t line)
{
    const hw_module *m = vm->m;
    if (line >= m->line_count) return HW_NONE;
    if (vm->locale != HW_NONE) {
        uint32_t t = m->locales[vm->locale].line_texts[line];
        if (t != HW_NONE) return t;
    }
    return m->lines[line].text;
}

const char *hw_vm_speaker_name(const hw_vm *vm, uint32_t line)
{
    const hw_module *m = vm->m;
    if (line >= m->line_count || m->lines[line].speaker == 0) return "";
    uint32_t speaker = m->lines[line].speaker;
    for (uint32_t i = 0; i < m->char_count; i++) {
        if (m->chars[i].id != speaker) continue;
        if (vm->locale != HW_NONE && m->locales[vm->locale].char_names[i] != 0) {
            return hw_str(m, m->locales[vm->locale].char_names[i]);
        }
        return hw_str(m, m->chars[i].name);
    }
    /* `me` without a character file is the unnamed protagonist. */
    return strcmp(hw_str(m, speaker), "me") == 0 ? "" : hw_str(m, speaker);
}

size_t hw_vm_value_text(const hw_vm *vm, uint32_t var, int32_t value, char *buf, size_t cap)
{
    const hw_module *m = vm->m;
    const char *s;
    char num[16];
    uint8_t type = var < m->var_count ? m->vars[var].type : HW_VAR_INT;
    if (type == HW_VAR_BOOL) {
        s = value ? "true" : "false";
    } else if (type == HW_VAR_STR) {
        s = hw_str(m, (uint32_t)value);
    } else {
        snprintf(num, sizeof num, "%d", (int)value);
        s = num;
    }
    size_t n = strlen(s);
    if (cap > 0) {
        size_t k = n < cap - 1 ? n : cap - 1;
        memcpy(buf, s, k);
        buf[k] = 0;
    }
    return n;
}

typedef struct text_ctx {
    const hw_vm *vm;
    const hw_text_sink *sink;
    const char *tags[TAG_DEPTH];
    uint32_t depth; /* open tags; names are kept for the first TAG_DEPTH */
} text_ctx;

static void eval_text(text_ctx *t, uint32_t text, uint32_t nesting)
{
    const hw_module *m = t->vm->m;
    const hw_text_sink *k = t->sink;
    if (text >= m->text_count || nesting > TEXT_DEPTH) return;
    const uint32_t *w = m->text_words;
    uint32_t i = m->text_start[text];
    char buf[64];
    for (;;) {
        switch (w[i++]) {
        case HW_TOP_END:
            return;
        case HW_TOP_RUN: {
            const char *s = hw_str(m, w[i++]);
            if (k->run) k->run(k->user, s, strlen(s));
            break;
        }
        case HW_TOP_VAR: {
            uint32_t var = w[i++];
            /* Strings can be long; only numbers and booleans go through the small buffer. */
            if (m->vars[var].type == HW_VAR_STR) {
                const char *s = hw_str(m, (uint32_t)t->vm->vars[var]);
                if (k->run) k->run(k->user, s, strlen(s));
            } else {
                size_t n = hw_vm_value_text(t->vm, var, t->vm->vars[var], buf, sizeof buf);
                if (k->run) k->run(k->user, buf, n < sizeof buf ? n : sizeof buf - 1);
            }
            break;
        }
        case HW_TOP_OPEN: {
            const char *tag = hw_str(m, w[i]);
            const char *value = hw_str(m, w[i + 1]);
            i += 2;
            if (t->depth < TAG_DEPTH) t->tags[t->depth] = tag;
            t->depth++;
            if (k->open) k->open(k->user, tag, value);
            break;
        }
        case HW_TOP_CLOSE:
            if (t->depth > 0) {
                t->depth--;
                const char *tag = t->depth < TAG_DEPTH ? t->tags[t->depth] : "";
                if (k->close) k->close(k->user, tag);
            }
            break;
        case HW_TOP_MARK: {
            const char *tag = hw_str(m, w[i]);
            const char *value = hw_str(m, w[i + 1]);
            i += 2;
            if (k->mark) k->mark(k->user, tag, value);
            break;
        }
        case HW_TOP_SELECT: {
            uint32_t var = w[i++];
            uint32_t count = w[i++];
            const uint32_t *cases = &w[i];
            i += 2 * count;
            const char *value;
            if (m->vars[var].type == HW_VAR_STR) {
                value = hw_str(m, (uint32_t)t->vm->vars[var]);
            } else {
                hw_vm_value_text(t->vm, var, t->vm->vars[var], buf, sizeof buf);
                value = buf;
            }
            uint32_t chosen = HW_NONE;
            for (uint32_t c = 0; c < count && chosen == HW_NONE; c++) {
                if (strcmp(hw_str(m, cases[2 * c]), value) == 0) chosen = cases[2 * c + 1];
            }
            for (uint32_t c = 0; c < count && chosen == HW_NONE; c++) {
                if (strcmp(hw_str(m, cases[2 * c]), "other") == 0) chosen = cases[2 * c + 1];
            }
            if (chosen != HW_NONE) eval_text(t, chosen, nesting + 1);
            break;
        }
        default:
            return; /* unreachable for a loaded module */
        }
    }
}

void hw_vm_eval_text(const hw_vm *vm, uint32_t text, const hw_text_sink *sink)
{
    text_ctx t;
    memset(&t, 0, sizeof t);
    t.vm = vm;
    t.sink = sink;
    eval_text(&t, text, 0);
    /* Close anything the text left open, so sinks always see balanced tags. */
    while (t.depth > 0) {
        t.depth--;
        if (sink->close) sink->close(sink->user, t.depth < TAG_DEPTH ? t.tags[t.depth] : "");
    }
}

/* A sink that writes canonical markup into a fixed buffer, snprintf-style. */
typedef struct markup_buf {
    char *buf;
    size_t cap, len;
} markup_buf;

static void mb_put(markup_buf *b, const char *s, size_t n)
{
    for (size_t i = 0; i < n; i++, b->len++) {
        if (b->len + 1 < b->cap) b->buf[b->len] = s[i];
    }
    if (b->cap > 0) b->buf[b->len + 1 < b->cap ? b->len : b->cap - 1] = 0;
}

static void mb_str(markup_buf *b, const char *s) { mb_put(b, s, strlen(s)); }

/* Literal braces and brackets are escaped, so the output reads back as source markup. */
static void mb_run(void *user, const char *text, size_t len)
{
    markup_buf *b = user;
    for (size_t i = 0; i < len; i++) {
        char c = text[i];
        if (c == '{' || c == '[' || c == '\\') mb_put(b, "\\", 1);
        mb_put(b, &c, 1);
    }
}

static void mb_tag(markup_buf *b, const char *prefix, const char *tag, const char *value)
{
    mb_str(b, prefix);
    mb_str(b, tag);
    if (value && value[0]) {
        mb_str(b, "=");
        mb_str(b, value);
    }
    mb_str(b, "}");
}

static void mb_open(void *user, const char *tag, const char *value) { mb_tag(user, "{", tag, value); }
static void mb_close(void *user, const char *tag) { mb_tag(user, "{/", tag, ""); }
static void mb_mark(void *user, const char *tag, const char *value) { mb_tag(user, "{", tag, value); }

size_t hw_vm_line_markup(const hw_vm *vm, uint32_t line, char *buf, size_t cap)
{
    markup_buf b = { buf, cap, 0 };
    if (cap > 0) buf[0] = 0;
    uint32_t text = hw_vm_line_text(vm, line);
    if (text == HW_NONE) return 0;
    hw_text_sink sink = { mb_run, mb_open, mb_close, mb_mark, &b };
    hw_vm_eval_text(vm, text, &sink);
    return b.len;
}

/* ---- snapshots ---- */

size_t hw_vm_snapshot_size(const hw_vm *vm)
{
    return sizeof(hw_vm_core) + (size_t)vm->m->var_count * sizeof(int32_t) + vm->m->line_count;
}

void hw_vm_snapshot(const hw_vm *vm, void *out)
{
    uint8_t *p = out;
    memcpy(p, &vm->s, sizeof vm->s);
    p += sizeof vm->s;
    memcpy(p, vm->vars, (size_t)vm->m->var_count * sizeof(int32_t));
    p += (size_t)vm->m->var_count * sizeof(int32_t);
    memcpy(p, vm->spent, vm->m->line_count);
}

void hw_vm_restore(hw_vm *vm, const void *snap)
{
    const hw_module *m = vm->m;
    const uint8_t *p = snap;
    memcpy(&vm->s, p, sizeof vm->s);
    p += sizeof vm->s;
    for (uint32_t i = 0; i < m->var_count; i++) {
        int32_t v;
        memcpy(&v, p + (size_t)i * sizeof(int32_t), sizeof v);
        if (m->vars[i].scope == HW_SCOPE_SAVE) vm->vars[i] = v;
    }
    p += (size_t)m->var_count * sizeof(int32_t);
    memcpy(vm->spent, p, m->line_count);
    vm->menu_count = 0;
    vm->error[0] = 0;
}
