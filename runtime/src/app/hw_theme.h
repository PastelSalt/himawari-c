/*
 * Himawari-C: the compiled theme (THEM, spec/bytecode.md §2.11, rfcs/0007).
 * Lookups with the default theme's values as fallbacks.
 */
#ifndef HW_THEME_H
#define HW_THEME_H

#include <stdint.h>

#include "hw_hwb.h"
#include "hw_ui_text.h"

/* The built-in UI's colors, from `color.*` or the defaults. 0xRRGGBB. */
typedef struct hw_palette {
    uint32_t accent, text, dim, textbox, nameplate, choice, choice_hover, choice_text, background, panel, ink;
} hw_palette;

void hw_theme_palette(const hw_module *m, hw_palette *out);
int32_t hw_theme_int(const hw_module *m, const char *key, int32_t def);
/* An asset-name setting (`textbox.image`, `font.main`, `title.music`, …), or NULL. */
const char *hw_theme_str(const hw_module *m, const char *key);
/* A UI string: the theme's `string.<lang>.<key>` when it has one (with the same % placeholder), else the built-in one. */
const char *hw_theme_ui(const hw_module *m, const char *lang, hw_ui_string id);

#endif
