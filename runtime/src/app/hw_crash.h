/*
 * Himawari-C: crash reports and the log (plan §8.13). In the player's save
 * folder: himawari.log (this run's log lines) and, if the game crashes,
 * crash-<date>-<time>.dmp, a minidump for the developer. dbghelp.dll is
 * loaded only when a crash happens, so the .exe still needs no DLLs.
 */
#ifndef HW_CRASH_H
#define HW_CRASH_H

#include <stdbool.h>

/* Starts writing the log to `dir`/himawari.log and installs the crash handler. `dir` ends with a separator. */
void hw_crash_install(const char *dir, bool show_message);
/* Closes the log. */
void hw_crash_shutdown(void);

/* For --perf (plan §8.1): milliseconds since the process was created, and its peak memory in MB. */
double hw_since_process_start_ms(void);
double hw_peak_memory_mb(void);

#endif
