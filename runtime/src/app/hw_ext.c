#include "hw_ext.h"

#include <string.h>

static hw_ext_statement registry[HW_EXT_MAX];
static int registered;

bool hw_register_statement(const hw_ext_statement *s)
{
    if (!s || !s->name || !s->name[0] || registered >= HW_EXT_MAX || hw_ext_find(s->name)) return false;
    registry[registered++] = *s;
    return true;
}

const hw_ext_statement *hw_ext_find(const char *name)
{
    for (int i = 0; i < registered; i++) {
        if (strcmp(registry[i].name, name) == 0) return &registry[i];
    }
    return NULL;
}

/* The parameter index for a name, or -1. */
static int param(const hw_ext_call *c, const char *name, uint32_t *type)
{
    const hw_module *m = c->vm->m;
    const hw_ext_info *e = &m->exts[c->ext];
    for (uint32_t i = 0; i < e->param_count; i++) {
        const hw_ext_param *p = &m->ext_params[e->param_first + i];
        if (strcmp(hw_str(m, p->name), name) == 0) {
            *type = p->type;
            return (int)i;
        }
    }
    return -1;
}

int32_t hw_ext_int(const hw_ext_call *c, const char *name)
{
    uint32_t type;
    int i = param(c, name, &type);
    return i >= 0 && (uint32_t)i < c->count && (type == HW_XP_INT || type == HW_XP_BOOL) ? (int32_t)c->values[i] : 0;
}

bool hw_ext_bool(const hw_ext_call *c, const char *name) { return hw_ext_int(c, name) != 0; }

const char *hw_ext_word(const hw_ext_call *c, const char *name)
{
    uint32_t type;
    int i = param(c, name, &type);
    if (i < 0 || (uint32_t)i >= c->count || type == HW_XP_INT || type == HW_XP_BOOL || type == HW_XP_TEXT) return "";
    return hw_str(c->vm->m, c->values[i]);
}

size_t hw_ext_text(const hw_ext_call *c, char *buf, size_t cap)
{
    const hw_module *m = c->vm->m;
    const hw_ext_info *e = &m->exts[c->ext];
    for (uint32_t i = 0; i < e->param_count && i < c->count; i++) {
        if (m->ext_params[e->param_first + i].type == HW_XP_TEXT && c->values[i] != HW_NONE && c->values[i] < m->line_count) {
            return hw_vm_line_markup(c->vm, c->values[i], buf, cap);
        }
    }
    if (cap > 0) buf[0] = 0;
    return 0;
}
