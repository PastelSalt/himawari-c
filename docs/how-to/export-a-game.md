# Export a game

Turn your project into a folder (or zip) that anyone with Windows 10 or 11 can play with a double-click. They don't need to install anything, and the game needs no internet.

## In Studio
1. Open **Build and export**.
2. Under **Windows game (x64)**, choose **Folder** or **Zip file**.
3. Choose **Export the game**.
4. When it says **Done**, choose **Show in Explorer**.

If Studio says **Fix 1 error first (see Problems)**, open **Problems**, fix what it lists (each one comes with a plain-words fix), and export again.

## What you get
A folder named after your game (under `build/windows/` in your project) with:
- **The game's `.exe`**: double-click it to play. It's a small native program with no extra files to install.
- **`data.hwp`**: your story, characters, pictures, and sound, packed together.
- **`CREDITS.txt`**: the notices for the libraries inside the game. Keep it with the game. It includes the credit that FreeType's license requires.

Zip the folder and share it anywhere: your own site, itch.io, a message to a friend.

## Before you share
- **Play it once from the exported folder**, not from Studio, so you see what players see.
- **Playtest every path** in the Story graph first, so no ending is unreachable.
- Windows may show a "Windows protected your PC" (SmartScreen) message for games it hasn't seen before. That's normal for any new program. Choose **More info**, then **Run anyway**. Signing your game's `.exe` removes the warning, but that's up to you and isn't required.
- **Your own art, music, and fonts:** you're responsible for their licenses. The templates and examples are CC0 and free to use.
- **If AI wrote some of your text**, stores such as itch.io and Steam ask you to say so. See [Use AI help](use-ai-help.md) for the one-line report.

## Updating a game later
Players' saves survive small updates. Export a **patch** (a small `patch*.hwp` file) instead of the whole game, and players drop it beside the `.exe`. From the command line, that's `hwc build --release --patch`.

## From the command line
If you prefer text, from your project folder:
```bash
hwc build --release
```
It writes the same folder to `build/windows/<Game>/`. See the [reference](../reference/index.md) for the other `hwc` commands.

## Next
- [Credit Himawari](credit-himawari.md), if you'd like to (you don't have to).
- [Add a language](add-a-language.md) before you export, if you want more than one.
