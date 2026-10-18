#include "hw_persist.h"

#include <SDL3/SDL.h>

#include <stdio.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_play.h"

bool hw_persist_open(hw_persist *p, const char *game_id)
{
    p->dir[0] = 0;
    char *dir = SDL_GetPrefPath("Himawari", game_id[0] ? game_id : "game");
    if (!dir) {
        SDL_Log("saves: no writable folder: %s", SDL_GetError());
        return false;
    }
    snprintf(p->dir, sizeof p->dir, "%s", dir);
    SDL_free(dir);
    return true;
}

void hw_persist_slot_path(const hw_persist *p, int slot, char *out, size_t cap)
{
    if (slot == HW_SLOT_QUICK) snprintf(out, cap, "%squick.hwsav", p->dir);
    else snprintf(out, cap, "%sslot%d.hwsav", p->dir, slot);
}

bool hw_persist_write(const char *path, const void *data, size_t size)
{
    char tmp[1100];
    snprintf(tmp, sizeof tmp, "%s.tmp", path);
    if (!SDL_SaveFile(tmp, data, size)) return false;
    if (!SDL_RenamePath(tmp, path)) {
        SDL_RemovePath(tmp);
        return false;
    }
    return true;
}

void hw_settings_default(hw_settings *s)
{
    memset(s, 0, sizeof *s);
    s->cps = 40;
    for (int i = 0; i < 4; i++) s->volume[i] = 1.0f;
    s->auto_speed = 3;
    s->textbox_opacity = -1;
    hw_bindings_default(&s->bindings);
}

/* ---- unlocks ---- */

static void add_unique(uint32_t *list, uint32_t *count, uint32_t v)
{
    for (uint32_t i = 0; i < *count; i++) {
        if (list[i] == v) return;
    }
    list[(*count)++] = v;
}

bool hw_unlocks_build(hw_unlocks *u, const hw_module *m)
{
    memset(u, 0, sizeof *u);
    uint32_t cap = 0;
    for (uint32_t pc = 0; pc < m->code_count; pc += 1 + hw_argc(m->code[pc])) cap++;
    u->cgs = SDL_calloc(cap + 1, sizeof *u->cgs);
    u->music = SDL_calloc(cap + 1, sizeof *u->music);
    if (!u->cgs || !u->music) {
        hw_unlocks_free(u);
        return false;
    }
    for (uint32_t pc = 0; pc < m->code_count; pc += 1 + hw_argc(m->code[pc])) {
        uint32_t op = hw_op(m->code[pc]);
        if (op == HW_OP_CG) add_unique(u->cgs, &u->cg_count, m->code[pc + 1]);
        if (op == HW_OP_AUDIO && m->code[pc + 1] == HW_CHANNEL_MUSIC) add_unique(u->music, &u->music_count, m->code[pc + 2]);
    }
    u->cg_seen = SDL_calloc(u->cg_count + 1, 1);
    u->music_heard = SDL_calloc(u->music_count + 1, 1);
    if (!u->cg_seen || !u->music_heard) {
        hw_unlocks_free(u);
        return false;
    }
    return true;
}

void hw_unlocks_free(hw_unlocks *u)
{
    SDL_free(u->cgs);
    SDL_free(u->music);
    SDL_free(u->cg_seen);
    SDL_free(u->music_heard);
    memset(u, 0, sizeof *u);
}

bool hw_unlock(hw_unlocks *u, bool music, uint32_t asset)
{
    uint32_t n = music ? u->music_count : u->cg_count;
    const uint32_t *list = music ? u->music : u->cgs;
    uint8_t *flags = music ? u->music_heard : u->cg_seen;
    for (uint32_t i = 0; i < n; i++) {
        if (list[i] != asset) continue;
        bool was = flags[i] != 0;
        flags[i] = 1;
        return !was;
    }
    return false;
}

/* ---- global.dat: "HWGL", version, payload size, crc, payload (u32 words, padded strings) ----
 * version 1: language, cps, volume × 4, fullscreen, globals, read lines
 * version 2 adds: auto_speed, text_size, line_spacing, font, textbox_opacity, flags, bindings, unlocked CGs, heard music */

#define GLOBAL_VERSION 2

static void w32(hw_buf *b, uint32_t v)
{
    uint8_t q[4] = { (uint8_t)v, (uint8_t)(v >> 8), (uint8_t)(v >> 16), (uint8_t)(v >> 24) };
    hw_buf_put(b, (const char *)q, 4);
}

static void wstr(hw_buf *b, const char *s)
{
    size_t n = strlen(s);
    w32(b, (uint32_t)n);
    hw_buf_put(b, s, n);
    hw_buf_put(b, "\0\0\0", (4 - n % 4) % 4);
}

typedef struct rd {
    const uint8_t *p;
    size_t n, pos;
    bool bad;
    char str[256];
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
    r->str[0] = 0;
    if (r->bad || r->n - r->pos < padded) {
        r->bad = true;
        return r->str;
    }
    size_t k = len < sizeof r->str - 1 ? len : sizeof r->str - 1;
    memcpy(r->str, r->p + r->pos, k);
    r->str[k] = 0;
    r->pos += padded;
    return r->str;
}

static uint32_t f2u(float f)
{
    uint32_t u;
    memcpy(&u, &f, sizeof u);
    return u;
}

static float u2f(uint32_t u)
{
    float f;
    memcpy(&f, &u, sizeof f);
    return f;
}

void hw_global_load(const hw_persist *p, const hw_module *m, hw_vm *vm, uint8_t *read_lines, hw_unlocks *u, hw_settings *s)
{
    if (!p->dir[0]) return;
    char path[1100];
    snprintf(path, sizeof path, "%sglobal.dat", p->dir);
    size_t size = 0;
    uint8_t *data = SDL_LoadFile(path, &size);
    if (!data) return;
    rd r = { data, size, 0, false, { 0 } };
    if (size < 16 || memcmp(data, "HWGL", 4) != 0) goto done;
    r.pos = 4;
    uint32_t version = r32(&r), len = r32(&r), crc = r32(&r);
    if (version < 1 || version > GLOBAL_VERSION || len != size - 16 || hw_crc32(0, data + 16, len) != crc) goto done;

    hw_settings loaded = *s;
    snprintf(loaded.language, sizeof loaded.language, "%s", rstr(&r));
    float cps = u2f(r32(&r));
    if (cps >= 1.0f && cps <= 1000.0f) loaded.cps = cps;
    for (int i = 0; i < 4; i++) {
        float v = u2f(r32(&r));
        if (v >= 0.0f && v <= 1.0f) loaded.volume[i] = v;
    }
    loaded.fullscreen = r32(&r) != 0;

    /* Global variables by name; values that no longer fit keep their defaults. */
    uint32_t vars = r32(&r);
    for (uint32_t i = 0; i < vars && !r.bad; i++) {
        char name[256];
        snprintf(name, sizeof name, "%s", rstr(&r));
        uint32_t type = r32(&r);
        int32_t value = 0;
        bool ok = true;
        if (type == HW_VAR_STR) {
            uint32_t sidx = hw_module_find_string(m, rstr(&r));
            ok = sidx != HW_NONE;
            value = (int32_t)sidx;
        } else {
            value = (int32_t)r32(&r);
        }
        uint32_t v = hw_module_find_var(m, name);
        if (ok && v != HW_NONE && m->vars[v].scope == HW_SCOPE_GLOBAL && m->vars[v].type == type) {
            vm->vars[v] = type == HW_VAR_BOOL ? value != 0 : value;
        }
    }
    uint32_t seen = r32(&r);
    for (uint32_t i = 0; i < seen && !r.bad; i++) {
        uint32_t id = r32(&r);
        for (uint32_t l = 0; l < m->line_count; l++) {
            if (m->lines[l].line_id == id) {
                read_lines[l] = 1;
                break;
            }
        }
    }
    if (version >= 2) {
        uint32_t a = r32(&r), ts = r32(&r), ls = r32(&r), font = r32(&r), op = r32(&r), flags = r32(&r);
        if (a >= 1 && a <= 5) loaded.auto_speed = (uint8_t)a;
        if (ts <= 3) loaded.text_size = (uint8_t)ts;
        if (ls <= 2) loaded.line_spacing = (uint8_t)ls;
        if (font <= 1) loaded.font = (uint8_t)font;
        int32_t opacity = (int32_t)op;
        if (opacity >= -1 && opacity <= 100) loaded.textbox_opacity = (int8_t)opacity;
        loaded.high_contrast = (flags & 1u) != 0;
        loaded.reduce_motion = (flags & 2u) != 0;
        loaded.skip_unread = (flags & 4u) != 0;
        loaded.a11y_prompted = (flags & 8u) != 0;
        /* Bindings by action name, so adding actions later keeps the player's choices. */
        uint32_t actions = r32(&r);
        for (uint32_t i = 0; i < actions && !r.bad; i++) {
            uint32_t index = r32(&r), key = r32(&r), pad = r32(&r);
            if (index < ACT_COUNT) {
                loaded.bindings.key[index] = key;
                loaded.bindings.pad[index] = (int32_t)pad;
            }
        }
        for (int list = 0; list < 2 && !r.bad; list++) {
            uint32_t n = r32(&r);
            for (uint32_t i = 0; i < n && !r.bad; i++) {
                uint32_t asset = hw_module_find_string(m, rstr(&r));
                if (asset != HW_NONE && u) hw_unlock(u, list == 1, asset);
            }
        }
    }
    if (!r.bad) *s = loaded;
done:
    SDL_free(data);
}

bool hw_global_save(const hw_persist *p, const hw_module *m, const hw_vm *vm, const uint8_t *read_lines, const hw_unlocks *u,
                    const hw_settings *s)
{
    if (!p->dir[0]) return false;
    hw_buf b = { 0 };
    wstr(&b, s->language);
    w32(&b, f2u(s->cps));
    for (int i = 0; i < 4; i++) w32(&b, f2u(s->volume[i]));
    w32(&b, s->fullscreen ? 1u : 0u);
    uint32_t globals = 0;
    for (uint32_t i = 0; i < m->var_count; i++) globals += m->vars[i].scope == HW_SCOPE_GLOBAL;
    w32(&b, globals);
    for (uint32_t i = 0; i < m->var_count; i++) {
        if (m->vars[i].scope != HW_SCOPE_GLOBAL) continue;
        wstr(&b, hw_str(m, m->vars[i].name));
        w32(&b, m->vars[i].type);
        if (m->vars[i].type == HW_VAR_STR) wstr(&b, hw_str(m, (uint32_t)vm->vars[i]));
        else w32(&b, (uint32_t)vm->vars[i]);
    }
    uint32_t seen = 0;
    for (uint32_t l = 0; l < m->line_count; l++) seen += read_lines[l] && m->lines[l].line_id != HW_NONE;
    w32(&b, seen);
    for (uint32_t l = 0; l < m->line_count; l++) {
        if (read_lines[l] && m->lines[l].line_id != HW_NONE) w32(&b, m->lines[l].line_id);
    }
    w32(&b, s->auto_speed);
    w32(&b, s->text_size);
    w32(&b, s->line_spacing);
    w32(&b, s->font);
    w32(&b, (uint32_t)(int32_t)s->textbox_opacity);
    w32(&b, (s->high_contrast ? 1u : 0u) | (s->reduce_motion ? 2u : 0u) | (s->skip_unread ? 4u : 0u) | (s->a11y_prompted ? 8u : 0u));
    w32(&b, ACT_COUNT);
    for (uint32_t i = 0; i < ACT_COUNT; i++) {
        w32(&b, i);
        w32(&b, s->bindings.key[i]);
        w32(&b, (uint32_t)s->bindings.pad[i]);
    }
    for (int list = 0; list < 2; list++) {
        uint32_t n = !u ? 0 : list ? u->music_count : u->cg_count;
        const uint8_t *flags = !u ? NULL : list ? u->music_heard : u->cg_seen;
        const uint32_t *names = !u ? NULL : list ? u->music : u->cgs;
        uint32_t unlocked = 0;
        for (uint32_t i = 0; i < n; i++) unlocked += flags[i] != 0;
        w32(&b, unlocked);
        for (uint32_t i = 0; i < n; i++) {
            if (flags[i]) wstr(&b, hw_str(m, names[i]));
        }
    }

    hw_buf out = { 0 };
    hw_buf_put(&out, "HWGL", 4);
    w32(&out, GLOBAL_VERSION);
    w32(&out, (uint32_t)b.len);
    w32(&out, hw_crc32(0, b.data, b.len));
    hw_buf_put(&out, b.data, b.len);
    bool ok = !b.oom && !out.oom;
    if (ok) {
        char path[1100];
        snprintf(path, sizeof path, "%sglobal.dat", p->dir);
        ok = hw_persist_write(path, out.data, out.len);
    }
    hw_buf_free(&b);
    hw_buf_free(&out);
    return ok;
}
