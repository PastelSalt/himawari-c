#include "hw_input.h"

void hw_bindings_default(hw_bindings *b)
{
    static const uint32_t keys[ACT_COUNT] = {
        [ACT_ADVANCE] = SDLK_RETURN, [ACT_BACK] = SDLK_ESCAPE, [ACT_UP] = SDLK_UP, [ACT_DOWN] = SDLK_DOWN,
        [ACT_LEFT] = SDLK_LEFT, [ACT_RIGHT] = SDLK_RIGHT, [ACT_ROLLBACK] = SDLK_PAGEUP, [ACT_SKIP] = SDLK_TAB,
        [ACT_AUTO] = SDLK_A, [ACT_HISTORY] = SDLK_H, [ACT_HIDE] = SDLK_DELETE, [ACT_QUICK_SAVE] = SDLK_F6,
        [ACT_QUICK_LOAD] = SDLK_F9,
    };
    static const int32_t pads[ACT_COUNT] = {
        [ACT_ADVANCE] = SDL_GAMEPAD_BUTTON_SOUTH, [ACT_BACK] = SDL_GAMEPAD_BUTTON_EAST, [ACT_UP] = SDL_GAMEPAD_BUTTON_DPAD_UP,
        [ACT_DOWN] = SDL_GAMEPAD_BUTTON_DPAD_DOWN, [ACT_LEFT] = SDL_GAMEPAD_BUTTON_DPAD_LEFT,
        [ACT_RIGHT] = SDL_GAMEPAD_BUTTON_DPAD_RIGHT, [ACT_ROLLBACK] = SDL_GAMEPAD_BUTTON_LEFT_SHOULDER,
        [ACT_SKIP] = SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER, [ACT_AUTO] = SDL_GAMEPAD_BUTTON_WEST, [ACT_HISTORY] = SDL_GAMEPAD_BUTTON_NORTH,
        [ACT_HIDE] = SDL_GAMEPAD_BUTTON_BACK, [ACT_QUICK_SAVE] = -1, [ACT_QUICK_LOAD] = -1,
    };
    for (int i = 0; i < ACT_COUNT; i++) {
        b->key[i] = keys[i];
        b->pad[i] = pads[i];
    }
}

hw_action hw_action_for_key(const hw_bindings *b, SDL_Keycode key)
{
    for (int i = 0; i < ACT_COUNT; i++) {
        if (b->key[i] == key && key != 0) return (hw_action)i;
    }
    switch (key) {
    case SDLK_RETURN: case SDLK_KP_ENTER: case SDLK_SPACE: case SDLK_Z: return ACT_ADVANCE;
    case SDLK_ESCAPE: return ACT_BACK;
    case SDLK_UP: return ACT_UP;
    case SDLK_DOWN: return ACT_DOWN;
    case SDLK_LEFT: return ACT_LEFT;
    case SDLK_RIGHT: return ACT_RIGHT;
    default: return ACT_NONE;
    }
}

hw_action hw_action_for_pad(const hw_bindings *b, int button)
{
    for (int i = 0; i < ACT_COUNT; i++) {
        if (b->pad[i] == button && button >= 0) return (hw_action)i;
    }
    if (button == SDL_GAMEPAD_BUTTON_START) return ACT_BACK; /* Start always opens the menu */
    return ACT_NONE;
}

void hw_bind_key(hw_bindings *b, hw_action a, SDL_Keycode key)
{
    if (a < 0 || a >= ACT_COUNT) return;
    for (int i = 0; i < ACT_COUNT; i++) {
        if (b->key[i] == key) b->key[i] = 0;
    }
    b->key[a] = key;
}

void hw_bind_pad(hw_bindings *b, hw_action a, int button)
{
    if (a < 0 || a >= ACT_COUNT) return;
    for (int i = 0; i < ACT_COUNT; i++) {
        if (b->pad[i] == button) b->pad[i] = -1;
    }
    b->pad[a] = button;
}

const char *hw_key_label(uint32_t key)
{
    if (key == 0) return "-";
    const char *s = SDL_GetKeyName((SDL_Keycode)key);
    return s && s[0] ? s : "?";
}

const char *hw_pad_label(int32_t button)
{
    switch (button) {
    case SDL_GAMEPAD_BUTTON_SOUTH: return "A";
    case SDL_GAMEPAD_BUTTON_EAST: return "B";
    case SDL_GAMEPAD_BUTTON_WEST: return "X";
    case SDL_GAMEPAD_BUTTON_NORTH: return "Y";
    case SDL_GAMEPAD_BUTTON_BACK: return "Back";
    case SDL_GAMEPAD_BUTTON_START: return "Start";
    case SDL_GAMEPAD_BUTTON_LEFT_SHOULDER: return "LB";
    case SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER: return "RB";
    case SDL_GAMEPAD_BUTTON_LEFT_STICK: return "LS";
    case SDL_GAMEPAD_BUTTON_RIGHT_STICK: return "RS";
    case SDL_GAMEPAD_BUTTON_DPAD_UP: return "D-pad \xE2\x86\x91";
    case SDL_GAMEPAD_BUTTON_DPAD_DOWN: return "D-pad \xE2\x86\x93";
    case SDL_GAMEPAD_BUTTON_DPAD_LEFT: return "D-pad \xE2\x86\x90";
    case SDL_GAMEPAD_BUTTON_DPAD_RIGHT: return "D-pad \xE2\x86\x92";
    case -1: return "-";
    default: return "?";
    }
}
