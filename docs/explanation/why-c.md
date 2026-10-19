# Why games run on any Windows 10/11 PC

A finished Himawari game is **one small program**. You double-click it and it plays. There's nothing to install, no admin password, and no internet needed. Here's why that works.

## The runtime is written in C
Visual novels don't need much, so the part that plays them shouldn't ask for much. Himawari's player, the *runtime*, is written in C: a small, direct language that compiles to a native Windows program. There's no heavy framework running underneath it and nothing for the player to download first.

## Everything is inside the `.exe`
The runtime is built **statically**: the pieces it uses (windowing and sound from SDL, text drawing from FreeType, and so on) are folded into the one `.exe` file, which is about 2.6 MB. No DLLs go missing, and there's no "please install the Visual C++ runtime" popup. It also works from folders with Japanese or Chinese characters in their names.

## Your writing is compiled ahead of time
You write scenes as friendly text. Before the game is exported, Himawari's compiler turns that text into compact **bytecode**, and the runtime never reads your source text at all. That means:
- The game starts fast and uses little memory.
- The player program stays small and simple, with less that can go wrong.
- A broken script is caught when you build, with a plain-words message, not in front of a player.

## Small on purpose
We keep an eye on a few numbers and treat them as promises. Measured on the developer's PC:

| What | Result |
|---|---|
| The game program | about 2.6 MB |
| Time to the first picture | about 135 ms |
| Work per frame (95th percentile) | about 0.2 ms |
| Memory at its peak | 106 MB or less |

The graphics are gentle too. The runtime prefers the modern GPU path, checks that it really works when the game starts, and falls back to a simpler one if it doesn't, so the same game runs on older and weaker hardware.

## Windows 10 and 11, 64-bit
Himawari targets 64-bit Windows 10 and 11, which covers nearly every PC in use today. Arm laptops run it through Windows' own built-in emulation. We're testing on a range of real and virtual machines, including low-end laptops, and we'll fix what we find.

## What this means for you
- Your players don't need a powerful PC.
- Sharing a game is as simple as sharing a zip.
- Studio and the game use the same runtime, so what you see in the preview is what players get.

Curious about the details? The decision records are in the [RFCs](../../rfcs/README.md), starting with [the static build](../../rfcs/0001-static-sdl3-build.md).

## Next
- [Export a game](../how-to/export-a-game.md)
- [AI is optional, and always will be](ai-is-optional.md)
