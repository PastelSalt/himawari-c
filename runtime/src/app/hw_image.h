/*
 * Himawari-C: decoding images (plan §8.2, §8.8): PNG and BMP through SDL,
 * JPEG through stb_image, WebP (with alpha, for sprites) through libwebp.
 */
#ifndef HW_IMAGE_H
#define HW_IMAGE_H

#include <SDL3/SDL.h>

/* Image formats in the order a name without an extension is looked up. */
extern const char *const HW_IMAGE_EXTS[];

/* Decodes the stream (always closed) as the format `ext` names (".png", ".jpg", …). NULL with SDL_GetError() on failure. */
SDL_Surface *hw_image_load(SDL_IOStream *io, const char *ext);

#endif
