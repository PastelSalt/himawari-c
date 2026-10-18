#include <stdbool.h>

#include "hw_crash.h"

#include <SDL3/SDL.h>

#include <stdio.h>
#include <string.h>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dbghelp.h>
#include <psapi.h>

static wchar_t dump_dir[1024];
static bool message;
static SDL_IOStream *log_file;
static SDL_LogOutputFunction default_log;
static void *default_log_user;

static void SDLCALL log_line(void *user, int category, SDL_LogPriority priority, const char *text)
{
    (void)user;
    if (log_file) {
        SDL_Time now = 0;
        SDL_GetCurrentTime(&now);
        SDL_DateTime dt;
        char stamp[32] = "";
        if (SDL_TimeToDateTime(now, &dt, true)) snprintf(stamp, sizeof stamp, "%02d:%02d:%02d ", dt.hour, dt.minute, dt.second);
        SDL_WriteIO(log_file, stamp, strlen(stamp));
        SDL_WriteIO(log_file, text, strlen(text));
        SDL_WriteIO(log_file, "\n", 1);
        SDL_FlushIO(log_file); /* what was logged survives a crash */
    }
    if (default_log) default_log(default_log_user, category, priority, text);
}

typedef BOOL(WINAPI *write_dump_fn)(HANDLE, DWORD, HANDLE, MINIDUMP_TYPE, PMINIDUMP_EXCEPTION_INFORMATION,
                                    PMINIDUMP_USER_STREAM_INFORMATION, PMINIDUMP_CALLBACK_INFORMATION);

static LONG WINAPI on_crash(EXCEPTION_POINTERS *ep)
{
    /* Keep this simple: the process is in an unknown state. No allocations, no SDL. */
    wchar_t path[1200];
    SYSTEMTIME t;
    GetLocalTime(&t);
    _snwprintf(path, sizeof path / sizeof path[0], L"%lscrash-%04u%02u%02u-%02u%02u%02u.dmp", dump_dir, t.wYear, t.wMonth, t.wDay, t.wHour,
               t.wMinute, t.wSecond);
    path[sizeof path / sizeof path[0] - 1] = 0;
    bool written = false;
    HMODULE dbghelp = LoadLibraryW(L"dbghelp.dll");
    write_dump_fn write_dump = dbghelp ? (write_dump_fn)(void (*)(void))GetProcAddress(dbghelp, "MiniDumpWriteDump") : NULL;
    if (write_dump) {
        HANDLE f = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (f != INVALID_HANDLE_VALUE) {
            MINIDUMP_EXCEPTION_INFORMATION info = { GetCurrentThreadId(), ep, FALSE };
            written = write_dump(GetCurrentProcess(), GetCurrentProcessId(), f, MiniDumpNormal, &info, NULL, NULL) != FALSE;
            CloseHandle(f);
        }
    }
    if (message) {
        wchar_t text[1500];
        _snwprintf(text, sizeof text / sizeof text[0], L"The game closed because of an error.%ls%ls", written ? L"\n\nA crash report was saved to:\n" : L"",
                   written ? path : L"");
        text[sizeof text / sizeof text[0] - 1] = 0;
        MessageBoxW(NULL, text, L"Himawari", MB_OK | MB_ICONERROR);
    }
    return EXCEPTION_EXECUTE_HANDLER;
}

void hw_crash_install(const char *dir, bool show_message)
{
    message = show_message;
    if (!dir || !dir[0]) return;
    MultiByteToWideChar(CP_UTF8, 0, dir, -1, dump_dir, (int)(sizeof dump_dir / sizeof dump_dir[0]));
    char path[1100];
    snprintf(path, sizeof path, "%shimawari.log", dir);
    log_file = SDL_IOFromFile(path, "w");
    SDL_GetLogOutputFunction(&default_log, &default_log_user);
    SDL_SetLogOutputFunction(log_line, NULL);
    SetUnhandledExceptionFilter(on_crash);
}

void hw_crash_shutdown(void)
{
    if (default_log) SDL_SetLogOutputFunction(default_log, default_log_user);
    if (log_file) SDL_CloseIO(log_file);
    log_file = NULL;
}

double hw_since_process_start_ms(void)
{
    FILETIME created, exited, kernel, user, now;
    if (!GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user)) return -1;
    GetSystemTimePreciseAsFileTime(&now);
    ULARGE_INTEGER a = { .LowPart = created.dwLowDateTime, .HighPart = created.dwHighDateTime };
    ULARGE_INTEGER b = { .LowPart = now.dwLowDateTime, .HighPart = now.dwHighDateTime };
    return (double)(b.QuadPart - a.QuadPart) / 10000.0;
}

double hw_peak_memory_mb(void)
{
    PROCESS_MEMORY_COUNTERS mem;
    memset(&mem, 0, sizeof mem);
    if (!K32GetProcessMemoryInfo(GetCurrentProcess(), &mem, sizeof mem)) return -1;
    return (double)mem.PeakWorkingSetSize / (1024.0 * 1024.0);
}
