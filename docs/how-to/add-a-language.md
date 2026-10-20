# Add a language

Your game can be played in more than one language, and players switch in the game's own menu. Studio starts with one language and keeps translation tools out of the way until you add a second.

## Add the language
1. Open **Localization**.
2. Choose **Add a language…** and pick one.

Studio creates a table with one row per line of your story, with your own language on one side and the new language on the other. New lines are marked **needs review** until someone checks them.

## Translate
You have three choices. Mix them however you like.

- **Type it yourself.** Click a row and write the translation. Studio warns you if you drop a name or a variable that the original line had (for example `[name]`), so placeholders don't go missing.
- **Send it to a translator.** Choose **Export CSV** or **Export XLIFF**. Translators can fill it in with a spreadsheet or a translation tool. When they send it back, import it and the lines land in the right places.
- **Ask AI for a first draft (optional).** Choose **Translate with AI**. It uses your own Anthropic API key (see [Use AI help](use-ai-help.md)) and fills the table with drafts marked **needs review**. A person should always read them before release. Nothing is sent unless you press the button.

If you keep a **glossary** (names and terms that must always be translated the same way), the AI follows it, and Studio warns when a human translation doesn't.

## Check it
In the **Preview**, use **Play in this language** to play the game in the new language. Look especially for:
- Long lines that might not fit. Studio's **UI Designer** can check text overflow in every language.
- Characters your chosen font can't draw. Studio warns you about missing glyphs.

Games ship with every language inside them. Players pick one in the game's config menu.

## Good to know
- The player's system fonts cover Japanese and Chinese on Windows, so most games don't need to bring a font.
- Your own menus and button names can be translated too, in the theme's UI strings.
- You can add another language at any time, even after you've started releasing the game.

## Next
- [Export a game](export-a-game.md)
- [AI is optional, and always will be](../explanation/ai-is-optional.md)
