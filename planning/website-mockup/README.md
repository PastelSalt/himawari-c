# Website mockup

A one-page mockup of Himawari's home page in the "middle path" style discussed for [WEBSITE.md](../WEBSITE.md):

- nanahira.jp's calm layout: thin double-line pill titles on rules, a speech-bubble news bar, and plenty of space;
- sunflower colors (yellow, white, gray, and black);
- thick outlines only on things you click;
- one moving thing per screen.

It's a sketch for judging the look, not the site itself. The real site is Astro in its own repository (WEBSITE.md §9).

| File | What it is |
|---|---|
| `index.html` | The mockup. Open it in a browser; it uses the repo's own logos and screenshots by relative path |
| `mockup-desktop.png` | The full page at 1440 px wide |
| `mockup-phone.png` | The full page at 390 px wide |
| `render.mjs` | Renders the two images with the Electron already in `packages/studio` |

**What moves**, with Motion on:
- the hero types a line into the editor, and the game's textbox follows, then changes the expression;
- section titles pop in letter by letter, and cards rise as they appear;
- flowers drift and bob, and fall behind the coming-soon band;
- the download button bursts into yellow, white, and black confetti.

The Motion button switches everything off, and it starts off when the system asks for reduced motion. Add `?still` to the address to see it without motion.

**What's borrowed for the mockup only:** Fredoka and Zen Maru Gothic come from Google Fonts, Phosphor icons from unpkg, and canvas-confetti from jsDelivr. The real site bundles all three and makes no third-party requests.

**To re-render the images after editing**, from `packages/studio`:

```bash
node_modules/electron/dist/electron.exe ../../planning/website-mockup/render.mjs ../../planning/website-mockup/index.html ../../planning/website-mockup desktop
```

```bash
node_modules/electron/dist/electron.exe ../../planning/website-mockup/render.mjs ../../planning/website-mockup/index.html ../../planning/website-mockup phone
```
