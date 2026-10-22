# Himawari: Website Plan

> **Status:** v0.3 · 2026-10-22 · a plan with an approved mockup, nothing built yet (LOG session 33). Earlier the same day:
> - v0.1 (session 31): the first plan, after the research.
> - v0.2: rebuilt on how the owner builds sites (Aqua Iro Archive, the Moeko Works portfolio, the fan sites). Sunflower colors (yellow, white, gray and black); icons from libraries; no commissioned art; "coming soon" instead of the samples; motion everywhere; Astro on Vercel with the owner's backend patterns.
> - v0.3: **the look is settled by the approved mockup** ([website-mockup/](website-mockup/)): nanahira.jp's calm with the owner's touches, thick outlines only on things you click, one dark band, and one moving thing per screen.
> **Where it fits:** part of the launch half of Phase 8 ([DETAILED_PLAN.md](DETAILED_PLAN.md) §18), which lists a docs site on GitHub Pages. This plan widens that into Himawari's public website, with the docs inside it.
> **Evidence:** engine sites, the reference look, and the owner's previous projects are in [RESEARCH.md](RESEARCH.md) §18.
> **Reference look:** [nanahira.jp](https://nanahira.jp/), chosen by the owner.

**The owner's requests (2026-10-22):**
- Work the way the previous projects do.
- Use the colors of a sunflower: yellow first, then white, then gray and black.
- Use proper icons from libraries.
- There's no budget for art, so expect none.
- Leave the samples off the home page; a proper visual novel is coming, so say "coming soon".
- Add motion and animation so the page feels alive.
- Deploy on Vercel with Astro, and build the backend the way the previous projects do.
- Then, after asking whether v0.2 still felt like nanahira.jp: keep its simplicity, add the owner's preferences. The middle-path mockup was approved: "looks good to me … I love it".

## 0. In short

- **One website for Himawari**, in English and Japanese, that a writer who has never heard of a game engine can understand in ten seconds and download from in one click.
- **The look is the approved mockup** in [website-mockup/](website-mockup/) (`index.html`, and the desktop and phone images). Where this document and the mockup differ, the mockup wins.
- **The middle path: nanahira.jp's calm, with the owner's touches.**
  - From nanahira.jp: a warm near-white page, a 1000 px column with lots of space, thin double-line pill titles on thin rules, a speech-bubble news bar, one long anchored page, and little flowers in the footer.
  - From the owner: sunflower colors (yellow, white, gray and black), Fredoka, Phosphor duotone icons, sticker-style buttons and window frames, and a live hero.
- **Thick outlines only on things you click** (buttons, the menu button) **and on the window frames** that show the product. Everything else uses thin lines.
- **One dark moment:** a single black band, the sunflower's center, for "coming soon".
- **One moving thing per screen.** The hero types a line into Studio and the game follows. Section titles pop in, cards rise, flowers drift and fall, and the download button bursts into confetti. A Motion switch turns it all off, and it starts off when the system asks for reduced motion.
- **Built like Aqua Iro Archive:**
  - Astro static-first with small Preact islands and plain CSS;
  - on Vercel `sin1`, with Neon and Drizzle for the little server work there is;
  - a hash-based content security policy;
  - Playwright with axe, a contrast check, and a JavaScript budget.
- **No drawn art needed:** logos, flower shapes drawn in code, icons, and real Studio screenshots.
- **Coming soon:** the owner's upcoming visual novel, teased with no samples on the home page.

## 1. What the site is for

| Goal | How we'll know |
|---|---|
| A visitor understands what Himawari is | The first screen answers what it is, who it's for, and that it's free, without scrolling |
| They can get it | One click from any page to the latest installer, with the requirements and the SmartScreen step beside it |
| They can make their first game | "Make your first game" leads straight to the tutorial, in their language |
| They trust it | The version and date on the button, real screenshots, open source, privacy stated plainly, and a way to report problems |
| It feels alive and made with care | Motion that has a purpose (shows the product working, rewards a click, guides the eye) and never gets in the way |
| Japanese writers feel at home | The Japanese pages are written in Japanese and reviewed by a native speaker |
| It stays current with no extra work | The version, date, size, and link come from the latest GitHub release; a new release rebuilds the site |

**Not goals:** selling anything, accounts for visitors, comments, a forum, ads, third-party trackers.

## 2. Who visits, and what they ask

| Visitor | First questions | Where the site answers |
|---|---|---|
| A writer who doesn't code | Can I make a visual novel without programming? Is it free? Will it run on my laptop? | Hero, the three promises, FAQ, requirements |
| An artist | Can I use my own layered sprites and design the menus? | Features: for artists |
| A translator or a bilingual team | How are languages handled? | Features: for translators |
| Someone who codes | Is it really open? What's the script like? Can I extend it? | Features: for coders, with a script sample; GitHub and the specs |
| Someone comparing engines | How is this different from Ren'Py or TyranoScript? | FAQ, the three promises |
| A player of a Himawari game | Who made the engine? Is it safe? | The footer credit, About, Privacy |
| Press and streamers | Logos, screenshots, a fact sheet | A press page (after launch) |

## 3. Principles

1. **The core concept is the pitch:** easy enough for anyone, open enough for coders, light enough for any PC.
2. **Show, don't claim.** Real screenshots, and a live, in-page recreation of play-as-you-write. Never stock images.
3. **Honest.** Current limits are on the site, as they are in the README.
4. **Calm, with one moving thing per screen.** Every animation shows the product, rewards an action, or guides the eye, and the page never feels busy. Motion can always be switched off, and it's off when the visitor's system asks for reduced motion.
5. **Readable.** WCAG 2.2 AA. Yellow is never used for text on white; text is black or gray, and yellow text appears only on black.
6. **Private.** No cookies and no third-party trackers. Visits are counted cookieless on our own database, the way the portfolio does it.
7. **Light.** Static HTML first. Islands only where something is interactive, and GSAP loaded only when it's needed.
8. **Human writing.** The README's voice, with no emoji and no stock phrases.
9. **No AI-made media** (plan §1.5), and no commissioned art: what can't be drawn is built from the logos, flower shapes, icons, and screenshots.

## 4. Site map

| Path (English) | Path (Japanese) | Page |
|---|---|---|
| `/` | `/ja` | **Home**, one long page with anchored sections (§5) |
| `/download` | `/ja/download` | The installer, requirements, the SmartScreen step, the SHA-256, older versions |
| `/news` and `/news/<post>` | `/ja/news/…` | Release notes and announcements |
| `/docs/…` | `/ja/docs/…` | The user documentation, rendered from this repo's `docs/` (§9.5) |
| `/about` | `/ja/about` | Moeko Works, how the project is run, licenses, the brand note |
| `/privacy` | `/ja/privacy` | What the site counts and how (cookieless), and Himawari's own privacy |
| `/press` | `/ja/press` | Logos, screenshots, a fact sheet, and the logo terms (after launch) |
| `/404` | | A friendly page with drifting flowers and links home |

Trailing slashes off, as in Aqua Iro Archive. The navigation is the home page's sections: **FEATURES · DOWNLOAD · LEARN · NEWS · FAQ**, then the language switch (EN / 日本語), the Motion switch, and GitHub and contact icons.

## 5. The home page, section by section

The order and look follow the mockup. Each section opens with a pill title on a rule, and a small flower drawn in code sits between sections. The motion for each part is in §7.

1. **Header.**
   - The trimmed Himawari Studio logo on the left (`packages/studio/src/renderer/src/brand/himawari-studio.png`, about 64 px tall).
   - On the right: the language switch (EN / 日本語), a **MOTION ON / OFF** pill, and GitHub and contact icons.
2. **Navigation row.**
   - "HIMAWARI", a short thin rule, then **FEATURES · DOWNLOAD · LEARN · NEWS · FAQ** in spaced capitals, with a yellow underline that grows on hover.
   - It stays at the top while scrolling. On phones the links fold into a yellow square menu button, the one element up here with a thick outline.
3. **News bar** (nanahira.jp's "hot topic"). A yellow speech bubble with no outline: "NEWS | Himawari Studio 0.4.1 is out · each sample now opens its own copy", and a small white flower bobbing at the end. It's generated from the latest release or news post.
4. **Hero.**
   - Headline: "Write your story and *play it as you type.*", with the second half underlined by a yellow highlighter.
   - Second line: "A free visual novel maker for Windows. No code needed, and nothing for your players to install."
   - **Download for Windows** (yellow, thick outline, black offset shadow), with "0.4.1 · 22 October 2026 · 146 MB" beneath it. Then **Make your first game** (white, thick outline, yellow offset shadow).
   - On the right, **the live Studio window**, in HTML and CSS. On one side a screenplay row (Hana, an expression chip, the line); on the other the game: sky, sun, a row of sunflowers, a placeholder character, and the textbox.
     - The line types itself into the row, and the textbox follows letter by letter; then the expression changes.
     - Under it, in small capitals: "THE GAME PLAYS BESIDE THE EDITOR, IN UNDER A SECOND".
     - On phones the game stacks above the row.
   - The logo flowers drift beside the window.
5. **ABOUT.** The three promises as three cards with thin borders, each with a Phosphor duotone icon (black outline, yellow fill): a pencil for anyone, code for coders, a lightning bolt for any PC.
6. **FEATURES.** Alternating rows of text and a real screenshot in a window frame:
   - "FOR WRITERS · Each line of your story is a row." with the Screenplay screenshot;
   - "FOR ARTISTS · Make the menus look like your game." with the UI Designer screenshot;
   - then translators, coders (with a few lines of real `.hws` script), the games you ship, and optional AI, in the same pattern.
7. **COMING SOON.**
   - The page's one black band: a yellow double-line pill "COMING SOON", the yellow headline "A visual novel made with Himawari is on the way.", and one line about it.
   - Flowers fall slowly behind it. No dates, names, or samples until the owner announces them.
8. **DOWNLOAD.** The button again, the requirements table, the SmartScreen explanation, and links to the download page and all releases.
9. **LEARN.** Make your first game (the tutorial), the documentation, working with AI, and, for coders, the script language and GitHub, each with an icon.
10. **NEWS.** The latest three posts as rows (icon or screenshot, title, "date | category", one line), then a wide pale-yellow "All news" button.
11. **FAQ.** The README's questions:
    - Do I need to code?
    - Do players install anything?
    - Is it free, and can I sell my game?
    - Do I have to use AI?
    - Is my work sent anywhere?
    - How does it compare to Ren'Py?
    - Mac or Linux?
12. **GET INVOLVED.** Report a problem (the Moeko Works contact page), GitHub issues, contributing, and security reports.
13. **Footer.** On the left, the logo flowers bobbing. On the right, the Moeko Works logo (linking to moekoworks.vercel.app), then PRIVACY · ABOUT · GITHUB, then the copyright and license line in small spaced capitals.

**Left out on purpose** (they were in v0.2): a splash screen, a numbers band, a marquee, and cursor sparkles. They made the page busy, and the mockup is calmer without them.

## 6. Visual design

### 6.1 What we take from nanahira.jp, and what we change

| nanahira.jp | Himawari site (the mockup) |
|---|---|
| Near-white background, one coral accent for everything | Warm paper `#FFFCF2`; yellow for fills, highlights, and shadows only; dark gray and black for text |
| Coral text (1.85:1, fails WCAG) | Body text `#45404D` (9.77:1), headings `#2E2A33` (13.68:1); yellow text only on the black band (11.96:1) |
| Thin double-line pill section titles on a full-width rule | The same, in dark gray `#4A4550`, with letters that pop in |
| Ribbon ornament between sections | A five-petal flower drawn in SVG, yellow or white, from the logo's shape |
| Sticker-style hero art amid desktop windows | A live Studio window with a thick outline and a yellow offset shadow; drifting logo flowers |
| Coral speech-bubble news bar | Yellow speech bubble with a bobbing white flower |
| Pixel sprites in the footer | The logo flowers, bobbing |
| Thin lines everywhere | Thin lines everywhere, except **thick black outlines on buttons and window frames** |
| No dark sections | **One** black band: coming soon |
| No animation | One moving thing per screen (§7) |

### 6.2 Tokens

These are the mockup's values.

| Token | Value | Use |
|---|---|---|
| `--sun` | `#F5D57C` | Buttons, the news bar, highlights, offset shadows, icon fills (Studio's accent) |
| `--sun-deep` | `#F1CB60` | Hover, list markers |
| `--sun-wash` | `#FDF3D4` | Window title bars, the active screenplay row, wide pale buttons |
| `--paper` | `#FFFCF2` | Page background |
| `--white` | `#FFFFFF` | Cards, window frames |
| `--ink` | `#2E2A33` | Headings (13.68:1) |
| `--text` | `#45404D` | Body text (9.77:1) |
| `--gray-600` | `#5D5869` | Secondary text and navigation (6.67:1) |
| `--gray-500` | `#77727F` | Dates and small captions only (4.55:1) |
| `--line` | `#DDD6C8` | Card borders, dividers |
| `--line-strong` | `#4A4550` | Pill outlines, the section rules, thin control borders |
| `--black` | `#1E1A24` | Thick outlines, offset shadows on yellow buttons, the black band, text on yellow (11.96:1) |
| `--focus` | 3 px black ring with a 2 px white gap | Keyboard focus |

- **Outline weights:** 2.5 px black on buttons, the menu button, and window frames; 1.5 px `--line-strong` on pills and small controls; 1 px `--line` on cards.
- **Offset shadows:** `4px 5px 0` black under yellow buttons, yellow under white buttons, and `8px 10px 0` yellow under window frames.
- **Links:** ink with a yellow highlighter underline that fills on hover.
- **Light only for v1.**

### 6.3 Type

- **Latin:** Fredoka, as on the portfolio and Aqua Iro Archive. It's rounded and friendly, and close to the logo's lettering.
- **Japanese:** Zen Maru Gothic, as on Aqua Iro Archive.
- **Loading:** both go through Astro's fonts API, so they're downloaded at build and served from our own domain. Weights are trimmed to what's used, and the Japanese slices load from one cached stylesheet, as in Aqua.
- **Japanese line breaks:** BudouX (as in Aqua), so headlines break between words, not inside them.
- **Scale:** fluid `clamp()` steps from 360 to 1600 px, as in the previous projects. Labels are in capitals with 0.16–0.22 em letter spacing.

### 6.4 Icons

- **Phosphor Icons** (`@phosphor-icons/core`, MIT), duotone, as in Aqua Iro Archive.
  - They're copied at build time into one inline SVG sprite and used as `<svg><use href="#ph-…">`.
  - The duotone layer takes `--sun`, so every icon is black with a yellow fill.
  - Likely icons: pencil-simple, code, lightning, play, translate, palette, paint-brush, globe, download-simple, book-open, robot, question, bug, github-logo, envelope, sparkle, flower, windows-logo.
- **Simple Icons** (CC0, as on the portfolio) only for brand marks Phosphor lacks, such as Discord if it's ever needed.
- **Never emoji**, in copy or as icons.

### 6.5 Components

**In the mockup already:**
- the pill section title, whose letters pop in;
- the speech-bubble news bar;
- the window frame: black outline, yellow offset shadow, a pale-yellow title bar with three dots;
- the primary button (yellow, black outline, black offset shadow, pressing down on click) and the secondary button (white, black outline, yellow offset shadow);
- the promise card with a duotone icon;
- the feature row (a kicker with an icon, a heading, a short paragraph, a list with yellow markers, and a screenshot);
- the black coming-soon band with its yellow double-line pill;
- the language and Motion switches, the phone menu button;
- the footer;
- the SVG flower in two colors: yellow with a dark center, and white with a yellow center, like the logo.

**To design in the same style:**
- the wide pale-yellow button;
- the news row;
- the FAQ item, a native `<details>`;
- the requirements table.

### 6.6 Art, without an art budget

| Need | Made from |
|---|---|
| Hero | The live HTML/CSS recreation of Studio (§5.4), with the logo flowers drifting behind |
| Section ornaments, falling flowers | A five-petal flower drawn in SVG code (the portfolio's `decor/shapes.ts` approach) |
| Feature visuals | Real Studio screenshots in sticker window frames (`docs/images/`, refreshed by the screenshot script from session 30) |
| Social preview images | Generated at build from the logo, the tagline, and a screenshot, as Aqua's `make-og.ts` does; English and Japanese |
| Favicon and app icons | The flowers (`branding/himawari-flowers.png`, already sized by `make-brand.mjs`) |
| 404 | Flowers drifting off the page |

## 7. Motion

**One moving thing per screen.** The page should feel alive and still read as calm, like nanahira.jp with a pulse. Everything here is in the mockup.

### 7.1 The switch
- A **MOTION ON / OFF** pill in the header.
- A small inline script runs before paint (as in Aqua's `Base.astro`). It reads the saved choice, or falls back to `prefers-reduced-motion`, and sets `html[data-motion]`.
- Every animation is gated by `html[data-motion='on']`. With Motion off, nothing moves: the hero shows a finished line, and reveals are already in place.
- The choice is saved in `localStorage` (`hws:prefs`), never in a cookie.

### 7.2 What moves

| Where | Motion | How |
|---|---|---|
| Hero | The line types itself into the screenplay row and the game's textbox together; the expression chip and the character change; three lines loop | A small island; pauses off screen |
| Hero | The logo flowers drift and turn slowly | CSS keyframes |
| Section titles | Letters pop in one by one when the title arrives | CSS, started by an IntersectionObserver |
| Cards and feature rows | Rise into place, staggered; anything already on screen stays put | Aqua's `reveal.ts` pattern |
| Ornaments, the news-bar flower, the footer flowers | A gentle bob | CSS keyframes |
| Coming soon | Flowers fall slowly behind the black band | CSS keyframes on SVG flowers (the portfolio's `FlowerFall` idea) |
| Download button | A burst of yellow, white, and black confetti on click | canvas-confetti, as on the portfolio |
| Buttons | Press down; the offset shadow closes up | CSS transitions |
| Navigation and links | The yellow underline grows; the highlighter fills | CSS transitions |

**Not used** (from v0.2): a splash, cursor sparkles, Lenis smooth scrolling, a marquee, counters, tilt, and scroll-pinned scenes. GSAP isn't needed for this design. It stays available, as in Aqua, if a later page needs a scroll story.

### 7.3 Keeping it smooth
- **Only `transform` and `opacity` animate.**
- **Animations far off screen pause** (Aqua's `offscreen.ts`), and the hero loop stops when it's out of view.
- **The budget:** under 40 KB of JavaScript (gzip) on the home page, including the confetti, which loads on the first click. Checked by `npm run budget`.

## 8. Words

- **Source:** the README is the source for every claim. The site says less and links to it or to the docs.
- **Japanese:** written in Japanese from the meaning, using Studio's Japanese terms (`packages/studio/locales/ja.json`), and reviewed by a native speaker.
- **What we never write:** emoji, exclamation marks in headings, "seamless", "powerful", "revolutionary", "unlock", "journey", "whether you're X or Y", or anything that isn't true today.
- **Coming soon stays vague** until the owner announces the visual novel.

## 9. How it's built, the way the previous projects are

### 9.1 Stack (from Aqua Iro Archive)
- **Astro 7**, `output: 'static'`: every page is prerendered unless a route sets `prerender = false`.
- **Preact islands** only where something is interactive: the hero recreation, the switches, the phone menu.
- **Plain CSS** with tokens and cascade layers. No CSS framework.
- **Integrations:**
  - `@astrojs/vercel` (`maxDuration` 30 s; the Vercel image optimizer off, since sharp handles images at build);
  - `@astrojs/preact` and `@astrojs/sitemap`;
  - Astro's fonts API;
  - `security.checkOrigin` on.
- **Libraries:** canvas-confetti, `@phosphor-icons/core`, simple-icons, BudouX, sharp, and Zod. GSAP only if a later page needs a scroll story; no Lenis (native scrolling suits the calm design).

### 9.2 Repository
- **Its own repository**, `PastelSalt/himawari-site`, like every previous site. This keeps the engine repo's Windows-only CI as it is; the site's CI runs on Ubuntu, as Aqua's does.
- **Branches:** work on `dev`, and `main` deploys production, as on the portfolio.
- **Every build reads this repo's latest release:**
  - the release information (§9.4);
  - the docs and screenshots, from the tagged source, so the site always shows the docs of the released version.

### 9.3 Backend (from the portfolio and Aqua Iro Archive)

The site needs very little server work. What it has follows the previous projects:

| Need | How |
|---|---|
| Database | **Neon Postgres** through the Vercel Marketplace integration (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`), region `ap-southeast-1` beside Vercel's `sin1`. Branch per preview |
| Schema and queries | **Drizzle ORM** (`drizzle-orm/neon-http`) with migrations in `db/migrations`; `npm run db:generate`, `db:migrate`, `db:seed` |
| Visit counts | The portfolio's **cookieless** `/api/track`. A visitor is counted with a hash of a daily rotating salt, the IP, the user agent, and the host; the salt changes every day, so visitors can't be followed across days. IPs are never stored. Bots are filtered, and events are validated with Zod |
| Download counts | GitHub's own per-file download counts, read at build; nothing stored |
| Rate limits | The portfolio's `rate_limits` table, with HMAC-hashed keys, for every POST route |
| Housekeeping | A daily **Vercel cron** (`/api/cron/daily`, protected by `CRON_SECRET`) rotates the salt and deletes old rate-limit rows |
| Contact and bug reports | Link to the Moeko Works contact page, which already has the honeypot, signed start time, and rate limit. No second contact form |
| Alerts | Errors and cron failures to a Discord webhook (`DISCORD_WEBHOOK_URL`), as in Aqua |
| Admin, if ever needed | Aqua's keeper: Better Auth with forced TOTP, sign-up disabled, a one-time `admin:create` script. Not in v1: news is Markdown in the repo |
| Environment | Astro's typed `env` schema; secrets only in Vercel and `.env.local`; `.env.example` with placeholders. Never commit secrets |
| Backups | The weekly encrypted Neon backup workflow from Aqua (`age`), once there's data worth keeping |

### 9.4 The download button stays current by itself
- **At build:** the site reads `GET /repos/PastelSalt/himawari-c/releases/latest` for:
  - the version and date;
  - the installer's URL and size;
  - its SHA-256 (GitHub records one for each file);
  - its download count.
- **On a new release:** a small workflow in this repo (`release: published`) calls a Vercel deploy hook, stored as a secret, which rebuilds the site.
- **If GitHub can't be reached:** the build keeps the last known values, and the button links to the releases page.

### 9.5 The docs
- **Rendered at `/docs` and `/ja/docs`** from the released `docs/` folder, replacing the unpublished Jekyll setup in `docs/_config.yml`.
- **Links:** relative `.md` links are rewritten to site URLs; links to the specs and policies point at GitHub.

### 9.6 Security headers (from Aqua's `vercel.json`)
- **Sent on every page:**
  - HSTS with preload;
  - `nosniff` and `strict-origin-when-cross-origin`;
  - a Permissions-Policy that turns off the camera, microphone, geolocation, payments, and USB;
  - COOP `same-origin`.
- **A content security policy** of `default-src 'self'`, with the hashes of Astro's inline scripts written into `vercel.json` at build (`scripts/csp-hash.ts`). No third-party origins at all: fonts and video are self-hosted.
- **Caching:** immutable caching for `/_astro/*`.

### 9.7 Checks (from Aqua's CI)
- **On every push:**
  - `npm run lint` (ESLint and Prettier);
  - `npm run contrast` (every token pair at WCAG AA);
  - `npm test` (Vitest; database routes tested on PGlite with the real migrations);
  - `npm run build`, then `npm run budget`.
- **Then:**
  - Playwright with axe on Chromium and WebKit, against the built site served with the `vercel.json` headers;
  - `npm audit --omit=dev --audit-level=high`.
- **With a Neon API key:** migrations run against a throwaway Neon branch.

## 10. Quality bars

| Area | Bar |
|---|---|
| Accessibility | WCAG 2.2 AA: the contrasts in §6.2; keyboard-only use; a skip link; visible focus; `lang` on every page; alt text on every image; touch targets at least 24 px; axe clean |
| Motion | Off for `prefers-reduced-motion` unless switched on; nothing flashes more than three times a second; nothing moves that the visitor needs to read while it moves |
| Performance | The home page under 1 MB; under 40 KB of JavaScript (gzip); Largest Contentful Paint under 2.5 s on a mid-range phone; no layout shift from fonts or images |
| Privacy | No cookies; no third-party requests (checked in the e2e suite); cookieless counting explained on `/privacy` |
| Search and sharing | Titles and descriptions per page and language; `hreflang`; `sitemap.xml`; social images per page; `SoftwareApplication` structured data (Windows, free, the current version) |
| Phones | Works from 360 px wide with no sideways scrolling. The download section says Himawari runs on Windows PCs |

## 11. Milestones

| Step | What's done | Needs |
|---|---|---|
| **W0. Setup** | The `himawari-site` repo, a Vercel project (Astro, Node 24, `sin1`), the Neon integration, a deploy hook, and the secrets | The owner's accounts |
| **W1. The page's bones** | The mockup turned into Astro components with its tokens, type, and icons; the English home page with real screenshots; the download button from the release API; the security headers and CSP; the checks in CI | The approved mockup |
| **W2. Alive** | The mockup's motion as islands and CSS: the typing hero, letter pops, reveals, bobbing and drifting flowers, the falling flowers, confetti, and the Motion switch; the budget met | |
| **W3. Japanese and the rest** | The Japanese home page; the download, news, privacy, and about pages; news posts for 0.4.0 and 0.4.1; cookieless counting and the daily cron | Native review of the Japanese |
| **W4. Docs and launch** | The docs rendered from the release; social images; the accessibility, performance, and privacy checks passing; the news bar announcing the site | |

The site should launch **before 1.0**, since it's where testers and early users will come from.

## 12. Questions for the owner (each with a recommendation)

1. **The address.**
   - Recommended: `himawari-moekoworks.vercel.app` (or similar) now, and a domain later if wanted. Confidence: medium.
   - Alternative: a path under moekoworks.vercel.app.
2. **Counting visits.**
   - Recommended: the portfolio's cookieless `/api/track` on the site's own Neon database. Confidence: high.
   - Alternative: Aqua's self-hosted Umami.
3. **Coming soon.** Should the teaser name the visual novel or show a date before you announce it? Recommended: neither, until you're ready. Confidence: high.
4. **The press page's logo terms.** Recommended: logos may be shown unchanged to talk about Himawari, and nothing else. Confidence: medium.

## 13. Done when

- [ ] The first screen in both languages says what Himawari is, that it's free, and that it's for Windows, with a working download button that shows the current version and date.
- [ ] Every claim on the site is true today and matches the README.
- [ ] The home page matches the approved mockup on desktop and phone.
- [ ] The page feels alive with Motion on, with one moving thing per screen; it's completely still with Motion off, and it respects `prefers-reduced-motion`.
- [ ] axe finds no serious problems on any page, and the contrast check passes for every token pair.
- [ ] The site makes no third-party requests and sets no cookies.
- [ ] A new release updates the button and the news bar with no hand editing.
- [ ] The Japanese pages have been read and approved by a native speaker.
- [ ] Nothing on the site is drawn art the owner would need to supply, and nothing is generated media.
