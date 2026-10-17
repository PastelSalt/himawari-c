/*
 * Himawari-C: the .hwb loader (spec/bytecode.md). Part of core/: no SDL, no
 * I/O (plan §8.3); the caller reads the file and passes its bytes.
 *
 * hw_module_load() validates everything once (spec §3), the same rules as
 * the reference reader packages/core/src/bytecode/reader.ts. Code that uses a
 * loaded module needs no further bounds checks on indices it got from it.
 */
#ifndef HW_HWB_H
#define HW_HWB_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define HW_HWB_MAJOR 1
#define HW_HWB_MINOR 0
#define HW_NONE 0xFFFFFFFFu
#define HW_POSITION_SCALE 10000

/* Story and expression ops (spec §2.7). */
enum {
    HW_OP_SAY = 0x01, HW_OP_SHOW = 0x02, HW_OP_HIDE = 0x03, HW_OP_MOVE = 0x04,
    HW_OP_BG = 0x05, HW_OP_CG = 0x06, HW_OP_AUDIO = 0x07, HW_OP_STOP = 0x08,
    HW_OP_WAIT = 0x09, HW_OP_EFFECT = 0x0A, HW_OP_MENU = 0x0B,
    HW_OP_JMP = 0x10, HW_OP_JZ = 0x11, HW_OP_CALL = 0x12, HW_OP_RET = 0x13, HW_OP_END = 0x14,
    HW_OP_PUSH = 0x20, HW_OP_LOAD = 0x21, HW_OP_STORE = 0x22,
    HW_OP_ADD = 0x23, HW_OP_SUB = 0x24, HW_OP_MUL = 0x25, HW_OP_DIV = 0x26, HW_OP_MOD = 0x27,
    HW_OP_NEG = 0x28, HW_OP_EQ = 0x29, HW_OP_NE = 0x2A, HW_OP_LT = 0x2B, HW_OP_LE = 0x2C,
    HW_OP_GT = 0x2D, HW_OP_GE = 0x2E, HW_OP_NOT = 0x2F, HW_OP_AND = 0x30, HW_OP_OR = 0x31,
    HW_OP_RAND = 0x32
};

/* Text program ops (spec §2.6). */
enum { HW_TOP_END = 0, HW_TOP_RUN, HW_TOP_VAR, HW_TOP_OPEN, HW_TOP_CLOSE, HW_TOP_MARK, HW_TOP_SELECT };

enum { HW_VAR_INT = 0, HW_VAR_BOOL = 1, HW_VAR_STR = 2 };
enum { HW_SCOPE_SAVE = 0, HW_SCOPE_GLOBAL = 1 };
enum { HW_CHANNEL_MUSIC = 0, HW_CHANNEL_AMBIENT = 1, HW_CHANNEL_SFX = 2, HW_CHANNEL_VOICE = 3 };

#define HW_LINE_OPTION 1u
#define HW_LINE_ONCE 2u
#define HW_LINE_PROMPT 4u

typedef struct hw_var_info {
    uint32_t name;
    uint8_t type, scope;
    int32_t def;
    uint32_t enum_first, enum_count;
} hw_var_info;

typedef struct hw_char_info { uint32_t id, name, color; } hw_char_info;
typedef struct hw_scene_info { uint32_t name, entry_pc, file; } hw_scene_info;
typedef struct hw_line_info { uint32_t line_id, speaker, text, flags; } hw_line_info;
typedef struct hw_debug_info { uint32_t pc, file, line; } hw_debug_info;
typedef struct hw_position { uint32_t name; int32_t x, y; } hw_position;

/* SPRT: layered sprites (spec §2.9). Group, preset, and rule indices are absolute. */
#define HW_SPRITE_ALWAYS 1u
#define HW_SPRITE_MULTIPLE 2u
#define HW_SPRITE_BLINK 4u
#define HW_SPRITE_LIPFLAP 8u

typedef struct hw_sprite {
    uint32_t chr, root;
    int32_t anchor_x, anchor_y; /* 1/10000 */
    uint32_t scale;             /* 1/10000 */
    uint32_t group_first, group_count, preset_first, preset_count, rule_first, rule_count;
} hw_sprite;

typedef struct hw_sprite_group { uint32_t name, flags, default_first, default_count, attr_first, attr_count; } hw_sprite_group;
typedef struct hw_sprite_preset { uint32_t name, layer_first, layer_count; } hw_sprite_preset; /* pool pairs: group (relative), attr */
typedef struct hw_sprite_rule { uint32_t hide, show, when_first, when_count; } hw_sprite_rule;

typedef struct hw_locale {
    uint32_t language;
    const uint32_t *line_texts; /* line_count entries: a text index or HW_NONE */
    const uint32_t *char_names; /* char_count entries: a string index or 0 */
} hw_locale;

typedef struct hw_module {
    uint16_t major, minor;
    uint32_t crc; /* identifies this exact build (saves remap when it changes) */

    /* META */
    uint32_t title, game_id, width, height, source_language;
    uint32_t language_count;
    uint32_t *languages;
    uint32_t position_count;
    hw_position *positions;

    uint32_t string_count;
    const char **strings; /* NUL-terminated UTF-8 */

    uint32_t var_count;
    hw_var_info *vars;
    uint32_t enum_total;
    uint32_t *enums;

    uint32_t char_count;
    hw_char_info *chars;

    uint32_t scene_count;
    hw_scene_info *scenes;
    uint32_t entry_scene; /* HW_NONE if none */

    uint32_t line_count;
    hw_line_info *lines;

    uint32_t text_count;
    uint32_t *text_start; /* index of each program in text_words */
    uint32_t text_word_count;
    uint32_t *text_words;

    uint32_t code_count;
    uint32_t *code;

    uint32_t debug_count; /* 0 when the file has no DBUG section */
    hw_debug_info *debug;

    uint32_t locale_count;
    hw_locale *locales;

    uint32_t sprite_count;
    hw_sprite *sprites;
    uint32_t sprite_group_count;
    hw_sprite_group *sprite_groups;
    uint32_t sprite_preset_count;
    hw_sprite_preset *sprite_presets;
    uint32_t sprite_rule_count;
    hw_sprite_rule *sprite_rules;
    uint32_t sprite_pool_count;
    uint32_t *sprite_pool;

    /* Owned allocations, released by hw_module_free(). */
    char *string_bytes;
    uint32_t *locale_words;
} hw_module;

/*
 * Validates and loads `size` bytes. On failure returns false, leaves `*m`
 * empty, and writes a one-line reason into `err`. Never aborts.
 */
bool hw_module_load(hw_module *m, const uint8_t *bytes, size_t size, char *err, size_t err_size);
void hw_module_free(hw_module *m);

static inline const char *hw_str(const hw_module *m, uint32_t i)
{
    return i < m->string_count ? m->strings[i] : "";
}

/* Lookups. Each returns HW_NONE when nothing matches. */
uint32_t hw_module_find_string(const hw_module *m, const char *s);
uint32_t hw_module_find_scene(const hw_module *m, const char *name);
uint32_t hw_module_find_var(const hw_module *m, const char *name);
uint32_t hw_module_find_locale(const hw_module *m, const char *language);
/* The sprite of a character (by its id's string index), or NULL. */
const hw_sprite *hw_module_sprite_of(const hw_module *m, uint32_t char_id);
/* The scene whose code contains `pc` (scenes are compiled one after another). */
uint32_t hw_module_scene_at(const hw_module *m, uint32_t pc);
/* The source file and 1-based line of `pc`, from DBUG. Returns false without debug info. */
bool hw_module_source_at(const hw_module *m, uint32_t pc, const char **file, uint32_t *line);

/* An op word's opcode and argument count. */
static inline uint32_t hw_op(uint32_t word) { return word & 0xFFu; }
static inline uint32_t hw_argc(uint32_t word) { return (word >> 8) & 0xFFu; }

/* Line IDs: 30-bit value <-> 6-character Crockford base32 (out needs 7 bytes). */
void hw_line_id_format(uint32_t id, char out[7]);

#endif
