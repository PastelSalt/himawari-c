/*
 * Himawari-C: the Studio debug pipe (plan §4.1, spec/debug-protocol.md).
 * Commands arrive as JSON lines on stdin and events leave as JSON lines on
 * stdout. When stdin closes (Studio quit or crashed), a "quit" command is
 * queued so the preview never outlives its editor.
 *
 * Also docks the game window inside another process's window (Studio's
 * preview pane): the same approach as Unity's -parentHWND.
 */
#ifndef HW_LINK_H
#define HW_LINK_H

#include <SDL3/SDL.h>
#include <stdint.h>

typedef struct hw_link hw_link;

/* Starts reading stdin on a background thread. NULL on failure. */
hw_link *hw_link_open(void);
void hw_link_close(hw_link *link);
/* The next complete command line, or NULL. Free it with SDL_free. */
char *hw_link_poll(hw_link *link);
/* Writes one event line (a JSON object without the newline) and flushes. */
void hw_link_send(hw_link *link, const char *json);

/* Makes `win` a borderless child of the native window `parent` (an HWND as an integer). */
bool hw_link_embed(SDL_Window *win, uint64_t parent);
/* Moves the docked window, in the parent's client pixels. w or h <= 0 hides it. */
void hw_link_place(SDL_Window *win, int x, int y, int w, int h);

#endif
