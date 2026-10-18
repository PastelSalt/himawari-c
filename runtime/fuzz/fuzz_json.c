/* libFuzzer target for the debug pipe's JSON reader (spec/debug-protocol.md): any line on stdin must be safe. */
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "hw_json.h"

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    char *line = malloc(size + 1);
    if (!line) return 0;
    memcpy(line, data, size);
    line[size] = 0;
    char out[64];
    double n;
    static const char *const keys[] = { "cmd", "to", "lang", "x", "w", "" };
    for (int i = 0; i < 6; i++) {
        if (hw_json_str(line, keys[i], out, sizeof out) && strlen(out) >= sizeof out) __builtin_trap();
        (void)hw_json_num(line, keys[i], &n);
    }
    hw_buf b = { 0 };
    hw_json_put_str(&b, line);
    hw_buf_free(&b);
    free(line);
    return 0;
}
