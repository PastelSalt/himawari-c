# Using Claude with a Himawari project (Mode A)

Himawari works with the AI app you already use: **Claude Code** or the **Claude desktop app** connect to your project through **himawari-mcp**, an MCP server that ships with Himawari. You use your own Claude plan; Himawari runs no servers and sends nothing anywhere. (Studio's built-in assistant panel, Mode B, comes with Studio in Phase 4.)

## What the AI can and can't do
- **Can:** read your scenes and characters, write and edit scenes (edits are anchored on each line's ID, checked before anything is saved, and refused if they'd break the story), rename things safely, declare variables, translate lines (they land as "needs review"), play every path of your story headlessly to find dead ends and unreachable endings, and take a screenshot of any line to check how it looks.
- **Can't:** create images, music, sound effects, voices, or video. Ever. Missing art shows as labeled placeholders until you add your own.
- **You stay in control:** wide changes (like a rename across many files) ask you first, and building a game folder is off unless you allow it. Everything the AI writes is recorded in `.himawari/provenance.json`; `hwc report ai-content` summarizes it for store disclosure.

## Set up
You need a Himawari checkout with the tools built (`corepack pnpm install`, then `corepack pnpm build`) and, for playtests and screenshots, the runtime (`runtime/`, `cmake --preset win64-release`, `cmake --build --preset win64-release`).

In your project folder, run:
```bash
hwc ai setup
```
It prints the exact command and config for this project and this computer.

### Claude Code
Either run the `claude mcp add himawari -- …` line that `hwc ai setup` printed, or let it write the project's `.mcp.json`:
```bash
hwc ai setup --write
```
Start `claude` in the project folder and approve the `himawari` server when asked. Commit `.mcp.json` only if everyone on your team keeps Himawari in the same place; the paths in it are absolute.

### Claude desktop app
Open **Settings → Developer → Edit Config**. In `claude_desktop_config.json`, add the `himawari-…` entry that `hwc ai setup` printed under `"mcpServers"` (keep any servers you already have), save, and restart the app. Use one entry per project.

### Options
Add these to the server's arguments if you need them:
- `--allow-build`: lets the AI package a playable `build/windows/<Game>/` folder.
- `--runtime C:\path\to\himawari.exe`: if the runtime isn't found automatically (or set `HIMAWARI_RUNTIME`).

## Working with it
- Tell the AI about your story in **`AGENTS.md`** at the project root (every template has one): tone, audience, style rules, and files it must not touch. It reads that file and each character's bible (including the "Must never" rules) before writing.
- Good first requests: *"Read the project and summarize the story so far"*, *"Write a scene where Hana and Mio argue about the festival, with a choice that leads to two endings"*, *"Playtest every path and fix any dead ends"*, *"Translate chapter 1 into Japanese"*.
- The server also offers ready-made prompts (in clients that show them): **write_scene**, **continuity_check**, **branch_planner**, **translate_scene**, **sprite_direction**.
- Changes land in your files right away. Use git (or Studio's history, later) to review and undo.

## Reference
- Tools, resources, and prompts: DETAILED_PLAN.md §10.3–10.4.
- What the AI is told: [`spec/agent-guide.md`](../spec/agent-guide.md) (Himawari's rules) and [`spec/llm-reference.md`](../spec/llm-reference.md) (the script language for models).
