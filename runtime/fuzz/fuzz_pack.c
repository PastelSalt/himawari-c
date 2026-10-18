/* libFuzzer: .hwp headers and tables of contents (hw_pack_parse), entry decoding, and raw LZ4 blocks. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_pack.h"

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    /* Raw LZ4: the first two bytes say how big the output must be. */
    if (size >= 2) {
        size_t out = (size_t)data[0] | ((size_t)data[1] << 8);
        uint8_t *buf = malloc(out ? out : 1);
        if (buf) {
            (void)hw_lz4_decode(data + 2, size - 2, buf, out);
            free(buf);
        }
    }
    /* A whole pack. */
    char err[200];
    hw_pack_header h;
    if (!hw_pack_header_parse(&h, data, size, size, err, sizeof err)) return 0;
    hw_pack p;
    if (!hw_pack_parse(&p, &h, data + h.toc_offset, size - h.toc_offset, size, err, sizeof err)) return 0;
    for (uint32_t i = 0; i < h.entry_count; i++) {
        const hw_pack_entry *e = &p.entries[i];
        if (e->codec == HW_CODEC_REMOVED || e->size > (1u << 20)) continue;
        const char *name = p.names + e->name;
        if (hw_pack_find(&p, name) == NULL) abort(); /* every listed name must be found again */
        uint8_t *stored = malloc(e->stored ? e->stored : 1), *out = malloc(e->size ? e->size : 1);
        if (stored && out) {
            memcpy(stored, data + e->offset, e->stored);
            hw_pack_unmask(&h, e->hash, 0, stored, e->stored);
            if (e->codec == HW_CODEC_LZ4) (void)hw_lz4_decode(stored, e->stored, out, e->size);
            else (void)hw_crc32(0, stored, e->stored);
        }
        free(stored);
        free(out);
    }
    hw_pack_free(&p);
    return 0;
}
