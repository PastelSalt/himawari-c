#include "hw_link.h"

#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#endif

#define QUEUE 64
#define LINE_MAX_BYTES 65536

struct hw_link {
    SDL_Mutex *lock;
    SDL_Thread *thread;
    char *queue[QUEUE];
    int head, count;
};

static void push(hw_link *link, char *line)
{
    SDL_LockMutex(link->lock);
    if (link->count < QUEUE) {
        link->queue[(link->head + link->count) % QUEUE] = line;
        link->count++;
        line = NULL;
    }
    SDL_UnlockMutex(link->lock);
    SDL_free(line); /* dropped: Studio sends far fewer than QUEUE commands per frame */
}

static int SDLCALL reader(void *user)
{
    hw_link *link = user;
    char *buf = SDL_malloc(LINE_MAX_BYTES);
    if (buf) {
        while (fgets(buf, LINE_MAX_BYTES, stdin)) {
            size_t n = strlen(buf);
            if (n > 0 && buf[n - 1] != '\n' && !feof(stdin)) {
                /* An overlong line: skip the rest of it. */
                int c;
                while ((c = fgetc(stdin)) != EOF && c != '\n') {}
                continue;
            }
            while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r')) buf[--n] = 0;
            if (n == 0) continue;
            char *line = SDL_strdup(buf);
            if (line) push(link, line);
        }
        SDL_free(buf);
    }
    char *quit = SDL_strdup("{\"cmd\":\"quit\"}");
    if (quit) push(link, quit);
    return 0;
}

hw_link *hw_link_open(void)
{
    hw_link *link = SDL_calloc(1, sizeof *link);
    if (!link) return NULL;
    link->lock = SDL_CreateMutex();
    if (link->lock) link->thread = SDL_CreateThread(reader, "studio-link", link);
    if (!link->thread) {
        SDL_DestroyMutex(link->lock);
        SDL_free(link);
        return NULL;
    }
    return link;
}

void hw_link_close(hw_link *link)
{
    if (!link) return;
    /* The reader may be blocked in fgets; it ends with the process. */
    SDL_DetachThread(link->thread);
}

char *hw_link_poll(hw_link *link)
{
    if (!link) return NULL;
    char *line = NULL;
    SDL_LockMutex(link->lock);
    if (link->count > 0) {
        line = link->queue[link->head];
        link->head = (link->head + 1) % QUEUE;
        link->count--;
    }
    SDL_UnlockMutex(link->lock);
    return line;
}

void hw_link_send(hw_link *link, const char *json)
{
    if (!link) return;
    fputs(json, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

#ifdef _WIN32
static HWND hwnd_of(SDL_Window *win)
{
    return (HWND)SDL_GetPointerProperty(SDL_GetWindowProperties(win), SDL_PROP_WINDOW_WIN32_HWND_POINTER, NULL);
}
#endif

bool hw_link_embed(SDL_Window *win, uint64_t parent)
{
#ifdef _WIN32
    HWND hwnd = hwnd_of(win);
    HWND host = (HWND)(uintptr_t)parent;
    if (!hwnd || !IsWindow(host)) return false;
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style &= ~(LONG_PTR)(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
    style |= WS_CHILD | WS_CLIPSIBLINGS;
    SetWindowLongPtrW(hwnd, GWL_STYLE, style);
    LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    ex &= ~(LONG_PTR)(WS_EX_APPWINDOW | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE);
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
    if (!SetParent(hwnd, host)) return false;
    /* Hidden until Studio sends the pane's bounds. */
    SetWindowPos(hwnd, HWND_TOP, 0, 0, 1, 1, SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_HIDEWINDOW);
    return true;
#else
    (void)win;
    (void)parent;
    return false;
#endif
}

void hw_link_place(SDL_Window *win, int x, int y, int w, int h)
{
#ifdef _WIN32
    HWND hwnd = hwnd_of(win);
    if (!hwnd) return;
    if (w <= 0 || h <= 0) {
        ShowWindow(hwnd, SW_HIDE);
        return;
    }
    SetWindowPos(hwnd, HWND_TOP, x, y, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
#else
    (void)win;
    (void)x;
    (void)y;
    (void)w;
    (void)h;
#endif
}
