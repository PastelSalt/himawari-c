#include "hw_audio.h"

#include <SDL3/SDL.h>
#include <SDL3_mixer/SDL_mixer.h>

#include <stdio.h>
#include <string.h>

#include "hw_hwb.h"

#define SFX_POOL 6

struct hw_audio {
    const hw_assets *assets;
    MIX_Mixer *mixer;
    MIX_Track *music[2];
    int music_now;          /* the track playing the current music */
    char music_name[128];
    MIX_Track *ambient;
    char ambient_name[128];
    MIX_Track *sfx[SFX_POOL];
    int sfx_next;
    MIX_Track *voice;
    float volume[4];
    const char *missing[4];
};

static const char *const FOLDERS[4] = { "music", "ambient", "sfx", "voice" };
static const char *const EXTS[] = { ".ogg", ".wav", ".mp3", ".flac", ".opus", NULL };

hw_audio *hw_audio_open(const hw_assets *assets)
{
    if (!MIX_Init()) {
        SDL_Log("audio: %s", SDL_GetError());
        return NULL;
    }
    hw_audio *au = SDL_calloc(1, sizeof *au);
    if (!au) return NULL;
    au->assets = assets;
    au->mixer = MIX_CreateMixerDevice(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, NULL);
    if (!au->mixer) {
        SDL_Log("audio: no output device (%s); playing silently", SDL_GetError());
        SDL_free(au);
        MIX_Quit();
        return NULL;
    }
    au->music[0] = MIX_CreateTrack(au->mixer);
    au->music[1] = MIX_CreateTrack(au->mixer);
    au->ambient = MIX_CreateTrack(au->mixer);
    for (int i = 0; i < SFX_POOL; i++) au->sfx[i] = MIX_CreateTrack(au->mixer);
    au->voice = MIX_CreateTrack(au->mixer);
    for (int i = 0; i < 4; i++) au->volume[i] = 1.0f;
    return au;
}

void hw_audio_close(hw_audio *au)
{
    if (!au) return;
    MIX_DestroyMixer(au->mixer); /* destroys its tracks */
    SDL_free(au);
    MIX_Quit();
}

static bool start(hw_audio *au, MIX_Track *track, int channel, const char *folder, const char *name, int loops, int fade_ms)
{
    char path[1024];
    if (!hw_assets_find(au->assets, folder, name, EXTS, path, sizeof path)) {
        au->missing[channel] = "missing";
        return false;
    }
    /* Music and ambient stream from disk; short sounds are decoded up front. */
    bool predecode = channel == HW_CHANNEL_SFX || channel == HW_CHANNEL_VOICE;
    MIX_Audio *audio = MIX_LoadAudio_IO(au->mixer, hw_vfs_open(hw_assets_vfs(au->assets), path), predecode, true);
    if (!audio) {
        SDL_Log("audio: %s: %s", path, SDL_GetError());
        au->missing[channel] = "can't be read";
        return false;
    }
    au->missing[channel] = NULL;
    MIX_SetTrackAudio(track, audio);
    MIX_DestroyAudio(audio); /* the track keeps a reference */
    MIX_SetTrackGain(track, au->volume[channel]);
    SDL_PropertiesID props = SDL_CreateProperties();
    SDL_SetNumberProperty(props, MIX_PROP_PLAY_LOOPS_NUMBER, loops);
    if (fade_ms > 0) SDL_SetNumberProperty(props, MIX_PROP_PLAY_FADE_IN_MILLISECONDS_NUMBER, fade_ms);
    bool ok = MIX_PlayTrack(track, props);
    SDL_DestroyProperties(props);
    return ok;
}

static Sint64 frames(MIX_Track *t, int ms) { return ms > 0 ? MIX_TrackMSToFrames(t, ms) : 0; }

void hw_audio_play(hw_audio *au, int channel, const char *name, int fade_ms)
{
    if (!au || channel < 0 || channel > 3) return;
    switch (channel) {
    case HW_CHANNEL_MUSIC: {
        if (strcmp(au->music_name, name) == 0 && MIX_TrackPlaying(au->music[au->music_now])) return; /* already playing */
        /* Crossfade: the old track fades out while the other one fades in. */
        MIX_Track *old = au->music[au->music_now];
        MIX_StopTrack(old, frames(old, fade_ms));
        au->music_now ^= 1;
        snprintf(au->music_name, sizeof au->music_name, "%s", name);
        start(au, au->music[au->music_now], channel, FOLDERS[channel], name, -1, fade_ms);
        break;
    }
    case HW_CHANNEL_AMBIENT:
        if (strcmp(au->ambient_name, name) == 0 && MIX_TrackPlaying(au->ambient)) return;
        snprintf(au->ambient_name, sizeof au->ambient_name, "%s", name);
        start(au, au->ambient, channel, FOLDERS[channel], name, -1, fade_ms);
        break;
    case HW_CHANNEL_SFX:
        start(au, au->sfx[au->sfx_next], channel, FOLDERS[channel], name, 0, 0);
        au->sfx_next = (au->sfx_next + 1) % SFX_POOL;
        break;
    default:
        start(au, au->voice, channel, FOLDERS[channel], name, 0, 0);
        break;
    }
}

void hw_audio_stop(hw_audio *au, int channel, int fade_ms)
{
    if (!au) return;
    if (channel == HW_CHANNEL_MUSIC) {
        MIX_StopTrack(au->music[au->music_now], frames(au->music[au->music_now], fade_ms));
        au->music_name[0] = 0;
    } else if (channel == HW_CHANNEL_AMBIENT) {
        MIX_StopTrack(au->ambient, frames(au->ambient, fade_ms));
        au->ambient_name[0] = 0;
    } else if (channel == HW_CHANNEL_VOICE) {
        MIX_StopTrack(au->voice, frames(au->voice, fade_ms));
    } else {
        for (int i = 0; i < SFX_POOL; i++) MIX_StopTrack(au->sfx[i], 0);
    }
}

void hw_audio_stop_all(hw_audio *au)
{
    if (!au) return;
    MIX_StopAllTracks(au->mixer, 0);
    au->music_name[0] = au->ambient_name[0] = 0;
}

void hw_audio_set_muted(hw_audio *au, bool muted)
{
    if (au) MIX_SetMixerGain(au->mixer, muted ? 0.0f : 1.0f);
}

void hw_audio_set_volume(hw_audio *au, int channel, float volume)
{
    if (!au || channel < 0 || channel > 3) return;
    au->volume[channel] = volume;
    if (channel == HW_CHANNEL_MUSIC) {
        MIX_SetTrackGain(au->music[0], volume);
        MIX_SetTrackGain(au->music[1], volume);
    } else if (channel == HW_CHANNEL_AMBIENT) {
        MIX_SetTrackGain(au->ambient, volume);
    } else if (channel == HW_CHANNEL_SFX) {
        for (int i = 0; i < SFX_POOL; i++) MIX_SetTrackGain(au->sfx[i], volume);
    } else {
        MIX_SetTrackGain(au->voice, volume);
    }
}

bool hw_audio_line_voice(hw_audio *au, const char *language, const char *line_id)
{
    if (!au) return false;
    char folder[64];
    snprintf(folder, sizeof folder, "voice/%s", language);
    if (start(au, au->voice, HW_CHANNEL_VOICE, folder, line_id, 0, 0)) return true;
    au->missing[HW_CHANNEL_VOICE] = NULL; /* most lines have no voice; that's not a problem */
    return false;
}

bool hw_audio_voice_playing(const hw_audio *au)
{
    return au && MIX_TrackPlaying(au->voice);
}

const char *hw_audio_missing(const hw_audio *au, int channel)
{
    return au && channel >= 0 && channel < 4 ? au->missing[channel] : NULL;
}
