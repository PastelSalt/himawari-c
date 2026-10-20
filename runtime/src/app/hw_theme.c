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
    p->ink = color(m, "outline", 0x12121c); /* text outlines */
    p->border = color(m, "border", p->accent);
    p->button = color(m, "button", p->panel);
    p->button_text = color(m, "button_text", p->text);
    p->title = color(m, "title", 0x2b3a67); /* the top of the title screen's gradient */
}

/* A percent setting (compiled in tenths) as a fraction. */
static float frac(const hw_module *m, const char *key, float def)
{
    const hw_theme_entry *e = hw_module_theme(m, key);
    return e && e->type == HW_THEME_INT ? (float)e->value / 1000.0f : def;
}

static float px(const hw_module *m, const char *key, float def)
{
    const hw_theme_entry *e = hw_module_theme(m, key);
    return e && e->type == HW_THEME_INT ? (float)e->value : def;
}

/* A choice setting: the index of its value in `names`, or `def`. */
static int pick(const hw_module *m, const char *key, const char *const *names, int def)
{
    const char *v = hw_theme_str(m, key);
    for (int i = 0; v && names[i]; i++) {
        if (strcmp(v, names[i]) == 0) return i;
    }
    return def;
}

static void column(const hw_module *m, const char *name, hw_ui_column *c, float y, float w, float h, float gap)
{
    char key[64];
    snprintf(key, sizeof key, "layout.%s.x", name);
    c->x = frac(m, key, 0.5f);
    snprintf(key, sizeof key, "layout.%s.y", name);
    c->y = frac(m, key, y);
    snprintf(key, sizeof key, "layout.%s.width", name);
    c->w = px(m, key, w);
    snprintf(key, sizeof key, "layout.%s.height", name);
    c->h = px(m, key, h);
    snprintf(key, sizeof key, "layout.%s.gap", name);
    c->gap = px(m, key, gap);
}

void hw_theme_layout(const hw_module *m, hw_ui_layout *u)
{
    /* 1.0's textbox.height and textbox.padding still place the textbox and its text when the layout doesn't. */
    float h = frac(m, "layout.textbox.height", (float)hw_theme_int(m, "textbox.height", 27) / 100.0f);
    u->textbox = (hw_ui_box){ frac(m, "layout.textbox.x", 0.08f), frac(m, "layout.textbox.y", 0.97f - h), frac(m, "layout.textbox.width", 0.84f), h };
    u->page = (hw_ui_box){ frac(m, "layout.page.x", 0.06f), frac(m, "layout.page.y", 0.05f), frac(m, "layout.page.width", 0.88f),
                           frac(m, "layout.page.height", 0.90f) };
    float pad = (float)hw_theme_int(m, "textbox.padding", 44);
    u->text_left = px(m, "layout.text.left", pad);
    u->text_top = px(m, "layout.text.top", 18);
    u->text_right = px(m, "layout.text.right", pad);
    u->plate_x = px(m, "layout.nameplate.x", 24);
    u->plate_y = px(m, "layout.nameplate.y", -58);
    u->plate_h = px(m, "layout.nameplate.height", 58);
    u->choice_x = frac(m, "layout.choices.x", 0.5f);
    u->choice_y = frac(m, "layout.choices.y", 0.40f);
    u->choice_w = frac(m, "layout.choices.width", 0.55f);
    u->choice_h = px(m, "layout.choices.height", 76);
    u->choice_gap = px(m, "layout.choices.gap", 18);
    u->quick_show = hw_theme_int(m, "layout.quickbar.show", 1) != 0;
    static const char *const ALIGN[] = { "left", "center", "right", NULL };
    u->quick_align = pick(m, "layout.quickbar.align", ALIGN, HW_ALIGN_RIGHT);
    u->title_x = frac(m, "layout.title.x", 0.5f);
    u->title_y = frac(m, "layout.title.y", 0.28f);
    u->title_size = px(m, "layout.title.size", 88);
    u->title_show = hw_theme_int(m, "layout.title.show", 1) != 0;
    u->credit_x = frac(m, "layout.credit.x", 0.985f);
    u->credit_y = frac(m, "layout.credit.y", 0.975f);
    u->credit_size = px(m, "layout.credit.size", 20);
    column(m, "title_menu", &u->title_menu, 0.40f, 440, 66, 16);
    column(m, "game_menu", &u->game_menu, 0.14f, 520, 68, 20);
    u->radius = px(m, "shape.radius", 0);
    u->border = px(m, "shape.border", 0);
    u->shadow = px(m, "shape.shadow", 0);
    static const char *const HOVER[] = { "bar", "outline", "fill", NULL };
    u->hover = pick(m, "shape.hover", HOVER, HW_HOVER_BAR);
    u->outline = px(m, "text.outline", 2);
    static const char *const MOTION[] = { "none", "fade", "rise", NULL };
    u->motion = pick(m, "motion.choices", MOTION, HW_MOTION_NONE);
    u->motion_ms = px(m, "motion.ms", 250);
    u->sound_hover = hw_theme_str(m, "sound.hover");
    u->sound_click = hw_theme_str(m, "sound.click");
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
