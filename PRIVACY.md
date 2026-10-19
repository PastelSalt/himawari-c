# Privacy

**Short version: Himawari sends nothing anywhere.** No telemetry, no analytics, no accounts, no "phone home". Your stories, your art, and your players' saves stay on your computer.

The one exception is the **optional AI help**, and it only happens when you ask for it. This page explains exactly what that means.

## What stays on your computer
| What | Where it goes |
|---|---|
| Your project (scenes, characters, art, sound) | Your project folder, and nowhere else |
| Studio's settings and recent projects | Studio's own folder on your PC |
| A player's saves, settings, and unlocks | The player's own PC, in a folder named after the game under `%APPDATA%\Himawari\` |
| **Crash reports** | A `.dmp` file and a log, saved on disk in that same folder, when a game crashes. They are **never sent automatically**. The game tells the player where the file is, and the player decides whether to share it with the developer. |
| Which AI wrote what | `.himawari/provenance.json` in your project, for you |

Himawari has no servers. Studio, `hwc`, `himawari-mcp`, and every game made with Himawari run entirely on the computer they are on. **A finished game contains no AI and makes no network calls.** It runs fine with the internet off.

Nothing runs in the background. Himawari starts nothing when Windows starts, has no hidden service, and doesn't wake up to check on you.

## Optional AI help: what is sent, and to whom
AI is a helper you can switch on, never a requirement. If you never open the assistant and never connect a Claude app, **no text ever leaves your computer.**

There are two ways to use it. You can use either, both, or neither.

### 1. Studio's built-in assistant ("Mode B")
- You add **your own Anthropic API key** in Settings. It's stored encrypted by Windows, for your Windows account only, and is used only by Studio's main process, never by the page. You can remove it at any time.
- When you send a message, or use **Translate with AI**, Studio sends the request **directly from your PC to Anthropic**. There's no Himawari server in between.
- What is sent:
  - **The request text** you typed (or the slash recipe you chose).
  - **Selected project text**: the text you selected or `@mention`, and the scenes, lines, character notes, glossary entries, and review notes the assistant reads through its tools to do the job. When translating, that's the lines being translated plus your glossary and character notes.
  - The earlier messages of the same chat, so it has context.
- What is **not** sent: files the assistant didn't read, your art and audio, other projects, saves, or anything about you or your PC.
- The assistant starts closed, and never calls the AI on its own. The cost meter in the panel shows what each request used. API usage is billed by Anthropic to your key.
- Anthropic's handling of what it receives is described in [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) and its API terms. Himawari doesn't control it.

### 2. Your own Claude app ("Mode A")
- **Claude Code** or the **Claude desktop app** connect to your project through `himawari-mcp`, a small program that runs **on your PC**. It opens no internet connection of its own.
- The Claude app decides what is sent to Anthropic, under **your own Claude account and its settings**: your messages and whatever the AI reads from your project, such as scenes and character notes. That is the same as any other use of that app. Himawari's tools only answer when the AI asks.
- With Studio open, the AI's changes appear as proposals for you to accept or reject. Studio also lets the app connect only from your own computer (`127.0.0.1`), with a random password for each session.

## What Himawari never does
- It never sends your writing or your art anywhere unless you ask the AI to read it, as described above.
- It never generates images, music, voice, or video with AI.
- It never uploads crash reports, usage statistics, or lists of your files.
- It never reads your API key from anywhere except the Settings you filled in.

## Other things to know
- **Links:** Studio opens a web link in your normal browser only when you click it.
- **Updates:** Studio does not check for updates today. If an update check is added, it will be described here before it ships, and it will only ask for the latest version number.
- **Websites:** this page is about the software. The project's website and repository are hosted by GitHub, which has [its own privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- **Games you make:** if you add your own online features through a C extension, you're responsible for telling your players. Himawari itself adds none.

## Questions or changes
If anything here is unclear, or you think Himawari does something this page doesn't say, please tell us (a normal issue is fine, or [SECURITY.md](SECURITY.md) if it's serious). We'll fix the code or this page. Changes to this page are made in the open, in the repository's history.
