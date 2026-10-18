/*
 * Himawari-C: the default theme's UI strings (plan §8.10, P10: the default
 * theme ships localized). English and Japanese. A theme replaces them per
 * language by key (`strings.<lang>.<key>` in theme/theme.json, hw_theme_ui);
 * the keys are kept in step with @himawari/core THEME_STRING_KEYS
 * (tests/theme-keys.test.ts).
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
    /* Phase 5: config, accessibility, controls, extras (plan §8.10, §13). */
    UI_CONFIG, UI_EXTRAS, UI_GALLERY, UI_MUSIC_ROOM, UI_LOCKED, UI_AUTO_SPEED, UI_TEXT_SIZE, UI_LINE_SPACING,
    UI_FONT, UI_FONT_DEFAULT, UI_FONT_READABLE, UI_TEXTBOX_OPACITY, UI_HIGH_CONTRAST, UI_REDUCE_MOTION,
    UI_SKIP_UNREAD, UI_FULLSCREEN, UI_VOLUME_MUSIC, UI_VOLUME_AMBIENT, UI_VOLUME_SFX, UI_VOLUME_VOICE, UI_CONTROLS,
    UI_KEYBOARD, UI_GAMEPAD, UI_PRESS_KEY, UI_RESET_CONTROLS, UI_ACCESSIBILITY, UI_A11Y_PROMPT, UI_A11Y_PROMPT_BODY,
    UI_CONTINUE, UI_ON, UI_OFF, UI_DEFAULT, UI_REPLAY_VOICE, UI_NOW_PLAYING, UI_STOP, UI_ACTION_ADVANCE,
    UI_ACTION_BACK, UI_ACTION_UP, UI_ACTION_DOWN, UI_ACTION_LEFT, UI_ACTION_RIGHT, UI_ACTION_ROLLBACK,
    UI_ACTION_SKIP, UI_ACTION_AUTO, UI_ACTION_HISTORY, UI_ACTION_HIDE, UI_ACTION_QUICK_SAVE, UI_ACTION_QUICK_LOAD,
    UI_COUNT
} hw_ui_string;

/* The string in `language` ("ja" or anything else for English). */
const char *hw_ui(const char *language, hw_ui_string id);
/* The theme key of a string ("start", "text_speed", …). */
const char *hw_ui_key(hw_ui_string id);
/* A language tag's own name: "English", "日本語", or the tag itself. */
const char *hw_language_name(const char *tag);

#endif
