# Himawari debug protocol (Studio ↔ runtime)

> **Version:** 1 · How Himawari Studio drives the runtime docked in its preview pane (plan §4.1, §11.3; rfcs/0006). Implemented by `runtime/src/app/hw_link.c` and `hw_game.c` (`--link`), and by `packages/studio/src/main/preview.ts`.

## Starting

```
himawari.exe --project <dir> --link [--parent-window <HWND>] [--start] [--warp <scene | file:line | #lineid>] [--lang <tag>]
```

- `--link` turns the pipe on: **commands** arrive on stdin and **events** leave on stdout, one JSON object per line (UTF-8, `\n`). Log output goes to stderr, never stdout. Readers should ignore stdout lines that don't start with `{`.
- `--parent-window <HWND>` (Windows; decimal or `0x` hex) docks the game window as a borderless child of that window. It stays hidden until the first `bounds` command. If docking fails, the game opens in its own window and `ready` reports `"docked": false`.
- **When stdin closes, the runtime quits.** A preview never outlives the program that started it.
- An unattended run (`--frames`) never writes the player's data; a linked run is a development run and may.

## Commands (stdin)

Every command is an object with a string `cmd`. Unknown commands and malformed lines are logged and ignored.

| `cmd` | Fields | Effect |
|---|---|---|
| `bounds` | `x`, `y`, `w`, `h` (numbers, device pixels in the parent's client area) | Place the docked window. `w` or `h` ≤ 0 hides it (Studio does this while a dialog covers the pane). |
| `reload` | | Reload `build/game.hwb` and carry the position over through a save, which remaps by line ID (plan §8.9). Answers with `reloaded`. |
| `warp` | `to` (string) | Play from a scene, `file:line`, or `#lineid`, with a state reconstructed along a real path. Answers with `warp`. |
| `restart` | | Start the story from the entry scene. |
| `next_menu` | | Play on without waiting until the next menu or the end. Sound effects and voices are skipped on the way; music and ambience follow the display state. |
| `advance` | | What a click does: finish the text, or go to the next line. |
| `lang` | `lang` (string) | Show the story in another language for this run only (the player's own choice isn't changed). |
| `quit` | | Quit. |

## Events (stdout)

Every event is an object with a string `ev`.

| `ev` | Fields | When |
|---|---|---|
| `ready` | `protocol` (1), `docked` (bool), `gpu` (bool) | Once, after start-up. |
| `state` | `screen` (`title`, `play`, `menu`, `slots`, `history`, `confirm`, `end`, `error`, `config`, `controls`, `accessibility`, `extras`, `gallery`, `cg`, `music`; readers show unknown names generically), `line` (6-character line ID or `null`), `waiting` (bool: the player is expected to click or choose), `choice` (bool: a menu is shown), `error` (string, only when `screen` is `error`) | Whenever any of these changes. Studio highlights the line (green while playing, yellow while waiting) and follows it. |
| `reloaded` | `result` (`exact`, `remapped`, `fallback`, `restarted`, `title`, `failed`), `message` (string) | After each `reload`. `fallback`: the current line was edited away and play resumed a little earlier. |
| `warp` | `ok` (bool), `to` (string), `message` (when not ok) | After each `warp`. |

## Versioning

`ready.protocol` is the protocol version. New commands and events, and new fields on existing ones, keep version 1 (readers ignore what they don't know); a change in meaning bumps it.
