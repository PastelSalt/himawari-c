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

/* ---- global.dat: "HWGL", version, payload size, crc, payload (u32 words, padded strings) ---- */

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

void hw_global_load(const hw_persist *p, const hw_module *m, hw_vm *vm, uint8_t *read_lines, hw_settings *s)
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
    if (version != 1 || len != size - 16 || hw_crc32(0, data + 16, len) != crc) goto done;

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
    if (!r.bad) *s = loaded;
done:
    SDL_free(data);
}

bool hw_global_save(const hw_persist *p, const hw_module *m, const hw_vm *vm, const uint8_t *read_lines, const hw_settings *s)
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

    hw_buf out = { 0 };
    hw_buf_put(&out, "HWGL", 4);
    w32(&out, 1);
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
