/* Himawari-C: the windowed game (plan §8.5–§8.11). */
#ifndef HW_GAME_H
#define HW_GAME_H

/* Opens the window and plays `game`. `project` is the project folder in dev mode, or NULL. */
int hw_game_main(int argc, char **argv, const char *game, const char *project);

#endif
