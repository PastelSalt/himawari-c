#include "hw_ui_text.h"

#include <string.h>

static const char *const EN[UI_COUNT] = {
    [UI_START] = "Start",
    [UI_LOAD] = "Load",
    [UI_SAVE] = "Save",
    [UI_LANGUAGE] = "Language",
    [UI_QUIT] = "Quit",
    [UI_RESUME] = "Resume",
    [UI_BACK] = "Back",
    [UI_TITLE] = "Title",
    [UI_HISTORY] = "History",
    [UI_AUTO] = "Auto",
    [UI_SKIP] = "Skip",
    [UI_MENU] = "Menu",
    [UI_ROLLBACK] = "Rewind",
    [UI_QUICK_SAVE] = "Quick save",
    [UI_QUICK_LOAD] = "Quick load",
    [UI_TEXT_SPEED] = "Text speed",
    [UI_EMPTY_SLOT] = "Empty",
    [UI_SLOT] = "Slot %d",
    [UI_QUICK_SLOT] = "Quick save",
    [UI_SAVED] = "Saved.",
    [UI_LOADED] = "Loaded.",
    [UI_LOAD_REMAPPED] = "This save was made with an earlier version of the story. It continues from the same line.",
    [UI_LOAD_FALLBACK] = "The line this save was at has changed, so the story continues from a little earlier.",
    [UI_LOAD_FAILED] = "This save can't be loaded: %s",
    [UI_NO_QUICK_SAVE] = "There is no quick save yet.",
    [UI_THE_END] = "The End",
    [UI_ERROR_TITLE] = "The story stopped because of an error",
    [UI_ERROR_RELEASE] = "Something went wrong in this part of the story. Your progress up to the last save is safe.",
    [UI_CLICK_TO_CONTINUE] = "Click to return to the title screen",
    [UI_CONFIRM_QUIT] = "Quit the game?",
    [UI_YES] = "Yes",
    [UI_NO] = "No",
    [UI_HISTORY_EMPTY] = "Nothing has been said yet.",
    [UI_RELOADED] = "Reloaded the story.",
    [UI_RELOAD_FAILED] = "Reload failed: %s",
};

static const char *const JA[UI_COUNT] = {
    [UI_START] = "はじめから",
    [UI_LOAD] = "ロード",
    [UI_SAVE] = "セーブ",
    [UI_LANGUAGE] = "言語",
    [UI_QUIT] = "終了",
    [UI_RESUME] = "ゲームに戻る",
    [UI_BACK] = "戻る",
    [UI_TITLE] = "タイトルへ",
    [UI_HISTORY] = "履歴",
    [UI_AUTO] = "オート",
    [UI_SKIP] = "スキップ",
    [UI_MENU] = "メニュー",
    [UI_ROLLBACK] = "巻き戻し",
    [UI_QUICK_SAVE] = "クイックセーブ",
    [UI_QUICK_LOAD] = "クイックロード",
    [UI_TEXT_SPEED] = "文字の速さ",
    [UI_EMPTY_SLOT] = "空き",
    [UI_SLOT] = "スロット %d",
    [UI_QUICK_SLOT] = "クイックセーブ",
    [UI_SAVED] = "セーブしました。",
    [UI_LOADED] = "ロードしました。",
    [UI_LOAD_REMAPPED] = "このセーブは以前のバージョンのシナリオで作られました。同じ台詞から続きます。",
    [UI_LOAD_FALLBACK] = "セーブした台詞が変更されたため、少し前の場面から続きます。",
    [UI_LOAD_FAILED] = "このセーブはロードできません：%s",
    [UI_NO_QUICK_SAVE] = "クイックセーブはまだありません。",
    [UI_THE_END] = "おわり",
    [UI_ERROR_TITLE] = "エラーのため、シナリオが止まりました",
    [UI_ERROR_RELEASE] = "この場面でエラーが発生しました。最後にセーブしたところまでの進行は無事です。",
    [UI_CLICK_TO_CONTINUE] = "クリックするとタイトル画面に戻ります",
    [UI_CONFIRM_QUIT] = "ゲームを終了しますか？",
    [UI_YES] = "はい",
    [UI_NO] = "いいえ",
    [UI_HISTORY_EMPTY] = "まだ台詞はありません。",
    [UI_RELOADED] = "シナリオを再読み込みしました。",
    [UI_RELOAD_FAILED] = "再読み込みに失敗しました：%s",
};

const char *hw_ui(const char *language, hw_ui_string id)
{
    if (id < 0 || id >= UI_COUNT) return "";
    const char *s = language && strcmp(language, "ja") == 0 ? JA[id] : EN[id];
    return s ? s : EN[id];
}

const char *hw_language_name(const char *tag)
{
    if (strcmp(tag, "en") == 0) return "English";
    if (strcmp(tag, "ja") == 0) return "日本語";
    if (strcmp(tag, "zh-Hans") == 0) return "简体中文";
    if (strcmp(tag, "zh-Hant") == 0) return "繁體中文";
    if (strcmp(tag, "ko") == 0) return "한국어";
    if (strcmp(tag, "es") == 0) return "Español";
    if (strcmp(tag, "fr") == 0) return "Français";
    if (strcmp(tag, "de") == 0) return "Deutsch";
    return tag;
}
