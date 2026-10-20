/*
 * Himawari-C: the compiled theme (THEM, spec/bytecode.md §2.11, rfcs/0007, rfcs/0010).
 * Lookups with the default theme's values as fallbacks: a game without a theme
 * looks exactly like the `himawari` preset (@himawari/core THEME_DEFAULTS).
 */
#ifndef HW_THEME_H
#define HW_THEME_H

#include <stdbool.h>
#include <stdint.h>

#include "hw_hwb.h"
#include "hw_ui_text.h"

/* The built-in UI's colors, from `color.*` or the defaults. 0xRRGGBB. `ink` is the text outline (`color.outline`). */
typedef struct hw_palette {
    uint32_t accent, text, dim, textbox, nameplate, choice, choice_hover, choice_text, background, panel, ink;
    uint32_t border, button, button_text, title;
} hw_palette;

/* A rectangle in fractions of the screen. */
typedef struct hw_ui_box {
    float x, y, w, h;
} hw_ui_box;

/* A column of buttons: x is its center and y the first button's top (fractions); w, h, gap in px at 1080p. */
typedef struct hw_ui_column {
    float x, y, w, h, gap;
} hw_ui_column;

enum { HW_HOVER_BAR, HW_HOVER_OUTLINE, HW_HOVER_FILL };
enum { HW_ALIGN_LEFT, HW_ALIGN_CENTER, HW_ALIGN_RIGHT };
enum { HW_MOTION_NONE, HW_MOTION_FADE, HW_MOTION_RISE };

/* Where the built-in UI's elements are and how they look (theme 2.0, rfcs/0010). Pixel values are at 1080p. */
typedef struct hw_ui_layout {
    hw_ui_box textbox, page;
    float text_left, text_top, text_right; /* the text area inside the textbox */
    float plate_x, plate_y, plate_h;       /* the nameplate, from the textbox's top-left corner */
    float choice_x, choice_y, choice_w;    /* fractions: center x, center y of the list, width */
    float choice_h, choice_gap;
    bool quick_show;
    int quick_align;
    float title_x, title_y, title_size;
    bool title_show;
    float credit_x, credit_y, credit_size; /* "Made with Himawari" (credit: "title"): anchor and baseline (fractions), px */
    hw_ui_column title_menu, game_menu;
    float radius, border, shadow;
    int hover;
    float outline; /* text outline, px */
    int motion;
    float motion_ms;
    const char *sound_hover, *sound_click; /* sfx names, or NULL */
} hw_ui_layout;

void hw_theme_layout(const hw_module *m, hw_ui_layout *out);

void hw_theme_palette(const hw_module *m, hw_palette *out);
int32_t hw_theme_int(const hw_module *m, const char *key, int32_t def);
/* An asset-name setting (`textbox.image`, `font.main`, `title.music`, …), or NULL. */
const char *hw_theme_str(const hw_module *m, const char *key);
/* A UI string: the theme's `string.<lang>.<key>` when it has one (with the same % placeholder), else the built-in one. */
const char *hw_theme_ui(const hw_module *m, const char *lang, hw_ui_string id);

#endif
