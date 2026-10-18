/* The debug pipe's JSON reader (spec/debug-protocol.md): lookups, escapes, and malformed input. */
#include <stdio.h>
#include <string.h>

#include "hw_json.h"

static int failures = 0;
#define CHECK(c)                                                                    \
    do {                                                                            \
        if (!(c)) {                                                                 \
            fprintf(stderr, "%s:%d: CHECK(%s) failed\n", __FILE__, __LINE__, #c); \
            failures++;                                                             \
        }                                                                           \
    } while (0)

int main(void)
{
    char s[64];
    double n = 0;

    const char *cmd = "{\"cmd\":\"bounds\",\"x\":12,\"y\":-3.5,\"w\":1280,\"h\":720}";
    CHECK(hw_json_str(cmd, "cmd", s, sizeof s) && strcmp(s, "bounds") == 0);
    CHECK(hw_json_num(cmd, "x", &n) && n == 12);
    CHECK(hw_json_num(cmd, "y", &n) && n == -3.5);
    CHECK(hw_json_num(cmd, "h", &n) && n == 720);
    CHECK(!hw_json_num(cmd, "z", &n));
    CHECK(!hw_json_str(cmd, "x", s, sizeof s)); /* a number, not a string */
    CHECK(!hw_json_num(cmd, "cmd", &n));

    /* Whitespace, nested values to skip, and escapes. */
    const char *w = " { \"skip\" : {\"a\":[1,\"}\",{\"b\":2}]} , \"to\" : \"#k3f9a1\\n\\\"q\\\" \\u3072\\ud83c\\udf3b\" } ";
    CHECK(hw_json_str(w, "to", s, sizeof s));
    CHECK(strcmp(s, "#k3f9a1\n\"q\" \xe3\x81\xb2\xf0\x9f\x8c\xbb") == 0);

    /* Too long for the buffer: refused, not truncated. */
    char tiny[4];
    CHECK(!hw_json_str("{\"cmd\":\"reload\"}", "cmd", tiny, sizeof tiny) && tiny[0] == 0);

    /* Malformed input fails cleanly. */
    const char *bad[] = { "", "{", "[]", "{\"cmd\"}", "{\"cmd\":\"x", "{\"cmd\":\"\\q\"}", "{\"a\":1 \"cmd\":\"x\"}",
                          "{\"a\":\"\\u12\"}", "{\"cmd\":\"a\x01\"}", "null", NULL };
    for (int i = 0; bad[i]; i++) CHECK(!hw_json_str(bad[i], "cmd", s, sizeof s));
    CHECK(!hw_json_str(NULL, "cmd", s, sizeof s));

    /* Writing escapes what JSON needs. */
    hw_buf b = { 0 };
    hw_json_put_str(&b, "a\"b\\c\nd\x01");
    CHECK(b.data && strcmp(b.data, "\"a\\\"b\\\\c\\nd\\u0001\"") == 0);
    hw_buf_free(&b);

    if (failures == 0) printf("json: all checks passed\n");
    return failures == 0 ? 0 : 1;
}
