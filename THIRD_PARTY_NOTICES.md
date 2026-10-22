# Third-party notices and license audit

Himawari is made of our own code plus a small number of open-source libraries. This page lists **everything that ships** to people (games, Studio, the tools), what license each part uses, and anything that needs care. It was audited on **2026-10-20** against the pinned versions in `runtime/cmake/HimawariDeps.cmake` and `pnpm-lock.yaml`.

**Short version:** nothing that ships is copyleft in a way that affects your games or your projects. A few items need attention before v1.0 and are listed under [Flagged items](#flagged-items).

## Himawari's own licenses
| Part | License |
|---|---|
| Runtime (`runtime/`: `himawari.exe` and every game made with it) | zlib ([LICENSE-zlib](LICENSE-zlib)) |
| Tooling: `@himawari/core`, `hwc`, `@himawari/tools`, `himawari-mcp`, Studio | MIT ([LICENSE-MIT](LICENSE-MIT)) |
| Specs and RFCs (`spec/`, `rfcs/`) | CC BY 4.0 ([spec/LICENSE.md](spec/LICENSE.md)) |
| Templates and examples (`templates/`, `examples/`) | CC0 1.0: a `LICENSE` file in each folder. Use them in your games freely, no credit needed. |

Crediting Himawari in your game is **appreciated but never required**. The runtime's zlib license doesn't require it, and the credit setting defaults to the quiet option. See [how to credit Himawari](docs/how-to/credit-himawari.md). The one credit that *is* required is FreeType's (below), and exported games already include it in `CREDITS.txt`.

## 1. The runtime (inside every game's `.exe`)
Everything is built from source and linked **statically**, so a game is one `.exe` with no DLLs. Versions are pinned by tag and SHA-256 hash.

| Library | Version | License | What it needs from you |
|---|---|---|---|
| [SDL](https://libsdl.org) | 3.4.18 | zlib | Nothing. |
| [SDL3_mixer](https://github.com/libsdl-org/SDL_mixer) | 3.2.4 | zlib | Nothing. |
| ↳ dr_mp3 (MP3 decoder inside SDL3_mixer) | bundled | MIT-0 or public domain | Nothing. |
| ↳ stb_vorbis (Ogg Vorbis decoder inside SDL3_mixer) | 1.22 | MIT or public domain (your choice) | Nothing. |
| ↳ miniz and stb_image (inside SDL, for PNG and BMP) | bundled | MIT / public domain | Nothing. |
| [FreeType](https://freetype.org) | 2.14.3 | **FreeType License (FTL)**, a BSD-style license with a **credit requirement**. FreeType is dual-licensed FTL or GPLv2; we use it under the FTL. | The game's documentation must say: *"Portions of this software are copyright (C) The FreeType Project (www.freetype.org). All rights reserved."* Exported games do this in `CREDITS.txt`. |
| [libunibreak](https://github.com/adah1972/libunibreak) | 8.0 | zlib/libpng-style | Nothing. |
| [stb_image](https://github.com/nothings/stb) (JPEG) | pinned commit `2c980bb` | MIT or public domain (your choice) | Nothing. |
| [libwebp](https://chromium.googlesource.com/webm/libwebp) (decoder only) | 1.6.0 | BSD 3-clause | Binary redistribution should reproduce the copyright notice, the conditions, and the disclaimer. See flagged item 3. |

In the repository but **not shipped in any game**: SDL3_ttf 3.2.2 (zlib) is used only by the "Spike C" comparison program (RFC 0003). The runtime's FLAC, Opus, MIDI, module-music, and other optional decoders are switched off.

**Fonts in games.** The runtime ships **no font files**. It uses fonts already on the player's Windows PC (Verdana, Segoe UI, Yu Gothic, Meiryo, UD Digi Kyokasho, Microsoft YaHei, Microsoft JhengHei) and your game's own fonts if you add them (`assets/fonts/`). The system fonts belong to Microsoft and are never copied into games. **If you add your own font to a game, you are responsible for its license.** Fonts under the [SIL Open Font License](https://openfontlicense.org) (like Noto) are a good choice; put their license text in your game's credits.

## 2. Himawari Studio (the editor)
Studio is an Electron app. Everything it needs is bundled into one package (no `node_modules` ships).

### Electron and Chromium
| Component | Version | License |
|---|---|---|
| [Electron](https://www.electronjs.org) | 45.0.0 | MIT |
| Chromium, Node.js, V8, and the other pieces inside Electron | as bundled by Electron | Many permissive licenses. Electron ships their full notices in `LICENSES.chromium.html` next to the app. **Keep that file in the installer.** |

Build tools (electron-builder, electron-vite, Vite, TypeScript, Vitest, Playwright, ESLint) are used to *build* Himawari and are **not shipped**.

### Bundled fonts (Studio's own interface only)
| Font | License | Notes |
|---|---|---|
| Noto Sans 5.3.0 (`@fontsource/noto-sans`) | **SIL OFL 1.1** | Studio's interface text. |
| Noto Sans JP 5.3.1 (`@fontsource/noto-sans-jp`) | **SIL OFL 1.1** | Studio's Japanese interface text. |

The OFL lets us bundle the fonts freely, but its license text must travel with them and the fonts can't be sold on their own. They are not copied into games.

### JavaScript packages bundled into Studio, `hwc`, and `himawari-mcp`
80 packages (versions counted separately), found by walking `pnpm-lock.yaml` from Studio's, `himawari-mcp`'s, `@himawari/tools`', and `@himawari/core`'s dependencies. All are permissive **except `elkjs`**, which is a dual license (see flagged item 1).

| License | Packages |
|---|---|
| **MIT** (56) | `@babel/runtime`, `@codemirror/*` (autocomplete, commands, language, lint, search, state, streamparser, view), `@formatjs/*` (fast-memoize, icu-messageformat-parser, icu-skeleton-parser, intl), `@lezer/*` (common, highlight, lr), `@marijn/find-cluster-break`, `@stablelib/base64`, `@types/*` (type definitions only), `@xyflow/react` 12.12.0, `@xyflow/system`, `ag-psd` 31.0.3, `base64-js`, `classcat`, `crelt`, `cross-spawn`, `csstype`, `eventsource`, `eventsource-parser`, `fflate`, `jose`, `json-schema-to-ts`, `path-key`, `pe-library` 2.0.1, `pkce-challenge`, `react` 19.3.1, `react-dom`, `resedit` 3.1.0 (the exported game's `.exe` name and icon), `scheduler`, `shebang-command`, `shebang-regex`, `standardwebhooks`, `style-mod`, `ts-algebra`, `use-sync-external-store`, `w3c-keyname`, `zod` 4.6.7, `zustand` 5.0.15 and 4.5.7 |
| **ISC** (11) | `d3-color`, `d3-dispatch`, `d3-drag`, `d3-interpolate`, `d3-selection`, `d3-timer`, `d3-transition`, `d3-zoom`, `isexe`, `which`, `yaml` |
| **BSD-3-Clause** (3) | `d3-ease`, `intl-messageformat`, `react-intl` 12.1.4 |
| **Apache-2.0** (5) | `@anthropic-ai/sdk` 1.1.0 (Apache-2.0 since 1.0; MIT before), `@modelcontextprotocol/client`, `@modelcontextprotocol/core`, `@modelcontextprotocol/server` (the MCP SDK, 2.3.1), `@opentelemetry/api` |
| **OFL-1.1** (2) | `@fontsource/noto-sans`, `@fontsource/noto-sans-jp` (the fonts above) |
| **EPL-2.0 OR GPL-3.0-or-later** (1) | `elkjs` 0.12.0 |
| **Unlicense** (1) | `fast-sha256` |
| **MIT AND Zlib** (1) | `pako` |

*How this list was made:* `corepack pnpm licenses list` from `packages/studio` (all of Studio's dependencies are `devDependencies`, because they're bundled, so `--prod` comes back empty), then the lockfile walk above. Regenerate it whenever dependencies change.

## 3. Templates and examples
Every folder in `templates/` and `examples/` has a `LICENSE` file with **CC0 1.0**. That covers the scripts, characters, and procedural placeholder art in it. You can ship games built from them with no credit. The art is drawn by small scripts (`make-art.mjs`), never generated by AI, and no third-party art, music, or fonts are included. (`examples/festival-eve` was written by an AI agent through `himawari-mcp` as a test; its text is dedicated to CC0 like the rest, and `.himawari/provenance.json` records who wrote what.)

## Flagged items
Nothing here blocks a release, but each should be settled before v1.0.

| # | Item | Why it matters | Suggested fix |
|---|---|---|---|
| 1 | **`elkjs` 0.12.0 is `EPL-2.0 OR GPL-3.0-or-later`** (Studio's story-graph layout). | EPL-2.0 is a *weak* copyleft that covers only elkjs's own files. Used unmodified under the **EPL-2.0** option, it leaves Studio's own code MIT. We must keep its notice and make its source available. | We use the EPL-2.0 option (stated here). Include the EPL-2.0 text in Studio's licenses and link elkjs's source. Don't modify elkjs. |
| 2 | **The MCP SDK (`@modelcontextprotocol/*` 2.3.1) and the Anthropic SDK (`@anthropic-ai/sdk` 1.x) are Apache-2.0**, not MIT. `@opentelemetry/api` (pulled in by the Anthropic SDK) is Apache-2.0 too. Neither SDK ships a NOTICE file. | Apache-2.0 asks that its license text (and any NOTICE) ship with the software. | Include the Apache-2.0 text in Studio's and `himawari-mcp`'s licenses. |
| 3 | **Exported games' `CREDITS.txt` is incomplete.** It names SDL, FreeType, libunibreak, and libwebp, but leaves out stb_image, stb_vorbis, and dr_mp3, and doesn't include libwebp's full BSD conditions. | libwebp's BSD license asks binary distributions to reproduce its notice and disclaimer. (FreeType's required credit line *is* already there.) | Have the exporter write the full texts to a `licenses/` folder (the plan already calls for this) and list every library in section 1. The text lives in `packages/tools/src/package.ts`. |
| 4 | **`spec/LICENSE.md` still has a TODO** for the full CC BY 4.0 legal text. | The summary and link are there, but the legal code should be in the folder. | Add the legal text before the first release. |
| 5 | **Studio has no place to show license texts.** MIT and BSD ask that copyright notices travel with the software, and OFL and EPL need their texts too. | Settings → About exists now (the version, Moeko Works, and the contact page), but it doesn't show license texts yet. | Generate the texts from the packages at build time and show them in About (already planned in FINALIZATION.md). Keep Electron's `LICENSES.chromium.html`. |
| 6 | **`hwc init` and Studio copy every file in a template**, including the new CC0 `LICENSE`, into each new game project (`readTemplate` in `packages/tools/src/init.ts`). | A new game would be given a CC0 license file its author didn't choose. | Skip `LICENSE` when copying (a code change this audit didn't make), or keep it on purpose and say so. |
| 7 | **The Windows installer is built with NSIS** (through electron-builder), whose runtime pieces have their own permissive licenses. | Probably nothing to do, but worth checking when the signed installer is built. | Add NSIS's notice to the installer's licenses if needed. |

### Checked and fine
- **No GPL, LGPL, or AGPL code ships.** FreeType's GPL option and elkjs's GPL option are *not* the ones we use.
- **Build-only packages that look scarier are not shipped:** `lightningcss` (MPL-2.0), `caniuse-lite` (CC BY 4.0), `argparse` (Python-2.0), and the WTFPL-licensed helpers belong to the build tools, not to the app.
- **The runtime links no network or TLS library**, so a game has no way to reach the internet. See [PRIVACY.md](PRIVACY.md).
- The **Anthropic SDK** (Apache-2.0) is used only by Studio's optional assistant and "Translate with AI". Games contain no AI.

## Keeping this page right
- Adding a dependency? Add it here in the same pull request ([CONTRIBUTING.md](CONTRIBUTING.md)). Anything copyleft needs a conversation first.
- Upgrading a runtime library? Update the version here and in `HimawariDeps.cmake`, and re-read its license file.
- Found a mistake? Please open an issue.
