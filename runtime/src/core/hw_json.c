#include "hw_json.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static const char *ws(const char *p)
{
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    return p;
}

static size_t utf8_encode(uint32_t cp, char out[4])
{
    if (cp < 0x80) {
        out[0] = (char)cp;
        return 1;
    }
    if (cp < 0x800) {
        out[0] = (char)(0xc0 | (cp >> 6));
        out[1] = (char)(0x80 | (cp & 0x3f));
        return 2;
    }
    if (cp < 0x10000) {
        out[0] = (char)(0xe0 | (cp >> 12));
        out[1] = (char)(0x80 | ((cp >> 6) & 0x3f));
        out[2] = (char)(0x80 | (cp & 0x3f));
        return 3;
    }
    out[0] = (char)(0xf0 | (cp >> 18));
    out[1] = (char)(0x80 | ((cp >> 12) & 0x3f));
    out[2] = (char)(0x80 | ((cp >> 6) & 0x3f));
    out[3] = (char)(0x80 | (cp & 0x3f));
    return 4;
}

static int hex(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

/* Parses the string starting at p (just after the quote). Writes up to cap-1 bytes when out != NULL. Returns the
 * position after the closing quote, or NULL when the string is malformed. *fits says whether it fit. */
static const char *string(const char *p, char *out, size_t cap, bool *fits)
{
    size_t n = 0;
    *fits = true;
    for (;;) {
        unsigned char c = (unsigned char)*p++;
        uint32_t cp;
        if (c == 0 || c < 0x20) return NULL;
        if (c == '"') break;
        if (c != '\\') {
            if (out && n + 1 < cap) out[n] = (char)c;
            else *fits = false;
            n++;
            continue;
        }
        switch (*p++) {
        case '"': cp = '"'; break;
        case '\\': cp = '\\'; break;
        case '/': cp = '/'; break;
        case 'b': cp = 8; break;
        case 'f': cp = 12; break;
        case 'n': cp = 10; break;
        case 'r': cp = 13; break;
        case 't': cp = 9; break;
        case 'u': {
            cp = 0;
            for (int i = 0; i < 4; i++) {
                int h = hex(*p++);
                if (h < 0) return NULL;
                cp = cp * 16 + (uint32_t)h;
            }
            if (cp >= 0xd800 && cp < 0xdc00 && p[0] == '\\' && p[1] == 'u') {
                uint32_t lo = 0;
                for (int i = 2; i < 6; i++) {
                    int h = hex(p[i]);
                    if (h < 0) return NULL;
                    lo = lo * 16 + (uint32_t)h;
                }
                if (lo >= 0xdc00 && lo < 0xe000) {
                    cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                    p += 6;
                }
            }
            if (cp >= 0xd800 && cp < 0xe000) cp = 0xfffd; /* a lone surrogate */
            break;
        }
        default: return NULL;
        }
        char enc[4];
        size_t len = utf8_encode(cp, enc);
        for (size_t i = 0; i < len; i++, n++) {
            if (out && n + 1 < cap) out[n] = enc[i];
            else *fits = false;
        }
    }
    if (out && cap > 0) out[n < cap ? n : cap - 1] = 0;
    return p;
}

/* Skips one value (string, number, literal, or a nested object/array). */
static const char *skip_value(const char *p)
{
    bool fits;
    p = ws(p);
    if (*p == '"') return string(p + 1, NULL, 0, &fits);
    if (*p == '{' || *p == '[') {
        int depth = 0;
        while (*p) {
            if (*p == '"') {
                p = string(p + 1, NULL, 0, &fits);
                if (!p) return NULL;
                continue;
            }
            if (*p == '{' || *p == '[') depth++;
            if (*p == '}' || *p == ']') {
                if (--depth == 0) return p + 1;
            }
            p++;
        }
        return NULL;
    }
    const char *start = p;
    while (*p && *p != ',' && *p != '}' && *p != ' ' && *p != '\t' && *p != '\r' && *p != '\n') p++;
    return p > start ? p : NULL;
}

/* The position of the value for a top-level key, or NULL. */
static const char *find(const char *json, const char *key)
{
    if (!json || !key) return NULL;
    const char *p = ws(json);
    if (*p++ != '{') return NULL;
    char name[64];
    for (;;) {
        p = ws(p);
        if (*p == '}') return NULL;
        if (*p++ != '"') return NULL;
        bool fits;
        p = string(p, name, sizeof name, &fits);
        if (!p) return NULL;
        p = ws(p);
        if (*p++ != ':') return NULL;
        p = ws(p);
        if (fits && strcmp(name, key) == 0) return p;
        p = skip_value(p);
        if (!p) return NULL;
        p = ws(p);
        if (*p == ',') p++;
        else return NULL;
    }
}

bool hw_json_str(const char *json, const char *key, char *out, size_t cap)
{
    if (cap == 0) return false;
    out[0] = 0;
    const char *p = find(json, key);
    if (!p || *p != '"') return false;
    bool fits;
    if (!string(p + 1, out, cap, &fits) || !fits) {
        out[0] = 0;
        return false;
    }
    return true;
}

bool hw_json_num(const char *json, const char *key, double *out)
{
    const char *p = find(json, key);
    if (!p || !(*p == '-' || (*p >= '0' && *p <= '9'))) return false;
    char *end;
    double v = strtod(p, &end);
    if (end == p) return false;
    *out = v;
    return true;
}

void hw_json_put_str(hw_buf *b, const char *s)
{
    hw_buf_put(b, "\"", 1);
    for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; p++) {
        switch (*p) {
        case '"': hw_buf_put(b, "\\\"", 2); break;
        case '\\': hw_buf_put(b, "\\\\", 2); break;
        case '\n': hw_buf_put(b, "\\n", 2); break;
        case '\r': hw_buf_put(b, "\\r", 2); break;
        case '\t': hw_buf_put(b, "\\t", 2); break;
        default:
            if (*p < 0x20) hw_buf_printf(b, "\\u%04x", *p);
            else hw_buf_put(b, (const char *)p, 1);
        }
    }
    hw_buf_put(b, "\"", 1);
}
