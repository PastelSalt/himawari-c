/*
 * Himawari-C: headless play (plan §8.12, §16.2). Part of core/: no SDL, no I/O.
 *
 * - Transcripts: play with a fixed list of choices and describe every event
 *   as text. The conformance suite compares them with expected.transcript.
 * - Playtests: explore every menu choice (depth-first, merging states that
 *   were already explored) and report endings, errors, and line coverage.
 */
#ifndef HW_PLAY_H
#define HW_PLAY_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "hw_hwb.h"
#include "hw_vm.h"

/* A growable string. */
typedef struct hw_buf {
    char *data;
    size_t len, cap;
    bool oom;
} hw_buf;

void hw_buf_put(hw_buf *b, const char *s, size_t n);
void hw_buf_printf(hw_buf *b, const char *fmt, ...)
#if defined(__GNUC__)
    __attribute__((format(gnu_printf, 2, 3)))
#endif
    ;
void hw_buf_free(hw_buf *b);

typedef struct hw_transcript_options {
    const uint32_t *choices; /* option index for each menu, in order */
    uint32_t choice_count;
    const char *language;    /* NULL or the source language for source text */
    uint64_t seed;
    uint32_t max_events;     /* 0 = 10000 */
} hw_transcript_options;

/* Plays from the entry scene and appends the transcript to `out`. Returns false when out of memory. */
bool hw_transcript(const hw_module *m, const hw_transcript_options *o, hw_buf *out);

/* Describes one event as a transcript line (no newline). */
void hw_describe_event(const hw_vm *vm, const hw_event *ev, hw_buf *out);

typedef struct hw_playtest_options {
    uint64_t seed;
    uint32_t max_steps; /* events across all paths; 0 = 50000 */
    const char *language;
} hw_playtest_options;

typedef struct hw_ending {
    uint32_t pc;   /* the END (or top-level RET) instruction */
    uint32_t hits; /* paths that ended here */
} hw_ending;

typedef struct hw_playtest_error {
    char message[200];
    uint32_t hits;
} hw_playtest_error;

typedef struct hw_playtest_report {
    uint32_t paths;         /* paths that finished (an ending, an error, or the step limit) */
    uint32_t steps;         /* events played */
    bool step_limit;        /* exploration stopped early */
    uint32_t menus;         /* distinct menu states explored */
    uint32_t ending_count;  /* endings reached (END, or a top-level RET) */
    uint32_t ending_total;  /* reached endings plus reachable END instructions never reached */
    hw_ending *endings;     /* ending_count reached endings, by pc */
    uint32_t unreached_count;
    uint32_t *unreached_endings; /* END instructions the code can reach that no path reached */
    uint32_t error_count;
    hw_playtest_error *errors;
    uint32_t lines_seen, lines_total;     /* dialogue and narration */
    uint32_t options_chosen, options_total;
    uint8_t *line_seen;     /* per LINE entry: 1 if shown or chosen on some path */
    uint32_t div_by_zero;
} hw_playtest_report;

/* Explores every path from the entry scene. Returns false when out of memory. */
bool hw_playtest(const hw_module *m, const hw_playtest_options *o, hw_playtest_report *r);
void hw_playtest_report_free(hw_playtest_report *r);

/*
 * Warp (plan §8.11): the SAY or MENU a place names: a scene ("ch1_hub", its
 * first line), "file:line" (the first line at or after it; "ch1.hws:40"
 * matches "script/ch1.hws"), or a line ID ("#k3f9a1"; for a menu option, its
 * menu). HW_NONE when nothing matches.
 */
uint32_t hw_warp_target(const hw_module *m, const char *where);
/*
 * Explores the story (like a playtest) until it reaches `target`, then writes
 * the snapshot taken right before it: a real state along one path to there,
 * with the variables that path set. Returns false when no path reaches it.
 */
bool hw_warp(const hw_module *m, uint32_t target, uint64_t seed, uint32_t max_steps, void *snapshot);
/* The report as JSON (the --out file of a headless playtest). */
void hw_playtest_report_json(const hw_module *m, const hw_playtest_report *r, hw_buf *out);

#endif
