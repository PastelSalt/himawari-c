# Branding

Moeko Works' art for Himawari, as drawn:

| File | What it is | Where it's used |
|---|---|---|
| `himawari-flowers.png` | The two flowers | Studio's icon: the exe, the window, and the installer |
| `himawari-studio-logo.png` | "Himawari Studio: Visual Novel Engine and Maker by Moeko Works" | Studio's Welcome screen and Settings → About, and the top of the README |
| `moeko-works-logo.png` | "Moeko Works: creative websites and systems" | "Made by" on the Welcome screen and in About, opening [moekoworks.vercel.app](https://moekoworks.vercel.app/) |

Studio uses sized copies, not these files. After changing the art, run this from the repo root and commit what it writes:

```bash
node packages/studio/scripts/make-brand.mjs
```

It writes `packages/studio/icons/studio.ico` (16 to 256 px) and `packages/studio/src/renderer/src/brand/*.png`.

The art has black outlines and dark lettering, drawn for light backgrounds. In Studio's dark theme it sits on a light card (`--brand-surface` in `styles.css`).

## License
The Himawari and Moeko Works names and logos belong to Moeko Works. They are **not** covered by the code and content licenses (zlib, MIT, CC BY 4.0, CC0), and that includes the sized copies made from them. A fork may keep the code but should use its own name and logo. Games made with Himawari don't include this art.
