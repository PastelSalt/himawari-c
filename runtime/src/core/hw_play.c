#include "hw_play.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---- hw_buf ---- */

void hw_buf_put(hw_buf *b, const char *s, size_t n)
{
    if (b->oom) return;
    if (b->len + n + 1 > b->cap) {
        size_t cap = b->cap ? b->cap : 256;
        while (cap < b->len + n + 1) cap *= 2;
        char *p = realloc(b->data, cap);
        if (!p) {
            b->oom = true;
            return;
        }
        b->data = p;
        b->cap = cap;
    }
    memcpy(b->data + b->len, s, n);
    b->len += n;
    b->data[b->len] = 0;
}

void hw_buf_printf(hw_buf *b, const char *fmt, ...)
{
    char small[256];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(small, sizeof small, fmt, ap);
    va_end(ap);
    if (n < 0) return;
    if ((size_t)n < sizeof small) {
        hw_buf_put(b, small, (size_t)n);
        return;
    }
    char *big = malloc((size_t)n + 1);
    if (!big) {
        b->oom = true;
        return;
    }
    va_start(ap, fmt);
    vsnprintf(big, (size_t)n + 1, fmt, ap);
    va_end(ap);
    hw_buf_put(b, big, (size_t)n);
    free(big);
}

void hw_buf_free(hw_buf *b)
{
    free(b->data);
    memset(b, 0, sizeof *b);
}

static void put_str(hw_buf *b, const char *s) { hw_buf_put(b, s, strlen(s)); }

/* ---- describing events ---- */

static void put_markup(const hw_vm *vm, uint32_t line, hw_buf *out)
{
    char small[512];
    size_t n = hw_vm_line_markup(vm, line, small, sizeof small);
    if (n < sizeof small) {
        hw_buf_put(out, small, n);
        return;
    }
    char *big = malloc(n + 1);
    if (!big) {
        out->oom = true;
        return;
    }
    hw_vm_line_markup(vm, line, big, n + 1);
    hw_buf_put(out, big, n);
    free(big);
}

static void put_line_id(const hw_module *m, uint32_t line, hw_buf *out)
{
    if (line >= m->line_count || m->lines[line].line_id == HW_NONE) return;
    char id[7];
    hw_line_id_format(m->lines[line].line_id, id);
    hw_buf_printf(out, "   #%s", id);
}

static void put_transition(const hw_module *m, const hw_transition *t, hw_buf *out)
{
    if (t->type == 0) return;
    hw_buf_printf(out, " with %s", hw_str(m, t->type));
    if (t->mask != 0) hw_buf_printf(out, "(%s%s", hw_str(m, t->mask), t->ms >= 0 ? ", " : ")");
    else if (t->ms >= 0) put_str(out, "(");
    if (t->ms >= 0) hw_buf_printf(out, "%d)", (int)t->ms);
}

static const char *const CHANNELS[4] = { "music", "ambient", "sfx", "voice" };

void hw_describe_event(const hw_vm *vm, const hw_event *ev, hw_buf *out)
{
    const hw_module *m = vm->m;
    switch (ev->kind) {
    case HW_EV_SAY: {
        const char *name = hw_vm_speaker_name(vm, ev->line);
        /* A speaker without a display name (`me`) is shown by id, so it can't pass for narration. */
        if (!name[0] && ev->line < m->line_count && m->lines[ev->line].speaker) name = hw_str(m, m->lines[ev->line].speaker);
        if (name[0]) hw_buf_printf(out, "%s: ", name);
        put_markup(vm, ev->line, out);
        put_line_id(m, ev->line, out);
        break;
    }
    case HW_EV_MENU:
        put_str(out, "menu");
        if (ev->line != HW_NONE) {
            put_str(out, " \"");
            put_markup(vm, ev->line, out);
            put_str(out, "\"");
            put_line_id(m, ev->line, out);
        }
        for (uint32_t i = 0; i < ev->option_count; i++) {
            hw_buf_printf(out, "\n  [%u] ", (unsigned)i);
            put_markup(vm, ev->options[i], out);
            put_line_id(m, ev->options[i], out);
        }
        break;
    case HW_EV_SHOW: {
        hw_buf_printf(out, "show %s (", hw_str(m, ev->subject));
        const hw_display *d = &vm->s.display;
        for (uint32_t i = 0; i < d->stage_count; i++) {
            if (d->stage[i].id != ev->subject) continue;
            const hw_sprite *sp = hw_module_sprite_of(m, d->stage[i].id);
            for (uint32_t k = 0; k < d->stage[i].attr_count; k++) {
                uint32_t a = d->stage[i].attrs[k];
                uint8_t g = d->stage[i].attr_group[k];
                const char *group = sp && g ? hw_str(m, m->sprite_groups[sp->group_first + g - 1u].name) : "";
                hw_buf_printf(out, "%s%s%s%s%s", k ? " " : "", (a & HW_ATTR_REMOVED) ? "-" : "", group, group[0] ? "=" : "",
                              hw_str(m, a & ~HW_ATTR_REMOVED));
            }
        }
        hw_buf_printf(out, ") at %s", ev->at ? hw_str(m, ev->at) : "-");
        put_transition(m, &ev->trans, out);
        break;
    }
    case HW_EV_HIDE:
        hw_buf_printf(out, "hide %s", hw_str(m, ev->subject));
        put_transition(m, &ev->trans, out);
        break;
    case HW_EV_MOVE:
        hw_buf_printf(out, "move %s at %s", hw_str(m, ev->subject), ev->at ? hw_str(m, ev->at) : "-");
        put_transition(m, &ev->trans, out);
        break;
    case HW_EV_BG:
    case HW_EV_CG:
        hw_buf_printf(out, "%s %s", ev->kind == HW_EV_BG ? "bg" : "cg", hw_str(m, ev->subject));
        put_transition(m, &ev->trans, out);
        break;
    case HW_EV_AUDIO:
        hw_buf_printf(out, "%s %s", CHANNELS[ev->channel & 3u], hw_str(m, ev->subject));
        if (ev->ms >= 0) hw_buf_printf(out, " fade(%d)", (int)ev->ms);
        break;
    case HW_EV_STOP:
        hw_buf_printf(out, "stop %s", CHANNELS[ev->channel & 3u]);
        if (ev->ms >= 0) hw_buf_printf(out, " fade(%d)", (int)ev->ms);
        break;
    case HW_EV_WAIT:
        hw_buf_printf(out, "wait(%d)", (int)ev->ms);
        break;
    case HW_EV_EFFECT:
        put_str(out, ev->effect ? "flash" : "shake");
        if (ev->ms >= 0) hw_buf_printf(out, "(%d)", (int)ev->ms);
        break;
    case HW_EV_TEXTBOX: {
        static const char *const MODES[5] = { "adv", "nvl", "clear", "hide", "show" };
        hw_buf_printf(out, "textbox %s", MODES[ev->effect < 5 ? ev->effect : 0]);
        break;
    }
    case HW_EV_XCALL: {
        const hw_ext_info *e = &m->exts[ev->subject];
        hw_buf_printf(out, "%s(", hw_str(m, e->name));
        for (uint32_t i = 0; i < e->param_count && i < ev->add_count; i++) {
            const hw_ext_param *p = &m->ext_params[e->param_first + i];
            uint32_t v = ev->add[i];
            hw_buf_printf(out, "%s%s=", i ? ", " : "", hw_str(m, p->name));
            if (p->type == HW_XP_INT) hw_buf_printf(out, "%d", (int)(int32_t)v);
            else if (p->type == HW_XP_BOOL) put_str(out, v ? "true" : "false");
            else if (p->type == HW_XP_TEXT && v == HW_NONE) put_str(out, "-");
            else if (p->type == HW_XP_TEXT) {
                put_str(out, "\"");
                put_markup(vm, v, out);
                put_str(out, "\"");
            } else put_str(out, hw_str(m, v));
        }
        put_str(out, ")");
        if (ev->line != HW_NONE) put_line_id(m, ev->line, out);
        break;
    }
    case HW_EV_END:
        put_str(out, "end");
        break;
    case HW_EV_ERROR:
        hw_buf_printf(out, "error: %s", vm->error);
        break;
    case HW_EV_NONE:
        break;
    }
}

/* ---- transcripts ---- */

static void put_vars(const hw_vm *vm, hw_buf *out)
{
    const hw_module *m = vm->m;
    put_str(out, "-- vars:");
    for (uint32_t i = 0; i < m->var_count; i++) {
        char v[64];
        hw_vm_value_text(vm, i, vm->vars[i], v, sizeof v);
        hw_buf_printf(out, " %s=%s", hw_str(m, m->vars[i].name), v);
    }
    put_str(out, "\n");
}

bool hw_transcript(const hw_module *m, const hw_transcript_options *o, hw_buf *out)
{
    hw_vm vm;
    if (!hw_vm_init(&vm, m, o->seed)) return false;
    if (o->language) hw_vm_set_language(&vm, o->language);
    uint32_t max = o->max_events ? o->max_events : 10000;

    put_str(out, "== choices:");
    for (uint32_t i = 0; i < o->choice_count; i++) hw_buf_printf(out, " %u", (unsigned)o->choices[i]);
    if (o->choice_count == 0) put_str(out, " (none)");
    hw_buf_printf(out, " | language: %s | seed: %llu\n", o->language ? o->language : hw_str(m, m->source_language),
                  (unsigned long long)o->seed);

    if (!hw_vm_start(&vm, HW_NONE)) {
        hw_buf_printf(out, "error: %s\n", vm.error);
        hw_vm_free(&vm);
        return !out->oom;
    }
    uint32_t scene = HW_NONE, used = 0, events = 0;
    hw_event ev;
    while (hw_vm_next(&vm, &ev)) {
        uint32_t here = hw_module_scene_at(m, ev.pc);
        if (here != scene && here != HW_NONE) {
            hw_buf_printf(out, "-- scene %s\n", hw_str(m, m->scenes[here].name));
            scene = here;
        }
        hw_describe_event(&vm, &ev, out);
        put_str(out, "\n");
        if (++events >= max) {
            put_str(out, "-- stopped: event limit\n");
            break;
        }
        if (ev.kind == HW_EV_MENU) {
            if (used >= o->choice_count) {
                put_str(out, "-- stopped: no more choices\n");
                break;
            }
            uint32_t k = o->choices[used++];
            if (!hw_vm_choose(&vm, k)) {
                hw_buf_printf(out, "-- stopped: choice %u isn't shown\n", (unsigned)k);
                break;
            }
            hw_buf_printf(out, "> %u\n", (unsigned)k);
        }
    }
    if (vm.div_by_zero) hw_buf_printf(out, "-- division by zero: %u time(s)\n", (unsigned)vm.div_by_zero);
    put_vars(&vm, out);
    hw_vm_free(&vm);
    return !out->oom;
}

/* ---- playtests ---- */

typedef struct node {
    uint8_t *snap;
    uint32_t next, count;
    bool expanded; /* coverage pass: an option of this menu was taken */
} node;

typedef struct explorer {
    const hw_module *m;
    hw_vm vm;
    size_t snap_size;
    uint8_t *checkpoint; /* the last checkpoint's snapshot */
    hw_playtest_report *r;
    uint32_t max_steps;
    /* Visited menu states: an open-addressing set of 64-bit hashes (0 = empty). */
    uint64_t *seen;
    size_t seen_cap, seen_len;
    node *stack;
    size_t stack_len, stack_cap;
    bool oom;
    uint32_t target; /* warp: stop at this SAY/MENU pc (HW_NONE = explore everything) */
    bool found;
    bool coverage;      /* the coverage pass is running */
    uint8_t *menu_seen; /* coverage pass: per pc, 1 once that menu was explored */
} explorer;

static void on_checkpoint(void *user, const hw_vm *vm)
{
    explorer *x = user;
    hw_vm_snapshot(vm, x->checkpoint);
}

static uint64_t hash_bytes(const uint8_t *p, size_t n)
{
    uint64_t h = 1469598103934665603ull;
    for (size_t i = 0; i < n; i++) {
        h ^= p[i];
        h *= 1099511628211ull;
    }
    return h ? h : 1;
}

/* Adds a hash; returns false if it was already there. */
static bool seen_add(explorer *x, uint64_t h)
{
    if ((x->seen_len + 1) * 2 > x->seen_cap) {
        size_t cap = x->seen_cap ? x->seen_cap * 2 : 1024;
        uint64_t *t = calloc(cap, sizeof *t);
        if (!t) {
            x->oom = true;
            return false;
        }
        for (size_t i = 0; i < x->seen_cap; i++) {
            if (!x->seen[i]) continue;
            size_t j = (size_t)(x->seen[i] & (cap - 1));
            while (t[j]) j = (j + 1) & (cap - 1);
            t[j] = x->seen[i];
        }
        free(x->seen);
        x->seen = t;
        x->seen_cap = cap;
    }
    size_t j = (size_t)(h & (x->seen_cap - 1));
    while (x->seen[j]) {
        if (x->seen[j] == h) return false;
        j = (j + 1) & (x->seen_cap - 1);
    }
    x->seen[j] = h;
    x->seen_len++;
    return true;
}

static void add_ending(explorer *x, uint32_t pc)
{
    hw_playtest_report *r = x->r;
    for (uint32_t i = 0; i < r->ending_count; i++) {
        if (r->endings[i].pc == pc) {
            r->endings[i].hits++;
            return;
        }
    }
    hw_ending *e = realloc(r->endings, (r->ending_count + 1) * sizeof *e);
    if (!e) {
        x->oom = true;
        return;
    }
    r->endings = e;
    r->endings[r->ending_count++] = (hw_ending){ pc, 1 };
}

static void add_error(explorer *x, const char *message)
{
    hw_playtest_report *r = x->r;
    for (uint32_t i = 0; i < r->error_count; i++) {
        if (strcmp(r->errors[i].message, message) == 0) {
            r->errors[i].hits++;
            return;
        }
    }
    hw_playtest_error *e = realloc(r->errors, (r->error_count + 1) * sizeof *e);
    if (!e) {
        x->oom = true;
        return;
    }
    r->errors = e;
    snprintf(r->errors[r->error_count].message, sizeof r->errors[0].message, "%s", message);
    r->errors[r->error_count++].hits = 1;
}

enum { RUN_MENU, RUN_DONE, RUN_LIMIT, RUN_FOUND };

/* Plays until the next menu (left waiting), an ending, an error, or the step limit. */
static int run(explorer *x, hw_event *ev)
{
    hw_playtest_report *r = x->r;
    while (hw_vm_next(&x->vm, ev)) {
        r->steps++;
        if ((ev->kind == HW_EV_SAY || ev->kind == HW_EV_MENU) && ev->pc == x->target) {
            x->found = true;
            return RUN_FOUND;
        }
        switch (ev->kind) {
        case HW_EV_SAY:
            r->line_seen[ev->line] = 1;
            break;
        case HW_EV_MENU:
            if (ev->line != HW_NONE) r->line_seen[ev->line] = 1;
            return RUN_MENU;
        case HW_EV_END:
            add_ending(x, ev->pc);
            return RUN_DONE;
        case HW_EV_ERROR:
            add_error(x, x->vm.error);
            return RUN_DONE;
        default:
            break;
        }
        if (r->steps >= x->max_steps) {
            r->step_limit = true;
            return RUN_LIMIT;
        }
    }
    return RUN_DONE;
}

static bool push_node(explorer *x, uint32_t count)
{
    if (x->stack_len == x->stack_cap) {
        size_t cap = x->stack_cap ? x->stack_cap * 2 : 64;
        node *s = realloc(x->stack, cap * sizeof *s);
        if (!s) return false;
        x->stack = s;
        x->stack_cap = cap;
    }
    uint8_t *snap = malloc(x->snap_size);
    if (!snap) return false;
    memcpy(snap, x->checkpoint, x->snap_size);
    x->stack[x->stack_len++] = (node){ snap, 0, count, false };
    return true;
}

/*
 * A menu was reached: explore it later unless this exact state was explored already.
 * The coverage pass explores each menu once more only while it has an option no path chose yet,
 * so a long route is walked about once instead of once per earlier choice.
 */
static void reached_menu(explorer *x, const hw_event *ev)
{
    if (x->coverage && ev->pc < x->m->code_count) {
        bool novel = !x->menu_seen[ev->pc];
        for (uint32_t i = 0; i < ev->option_count && !novel; i++) novel = !x->r->line_seen[ev->options[i]];
        if (!novel) {
            x->r->paths++;
            return;
        }
        x->menu_seen[ev->pc] = 1;
    }
    if (!seen_add(x, hash_bytes(x->checkpoint, x->snap_size))) return;
    x->r->menus++;
    if (!push_node(x, ev->option_count)) x->oom = true;
}

/*
 * Takes the menus on the stack depth-first. The coverage pass takes only options no path chose
 * yet, and one option at a menu whose options were all chosen already (so the story goes on).
 */
static void explore(explorer *x)
{
    hw_playtest_report *r = x->r;
    hw_event ev;
    while (x->stack_len > 0 && !r->step_limit && !x->oom && !x->found) {
        node *top = &x->stack[x->stack_len - 1];
        if (top->next >= top->count) {
            free(top->snap);
            x->stack_len--;
            continue;
        }
        uint32_t k = top->next++;
        hw_vm_restore(&x->vm, top->snap);
        if (!hw_vm_next(&x->vm, &ev) || ev.kind != HW_EV_MENU || k >= ev.option_count) {
            add_error(x, "replaying a menu gave a different result (non-deterministic state)");
            continue;
        }
        if (x->coverage && r->line_seen[ev.options[k]] && (top->expanded || top->next < top->count)) continue;
        top->expanded = true; /* before run(): pushing a node may move the stack */
        if (!hw_vm_choose(&x->vm, k)) {
            add_error(x, "replaying a menu gave a different result (non-deterministic state)");
            continue;
        }
        r->line_seen[ev.options[k]] = 1;
        int res = run(x, &ev);
        if (res == RUN_MENU) reached_menu(x, &ev);
        else if (res != RUN_FOUND) r->paths++;
    }
}

/* Plays from the start to the first menu, then the coverage pass, then every combination with what's left of the budget. */
static void explore_all(explorer *x)
{
    hw_playtest_report *r = x->r;
    hw_event ev;
    if (!hw_vm_start(&x->vm, HW_NONE)) {
        add_error(x, x->vm.error);
        return;
    }
    x->coverage = x->menu_seen != NULL;
    int res = run(x, &ev);
    if (res != RUN_MENU) {
        if (res != RUN_FOUND) r->paths++;
        r->covered = res == RUN_DONE;
        return;
    }
    uint8_t *root = malloc(x->snap_size);
    if (!root) {
        x->oom = true;
        return;
    }
    memcpy(root, x->checkpoint, x->snap_size);
    reached_menu(x, &ev);
    explore(x);
    r->covered = x->coverage && !r->step_limit && !x->oom;
    if (x->coverage && !r->step_limit && !x->oom && !x->found) {
        /* Every combination of choices, from the first menu again, with a fresh set of explored states. */
        x->coverage = false;
        memset(x->seen, 0, x->seen_cap * sizeof *x->seen);
        x->seen_len = 0;
        r->paths = 0;
        r->menus = 0;
        memcpy(x->checkpoint, root, x->snap_size);
        reached_menu(x, &ev);
        explore(x);
    }
    free(root);
}

/* Instructions reachable from the entry scene, following every branch. */
static uint8_t *static_reach(const hw_module *m)
{
    uint8_t *reach = calloc(m->code_count > 0 ? m->code_count : 1, 1);
    uint32_t *work = malloc((m->code_count + 1) * sizeof *work);
    if (!reach || !work) {
        free(reach);
        free(work);
        return NULL;
    }
    size_t n = 0;
    if (m->entry_scene != HW_NONE) work[n++] = m->scenes[m->entry_scene].entry_pc;
#define VISIT(p)                                                         \
    do {                                                                 \
        uint32_t p_ = (p);                                               \
        if (p_ < m->code_count && !reach[p_]) {                          \
            reach[p_] = 1;                                               \
            work[n++] = p_;                                              \
        }                                                                \
    } while (0)
    if (n) reach[work[0]] = 1;
    while (n > 0) {
        uint32_t pc = work[--n];
        uint32_t op = hw_op(m->code[pc]);
        const uint32_t *a = &m->code[pc + 1];
        uint32_t next = pc + 1 + hw_argc(m->code[pc]);
        switch (op) {
        case HW_OP_JMP: VISIT(a[0]); break;
        case HW_OP_JZ: VISIT(a[0]); VISIT(next); break;
        case HW_OP_CALL: VISIT(a[0]); VISIT(next); break;
        case HW_OP_MENU:
            for (uint32_t i = 0; i < a[1]; i++) VISIT(a[3 + 2 * i]);
            VISIT(next);
            break;
        case HW_OP_RET: case HW_OP_END: break;
        default: VISIT(next); break;
        }
    }
#undef VISIT
    free(work);
    return reach;
}

/* The default step budget grows with the story: about 40 events per line, so a big game's coverage pass finishes. */
static uint32_t default_steps(const hw_module *m)
{
    uint64_t n = (uint64_t)m->line_count * 40u;
    return n < 50000u ? 50000u : n > 20000000u ? 20000000u : (uint32_t)n;
}

bool hw_playtest(const hw_module *m, const hw_playtest_options *o, hw_playtest_report *r)
{
    memset(r, 0, sizeof *r);
    explorer x;
    memset(&x, 0, sizeof x);
    x.target = HW_NONE;
    x.m = m;
    x.r = r;
    x.max_steps = o->max_steps ? o->max_steps : default_steps(m);
    r->line_seen = calloc(m->line_count > 0 ? m->line_count : 1, 1);
    if (!r->line_seen || !hw_vm_init(&x.vm, m, o->seed)) {
        hw_playtest_report_free(r);
        return false;
    }
    if (o->language) hw_vm_set_language(&x.vm, o->language);
    x.snap_size = hw_vm_snapshot_size(&x.vm);
    x.checkpoint = calloc(1, x.snap_size);
    x.vm.checkpoint = on_checkpoint;
    x.vm.checkpoint_user = &x;
    bool ok = x.checkpoint != NULL;

    x.menu_seen = calloc(m->code_count > 0 ? m->code_count : 1, 1);
    ok = ok && x.menu_seen != NULL;
    if (ok) explore_all(&x);
    ok = ok && !x.oom;

    /* Coverage and endings. */
    for (uint32_t i = 0; i < m->line_count; i++) {
        bool option = (m->lines[i].flags & HW_LINE_OPTION) != 0;
        bool prompt = (m->lines[i].flags & HW_LINE_PROMPT) != 0;
        if (option) {
            r->options_total++;
            r->options_chosen += r->line_seen[i];
        } else if (!prompt) {
            r->lines_total++;
            r->lines_seen += r->line_seen[i];
        }
    }
    uint8_t *reach = static_reach(m);
    if (reach) {
        for (uint32_t pc = 0; pc < m->code_count; pc++) {
            if (!reach[pc] || hw_op(m->code[pc]) != HW_OP_END) continue;
            bool hit = false;
            for (uint32_t i = 0; i < r->ending_count; i++) hit = hit || r->endings[i].pc == pc;
            if (hit) continue;
            uint32_t *u = realloc(r->unreached_endings, (r->unreached_count + 1) * sizeof *u);
            if (!u) {
                ok = false;
                break;
            }
            r->unreached_endings = u;
            r->unreached_endings[r->unreached_count++] = pc;
        }
        r->ending_total = r->ending_count + r->unreached_count;
        free(reach);
    } else {
        ok = false;
    }
    r->div_by_zero = x.vm.div_by_zero;

    for (size_t i = 0; i < x.stack_len; i++) free(x.stack[i].snap);
    free(x.stack);
    free(x.seen);
    free(x.menu_seen);
    free(x.checkpoint);
    hw_vm_free(&x.vm);
    if (!ok) hw_playtest_report_free(r);
    return ok;
}

void hw_playtest_report_free(hw_playtest_report *r)
{
    free(r->endings);
    free(r->unreached_endings);
    free(r->errors);
    free(r->line_seen);
    memset(r, 0, sizeof *r);
}

static void json_string(hw_buf *b, const char *s)
{
    put_str(b, "\"");
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') hw_buf_printf(b, "\\%c", c);
        else if (c < 0x20) hw_buf_printf(b, "\\u%04x", c);
        else hw_buf_put(b, (const char *)&c, 1);
    }
    put_str(b, "\"");
}

static void json_place(const hw_module *m, uint32_t pc, hw_buf *b)
{
    uint32_t scene = hw_module_scene_at(m, pc);
    put_str(b, "\"scene\": ");
    json_string(b, scene == HW_NONE ? "" : hw_str(m, m->scenes[scene].name));
    const char *file;
    uint32_t line;
    if (hw_module_source_at(m, pc, &file, &line)) {
        put_str(b, ", \"file\": ");
        json_string(b, file);
        hw_buf_printf(b, ", \"line\": %u", (unsigned)line);
    }
    hw_buf_printf(b, ", \"pc\": %u", (unsigned)pc);
}

void hw_playtest_report_json(const hw_module *m, const hw_playtest_report *r, hw_buf *b)
{
    hw_buf_printf(b, "{\n  \"paths\": %u,\n  \"steps\": %u,\n  \"stepLimit\": %s,\n  \"covered\": %s,\n  \"menus\": %u,\n",
                  (unsigned)r->paths, (unsigned)r->steps, r->step_limit ? "true" : "false", r->covered ? "true" : "false", (unsigned)r->menus);
    hw_buf_printf(b, "  \"endings\": {\n    \"reached\": %u,\n    \"total\": %u,\n    \"list\": [", (unsigned)r->ending_count,
                  (unsigned)r->ending_total);
    for (uint32_t i = 0; i < r->ending_count; i++) {
        put_str(b, i ? ",\n      { " : "\n      { ");
        json_place(m, r->endings[i].pc, b);
        hw_buf_printf(b, ", \"hits\": %u }", (unsigned)r->endings[i].hits);
    }
    put_str(b, r->ending_count ? "\n    ],\n    \"unreached\": [" : "],\n    \"unreached\": [");
    uint32_t unreached = r->unreached_count;
    for (uint32_t i = 0; i < unreached; i++) {
        put_str(b, i ? ",\n      { " : "\n      { ");
        json_place(m, r->unreached_endings[i], b);
        put_str(b, " }");
    }
    put_str(b, unreached ? "\n    ]\n  },\n  \"errors\": [" : "]\n  },\n  \"errors\": [");
    for (uint32_t i = 0; i < r->error_count; i++) {
        put_str(b, i ? ",\n    { \"message\": " : "\n    { \"message\": ");
        json_string(b, r->errors[i].message);
        hw_buf_printf(b, ", \"hits\": %u }", (unsigned)r->errors[i].hits);
    }
    put_str(b, r->error_count ? "\n  ],\n" : "],\n");
    hw_buf_printf(b, "  \"coverage\": {\n    \"lines\": { \"seen\": %u, \"total\": %u },\n    \"options\": { \"chosen\": %u, \"total\": %u },\n    \"unseen\": [",
                  (unsigned)r->lines_seen, (unsigned)r->lines_total, (unsigned)r->options_chosen, (unsigned)r->options_total);
    bool first = true;
    for (uint32_t i = 0; i < m->line_count; i++) {
        if (r->line_seen[i] || (m->lines[i].flags & HW_LINE_PROMPT) || m->lines[i].line_id == HW_NONE) continue;
        char id[7];
        hw_line_id_format(m->lines[i].line_id, id);
        hw_buf_printf(b, "%s\"%s\"", first ? "" : ", ", id);
        first = false;
    }
    hw_buf_printf(b, "]\n  },\n  \"divisionByZero\": %u\n}\n", (unsigned)r->div_by_zero);
}

/* ---- warp (plan §8.11) ---- */

/* Crockford base32 line ID → 30-bit value, or HW_NONE. */
static uint32_t parse_line_id(const char *s)
{
    static const char alphabet[] = "0123456789abcdefghjkmnpqrstvwxyz";
    if (strlen(s) != 6) return HW_NONE;
    uint32_t v = 0;
    for (int i = 0; i < 6; i++) {
        const char *p = strchr(alphabet, s[i]);
        if (!p || !s[i]) return HW_NONE;
        v = (v << 5) | (uint32_t)(p - alphabet);
    }
    return v;
}

uint32_t hw_warp_target(const hw_module *m, const char *where)
{
    /* "#k3f9a1": the SAY or MENU showing that line (a menu by its prompt or any option). */
    if (where[0] == '#') {
        uint32_t id = parse_line_id(where + 1);
        if (id == HW_NONE) return HW_NONE;
        for (uint32_t pc = 0; pc < m->code_count; pc += 1 + hw_argc(m->code[pc])) {
            const uint32_t *a = &m->code[pc + 1];
            if (hw_op(m->code[pc]) == HW_OP_SAY && m->lines[a[0]].line_id == id) return pc;
            if (hw_op(m->code[pc]) == HW_OP_MENU) {
                if (a[0] != HW_NONE && m->lines[a[0]].line_id == id) return pc;
                for (uint32_t k = 0; k < a[1]; k++) {
                    if (m->lines[a[2 + 2 * k]].line_id == id) return pc;
                }
            }
        }
        return HW_NONE;
    }
    /* A scene name: its first line or menu. */
    uint32_t scene = hw_module_find_scene(m, where);
    uint32_t from = HW_NONE;
    if (scene != HW_NONE) {
        from = m->scenes[scene].entry_pc;
    } else {
        /* file:line, from DBUG: the first instruction recorded at or after that line in that file. */
        const char *colon = strrchr(where, ':');
        if (!colon || colon == where) return HW_NONE;
        size_t flen = (size_t)(colon - where);
        long line = strtol(colon + 1, NULL, 10);
        uint32_t best_line = UINT32_MAX;
        for (uint32_t i = 0; i < m->debug_count; i++) {
            const char *file = hw_str(m, m->debug[i].file);
            size_t n = strlen(file);
            /* "start.hws:12" matches "script/start.hws". */
            bool same = n >= flen && strncmp(file + n - flen, where, flen) == 0 && (n == flen || file[n - flen - 1] == '/');
            if (same && m->debug[i].line >= (uint32_t)line && m->debug[i].line < best_line) {
                best_line = m->debug[i].line;
                from = m->debug[i].pc;
            }
        }
    }
    /* The first SAY or MENU from there, inside the same scene. */
    uint32_t sc = from == HW_NONE ? HW_NONE : hw_module_scene_at(m, from);
    for (uint32_t pc = from; pc != HW_NONE && pc < m->code_count && hw_module_scene_at(m, pc) == sc; pc += 1 + hw_argc(m->code[pc])) {
        uint32_t op = hw_op(m->code[pc]);
        if (op == HW_OP_SAY || op == HW_OP_MENU) return pc;
    }
    return HW_NONE;
}

bool hw_warp(const hw_module *m, uint32_t target, uint64_t seed, uint32_t max_steps, void *snapshot)
{
    hw_playtest_report r;
    memset(&r, 0, sizeof r);
    explorer x;
    memset(&x, 0, sizeof x);
    x.m = m;
    x.r = &r;
    x.target = target;
    x.max_steps = max_steps ? max_steps : default_steps(m);
    r.line_seen = calloc(m->line_count > 0 ? m->line_count : 1, 1);
    if (!r.line_seen || !hw_vm_init(&x.vm, m, seed)) {
        free(r.line_seen);
        return false;
    }
    x.snap_size = hw_vm_snapshot_size(&x.vm);
    x.checkpoint = calloc(1, x.snap_size);
    x.vm.checkpoint = on_checkpoint;
    x.vm.checkpoint_user = &x;
    /* The coverage pass first: a line deep in the last route of a big game is found in about one read-through. */
    x.menu_seen = calloc(m->code_count > 0 ? m->code_count : 1, 1);
    if (x.checkpoint && x.menu_seen) explore_all(&x);
    bool ok = x.found;
    if (ok) memcpy(snapshot, x.checkpoint, x.snap_size); /* the checkpoint right before the target */
    for (size_t i = 0; i < x.stack_len; i++) free(x.stack[i].snap);
    free(x.stack);
    free(x.seen);
    free(x.menu_seen);
    free(x.checkpoint);
    free(r.line_seen);
    free(r.endings);
    free(r.unreached_endings);
    free(r.errors);
    hw_vm_free(&x.vm);
    return ok;
}
