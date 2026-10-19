# AI is optional, and always will be

Himawari has AI helpers. It's also designed so you never have to use them, and so they never get in your way. This page explains where we drew the lines, and why.

## What AI is here
AI is a **development assistant**. It can help you while you make a game:
- read your story and answer questions about it,
- write or rewrite scenes when you ask,
- draft translations,
- spot continuity slips and leave notes,
- and playtest every path to find dead ends.

It works on text and checks. Nothing else.

## What AI will never be
- **It never makes pictures, music, sound, voices, or video.** If a scene needs art you don't have yet, Himawari draws a labeled placeholder, by a simple program, until you add your own. This is a promise, not a roadmap item.
- **It's not in your game.** A finished game contains no AI, makes no network calls, and works with the internet off.
- **It doesn't act on its own.** The assistant starts closed. Nothing runs in the background, and nothing is sent anywhere until you ask.
- **It doesn't overwrite your work.** When Studio is open, the AI's changes arrive as *proposals* with a clear before and after. You accept or reject each one, and anything you accept can be undone.

## Why it works this way
- **You're the author.** The story, the voice, and the decisions are yours. A good tool helps without taking the pen.
- **Everyone can opt out.** Many writers and players care about this, and they should be able to use Himawari with a clear conscience. Every feature has a non-AI way to do it.
- **Safe by design.** AI edits are checked before they touch your files, tied to each line's ID (not to fragile line numbers), and refused if they'd break your story.
- **Honest records.** Anything an AI writes is noted in `.himawari/provenance.json`, and `hwc report ai-content` makes a short summary for store forms.
- **Your keys, your costs.** AI help uses your own Claude app or your own API key. Himawari runs no servers and takes no cut.

## What gets sent, and when
Only when you ask the AI for help, and only the request plus the parts of your project it needs to answer. The details are on the [privacy page](../../PRIVACY.md).

## Where to go from here
- [Use AI help](../how-to/use-ai-help.md) if you'd like to try it.
- [Governance](../../GOVERNANCE.md) lists what we've decided not to build, including AI-generated media and live AI inside games.
