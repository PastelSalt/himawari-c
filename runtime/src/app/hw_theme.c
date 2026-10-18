#include "hw_theme.h"

#include <stdio.h>
#include <string.h>

static uint32_t color(const hw_module *m, const char *name, uint32_t def)
{
    char key[64];
    snprintf(key, sizeof key, "color.%s", name);
    const hw_theme_entry *e = hw_module_theme(m, key);
    return e && e->type == HW_THEME_COLOR ? (uint32_t)e->value & 0xFFFFFFu : def;
}

void hw_theme_palette(const hw_module *m, hw_palette *p)
{
    p->accent = color(m, "accent", 0xffc440);
    p->text = color(m, "text", 0xffffff);
    p->dim = color(m, "dim", 0xbec4d6);
    p->textbox = color(m, "textbox", 0x101320);
    p->nameplate = color(m, "nameplate", p->textbox);
    p->choice = color(m, "choice", 0x161a2b);
    p->choice_hover = color(m, "choice_hover", 0x3a4466);
    p->choice_text = color(m, "choice_text", p->text);
    p->background = color(m, "background", 0x05060c);
    p->panel = color(m, "panel", 0x1c2033);
    p->ink = 0x12121c; /* text outlines */
}

int32_t hw_theme_int(const hw_module *m, const char *key, int32_t def)
{
    const hw_theme_entry *e = hw_module_theme(m, key);
    return e && e->type == HW_THEME_INT ? e->value : def;
}

const char *hw_theme_str(const hw_module *m, const char *key)
{
    const hw_theme_entry *e = hw_module_theme(m, key);
    return e && e->type == HW_THEME_STR ? hw_str(m, (uint32_t)e->value) : NULL;
}

/* The printf conversions in s ("%%" excluded), as a string like "d" or "s". */
static void conversions(const char *s, char *out, size_t cap)
{
    size_t n = 0;
    for (; *s; s++) {
        if (*s != '%') continue;
        if (s[1] == '%') {
            s++;
            continue;
        }
        if (n + 1 < cap) out[n++] = s[1] ? s[1] : '?';
        if (!s[1]) break;
    }
    out[n] = 0;
}

const char *hw_theme_ui(const hw_module *m, const char *lang, hw_ui_string id)
{
    const char *builtin = hw_ui(lang, id);
    if (!m || m->theme_count == 0) return builtin;
    char key[96];
    snprintf(key, sizeof key, "string.%s.%s", lang, hw_ui_key(id));
    const char *s = hw_theme_str(m, key);
    if (!s) return builtin;
    /* A themed string is used as a format: it must have exactly the built-in one's placeholders. */
    char want[8], have[8];
    conversions(builtin, want, sizeof want);
    conversions(s, have, sizeof have);
    return strcmp(want, have) == 0 ? s : builtin;
}
