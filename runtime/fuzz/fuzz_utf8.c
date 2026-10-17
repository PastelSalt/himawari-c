/* libFuzzer target for the UTF-8 decoder (plan §16.1). Build with the `fuzz` preset. */
#include <stddef.h>
#include <stdint.h>

#include "hw_utf8.h"

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    uint32_t cp;
    size_t i = 0;
    while (i < size) {
        size_t n = hw_utf8_decode(data + i, size - i, &cp);
        if (n == 0 || n > 4 || n > size - i || cp > 0x10FFFFu) {
            __builtin_trap();
        }
        i += n;
    }
    (void)hw_utf8_count(data, size);
    return 0;
}
