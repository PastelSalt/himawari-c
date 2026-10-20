# Security Policy

Thank you for helping keep Himawari, and the games and writers who rely on it, safe.

## Supported versions
| Version | Supported |
|---|---|
| Latest 1.x release (once v1.0 ships) | ✅ Security fixes |
| Older 1.x releases | Fixed in the latest 1.x; please update |
| Before v1.0 (the 0.x line, and `main`) | Best effort: fixes land on `main` and in the next release |

Himawari is Windows-only (64-bit Windows 10/11) for games, Studio, and tooling.

## Reporting a vulnerability
**Please don't open a public issue for a security problem.**

Report it privately using GitHub's security advisories:

👉 **[Report a vulnerability](https://github.com/PastelSalt/himawari-c/security/advisories/new)**

(That's the "Security" tab of the repository → "Report a vulnerability".) Include:
- What you found and which part of Himawari it affects (Studio, the runtime, `hwc`, or `himawari-mcp`), with the version.
- Steps to reproduce, or a small file that triggers it (a project folder, a `.hwp`, a save file). A proof of concept helps a lot.
- What you think an attacker could do with it.

What to expect:
- We aim to **acknowledge your report within 7 days** and to tell you what we plan to do within 30 days. Himawari is a small project, so these are goals, not guarantees. We'll keep you updated either way.
- We'll fix it, publish an advisory, and release a new version. We're happy to credit you in the advisory unless you'd rather stay anonymous.
- Please give us a reasonable chance to fix the problem before you share details publicly.

## What's in scope
- **Himawari Studio** (Electron): escaping the renderer sandbox, reaching Node or the file system from project content, bypassing the content security policy, leaking the stored API key, or running code just by opening a project.
- **The runtime** (`himawari.exe`): memory-safety bugs or crashes from a crafted `.hwb`, `.hwp` or patch pack, save file, settings file, theme, image, or font; anything that makes a game read or write outside its own folders.
- **`himawari-mcp`** and the shared tools: leaving the project folder, running commands, writing without validation, or accepting connections it shouldn't (see below).
- **`hwc`**, the compiler and validator: path traversal or code execution from crafted project files.

## What's out of scope
- Problems in **third-party libraries** themselves. Please report those upstream (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for what we use), and tell us too if it affects Himawari so we can update.
- **C extension statements** (`HW_EXTENSIONS`): they are native code the game's own developer chooses to compile in, so they run with the game's full permissions by design.
- A **game's own content or behavior**: a game is a program its developer made. Only run games from people you trust, as with any program.
- **The quality of AI output**, or what an AI service does with text it receives. See [PRIVACY.md](PRIVACY.md). (Ways to trick the AI into escaping the sandbox *are* in scope.)
- Attacks that need the attacker to already control your Windows account or computer.

## How Himawari is built to be safe
These are design rules, so reports that break them are especially welcome.

**The runtime never parses source text.** Game scripts (`.hws`) are compiled by Core into bytecode (`.hwb`) and packed into `.hwp` files. The runtime only loads those compiled formats. Its loaders validate everything, treat content errors as ordinary errors (they never `abort()`), and are fuzzed with libFuzzer and sanitizers (ASan/UBSan). The bytecode loader and the save loader have each survived millions of fuzzed inputs.

**The MCP server is sandboxed.** `himawari-mcp` lets an AI app work on a project:
- Every path is relative to the project folder and may not leave it. Absolute paths, drive letters, null bytes, and `..` escapes are refused.
- There is **no shell** and no way to run commands. Playtests run only the bundled `himawari.exe` with fixed arguments.
- Packaging a game folder is **off** unless you start the server with `--allow-build`.
- Every write is validated before touching disk, anchored on line IDs, and saved atomically (to a temporary file, then renamed). Wide changes ask for confirmation.
- Everything the AI writes is recorded in `.himawari/provenance.json`.
- The default transport is stdio, on your own machine. Studio also hosts it on `127.0.0.1` only, with a random bearer token and Host-header checks against DNS rebinding.

**Studio follows the Electron security checklist.** Context isolation and the sandbox are on, Node integration is off, a strict content security policy applies, there's a typed bridge between the windows, and the Electron fuses are set (no running as plain Node, the app loads only from its integrity-checked archive). An API key is stored encrypted by Windows (`safeStorage`) and used only in the main process, never in the page.

## Our own housekeeping
- Fuzzing runs for the bytecode loader and the save loader.
- Dependencies are pinned by version, and runtime libraries by version and SHA-256 hash.
- Releases are built by CI, and the Studio installer will be code-signed.

Thanks for reading, and for reporting. 🌻
