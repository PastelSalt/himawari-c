/*
 * Himawari-C: the bytecode VM (plan §8.4, spec/bytecode.md §2.7). Part of
 * core/: no SDL, no I/O.
 *
 * The VM never renders. hw_vm_next() runs until something happens and
 * describes it as an event; the presentation layer (the game window, or a
 * headless playtest) acts on it. SAY waits for the caller to call
 * hw_vm_next() again; MENU waits for hw_vm_choose().
 *
 * The VM keeps the display state (background, characters, music) itself, so
 * a save or a rollback restores what is on screen without replaying events.
 */
#ifndef HW_VM_H
#define HW_VM_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "hw_hwb.h"

#define HW_VM_STACK 256
#define HW_VM_FRAMES 64
#define HW_VM_MAX_STAGE 16   /* characters on stage at once */
#define HW_VM_MAX_ATTRS 16   /* attributes per character */
#define HW_VM_MAX_OPTIONS 128
#define HW_VM_MAX_PAGE 32      /* lines kept on an NVL page */
#define HW_VM_MAX_EXT 16       /* extension statements (by XTNS index) whose last call is remembered */
#define HW_VM_EXT_VALUES 8     /* values remembered of that call */

typedef enum hw_vm_status {
    HW_VM_IDLE,         /* not started */
    HW_VM_RUNNING,
    HW_VM_WAIT_CHOICE,  /* a MENU is waiting for hw_vm_choose() */
    HW_VM_ENDED,
    HW_VM_ERROR
} hw_vm_status;

typedef enum hw_event_kind {
    HW_EV_NONE,
    HW_EV_SAY,      /* line */
    HW_EV_MENU,     /* line (prompt or HW_NONE), option_count, options[] */
    HW_EV_SHOW,     /* subject (character id), at, trans, add/remove */
    HW_EV_HIDE,     /* subject, trans */
    HW_EV_MOVE,     /* subject, at, trans */
    HW_EV_BG,       /* subject (asset), trans */
    HW_EV_CG,       /* subject (asset), trans */
    HW_EV_AUDIO,    /* channel, subject (asset), ms (fade, -1 = none) */
    HW_EV_STOP,     /* channel, ms */
    HW_EV_WAIT,     /* ms */
    HW_EV_EFFECT,   /* effect (0 shake, 1 flash), ms (-1 = default) */
    HW_EV_TEXTBOX,  /* effect = the mode (HW_TEXTBOX_*); 1.1 */
    HW_EV_XCALL,    /* subject = XTNS index, add/add_count = one value per parameter, line = its text or HW_NONE; 1.1 */
    HW_EV_END,      /* the story ended (END, or RET with no caller) */
    HW_EV_ERROR     /* a content error; the message is in vm->error */
} hw_event_kind;

typedef struct hw_transition {
    uint32_t type;  /* string index of the name, 0 = none */
    uint32_t mask;  /* rule: string index of the mask, else 0 */
    int32_t ms;     /* -1 = theme default */
} hw_transition;

typedef struct hw_event {
    hw_event_kind kind;
    uint32_t pc;
    uint32_t line;
    uint32_t subject;
    uint32_t at;
    hw_transition trans;
    uint32_t channel;
    uint32_t effect;
    int32_t ms;
    const uint32_t *add, *remove; /* string indices, pointing into the module */
    uint32_t add_count, remove_count;
    uint32_t option_count;
    uint32_t options[HW_VM_MAX_OPTIONS]; /* line indices of the options shown, in order */
} hw_event;

/* An attribute entry with this bit set means "removed": a default kept off by `-attr`. */
#define HW_ATTR_REMOVED 0x80000000u

typedef struct hw_stage_char {
    uint32_t id;  /* character id (string index) */
    uint32_t at;  /* position name (string index) */
    uint32_t attr_count;
    uint32_t attrs[HW_VM_MAX_ATTRS];    /* attributes set by the script, plus HW_ATTR_REMOVED markers */
    uint8_t attr_group[HW_VM_MAX_ATTRS]; /* the sprite group of each (index within the sprite + 1), 0 = none */
} hw_stage_char;

typedef struct hw_display {
    uint32_t bg, cg;          /* asset string indices, 0 = none */
    uint32_t music, ambient;  /* looping audio, 0 = none */
    uint32_t stage_count;
    hw_stage_char stage[HW_VM_MAX_STAGE]; /* in the order they appeared (draw order) */
    /* 1.1: textbox mode and the NVL page (spec/language.md §2.8). */
    uint32_t textbox;         /* HW_TEXTBOX_ADV or HW_TEXTBOX_NVL */
    uint32_t textbox_hidden;  /* `textbox hide` until the next line or `textbox show` */
    uint32_t page_count;
    uint32_t page[HW_VM_MAX_PAGE]; /* line indices on the NVL page, oldest first */
    /* 1.1: each extension statement's most recent call (rfcs/0007), by XTNS index, so whatever it left on
     * screen comes back after a load, a rewind, a reload, or a warp. Bit i of ext_called: statement i has run. */
    uint32_t ext_called;
    uint32_t ext_last[HW_VM_MAX_EXT][HW_VM_EXT_VALUES];
} hw_display;

/* The fixed-size part of the state. Saves and rollback snapshots hold this plus the variables. */
typedef struct hw_vm_core {
    uint32_t pc;
    uint32_t status;
    uint32_t sp, fp;
    int32_t stack[HW_VM_STACK];
    uint32_t frames[HW_VM_FRAMES]; /* return pcs */
    uint64_t rng;
    hw_display display;
} hw_vm_core;

typedef struct hw_vm {
    const hw_module *m;
    hw_vm_core s;
    int32_t *vars;     /* m->var_count values */
    uint8_t *spent;    /* per line: a `once` option already chosen (saved) */
    uint8_t *seen;     /* per line: read at least once (global data, survives rollback) */
    uint32_t locale;   /* index into m->locales, or HW_NONE for the source language */
    uint32_t div_by_zero; /* count of divisions by zero (reported in dev builds) */
    char error[200];

    /*
     * Called right before a SAY or MENU runs, with pc on that instruction:
     * a checkpoint (plan §8.9). A snapshot taken here replays the line or the
     * menu when restored. Optional.
     */
    void (*checkpoint)(void *user, const struct hw_vm *vm);
    void *checkpoint_user;

    /* The pending menu (valid in HW_VM_WAIT_CHOICE). */
    uint32_t menu_pc;
    uint32_t menu_count;
    uint32_t menu_lines[HW_VM_MAX_OPTIONS];
    uint32_t menu_targets[HW_VM_MAX_OPTIONS];
} hw_vm;

/* Allocates per-module state; variables get their defaults. Returns false when out of memory. */
bool hw_vm_init(hw_vm *vm, const hw_module *m, uint64_t seed);
void hw_vm_free(hw_vm *vm);

/* Starts at a scene (HW_NONE = the entry scene). Resets save-scope variables and the stage. */
bool hw_vm_start(hw_vm *vm, uint32_t scene);

/*
 * Runs until the next event. Returns false (and kind HW_EV_NONE) while a menu
 * is waiting or after the story ended or failed.
 */
bool hw_vm_next(hw_vm *vm, hw_event *ev);

/* Picks option k (0-based, among the options the MENU event showed). */
bool hw_vm_choose(hw_vm *vm, uint32_t k);

/* NVL: the page is full on screen, so it starts over with only its newest line. */
void hw_vm_page_restart(hw_vm *vm);

/* ---- layered sprites (spec §2.9) ---- */

typedef struct hw_layer {
    uint32_t group; /* absolute index into m->sprite_groups */
    uint32_t attr;  /* string index */
} hw_layer;

/*
 * The layers a character on stage shows, bottom to top: each group's set
 * attributes, else its defaults (minus removed ones); `always` groups whole;
 * then the sprite's rules. Returns how many were written (at most `cap`).
 */
uint32_t hw_sprite_layers(const hw_module *m, const hw_sprite *sp, const hw_stage_char *c, hw_layer *out, uint32_t cap);

/* The PCG32 RNG (spec §2.7). */
void hw_rng_seed(uint64_t *state, uint64_t seed);
uint32_t hw_rng_next(uint64_t *state);

/* ---- text (spec §2.6) ---- */

/* Receives evaluated text: variables and selects are resolved; tags arrive as open/close/mark. */
typedef struct hw_text_sink {
    void (*run)(void *user, const char *text, size_t len);
    void (*open)(void *user, const char *tag, const char *value);  /* value "" when none */
    void (*close)(void *user, const char *tag);
    void (*mark)(void *user, const char *tag, const char *value);
    void *user;
} hw_text_sink;

/* The text program shown for a line in the current language (falls back to the source). */
uint32_t hw_vm_line_text(const hw_vm *vm, uint32_t line);
/* Evaluates a text program into the sink. */
void hw_vm_eval_text(const hw_vm *vm, uint32_t text, const hw_text_sink *sink);
/* The speaker's display name in the current language ("" for narration). */
const char *hw_vm_speaker_name(const hw_vm *vm, uint32_t line);
/*
 * Writes a line's text in canonical markup ({b}…{/b}, {rb=reading}base{/rb},
 * {w=500}), with variables and selects resolved. Always NUL-terminates;
 * returns the length it needed (like snprintf).
 */
size_t hw_vm_line_markup(const hw_vm *vm, uint32_t line, char *buf, size_t cap);
/* A variable's value as text (spec: values as text). Returns the length needed. */
size_t hw_vm_value_text(const hw_vm *vm, uint32_t var, int32_t value, char *buf, size_t cap);

/* Switches the language by tag ("en", "ja"); the source language or an unknown tag selects the source. */
void hw_vm_set_language(hw_vm *vm, const char *language);

/* ---- snapshots (rollback, saves) ---- */

/* Bytes a snapshot of this VM needs: the core plus variables and spent options. */
size_t hw_vm_snapshot_size(const hw_vm *vm);
void hw_vm_snapshot(const hw_vm *vm, void *out);
/* Restores a snapshot; global variables keep their current values (they are not rolled back). */
void hw_vm_restore(hw_vm *vm, const void *snap);

#endif
