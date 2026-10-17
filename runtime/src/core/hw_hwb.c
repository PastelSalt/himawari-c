#include "hw_hwb.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_utf8.h"

#define HEADER_SIZE 24u

static uint32_t rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

/* Loader context: the input, the first error, and the module being built. */
typedef struct ctx {
    const uint8_t *bytes;
    size_t size;
    char *err;
    size_t err_size;
    bool failed;
    hw_module *m;
} ctx;

static void fail(ctx *c, const char *fmt, ...)
{
    if (c->failed) return;
    c->failed = true;
    if (c->err && c->err_size > 0) {
        va_list ap;
        va_start(ap, fmt);
        vsnprintf(c->err, c->err_size, fmt, ap);
        va_end(ap);
    }
}

/* A word reader confined to one section. Reads past its end fail and return 0. */
typedef struct section {
    char tag[5];
    uint32_t at, size, pos;
    bool present;
} section;

static uint32_t next(ctx *c, section *s)
{
    if (c->failed) return 0;
    if (s->size - (s->pos - s->at) < 4) {
        fail(c, "section %s is truncated", s->tag);
        return 0;
    }
    uint32_t v = rd32(c->bytes + s->pos);
    s->pos += 4;
    return v;
}

/* Words left in the section; used to refuse counts before allocating for them. */
static uint32_t words_left(const section *s) { return (s->size - (s->pos - s->at)) / 4; }

/* Allocates `count` items of `item` bytes after checking that `count * words` words remain. */
static void *take_array(ctx *c, section *s, uint32_t count, uint32_t words, size_t item)
{
    if (c->failed) return NULL;
    if (words > 0 && count > words_left(s) / words) {
        fail(c, "section %s is truncated", s->tag);
        return NULL;
    }
    void *p = calloc(count > 0 ? count : 1, item);
    if (!p) fail(c, "out of memory");
    return p;
}

static uint32_t str_index(ctx *c, uint32_t i, const char *what)
{
    if (!c->failed && i >= c->m->string_count) fail(c, "%s: string index %u out of range", what, (unsigned)i);
    return i;
}

static bool valid_utf8(const uint8_t *s, size_t len)
{
    size_t i = 0;
    while (i < len) {
        uint32_t cp;
        size_t n = hw_utf8_decode(s + i, len - i, &cp);
        if (cp == HW_UTF8_REPLACEMENT && n == 1) return false;
        i += n;
    }
    return true;
}

static void load_strings(ctx *c, section *s)
{
    hw_module *m = c->m;
    uint32_t count = next(c, s);
    uint32_t *offsets = take_array(c, s, count, 1, sizeof(uint32_t));
    if (c->failed) return;
    for (uint32_t i = 0; i < count; i++) offsets[i] = next(c, s);

    m->string_bytes = malloc(s->size > 0 ? s->size : 1);
    m->strings = calloc(count > 0 ? count : 1, sizeof(char *));
    if (!m->string_bytes || !m->strings) {
        free(offsets);
        fail(c, "out of memory");
        return;
    }
    memcpy(m->string_bytes, c->bytes + s->at, s->size);
    m->string_count = count;
    for (uint32_t i = 0; i < count && !c->failed; i++) {
        uint32_t o = offsets[i];
        const char *start = m->string_bytes + o;
        const char *nul = o < s->size ? memchr(start, 0, s->size - o) : NULL;
        if (!nul) fail(c, "a string isn't NUL-terminated inside STRS");
        else if (!valid_utf8((const uint8_t *)start, (size_t)(nul - start))) fail(c, "a string isn't valid UTF-8");
        else m->strings[i] = start;
    }
    free(offsets);
    if (!c->failed && (count == 0 || m->strings[0][0] != 0)) fail(c, "string 0 must be empty");
}

static void load_meta(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->title = str_index(c, next(c, s), "title");
    m->game_id = str_index(c, next(c, s), "game id");
    m->width = next(c, s);
    m->height = next(c, s);
    m->source_language = str_index(c, next(c, s), "source language");
    m->language_count = next(c, s);
    m->languages = take_array(c, s, m->language_count, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->language_count && !c->failed; i++) m->languages[i] = str_index(c, next(c, s), "language");
    m->position_count = next(c, s);
    m->positions = take_array(c, s, m->position_count, 3, sizeof(hw_position));
    for (uint32_t i = 0; i < m->position_count && !c->failed; i++) {
        m->positions[i].name = str_index(c, next(c, s), "position name");
        m->positions[i].x = (int32_t)next(c, s);
        m->positions[i].y = (int32_t)next(c, s);
    }
    if (c->failed) return;
    if (m->width == 0 || m->height == 0 || m->width > 16384 || m->height > 16384) fail(c, "invalid resolution");
    else if (m->language_count == 0 || m->languages[0] != m->source_language) fail(c, "the first language must be the source language");
}

static void load_vars(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->var_count = next(c, s);
    m->vars = take_array(c, s, m->var_count, 5, sizeof(hw_var_info));
    for (uint32_t i = 0; i < m->var_count && !c->failed; i++) {
        hw_var_info *v = &m->vars[i];
        v->name = str_index(c, next(c, s), "variable name");
        uint32_t ts = next(c, s);
        v->type = (uint8_t)(ts & 0xFFu);
        v->scope = (uint8_t)((ts >> 8) & 0xFFu);
        v->def = (int32_t)next(c, s);
        v->enum_first = next(c, s);
        v->enum_count = next(c, s);
        if (v->type > HW_VAR_STR || v->scope > HW_SCOPE_GLOBAL) fail(c, "invalid variable type or scope");
    }
    m->enum_total = next(c, s);
    m->enums = take_array(c, s, m->enum_total, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->enum_total && !c->failed; i++) m->enums[i] = str_index(c, next(c, s), "enum value");
    for (uint32_t i = 0; i < m->var_count && !c->failed; i++) {
        const hw_var_info *v = &m->vars[i];
        if (v->enum_first > m->enum_total || v->enum_count > m->enum_total - v->enum_first) fail(c, "variable enum out of range");
        if (v->type == HW_VAR_STR) str_index(c, (uint32_t)v->def, "variable default");
    }
}

static void load_chars(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->char_count = next(c, s);
    m->chars = take_array(c, s, m->char_count, 3, sizeof(hw_char_info));
    for (uint32_t i = 0; i < m->char_count && !c->failed; i++) {
        m->chars[i].id = str_index(c, next(c, s), "character id");
        m->chars[i].name = str_index(c, next(c, s), "character name");
        m->chars[i].color = next(c, s);
    }
}

/* Validates one text program; `self` is its own index (SELECT cases must be lower). */
static void check_text(ctx *c, uint32_t self)
{
    const hw_module *m = c->m;
    uint32_t i = m->text_start[self];
    const uint32_t n = m->text_word_count;
#define TEXT_NEXT(dst)                                                     \
    do {                                                                   \
        if (i >= n) {                                                      \
            fail(c, "a text program runs past the end of TEXT");           \
            return;                                                        \
        }                                                                  \
        (dst) = m->text_words[i++];                                        \
    } while (0)
    for (;;) {
        uint32_t op, a, b;
        TEXT_NEXT(op);
        switch (op) {
        case HW_TOP_END:
            return;
        case HW_TOP_RUN:
            TEXT_NEXT(a);
            if (a >= m->string_count) { fail(c, "text string index out of range"); return; }
            break;
        case HW_TOP_VAR:
            TEXT_NEXT(a);
            if (a >= m->var_count) { fail(c, "text variable out of range"); return; }
            break;
        case HW_TOP_OPEN:
        case HW_TOP_MARK:
            TEXT_NEXT(a);
            TEXT_NEXT(b);
            if (a >= m->string_count || b >= m->string_count) { fail(c, "text string index out of range"); return; }
            break;
        case HW_TOP_CLOSE:
            break;
        case HW_TOP_SELECT: {
            uint32_t count;
            TEXT_NEXT(a);
            if (a >= m->var_count) { fail(c, "select variable out of range"); return; }
            TEXT_NEXT(count);
            for (uint32_t k = 0; k < count; k++) {
                TEXT_NEXT(a);
                TEXT_NEXT(b);
                if (a >= m->string_count) { fail(c, "text string index out of range"); return; }
                if (b >= self) { fail(c, "select case text out of range"); return; }
            }
            break;
        }
        default:
            fail(c, "unknown text op %u", (unsigned)op);
            return;
        }
    }
#undef TEXT_NEXT
}

static void load_texts(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->text_count = next(c, s);
    m->text_start = take_array(c, s, m->text_count, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->text_count && !c->failed; i++) m->text_start[i] = next(c, s);
    m->text_word_count = next(c, s);
    m->text_words = take_array(c, s, m->text_word_count, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->text_word_count && !c->failed; i++) m->text_words[i] = next(c, s);
    for (uint32_t i = 0; i < m->text_count && !c->failed; i++) {
        if (m->text_start[i] >= m->text_word_count) fail(c, "a text program starts outside TEXT");
        else check_text(c, i);
    }
}

static void load_lines(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->line_count = next(c, s);
    m->lines = take_array(c, s, m->line_count, 4, sizeof(hw_line_info));
    for (uint32_t i = 0; i < m->line_count && !c->failed; i++) {
        hw_line_info *l = &m->lines[i];
        l->line_id = next(c, s);
        l->speaker = str_index(c, next(c, s), "speaker");
        l->text = next(c, s);
        l->flags = next(c, s);
        if (!c->failed && l->text >= m->text_count) fail(c, "line text %u out of range", (unsigned)l->text);
    }
}

/* Expected argc of the instruction at pc (SHOW and MENU depend on their own arguments). */
static bool expected_argc(const uint32_t *code, uint32_t count, uint32_t pc, uint32_t *argc)
{
    uint32_t op = hw_op(code[pc]);
    uint32_t have = count - pc - 1; /* words available after the op word */
    switch (op) {
    case HW_OP_SAY: case HW_OP_WAIT: case HW_OP_JMP: case HW_OP_JZ: case HW_OP_CALL:
    case HW_OP_PUSH: case HW_OP_LOAD: case HW_OP_STORE:
        *argc = 1; return true;
    case HW_OP_STOP: case HW_OP_EFFECT:
        *argc = 2; return true;
    case HW_OP_AUDIO:
        *argc = 3; return true;
    case HW_OP_HIDE: case HW_OP_BG: case HW_OP_CG:
        *argc = 4; return true;
    case HW_OP_MOVE:
        *argc = 5; return true;
    case HW_OP_RET: case HW_OP_END: case HW_OP_ADD: case HW_OP_SUB: case HW_OP_MUL: case HW_OP_DIV:
    case HW_OP_MOD: case HW_OP_NEG: case HW_OP_EQ: case HW_OP_NE: case HW_OP_LT: case HW_OP_LE:
    case HW_OP_GT: case HW_OP_GE: case HW_OP_NOT: case HW_OP_AND: case HW_OP_OR: case HW_OP_RAND:
        *argc = 0; return true;
    case HW_OP_SHOW: {
        if (have < 7) return false;
        uint64_t n = 7u + (uint64_t)code[pc + 6] + (uint64_t)code[pc + 7];
        if (n > 255) return false;
        *argc = (uint32_t)n;
        return true;
    }
    case HW_OP_MENU: {
        if (have < 2) return false;
        uint64_t n = 2u + 2u * (uint64_t)code[pc + 2];
        if (n > 255) return false;
        *argc = (uint32_t)n;
        return true;
    }
    default:
        return false;
    }
}

static void load_code(ctx *c, section *s, uint8_t **is_op_out)
{
    hw_module *m = c->m;
    m->code_count = next(c, s);
    m->code = take_array(c, s, m->code_count, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->code_count && !c->failed; i++) m->code[i] = next(c, s);
    if (c->failed) return;

    uint8_t *is_op = calloc(m->code_count > 0 ? m->code_count : 1, 1);
    if (!is_op) {
        fail(c, "out of memory");
        return;
    }
    *is_op_out = is_op;
    for (uint32_t pc = 0; pc < m->code_count;) {
        uint32_t want;
        uint32_t argc = hw_argc(m->code[pc]);
        if (!expected_argc(m->code, m->code_count, pc, &want)) {
            fail(c, "unknown opcode 0x%x at pc %u", (unsigned)hw_op(m->code[pc]), (unsigned)pc);
            return;
        }
        if (argc > m->code_count - pc - 1) {
            fail(c, "instruction at pc %u runs past the end of CODE", (unsigned)pc);
            return;
        }
        if (argc != want) {
            fail(c, "instruction at pc %u has the wrong argument count", (unsigned)pc);
            return;
        }
        is_op[pc] = 1;
        pc += 1 + argc;
    }
}

static void check_target(ctx *c, const uint8_t *is_op, uint32_t target, const char *what)
{
    if (!c->failed && (target >= c->m->code_count || !is_op[target])) fail(c, "%s target %u isn't an instruction", what, (unsigned)target);
}

static void check_code(ctx *c, const uint8_t *is_op)
{
    const hw_module *m = c->m;
    for (uint32_t pc = 0; pc < m->code_count && !c->failed; pc++) {
        if (!is_op[pc]) continue;
        const uint32_t *a = &m->code[pc + 1];
        uint32_t op = hw_op(m->code[pc]);
#define STR(k) (void)str_index(c, a[k], "instruction")
#define TRANS(k)                                                         \
    do {                                                                 \
        STR(k);                                                          \
        if (!c->failed && a[k] != 0 && strcmp(m->strings[a[k]], "rule") == 0) STR((k) + 1); \
    } while (0)
        switch (op) {
        case HW_OP_SAY:
            if (a[0] >= m->line_count) fail(c, "SAY at pc %u: line out of range", (unsigned)pc);
            break;
        case HW_OP_SHOW:
            STR(0);
            STR(1);
            TRANS(2);
            for (uint32_t i = 0; i < a[5] + a[6]; i++) STR(7 + i);
            break;
        case HW_OP_HIDE: case HW_OP_BG: case HW_OP_CG:
            STR(0);
            TRANS(1);
            break;
        case HW_OP_MOVE:
            STR(0);
            STR(1);
            TRANS(2);
            break;
        case HW_OP_AUDIO:
            if (a[0] > 3) fail(c, "pc %u: invalid audio channel", (unsigned)pc);
            STR(1);
            break;
        case HW_OP_STOP:
            if (a[0] > 3) fail(c, "pc %u: invalid audio channel", (unsigned)pc);
            break;
        case HW_OP_EFFECT:
            if (a[0] > 1) fail(c, "pc %u: invalid effect", (unsigned)pc);
            break;
        case HW_OP_MENU:
            if (a[0] != HW_NONE && a[0] >= m->line_count) fail(c, "MENU at pc %u: prompt out of range", (unsigned)pc);
            for (uint32_t i = 0; i < a[1] && !c->failed; i++) {
                if (a[2 + 2 * i] >= m->line_count) fail(c, "MENU at pc %u: option line out of range", (unsigned)pc);
                check_target(c, is_op, a[3 + 2 * i], "menu option");
            }
            break;
        case HW_OP_JMP: case HW_OP_JZ: case HW_OP_CALL:
            check_target(c, is_op, a[0], "jump");
            break;
        case HW_OP_LOAD: case HW_OP_STORE:
            if (a[0] >= m->var_count) fail(c, "pc %u: variable out of range", (unsigned)pc);
            break;
        default:
            break;
        }
#undef STR
#undef TRANS
    }
}

static void load_scenes(ctx *c, section *s, const uint8_t *is_op)
{
    hw_module *m = c->m;
    m->scene_count = next(c, s);
    m->scenes = take_array(c, s, m->scene_count, 3, sizeof(hw_scene_info));
    for (uint32_t i = 0; i < m->scene_count && !c->failed; i++) {
        m->scenes[i].name = str_index(c, next(c, s), "scene name");
        m->scenes[i].entry_pc = next(c, s);
        m->scenes[i].file = str_index(c, next(c, s), "scene file");
        check_target(c, is_op, m->scenes[i].entry_pc, "scene entry");
    }
    m->entry_scene = next(c, s);
    if (!c->failed && m->entry_scene != HW_NONE && m->entry_scene >= m->scene_count) fail(c, "entry scene out of range");
}

static void load_debug(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->debug_count = next(c, s);
    m->debug = take_array(c, s, m->debug_count, 3, sizeof(hw_debug_info));
    for (uint32_t i = 0; i < m->debug_count && !c->failed; i++) {
        m->debug[i].pc = next(c, s);
        m->debug[i].file = str_index(c, next(c, s), "debug file");
        m->debug[i].line = next(c, s);
    }
}

static void load_locales(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->locale_count = next(c, s);
    m->locales = take_array(c, s, m->locale_count, 2, sizeof(hw_locale));
    uint32_t *offsets = take_array(c, s, m->locale_count, 2, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->locale_count && !c->failed; i++) {
        m->locales[i].language = str_index(c, next(c, s), "LOCL language");
        offsets[i] = next(c, s);
    }
    uint32_t words = next(c, s);
    m->locale_words = take_array(c, s, words, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < words && !c->failed; i++) m->locale_words[i] = next(c, s);

    uint64_t per = (uint64_t)m->line_count + m->char_count;
    for (uint32_t i = 0; i < m->locale_count && !c->failed; i++) {
        if ((uint64_t)offsets[i] + per > words) {
            fail(c, "LOCL table out of range");
            break;
        }
        hw_locale *l = &m->locales[i];
        l->line_texts = m->locale_words + offsets[i];
        l->char_names = l->line_texts + m->line_count;
        for (uint32_t k = 0; k < m->line_count && !c->failed; k++) {
            if (l->line_texts[k] != HW_NONE && l->line_texts[k] >= m->text_count) fail(c, "LOCL text out of range");
        }
        for (uint32_t k = 0; k < m->char_count && !c->failed; k++) str_index(c, l->char_names[k], "LOCL character name");
    }
    free(offsets);
}

static bool in_range(uint32_t first, uint32_t count, uint32_t total)
{
    return first <= total && count <= total - first;
}

static void pool_strs(ctx *c, uint32_t first, uint32_t count)
{
    const hw_module *m = c->m;
    if (!in_range(first, count, m->sprite_pool_count)) {
        fail(c, "SPRT list out of range");
        return;
    }
    for (uint32_t k = 0; k < count && !c->failed; k++) str_index(c, m->sprite_pool[first + k], "SPRT string");
}

static void check_sprites(ctx *c)
{
    const hw_module *m = c->m;
    const uint32_t pool = m->sprite_pool_count;
    for (uint32_t i = 0; i < m->sprite_count && !c->failed; i++) {
        const hw_sprite *p = &m->sprites[i];
        if (p->chr >= m->char_count) {
            fail(c, "SPRT character out of range");
        } else if (p->scale == 0 || p->scale > 1000000) {
            fail(c, "SPRT scale out of range");
        } else if (!in_range(p->group_first, p->group_count, m->sprite_group_count) ||
                   !in_range(p->preset_first, p->preset_count, m->sprite_preset_count) ||
                   !in_range(p->rule_first, p->rule_count, m->sprite_rule_count)) {
            fail(c, "SPRT entry out of range");
        }
        for (uint32_t k = 0; k < p->preset_count && !c->failed; k++) {
            const hw_sprite_preset *pr = &m->sprite_presets[p->preset_first + k];
            if (pr->layer_count > pool / 2 || !in_range(pr->layer_first, 2 * pr->layer_count, pool)) {
                fail(c, "SPRT preset layers out of range");
                break;
            }
            for (uint32_t l = 0; l < pr->layer_count && !c->failed; l++) {
                if (m->sprite_pool[pr->layer_first + 2 * l] >= p->group_count) fail(c, "SPRT preset group out of range");
                else str_index(c, m->sprite_pool[pr->layer_first + 2 * l + 1], "SPRT preset attribute");
            }
        }
    }
    for (uint32_t i = 0; i < m->sprite_group_count && !c->failed; i++) {
        pool_strs(c, m->sprite_groups[i].default_first, m->sprite_groups[i].default_count);
        if (!c->failed) pool_strs(c, m->sprite_groups[i].attr_first, m->sprite_groups[i].attr_count);
    }
    for (uint32_t i = 0; i < m->sprite_rule_count && !c->failed; i++) {
        pool_strs(c, m->sprite_rules[i].when_first, m->sprite_rules[i].when_count);
    }
}

static void load_sprites(ctx *c, section *s)
{
    hw_module *m = c->m;
    m->sprite_count = next(c, s);
    m->sprites = take_array(c, s, m->sprite_count, 11, sizeof(hw_sprite));
    for (uint32_t i = 0; i < m->sprite_count && !c->failed; i++) {
        hw_sprite *p = &m->sprites[i];
        p->chr = next(c, s);
        p->root = str_index(c, next(c, s), "SPRT root");
        p->anchor_x = (int32_t)next(c, s);
        p->anchor_y = (int32_t)next(c, s);
        p->scale = next(c, s);
        p->group_first = next(c, s);
        p->group_count = next(c, s);
        p->preset_first = next(c, s);
        p->preset_count = next(c, s);
        p->rule_first = next(c, s);
        p->rule_count = next(c, s);
    }
    m->sprite_group_count = next(c, s);
    m->sprite_groups = take_array(c, s, m->sprite_group_count, 6, sizeof(hw_sprite_group));
    for (uint32_t i = 0; i < m->sprite_group_count && !c->failed; i++) {
        hw_sprite_group *g = &m->sprite_groups[i];
        g->name = str_index(c, next(c, s), "SPRT group");
        g->flags = next(c, s);
        g->default_first = next(c, s);
        g->default_count = next(c, s);
        g->attr_first = next(c, s);
        g->attr_count = next(c, s);
    }
    m->sprite_preset_count = next(c, s);
    m->sprite_presets = take_array(c, s, m->sprite_preset_count, 3, sizeof(hw_sprite_preset));
    for (uint32_t i = 0; i < m->sprite_preset_count && !c->failed; i++) {
        hw_sprite_preset *p = &m->sprite_presets[i];
        p->name = str_index(c, next(c, s), "SPRT preset");
        p->layer_first = next(c, s);
        p->layer_count = next(c, s);
    }
    m->sprite_rule_count = next(c, s);
    m->sprite_rules = take_array(c, s, m->sprite_rule_count, 4, sizeof(hw_sprite_rule));
    for (uint32_t i = 0; i < m->sprite_rule_count && !c->failed; i++) {
        hw_sprite_rule *r = &m->sprite_rules[i];
        r->hide = str_index(c, next(c, s), "SPRT rule");
        r->show = str_index(c, next(c, s), "SPRT rule");
        r->when_first = next(c, s);
        r->when_count = next(c, s);
    }
    m->sprite_pool_count = next(c, s);
    m->sprite_pool = take_array(c, s, m->sprite_pool_count, 1, sizeof(uint32_t));
    for (uint32_t i = 0; i < m->sprite_pool_count && !c->failed; i++) m->sprite_pool[i] = next(c, s);
    if (!c->failed) check_sprites(c);
}

const hw_sprite *hw_module_sprite_of(const hw_module *m, uint32_t char_id)
{
    for (uint32_t i = 0; i < m->sprite_count; i++) {
        if (m->chars[m->sprites[i].chr].id == char_id) return &m->sprites[i];
    }
    return NULL;
}

enum { S_META, S_STRS, S_VARS, S_CHAR, S_SCNE, S_LINE, S_TEXT, S_CODE, S_LOCL, S_DBUG, S_SPRT, S_COUNT };
static const char *const TAGS[S_COUNT] = { "META", "STRS", "VARS", "CHAR", "SCNE", "LINE", "TEXT", "CODE", "LOCL", "DBUG", "SPRT" };
#define REQUIRED_SECTIONS 8 /* META..CODE */

bool hw_module_load(hw_module *m, const uint8_t *bytes, size_t size, char *err, size_t err_size)
{
    memset(m, 0, sizeof *m);
    if (err && err_size > 0) err[0] = 0;
    ctx c = { bytes, size, err, err_size, false, m };
    uint8_t *is_op = NULL;

    if (size < HEADER_SIZE) {
        fail(&c, "file is too small to be .hwb");
        goto done;
    }
    if (size > 0xFFFFFFFFu) {
        fail(&c, "file is too large");
        goto done;
    }
    if (memcmp(bytes, "HWB\x01", 4) != 0) {
        fail(&c, "not a .hwb file (bad magic)");
        goto done;
    }
    m->major = (uint16_t)(bytes[4] | (bytes[5] << 8));
    m->minor = (uint16_t)(bytes[6] | (bytes[7] << 8));
    if (m->major != HW_HWB_MAJOR || m->minor > HW_HWB_MINOR) {
        fail(&c, "unsupported version %u.%u (this runtime supports %u.%u)", (unsigned)m->major, (unsigned)m->minor,
             (unsigned)HW_HWB_MAJOR, (unsigned)HW_HWB_MINOR);
        goto done;
    }
    if (rd32(bytes + 16) != size) {
        fail(&c, "file size in the header doesn't match");
        goto done;
    }
    {
        static const uint8_t zero[4] = { 0, 0, 0, 0 };
        uint32_t crc = hw_crc32(0, bytes, 20);
        crc = hw_crc32(crc, zero, 4);
        crc = hw_crc32(crc, bytes + HEADER_SIZE, size - HEADER_SIZE);
        m->crc = rd32(bytes + 20);
        if (crc != m->crc) {
            fail(&c, "checksum mismatch (the file is damaged)");
            goto done;
        }
    }

    section secs[S_COUNT];
    memset(secs, 0, sizeof secs);
    for (int i = 0; i < S_COUNT; i++) memcpy(secs[i].tag, TAGS[i], 5);
    uint32_t count = rd32(bytes + 12);
    if (count > (size - HEADER_SIZE) / 12) {
        fail(&c, "section table runs past the end of the file");
        goto done;
    }
    for (uint32_t i = 0; i < count; i++) {
        const uint8_t *e = bytes + HEADER_SIZE + 12 * i;
        uint32_t at = rd32(e + 4), sz = rd32(e + 8);
        if (at % 4 != 0 || sz % 4 != 0 || at > size || sz > size - at) {
            fail(&c, "section %.4s is misaligned or out of bounds", (const char *)e);
            goto done;
        }
        for (int k = 0; k < S_COUNT; k++) {
            if (memcmp(e, TAGS[k], 4) != 0) continue;
            if (secs[k].present) {
                fail(&c, "section %s appears twice", TAGS[k]);
                goto done;
            }
            secs[k].present = true;
            secs[k].at = secs[k].pos = at;
            secs[k].size = sz;
        }
        /* Unknown tags are skipped (spec §1.2). */
    }
    for (int k = 0; k < REQUIRED_SECTIONS; k++) {
        if (!secs[k].present) {
            fail(&c, "missing section %s", TAGS[k]);
            goto done;
        }
    }

    load_strings(&c, &secs[S_STRS]);
    if (!c.failed) load_meta(&c, &secs[S_META]);
    if (!c.failed) load_vars(&c, &secs[S_VARS]);
    if (!c.failed) load_chars(&c, &secs[S_CHAR]);
    if (!c.failed) load_texts(&c, &secs[S_TEXT]);
    if (!c.failed) load_lines(&c, &secs[S_LINE]);
    if (!c.failed) load_code(&c, &secs[S_CODE], &is_op);
    if (!c.failed) check_code(&c, is_op);
    if (!c.failed) load_scenes(&c, &secs[S_SCNE], is_op);
    if (!c.failed && secs[S_LOCL].present) load_locales(&c, &secs[S_LOCL]);
    if (!c.failed && secs[S_DBUG].present) load_debug(&c, &secs[S_DBUG]);
    if (!c.failed && secs[S_SPRT].present) load_sprites(&c, &secs[S_SPRT]);

done:
    free(is_op);
    if (c.failed) {
        hw_module_free(m);
        return false;
    }
    return true;
}

void hw_module_free(hw_module *m)
{
    free(m->languages);
    free(m->positions);
    free((void *)m->strings);
    free(m->string_bytes);
    free(m->vars);
    free(m->enums);
    free(m->chars);
    free(m->scenes);
    free(m->lines);
    free(m->text_start);
    free(m->text_words);
    free(m->code);
    free(m->debug);
    free(m->locales);
    free(m->locale_words);
    free(m->sprites);
    free(m->sprite_groups);
    free(m->sprite_presets);
    free(m->sprite_rules);
    free(m->sprite_pool);
    memset(m, 0, sizeof *m);
}

uint32_t hw_module_find_string(const hw_module *m, const char *s)
{
    for (uint32_t i = 0; i < m->string_count; i++) {
        if (strcmp(m->strings[i], s) == 0) return i;
    }
    return HW_NONE;
}

uint32_t hw_module_find_scene(const hw_module *m, const char *name)
{
    for (uint32_t i = 0; i < m->scene_count; i++) {
        if (strcmp(hw_str(m, m->scenes[i].name), name) == 0) return i;
    }
    return HW_NONE;
}

uint32_t hw_module_find_var(const hw_module *m, const char *name)
{
    for (uint32_t i = 0; i < m->var_count; i++) {
        if (strcmp(hw_str(m, m->vars[i].name), name) == 0) return i;
    }
    return HW_NONE;
}

uint32_t hw_module_find_locale(const hw_module *m, const char *language)
{
    for (uint32_t i = 0; i < m->locale_count; i++) {
        if (strcmp(hw_str(m, m->locales[i].language), language) == 0) return i;
    }
    return HW_NONE;
}

uint32_t hw_module_scene_at(const hw_module *m, uint32_t pc)
{
    uint32_t best = HW_NONE;
    for (uint32_t i = 0; i < m->scene_count; i++) {
        uint32_t e = m->scenes[i].entry_pc;
        if (e <= pc && (best == HW_NONE || e > m->scenes[best].entry_pc)) best = i;
    }
    return best;
}

bool hw_module_source_at(const hw_module *m, uint32_t pc, const char **file, uint32_t *line)
{
    /* Entries are sorted by pc; the last one at or before pc applies. */
    uint32_t lo = 0, hi = m->debug_count;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        if (m->debug[mid].pc <= pc) lo = mid + 1;
        else hi = mid;
    }
    if (lo == 0) return false;
    *file = hw_str(m, m->debug[lo - 1].file);
    *line = m->debug[lo - 1].line;
    return true;
}

void hw_line_id_format(uint32_t id, char out[7])
{
    static const char alphabet[] = "0123456789abcdefghjkmnpqrstvwxyz";
    for (int i = 5; i >= 0; i--) {
        out[i] = alphabet[id & 31u];
        id >>= 5;
    }
    out[6] = 0;
}
