/*
 * Himawari-C: the default theme's UI strings (plan §8.10, P10: the default
 * theme ships localized). English and Japanese. They move into the theme files
 * (theme/theme.json) with the theme loader.
 */
#ifndef HW_UI_TEXT_H
#define HW_UI_TEXT_H

typedef enum hw_ui_string {
    UI_START, UI_LOAD, UI_SAVE, UI_LANGUAGE, UI_QUIT, UI_RESUME, UI_BACK, UI_TITLE,
    UI_HISTORY, UI_AUTO, UI_SKIP, UI_MENU, UI_ROLLBACK,
    UI_TEXT_SPEED, UI_EMPTY_SLOT, UI_SLOT, UI_QUICK_SLOT,
    UI_SAVED, UI_LOADED, UI_LOAD_REMAPPED, UI_LOAD_FALLBACK, UI_LOAD_FAILED, UI_NO_QUICK_SAVE,
    UI_THE_END, UI_ERROR_TITLE, UI_ERROR_RELEASE, UI_CLICK_TO_CONTINUE,
    UI_CONFIRM_QUIT, UI_YES, UI_NO, UI_HISTORY_EMPTY, UI_RELOADED, UI_RELOAD_FAILED,
    UI_COUNT
} hw_ui_string;

/* The string in `language` ("ja" or anything else for English). */
const char *hw_ui(const char *language, hw_ui_string id);
/* A language tag's own name: "English", "日本語", or the tag itself. */
const char *hw_language_name(const char *tag);

#endif
