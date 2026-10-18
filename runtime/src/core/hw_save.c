#include "hw_save.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"

/*
 * Save format (all little-endian u32 words; strings are a length word, the
 * UTF-8 bytes, and zero padding to a word boundary):
 *
 *   "HWSV", version, payload_size, crc32(payload)
 *   payload:
 *     game_id, module_crc
 *     time_lo, time_hi, playtime_s, scene, preview, language     (hw_save_info)
 *     thumb_size, thumb bytes (padded to a word)                  (version 2)
 *     rng_lo, rng_hi
 *     pc, history_count, history_count × line_id                 (newest first; [0] is pc's line)
 *     scene_of_pc
 *     stack_count, stack_count × value
 *     frame_count, frame_count × { pc, caller, callee, ordinal } (the ordinal-th `call callee` in scene caller)
 *     var_count, var_count × { name, type, value | str }
 *     spent_count, spent_count × line_id
 *     bg, cg, music, ambient, stage_count, stage_count × { id, at, attr_count, attr_count × attr }
 *   version 2 adds:
 *     textbox, textbox_hidden, page_count, page_count × line_id     (the NVL page)
 *     ext_count, ext_count × { name, n, n × { type, value } }         (each extension statement's last call, by name;
 *                                                                      values typed: ints and bools as words, texts
 *                                                                      by line ID, everything else by name)
 */

#define MAGIC "HWSV"

/* ---- writing ---- */

static void w32(hw_buf *b, uint32_t v)
{
    uint8_t p[4] = { (uint8_t)v, (uint8_t)(v >> 8), (uint8_t)(v >> 16), (uint8_t)(v >> 24) };
    hw_buf_put(b, (const char *)p, 4);
}

static void wblob(hw_buf *b, const void *data, size_t n)
{
    w32(b, (uint32_t)n);
    if (n) hw_buf_put(b, data, n);
    static const char pad[4] = { 0, 0, 0, 0 };
    hw_buf_put(b, pad, (4 - n % 4) % 4);
}

static void wstr(hw_buf *b, const char *s) { wblob(b, s, strlen(s)); }

/* The line ID a checkpoint instruction is known by: SAY's line, MENU's prompt or first option. */
static uint32_t checkpoint_line_id(const hw_module *m, uint32_t pc)
{
    if (pc >= m->code_count) return HW_NONE;
    const uint32_t *a = &m->code[pc + 1];
    switch (hw_op(m->code[pc])) {
    case HW_OP_SAY:
        return m->lines[a[0]].line_id;
    case HW_OP_MENU:
        if (a[0] != HW_NONE && m->lines[a[0]].line_id != HW_NONE) return m->lines[a[0]].line_id;
        return a[1] > 0 ? m->lines[a[2]].line_id : HW_NONE;
    default:
        return HW_NONE;
    }
}

/*
 * A return address is right after a CALL (2 words). It is saved as "the
 * ordinal-th call to scene `callee` inside scene `caller`", which survives
 * edits elsewhere in the scripts.
 */
static bool call_site(const hw_module *m, uint32_t ret, uint32_t *caller, uint32_t *callee, uint32_t *ordinal)
{
    if (ret < 2 || ret > m->code_count || m->code[ret - 2] != ((uint32_t)HW_OP_CALL | (1u << 8))) return false;
    uint32_t target = m->code[ret - 1];
    *caller = hw_module_scene_at(m, ret - 2);
    *callee = hw_module_scene_at(m, target);
    if (*caller == HW_NONE || *callee == HW_NONE) return false;
    *ordinal = 0;
    for (uint32_t p = m->scenes[*caller].entry_pc; p < ret - 2; p += 1 + hw_argc(m->code[p])) {
        if (hw_op(m->code[p]) == HW_OP_CALL && m->code[p + 1] == target) (*ordinal)++;
    }
    return true;
}

/* The return address of the ordinal-th call to `callee` in `caller`, or HW_NONE. */
static uint32_t find_call_site(const hw_module *m, const char *caller, const char *callee, uint32_t ordinal)
{
    uint32_t from = hw_module_find_scene(m, caller), to = hw_module_find_scene(m, callee);
    if (from == HW_NONE || to == HW_NONE) return HW_NONE;
    uint32_t target = m->scenes[to].entry_pc;
    for (uint32_t p = m->scenes[from].entry_pc; p < m->code_count && hw_module_scene_at(m, p) == from;
         p += 1 + hw_argc(m->code[p])) {
        if (hw_op(m->code[p]) == HW_OP_CALL && m->code[p + 1] == target && ordinal-- == 0) return p + 2;
    }
    return HW_NONE;
}

static const char *scene_name(const hw_module *m, uint32_t pc)
{
    uint32_t s = hw_module_scene_at(m, pc);
    return s == HW_NONE ? "" : hw_str(m, m->scenes[s].name);
}

bool hw_save_write(const hw_vm *vm, const void *snap, const uint32_t *history, uint32_t history_count,
                   const hw_save_info *info, hw_buf *out)
{
    const hw_module *m = vm->m;
    hw_vm_core core;
    memcpy(&core, snap, sizeof core);
    const uint8_t *p = (const uint8_t *)snap + sizeof core;

    hw_buf b = { 0 };
    wstr(&b, hw_str(m, m->game_id));
    w32(&b, m->crc);
    w32(&b, (uint32_t)((uint64_t)info->time & 0xFFFFFFFFu));
    w32(&b, (uint32_t)((uint64_t)info->time >> 32));
    w32(&b, info->playtime_s);
    wstr(&b, info->scene);
    wstr(&b, info->preview);
    wstr(&b, info->language);
    wblob(&b, info->thumb, info->thumb ? info->thumb_size : 0);
    w32(&b, (uint32_t)(core.rng & 0xFFFFFFFFu));
    w32(&b, (uint32_t)(core.rng >> 32));

    /* Position, with earlier checkpoints for remapping. */
    w32(&b, core.pc);
    uint32_t n = 1;
    uint32_t ids[HW_SAVE_HISTORY];
    ids[0] = checkpoint_line_id(m, core.pc);
    for (uint32_t i = 0; i < history_count && n < HW_SAVE_HISTORY; i++) {
        uint32_t id = checkpoint_line_id(m, history[i]);
        if (id != HW_NONE && id != ids[n - 1]) ids[n++] = id;
    }
    w32(&b, n);
    for (uint32_t i = 0; i < n; i++) w32(&b, ids[i]);
    wstr(&b, scene_name(m, core.pc));

    w32(&b, core.sp);
    for (uint32_t i = 0; i < core.sp && i < HW_VM_STACK; i++) w32(&b, (uint32_t)core.stack[i]);
    w32(&b, core.fp);
    for (uint32_t i = 0; i < core.fp && i < HW_VM_FRAMES; i++) {
        uint32_t caller = HW_NONE, callee = HW_NONE, ordinal = 0;
        call_site(m, core.frames[i], &caller, &callee, &ordinal);
        w32(&b, core.frames[i]);
        wstr(&b, caller == HW_NONE ? "" : hw_str(m, m->scenes[caller].name));
        wstr(&b, callee == HW_NONE ? "" : hw_str(m, m->scenes[callee].name));
        w32(&b, ordinal);
    }

    /* Save-scope variables by name (globals live in the global data file). */
    uint32_t saved = 0;
    for (uint32_t i = 0; i < m->var_count; i++) saved += m->vars[i].scope == HW_SCOPE_SAVE;
    w32(&b, saved);
    for (uint32_t i = 0; i < m->var_count; i++) {
        if (m->vars[i].scope != HW_SCOPE_SAVE) continue;
        int32_t v;
        memcpy(&v, p + (size_t)i * sizeof v, sizeof v);
        wstr(&b, hw_str(m, m->vars[i].name));
        w32(&b, m->vars[i].type);
        if (m->vars[i].type == HW_VAR_STR) wstr(&b, hw_str(m, (uint32_t)v));
        else w32(&b, (uint32_t)v);
    }
    p += (size_t)m->var_count * sizeof(int32_t);

    uint32_t spent = 0;
    for (uint32_t i = 0; i < m->line_count; i++) spent += p[i] && m->lines[i].line_id != HW_NONE;
    w32(&b, spent);
    for (uint32_t i = 0; i < m->line_count; i++) {
        if (p[i] && m->lines[i].line_id != HW_NONE) w32(&b, m->lines[i].line_id);
    }

    const hw_display *d = &core.display;
    wstr(&b, hw_str(m, d->bg));
    wstr(&b, hw_str(m, d->cg));
    wstr(&b, hw_str(m, d->music));
    wstr(&b, hw_str(m, d->ambient));
    w32(&b, d->stage_count);
    for (uint32_t i = 0; i < d->stage_count && i < HW_VM_MAX_STAGE; i++) {
        wstr(&b, hw_str(m, d->stage[i].id));
        wstr(&b, hw_str(m, d->stage[i].at));
        w32(&b, d->stage[i].attr_count);
        const hw_sprite *sp = hw_module_sprite_of(m, d->stage[i].id);
        for (uint32_t k = 0; k < d->stage[i].attr_count && k < HW_VM_MAX_ATTRS; k++) {
            uint32_t a = d->stage[i].attrs[k];
            uint8_t g = d->stage[i].attr_group[k];
            const char *group = sp && g && g <= sp->group_count ? hw_str(m, m->sprite_groups[sp->group_first + g - 1u].name) : "";
            char name[300];
            snprintf(name, sizeof name, "%s%s%s%s", (a & HW_ATTR_REMOVED) ? "-" : "", group, group[0] ? "/" : "", hw_str(m, a & ~HW_ATTR_REMOVED));
            wstr(&b, name);
        }
    }

    /* Version 2: the textbox, the NVL page by line ID, and extension state by statement name. */
    w32(&b, d->textbox);
    w32(&b, d->textbox_hidden);
    uint32_t page = 0;
    for (uint32_t i = 0; i < d->page_count && i < HW_VM_MAX_PAGE; i++) page += m->lines[d->page[i]].line_id != HW_NONE;
    w32(&b, page);
    for (uint32_t i = 0; i < d->page_count && i < HW_VM_MAX_PAGE; i++) {
        if (m->lines[d->page[i]].line_id != HW_NONE) w32(&b, m->lines[d->page[i]].line_id);
    }
    uint32_t exts = 0;
    for (uint32_t i = 0; i < m->ext_count && i < HW_VM_MAX_EXT; i++) exts += (d->ext_called >> i) & 1u;
    w32(&b, exts);
    for (uint32_t i = 0; i < m->ext_count && i < HW_VM_MAX_EXT; i++) {
        if (!((d->ext_called >> i) & 1u)) continue;
        const hw_ext_info *e = &m->exts[i];
        uint32_t values = e->param_count < HW_VM_EXT_VALUES ? e->param_count : HW_VM_EXT_VALUES;
        wstr(&b, hw_str(m, e->name));
        w32(&b, values);
        for (uint32_t k = 0; k < values; k++) {
            uint32_t type = m->ext_params[e->param_first + k].type, v = d->ext_last[i][k];
            w32(&b, type);
            if (type == HW_XP_INT || type == HW_XP_BOOL) w32(&b, v);
            else if (type == HW_XP_TEXT) w32(&b, v < m->line_count ? m->lines[v].line_id : HW_NONE);
            else wstr(&b, hw_str(m, v));
        }
    }

    if (b.oom) {
        hw_buf_free(&b);
        return false;
    }
    hw_buf_put(out, MAGIC, 4);
    w32(out, HW_SAVE_VERSION);
    w32(out, (uint32_t)b.len);
    w32(out, hw_crc32(0, b.data, b.len));
    hw_buf_put(out, b.data, b.len);
    hw_buf_free(&b);
    return !out->oom;
}

/* ---- reading ---- */

typedef struct rd {
    const uint8_t *p;
    size_t n, pos;
    bool bad;
    uint32_t version;
    char str[256]; /* the last string read (longer strings are cut) */
} rd;

static uint32_t r32(rd *r)
{
    if (r->bad || r->n - r->pos < 4) {
        r->bad = true;
        return 0;
    }
    const uint8_t *q = r->p + r->pos;
    r->pos += 4;
    return (uint32_t)q[0] | ((uint32_t)q[1] << 8) | ((uint32_t)q[2] << 16) | ((uint32_t)q[3] << 24);
}

static const char *rstr(rd *r)
{
    uint32_t len = r32(r);
    size_t padded = (size_t)len + (4 - len % 4) % 4;
    if (r->bad || r->n - r->pos < padded) {
        r->bad = true;
        r->str[0] = 0;
        return r->str;
    }
    size_t k = len < sizeof r->str - 1 ? len : sizeof r->str - 1;
    memcpy(r->str, r->p + r->pos, k);
    r->str[k] = 0;
    if (memchr(r->str, 0, k)) r->bad = true; /* no NULs inside strings */
    r->pos += padded;
    return r->str;
}

static void copy_str(char *dst, size_t cap, const char *src) { snprintf(dst, cap, "%s", src); }

/* Checks the header and positions `r` at the payload. */
static bool open_save(const uint8_t *data, size_t size, rd *r)
{
    memset(r, 0, sizeof *r);
    if (size < 16 || memcmp(data, MAGIC, 4) != 0) return false;
    r->p = data;
    r->n = size;
    r->pos = 4;
    uint32_t version = r32(r), len = r32(r), crc = r32(r);
    if (version < 1 || version > HW_SAVE_VERSION || len != size - 16 || hw_crc32(0, data + 16, len) != crc) return false;
    r->version = version;
    return true;
}

static void read_info(rd *r, hw_save_info *info)
{
    uint32_t lo = r32(r), hi = r32(r);
    info->time = (int64_t)(((uint64_t)hi << 32) | lo);
    info->playtime_s = r32(r);
    copy_str(info->scene, sizeof info->scene, rstr(r));
    copy_str(info->preview, sizeof info->preview, rstr(r));
    copy_str(info->language, sizeof info->language, rstr(r));
    info->thumb = NULL;
    info->thumb_size = 0;
    if (r->version >= 2) {
        uint32_t len = r32(r);
        size_t padded = (size_t)len + (4 - len % 4) % 4;
        if (r->bad || r->n - r->pos < padded) {
            r->bad = true;
            return;
        }
        if (len) {
            info->thumb = r->p + r->pos;
            info->thumb_size = len;
        }
        r->pos += padded;
    }
}

bool hw_save_peek(const uint8_t *data, size_t size, hw_save_info *info)
{
    rd r;
    memset(info, 0, sizeof *info);
    if (!open_save(data, size, &r)) return false;
    (void)rstr(&r); /* game id */
    (void)r32(&r);  /* module crc */
    read_info(&r, info);
    return !r.bad;
}

/* Marks instruction starts, so pcs from a save can be checked before they are used. */
static uint8_t *op_starts(const hw_module *m)
{
    uint8_t *is_op = calloc(m->code_count > 0 ? m->code_count : 1, 1);
    if (!is_op) return NULL;
    for (uint32_t pc = 0; pc < m->code_count; pc += 1 + hw_argc(m->code[pc])) is_op[pc] = 1;
    return is_op;
}

/* The checkpoint instruction known by a line ID, or HW_NONE. */
static uint32_t find_checkpoint(const hw_module *m, uint32_t line_id)
{
    if (line_id == HW_NONE) return HW_NONE;
    for (uint32_t pc = 0; pc < m->code_count; pc += 1 + hw_argc(m->code[pc])) {
        if (checkpoint_line_id(m, pc) == line_id) return pc;
    }
    return HW_NONE;
}

static uint32_t find_line(const hw_module *m, uint32_t line_id)
{
    for (uint32_t i = 0; i < m->line_count; i++) {
        if (m->lines[i].line_id == line_id) return i;
    }
    return HW_NONE;
}

static uint32_t string_or_none(const hw_module *m, const char *s)
{
    if (!s[0]) return 0;
    uint32_t i = hw_module_find_string(m, s);
    return i == HW_NONE ? 0 : i;
}

#define FAIL(...)                                          \
    do {                                                   \
        if (err && err_size) snprintf(err, err_size, __VA_ARGS__); \
        result = HW_SAVE_BAD;                              \
        goto done;                                         \
    } while (0)

hw_save_result hw_save_load(hw_vm *vm, const uint8_t *data, size_t size, hw_save_info *info, char *err, size_t err_size)
{
    const hw_module *m = vm->m;
    hw_save_result result = HW_SAVE_EXACT;
    hw_save_info scratch;
    if (!info) info = &scratch;
    memset(info, 0, sizeof *info);
    if (err && err_size) err[0] = 0;
    uint8_t *is_op = NULL;
    rd r;
    if (!open_save(data, size, &r)) FAIL("the save file is damaged or from a newer version");

    if (strcmp(rstr(&r), hw_str(m, m->game_id)) != 0) FAIL("this save belongs to another game");
    bool exact = r32(&r) == m->crc;
    if (!exact) result = HW_SAVE_REMAPPED;
    read_info(&r, info);
    is_op = op_starts(m);
    if (!is_op) FAIL("out of memory");

    hw_vm_core s;
    memset(&s, 0, sizeof s);
    uint32_t lo = r32(&r), hi = r32(&r);
    s.rng = ((uint64_t)hi << 32) | lo;
    s.status = HW_VM_RUNNING;

    /* Position. */
    uint32_t pc = r32(&r);
    uint32_t history_count = r32(&r);
    if (r.bad || history_count == 0 || history_count > HW_SAVE_HISTORY) FAIL("the save file is damaged");
    uint32_t history[HW_SAVE_HISTORY];
    for (uint32_t i = 0; i < history_count; i++) history[i] = r32(&r);
    char scene[256];
    copy_str(scene, sizeof scene, rstr(&r));
    uint32_t sp = r32(&r);
    if (r.bad || sp > HW_VM_STACK) FAIL("the save file is damaged");
    int32_t stack[HW_VM_STACK];
    for (uint32_t i = 0; i < sp; i++) stack[i] = (int32_t)r32(&r);

    if (exact) {
        if (pc >= m->code_count || !is_op[pc]) FAIL("the save file is damaged");
    } else {
        /* The saved line, else an earlier checkpoint (newest first), else the scene's start. */
        pc = HW_NONE;
        for (uint32_t i = 0; i < history_count && pc == HW_NONE; i++) {
            uint32_t at = find_checkpoint(m, history[i]);
            if (at == HW_NONE) continue;
            /* A menu's saved conditions only fit a menu with the same number of options. */
            bool menu = hw_op(m->code[at]) == HW_OP_MENU;
            if (menu ? m->code[at + 2] != sp : sp != 0) continue;
            pc = at;
            if (i > 0) result = HW_SAVE_FALLBACK;
        }
        if (pc == HW_NONE) {
            uint32_t sc = hw_module_find_scene(m, scene);
            if (sc == HW_NONE) FAIL("the scene \"%s\" this save was in no longer exists", scene);
            pc = m->scenes[sc].entry_pc;
            sp = 0;
            result = HW_SAVE_FALLBACK;
        }
    }
    s.pc = pc;
    s.sp = sp;
    memcpy(s.stack, stack, sp * sizeof stack[0]);

    /* Call frames. */
    uint32_t fp = r32(&r);
    if (r.bad || fp > HW_VM_FRAMES) FAIL("the save file is damaged");
    for (uint32_t i = 0; i < fp; i++) {
        uint32_t ret = r32(&r);
        char caller[256], callee[256];
        copy_str(caller, sizeof caller, rstr(&r));
        copy_str(callee, sizeof callee, rstr(&r));
        uint32_t ordinal = r32(&r);
        if (r.bad) FAIL("the save file is damaged");
        if (exact) {
            if (ret >= m->code_count || !is_op[ret]) FAIL("the save file is damaged");
        } else {
            uint32_t at = find_call_site(m, caller, callee, ordinal);
            if (at == HW_NONE) {
                /* The call is gone: returning restarts the calling scene. */
                uint32_t sc = hw_module_find_scene(m, caller);
                if (sc == HW_NONE) FAIL("the scene \"%s\" this save returns to no longer exists", caller);
                at = m->scenes[sc].entry_pc;
                result = HW_SAVE_FALLBACK;
            }
            ret = at;
        }
        s.frames[i] = ret;
    }
    s.fp = fp;

    /* Variables: start from the defaults, then take every saved value that still fits. */
    int32_t *vars = malloc((m->var_count > 0 ? m->var_count : 1) * sizeof *vars);
    if (!vars) FAIL("out of memory");
    for (uint32_t i = 0; i < m->var_count; i++) vars[i] = m->vars[i].scope == HW_SCOPE_SAVE ? m->vars[i].def : vm->vars[i];
    uint32_t var_count = r32(&r);
    for (uint32_t i = 0; i < var_count && !r.bad; i++) {
        char name[256];
        copy_str(name, sizeof name, rstr(&r));
        uint32_t type = r32(&r);
        int32_t value;
        if (type == HW_VAR_STR) {
            value = (int32_t)string_or_none(m, rstr(&r));
        } else {
            value = (int32_t)r32(&r);
        }
        uint32_t v = hw_module_find_var(m, name);
        if (v == HW_NONE || m->vars[v].scope != HW_SCOPE_SAVE || m->vars[v].type != type) continue;
        if (type == HW_VAR_STR && value == 0 && hw_str(m, (uint32_t)m->vars[v].def)[0]) continue; /* value gone: keep the default */
        if (type == HW_VAR_BOOL) value = value != 0;
        vars[v] = value;
    }

    uint8_t *spent = calloc(m->line_count > 0 ? m->line_count : 1, 1);
    if (!spent) {
        free(vars);
        FAIL("out of memory");
    }
    uint32_t spent_count = r32(&r);
    for (uint32_t i = 0; i < spent_count && !r.bad; i++) {
        uint32_t line = find_line(m, r32(&r));
        if (line != HW_NONE) spent[line] = 1;
    }

    hw_display *d = &s.display;
    d->bg = string_or_none(m, rstr(&r));
    d->cg = string_or_none(m, rstr(&r));
    d->music = string_or_none(m, rstr(&r));
    d->ambient = string_or_none(m, rstr(&r));
    uint32_t stage = r32(&r);
    for (uint32_t i = 0; i < stage && !r.bad; i++) {
        hw_stage_char c;
        memset(&c, 0, sizeof c);
        c.id = string_or_none(m, rstr(&r));
        c.at = string_or_none(m, rstr(&r));
        const hw_sprite *sprite = c.id ? hw_module_sprite_of(m, c.id) : NULL;
        uint32_t attrs = r32(&r);
        for (uint32_t k = 0; k < attrs && !r.bad; k++) {
            char name[256];
            snprintf(name, sizeof name, "%s", rstr(&r));
            bool removed = name[0] == '-';
            char *word = removed ? name + 1 : name;
            uint8_t tag = 0;
            char *slash = strchr(word, '/');
            if (slash) {
                *slash = 0;
                /* The group by name; a group that no longer exists drops the attribute. */
                for (uint32_t g = 0; sprite && g < sprite->group_count && !tag; g++) {
                    if (strcmp(hw_str(m, m->sprite_groups[sprite->group_first + g].name), word) == 0) tag = (uint8_t)(g + 1);
                }
                if (!tag) continue;
                word = slash + 1;
            }
            uint32_t a = string_or_none(m, word);
            if (a && c.attr_count < HW_VM_MAX_ATTRS) {
                c.attrs[c.attr_count] = removed ? a | HW_ATTR_REMOVED : a;
                c.attr_group[c.attr_count] = tag;
                c.attr_count++;
            }
        }
        if (c.id && d->stage_count < HW_VM_MAX_STAGE) d->stage[d->stage_count++] = c;
    }
    if (r.version >= 2) {
        uint32_t textbox = r32(&r), hidden = r32(&r);
        d->textbox = textbox == HW_TEXTBOX_NVL ? HW_TEXTBOX_NVL : HW_TEXTBOX_ADV;
        d->textbox_hidden = hidden != 0;
        uint32_t page = r32(&r);
        for (uint32_t i = 0; i < page && !r.bad; i++) {
            uint32_t line = find_line(m, r32(&r));
            if (line == HW_NONE) continue; /* a line deleted since: the page shows the rest */
            if (d->page_count == HW_VM_MAX_PAGE) {
                memmove(&d->page[0], &d->page[1], (HW_VM_MAX_PAGE - 1) * sizeof d->page[0]);
                d->page_count--;
            }
            d->page[d->page_count++] = line;
        }
        uint32_t exts = r32(&r);
        for (uint32_t i = 0; i < exts && !r.bad; i++) {
            char name[256];
            copy_str(name, sizeof name, rstr(&r));
            uint32_t ext = HW_NONE;
            for (uint32_t e = 0; e < m->ext_count && e < HW_VM_MAX_EXT; e++) {
                if (strcmp(hw_str(m, m->exts[e].name), name) == 0) ext = e;
            }
            uint32_t n = r32(&r), values[HW_VM_EXT_VALUES] = { 0 };
            bool fits = ext != HW_NONE && n <= HW_VM_EXT_VALUES && n == (m->exts[ext].param_count < HW_VM_EXT_VALUES ? m->exts[ext].param_count : HW_VM_EXT_VALUES);
            for (uint32_t k = 0; k < n && !r.bad && k < 64; k++) {
                uint32_t type = r32(&r), v;
                if (type == HW_XP_INT || type == HW_XP_BOOL) v = r32(&r);
                else if (type == HW_XP_TEXT) v = find_line(m, r32(&r));
                else v = string_or_none(m, rstr(&r));
                /* The statement changed its parameters since: it starts over (as if it hadn't run). */
                if (!fits || k >= HW_VM_EXT_VALUES || m->ext_params[m->exts[ext].param_first + k].type != type) fits = false;
                else values[k] = v;
            }
            if (fits) {
                d->ext_called |= 1u << ext;
                memcpy(d->ext_last[ext], values, sizeof values);
            }
        }
    }
    if (r.bad || r.pos != r.n) {
        free(vars);
        free(spent);
        FAIL("the save file is damaged");
    }

    /* Everything checked: commit. */
    vm->s = s;
    memcpy(vm->vars, vars, (size_t)m->var_count * sizeof *vars);
    memcpy(vm->spent, spent, m->line_count);
    vm->menu_count = 0;
    vm->error[0] = 0;
    free(vars);
    free(spent);
    if (info->language[0]) hw_vm_set_language(vm, info->language);

done:
    free(is_op);
    return result;
}

/* ---- rollback history ---- */

bool hw_history_init(hw_history *h, size_t snap_size, uint32_t capacity)
{
    memset(h, 0, sizeof *h);
    h->buf = malloc(snap_size * (capacity > 0 ? capacity : 1));
    if (!h->buf) return false;
    h->snap_size = snap_size;
    h->cap = capacity > 0 ? capacity : 1;
    return true;
}

void hw_history_free(hw_history *h)
{
    free(h->buf);
    memset(h, 0, sizeof *h);
}

void hw_history_clear(hw_history *h)
{
    h->start = 0;
    h->count = 0;
}

void hw_history_push(hw_history *h, const void *snap)
{
    uint32_t slot;
    if (h->count < h->cap) {
        slot = (h->start + h->count) % h->cap;
        h->count++;
    } else {
        slot = h->start;
        h->start = (h->start + 1) % h->cap;
    }
    memcpy(h->buf + (size_t)slot * h->snap_size, snap, h->snap_size);
}

const void *hw_history_peek(const hw_history *h, uint32_t back)
{
    if (back >= h->count) return NULL;
    uint32_t slot = (h->start + h->count - 1 - back) % h->cap;
    return h->buf + (size_t)slot * h->snap_size;
}

bool hw_history_pop(hw_history *h)
{
    if (h->count == 0) return false;
    h->count--;
    return true;
}

uint32_t hw_snapshot_pc(const void *snap)
{
    hw_vm_core core;
    memcpy(&core.pc, (const uint8_t *)snap + offsetof(hw_vm_core, pc), sizeof core.pc);
    return core.pc;
}

bool hw_rollback(hw_vm *vm, hw_history *h)
{
    if (h->count < 2) return false;
    hw_history_pop(h); /* the current checkpoint */
    const void *prev = hw_history_peek(h, 0);
    hw_vm_restore(vm, prev);
    hw_history_pop(h); /* replaying it pushes it again */
    return true;
}
