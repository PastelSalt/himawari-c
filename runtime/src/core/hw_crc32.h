/* Himawari-C: CRC-32 (IEEE 802.3, as in zlib). Part of core/: no SDL, no I/O (plan §8.3). */
#ifndef HW_CRC32_H
#define HW_CRC32_H

#include <stddef.h>
#include <stdint.h>

/* Continues a CRC: start with crc = 0. */
uint32_t hw_crc32(uint32_t crc, const void *data, size_t len);

#endif
