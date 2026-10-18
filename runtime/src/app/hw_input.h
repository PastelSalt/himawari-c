/*
 * Himawari-C: input actions (plan §8.10, §13). Every action has a key and a
 * gamepad button, both remappable from the Controls screen, so the whole
 * game can be played with one input method. The mouse works everywhere too.
 */
#ifndef HW_INPUT_H
#define HW_INPUT_H

#include <SDL3/SDL.h>

#include <stdbool.h>
#include <stdint.h>

typedef enum hw_action {
    ACT_NONE = -1,
    ACT_ADVANCE = 0, /* go on; confirm the focused button */
    ACT_BACK,        /* open the menu in play; go back in menus */
    ACT_UP, ACT_DOWN, ACT_LEFT, ACT_RIGHT,
    ACT_ROLLBACK, ACT_SKIP, ACT_AUTO, ACT_HISTORY, ACT_HIDE,
    ACT_QUICK_SAVE, ACT_QUICK_LOAD,
    ACT_COUNT
} hw_action;

typedef struct hw_bindings {
    uint32_t key[ACT_COUNT]; /* SDL_Keycode; 0 = none */
    int32_t pad[ACT_COUNT];  /* SDL_GamepadButton; -1 = none */
} hw_bindings;

void hw_bindings_default(hw_bindings *b);
/* The action a key or a gamepad button is bound to, or ACT_NONE. Fixed alternatives (Space, Enter, Z,
 * arrow keys) work alongside the bindings, so a bad remap can't lock the player out. */
hw_action hw_action_for_key(const hw_bindings *b, SDL_Keycode key);
hw_action hw_action_for_pad(const hw_bindings *b, int button);
/* Binds a key (or button) to an action; another action that had it loses it. */
void hw_bind_key(hw_bindings *b, hw_action a, SDL_Keycode key);
void hw_bind_pad(hw_bindings *b, hw_action a, int button);
/* Display names: the key's name, or a gamepad button label (A, B, LB, D-pad up, …). */
const char *hw_key_label(uint32_t key);
const char *hw_pad_label(int32_t button);

#endif
