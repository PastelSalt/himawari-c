# Use AI help (optional)

You never need AI to make a game with Himawari. If you'd like a writing partner anyway, there are two ways to get one. Pick the one that fits, or use neither.

**What AI can do:** read your story, write and edit scenes, translate, check for continuity slips, and playtest every path.
**What it can't do:** make pictures, music, voices, or video. Ever. See [AI is optional](../explanation/ai-is-optional.md).

## Way 1: your own Claude app
Use **Claude Code** or the **Claude desktop app** that you may already have. They connect to your project through a small program that comes with Himawari, and use your own Claude plan.

In Studio, open **Settings → Use your Claude app**. It shows the exact setup for your project. When the AI makes changes, they show up in Studio's **AI Proposals** panel, and you accept or reject each one.

The full step-by-step guide, for both apps, is here: **[Using Claude with a Himawari project](../ai-setup.md)**.

## Way 2: Studio's built-in assistant
1. Open **AI assistant**. It starts closed and stays quiet until you open it.
2. Open **Settings**, find **Built-in assistant**, and add your own Anthropic API key. Studio stores it encrypted by Windows, for your account only.
3. Ask for help in plain words, like "Rewrite this line so it sounds warmer", or type `/` to see ready-made recipes (write a scene, check continuity, plan branches, proofread, and more).

An API key is billed per use by Anthropic and is separate from a Claude subscription. A small meter in the panel shows what each request used. If you'd rather use your subscription, use Way 1.

## What gets sent
Only when you ask the AI for something, Himawari sends your request and the parts of your project it needs to answer. Nothing runs in the background, and nothing is sent otherwise. The details are on the [privacy page](../../PRIVACY.md).

## Keeping track of what AI wrote
Everything an AI writes is recorded in `.himawari/provenance.json` in your project. If a store asks whether your game used AI, run this from your project folder for a short report:
```bash
hwc report ai-content
```
If no AI touched your text, there's nothing to report.

## Next
- [Make your first game](../tutorials/first-game.md)
- [Add a language](add-a-language.md): AI can draft translations too.
