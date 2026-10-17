/*
 * Himawari-C: audio over SDL3_mixer (plan §8.7). Channels: music (two tracks
 * for crossfades), ambient, sound effects (a small pool), and voice. Files
 * come from <assets>/<channel folder>/<name>.ogg|.wav|.mp3|.flac. A missing
 * file is silence, never an error (P5).
 */
#ifndef HW_AUDIO_H
#define HW_AUDIO_H

#include <stdbool.h>

#include "hw_assets.h"

typedef struct hw_audio hw_audio;

/* Returns NULL when there is no audio device; every function accepts NULL. */
hw_audio *hw_audio_open(const hw_assets *assets);
void hw_audio_close(hw_audio *au);

/* channel: HW_CHANNEL_* from hw_hwb.h. Music and ambient loop; sfx and voice play once. fade_ms < 0 = none. */
void hw_audio_play(hw_audio *au, int channel, const char *name, int fade_ms);
void hw_audio_stop(hw_audio *au, int channel, int fade_ms);
void hw_audio_stop_all(hw_audio *au);
/* Plays voice/<language>/<line_id> if it exists (plan §8.7: voice is bound by line ID). */
bool hw_audio_line_voice(hw_audio *au, const char *language, const char *line_id);
/* Whether a voice line is still playing (drives lip-flap). */
bool hw_audio_voice_playing(const hw_audio *au);
/* Volume 0..1 per channel. */
void hw_audio_set_volume(hw_audio *au, int channel, float volume);
/* Whether the last play on this channel found no file (for the dev overlay). */
const char *hw_audio_missing(const hw_audio *au, int channel);

#endif
