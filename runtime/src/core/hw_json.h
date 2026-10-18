/*
 * Himawari-C: just enough JSON for the Studio debug pipe (spec/debug-protocol.md).
 * Commands are flat objects of strings and numbers, one per line. No SDL, no I/O.
 * Malformed input never crashes: a lookup simply fails.
 */
#ifndef HW_JSON_H
#define HW_JSON_H

#include <stdbool.h>
#include <stddef.h>

#include "hw_play.h"

/* The string value of a top-level `key`, unescaped into `out` (always terminated). False if absent, not a string, or too long. */
bool hw_json_str(const char *json, const char *key, char *out, size_t cap);
/* The number value of a top-level `key`. */
bool hw_json_num(const char *json, const char *key, double *out);
/* Appends `s` as a quoted, escaped JSON string. */
void hw_json_put_str(hw_buf *b, const char *s);

#endif
