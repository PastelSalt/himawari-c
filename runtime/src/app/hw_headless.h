/* Himawari-C: `--headless` modes (plan §8.12): playtests and transcripts, no window. */
#ifndef HW_HEADLESS_H
#define HW_HEADLESS_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/*
 * Runs `himawari --headless …`. `game` is the path of the .hwb to play.
 * Returns the process exit code: 0 all good, 1 the playtest found problems
 * (errors or unreached endings), 2 the file couldn't be loaded or the
 * arguments are wrong.
 */
int hw_headless_main(int argc, char **argv, const char *game);

/* Reads a whole file (UTF-8 path). The caller frees the result with SDL_free(). */
uint8_t *hw_read_file(const char *path, size_t *size);
bool hw_write_file(const char *path, const void *data, size_t size);

#endif
