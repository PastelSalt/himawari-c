# Himawari: Website Plan

> **Status:** v0.1 · 2026-10-22 · a plan, nothing built yet (LOG session 31).
> **Where it fits:** part of the launch half of Phase 8 ([DETAILED_PLAN.md](DETAILED_PLAN.md) §18), which lists a docs site on GitHub Pages. This plan widens that into Himawari's public website, with the docs inside it.
> **Evidence:** how other engine sites present themselves, and the reference look, are in [RESEARCH.md](RESEARCH.md) §18.
> **Reference look:** [nanahira.jp](https://nanahira.jp/), chosen by the owner (2026-10-22).

## 0. In short

- **One website for Himawari**, in English and Japanese, that a writer who has never heard of a game engine can understand in ten seconds and download from in one click.
- **It works like the best engine sites:**
  - one sentence, then a download button showing the version and date;
  - Studio's play-as-you-write shown moving;
  - proof that it makes real games;
  - a clear path to the first game, and an FAQ that answers money and platform questions first.
- **It looks like nanahira.jp, in Himawari's colors:**
  - a near-white page with one accent, and section titles in outlined pills on thin rules;
  - small ornaments between sections, sticker-style art, and a playful desktop motif;
  - every text color readable (4.5:1 or better), which the reference doesn't manage.
- **Fast, private, and plain:** static pages, no trackers, no cookies, no third-party requests, and no emoji or stock marketing phrases.
- **All art is the owner's own**, never generated. Until it's drawn, real Studio screenshots in window frames stand in.

## 1. What the site is for

| Goal | How we'll know |
|---|---|
| A visitor understands what Himawari is | The first screen answers what it is, who it's for, and what it costs, without scrolling |
| They can get it | One click from any page to the latest installer, with requirements and the SmartScreen step explained beside it |
| They can make their first game | "Make your first game" leads straight to the tutorial, in their language |
| They trust it | Version and date on the button, real screenshots, the sample games, open source, privacy stated plainly, and a way to report problems |
| Japanese writers feel at home | The Japanese pages are written in Japanese, reviewed by a native speaker, not machine-translated |
| It stays current with no extra work | The version, date, size, and download link come from the latest GitHub release at build time |

**Not goals:** selling anything, accounts or sign-ups, a forum, comments, a newsletter, analytics.

## 2. Who visits, and what they ask

| Visitor | First questions | Where the site answers |
|---|---|---|
| A writer who doesn't code | Can I make a visual novel without programming? Is it free? Will it run on my laptop? | Hero, the three promises, FAQ, requirements |
| An artist | Can I use my own layered sprites and design the menus? | Features: for artists, with the UI Designer screenshot |
| A translator or a team making a bilingual game | How are languages handled? | Features: for translators |
| Someone who codes | Is it really open? What's the script like? Can I extend it? | Features: for coders, with a script sample; links to GitHub and the specs |
| Someone comparing engines | How is this different from Ren'Py or TyranoScript? | FAQ ("How does it compare…"), the three promises |
| A player of a Himawari game | Is this safe? Who made the engine? | The footer credit links here; Privacy and About |
| Press, streamers, contest organizers | Logos, screenshots, a fact sheet | A press page (after launch) |

## 3. Principles

1. **The core concept is the pitch:** easy enough for anyone, open enough for coders, light enough for any PC ([FINALIZATION.md](FINALIZATION.md) §1).
2. **Show, don't claim.** A moving loop of Studio beats a paragraph about it; real screenshots only, never mock-ups.
3. **Honest.** Current limits are on the site, in plain words, as they are in the README.
4. **Readable first.** WCAG 2.2 AA throughout. The playful look comes from art and ornaments, never from low-contrast text.
5. **Private.** No analytics, cookies, embeds, or third-party fonts. The site makes no request to anyone but itself ([PRIVACY.md](../PRIVACY.md)).
6. **Light.** Static HTML, almost no JavaScript, images sized for the screen.
7. **Human writing.** The README's voice: short sentences, concrete words, no emoji, no "seamless" or "powerful".
8. **No AI-made media.** Every illustration, ornament, and icon is drawn by the owner or comes from the project's own art (plan §1.5).

## 4. Site map

| Path (English) | Path (Japanese) | Page |
|---|---|---|
| `/` | `/ja/` | **Home**, one long page with anchored sections (§5), like nanahira.jp |
| `/download/` | `/ja/download/` | The installer, requirements, the SmartScreen step, checksums, older versions |
| `/news/` and `/news/<post>/` | `/ja/news/…` | Release notes and announcements |
| `/docs/…` | `/ja/docs/…` | The user documentation, rendered from `docs/` (§8.4) |
| `/about/` | `/ja/about/` | Moeko Works, how the project is run, licenses, the brand note |
| `/privacy/` | `/ja/privacy/` | PRIVACY.md, for the site and for Himawari |
| `/press/` | `/ja/press/` | Logos, screenshots, a fact sheet, and the terms for using the logos (after launch) |
| `/404` | | A friendly page with a small illustration and links home |

The navigation is the home page's sections: **FEATURES · DOWNLOAD · LEARN · NEWS · FAQ**, then a language switch (EN / 日本語), a GitHub icon, and a contact icon.

## 5. The home page, section by section

Each section has a pill title on a rule, as on nanahira.jp, with a small ornament between sections.

1. **Header.**
   - The Himawari Studio logo on the left; GitHub and contact icons and the language switch on the right.
   - Below that, a row with the navigation, which stays at the top while scrolling. On phones it becomes a sunflower-colored square menu button.
2. **News bar** (nanahira.jp's "hot topic").
   - A rounded bar with a speech-bubble tail and one line, such as "Himawari Studio 0.4.1 is out", linking to the post.
   - It's generated from the latest release or news post.
3. **Hero.**
   - Headline: "Write your story and play it as you type."
   - Second line: "A free visual novel maker for Windows. No code needed."
   - **Download for Windows**, with "0.4.1 · 22 October 2026 · 146 MB" beneath it, and **Make your first game** as the second button.
   - On the right, the hero art. Until it exists: a Studio screenshot in a desktop-window frame with a sticker outline.
4. **What it is.** The three promises from the README, each as a short paragraph with a small drawing, never an emoji.
5. **SEE IT WORK.**
   - A 15–20 second silent loop: typing a line, then the game updating beside it; picking an expression; dragging the textbox in the UI Designer.
   - It's self-hosted video with a still poster image. With reduced motion turned on, the poster shows with a play button.
6. **FEATURES**, grouped by who uses them (writers, artists, translators, coders, the games you ship, optional AI).
   - Each group has two or three plain sentences and one screenshot in a window frame.
   - The coders' group shows a few lines of real `.hws` script.
7. **SAMPLES**, and later **MADE WITH HIMAWARI**.
   - Cards for Sunflower Days, Festival Eve, Layered Sprites, and the tutorial: a screenshot, one line each, and a download of the playable game.
   - When games made with Himawari exist, this becomes their gallery: cover, title, maker, link. Submissions come through the contact page.
8. **DOWNLOAD.** The button again, the requirements table, the SmartScreen explanation, and links to the download page and all releases.
9. **LEARN.** Make your first game (the tutorial), the documentation, working with AI, and, for coders, the script language and GitHub.
10. **NEWS.** The latest three posts, as rows like nanahira.jp's topics: thumbnail, title, "date | category", one line. Then a pale full-width "All news" button.
11. **FAQ.** The README's questions:
    - Do I need to code?
    - Do players install anything?
    - Is it free, and can I sell my game?
    - Do I have to use AI?
    - Is my work sent anywhere?
    - How does it compare to Ren'Py?
    - Mac or Linux?
12. **GET INVOLVED.** Report a problem (the contact page), GitHub issues, contributing, and security reports.
13. **Footer.**
    - The Moeko Works logo, linking to moekoworks.vercel.app, and the copyright and license line.
    - Links to Privacy, About, and Press.
    - Small flower or pixel characters on the left, as nanahira.jp has its sprites.

## 6. Visual design

### 6.1 What we take from nanahira.jp, and what we change

| nanahira.jp | Himawari site |
|---|---|
| Near-white background `#FFFAFA` | Warm white `#FFFCF5` (sunflower, not rose) |
| One accent, coral `#FFA399`, for everything | One accent family: **golden brown `#8F6500` for all accent text** (5.09:1), **sunflower `#F5D57C` for fills** (with dark text on it, 9.45:1) |
| Coral body text (1.85:1, fails WCAG) | Body text in `#2E2A33` (13.71:1); muted text `#675F70` (5.94:1) |
| Pill section titles with a double outline on a full-width rule | Same shape, with a golden outline and golden-brown capitals |
| Ribbon ornament with a face between sections | A small sunflower with a face, from the owner's flower art |
| Sticker-style hero (white outline, halftone shadow) amid retro desktop windows | The same idea, and it fits: Studio *is* a desktop app. Screenshots sit in rounded window frames with title bars; the hero character sits among them |
| Coral speech-bubble news bar | Sunflower speech-bubble news bar, dark text |
| Pixel sprites in the footer | Small flowers or the owner's pixel characters |
| No animation | No decorative animation; only the Studio loop and hover states |

The pink and purple from the Moeko Works logo appear only inside art, never as text colors, so the page keeps nanahira.jp's one-accent calm.

### 6.2 Tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FFFCF5` | Page background |
| `--ink` | `#2E2A33` | Body text |
| `--muted` | `#675F70` | Dates, captions |
| `--accent-ink` | `#8F6500` | Headings, links, navigation, pill titles |
| `--accent` | `#F5D57C` | Buttons, the news bar, highlights |
| `--accent-soft` | `#FDF3D4` | Pale wide buttons, card backgrounds |
| `--line` | `#EFD68E` | Rules, pill outlines, frames (decorative only) |
| `--on-accent` | `#3A2D00` | Text on sunflower fills |
| `--focus` | `#DCAE3C` ring with a `#2E2A33` inner line | Keyboard focus, visible on every background |

These match Studio's light theme (`packages/studio/src/renderer/src/styles.css`), so the site and the app look like one product. **Light only for v1:** the reference is light, and the art is drawn for light backgrounds. A dark theme can follow with the brand cards used in Studio.

### 6.3 Type

- **Latin:** Outfit, a geometric sans close to nanahira.jp's Arboria (Arboria needs a paid Adobe Fonts licence and a request to Adobe on every page; Outfit is SIL OFL).
- **Japanese:** M PLUS Rounded 1c, the rounded gothic nanahira.jp also loads (SIL OFL).
- **Size and spacing:** body 17 px with line height 1.8. Navigation and section titles in capitals with 0.08 em letter spacing, as on the reference.
- **Loading:** both fonts are self-hosted, subset, and loaded with `font-display: swap`. No Google Fonts requests.

### 6.4 Components

- The pill section title on a rule.
- The speech-bubble news bar.
- The window frame for screenshots: rounded corners, a title bar with three dots, and a sticker outline.
- The primary button: sunflower, dark text. The secondary button: outlined in golden brown.
- The wide pale button.
- The news row.
- The sample card.
- The FAQ item, a native `<details>`, so it works without JavaScript.
- The requirements table.
- The section ornament.
- The language switch.
- The phone menu.

### 6.5 Art the owner draws

| Piece | Size | Notes |
|---|---|---|
| Hero illustration | About 1200 × 900, transparent | A character (Hana from Sunflower Days, or a Himawari mascot), sticker style, among desktop windows showing Studio |
| Section ornament | About 80 × 40 | A small sunflower with a face, in the line color |
| Footer characters | Small, pixel or chibi | Two or three, like nanahira.jp's |
| Social preview image | 1200 × 630 | Logo, tagline, and a screenshot or the hero art, in English and Japanese |
| Favicon | 32 and 180 px | The flowers (`branding/himawari-flowers.png`) |
| 404 illustration | Small | A lost flower, for instance |

Until each piece exists, the site ships with the logo, the flowers, and real screenshots. Nothing is a stock image or generated.

## 7. Words

- **Source:** the README is the source for every claim. The site says less, in shorter sentences, and links to the README or the docs for detail.
- **Japanese:** written in Japanese from the English meaning, not translated word for word, and reviewed by a native speaker before launch. It uses the same terms as Studio's Japanese interface (`packages/studio/locales/ja.json`).
- **What we never write:** emoji, exclamation marks in headings, "seamless", "powerful", "revolutionary", "unlock", "journey", "whether you're X or Y", or claims that aren't true today.
- **Limits are stated,** linked from Download and the FAQ: Windows only, an unsigned installer, early software.

## 8. How it's built

### 8.1 Tools
- **Astro** for static output: every page is plain HTML at build time. It has built-in English and Japanese routing and renders Markdown, which suits the news posts and the docs.
- **JavaScript in the browser:** only the phone menu (a few lines). The FAQ uses `<details>`, and the video uses `<video>` attributes.
- **Images:** AVIF and WebP with explicit width and height, made at build time.

### 8.2 Where it lives
- **In the monorepo** as `site/`, a pnpm workspace package, so the docs, the README facts, and the screenshots stay in one place.
- **CI:** a `site` job on `windows-latest` builds the site, checks every link, and runs axe on the built pages with Playwright, which the repo already uses.

### 8.3 The download button stays current by itself
- At build time, the site reads GitHub's "latest release" endpoint (`GET /repos/PastelSalt/himawari-c/releases/latest`) for:
  - the version and date;
  - the installer's URL and size;
  - its SHA-256, which GitHub records for each uploaded file.
- Publishing a release triggers a rebuild, through a small workflow on `release: published`.
- If the request fails, the build keeps the last known values, and the button falls back to the releases page.

### 8.4 The docs
- The site renders `docs/` and `docs/ja/` at `/docs/` and `/ja/docs/`, replacing the unpublished Jekyll setup in `docs/_config.yml`.
- The Markdown stays where it is, so the README's relative links keep working.
- Links to the specs and policies outside `docs/` point at GitHub.

### 8.5 Hosting
- **Recommended: Vercel**, where moekoworks.vercel.app already lives, deploying `site/` from `main`, with preview links for pull requests.
- **Alternative: GitHub Pages** through an Actions workflow.
- **Either way:** analytics stay off, and there are no cookies.

## 9. Quality bars

| Area | Bar |
|---|---|
| Accessibility | WCAG 2.2 AA: contrast as in §6.2; keyboard-only use; a skip link; visible focus; `lang` set on every page; alt text on every image; touch targets at least 24 px |
| Performance | The home page loads in under 1 MB before the video, with the hero image under 200 KB. Largest Contentful Paint under 2.5 s on a mid-range phone. The video lazy-loads, stays under 3 MB, and has a poster image |
| Motion | No decorative animation. The Studio loop pauses for `prefers-reduced-motion` |
| Privacy | No request to any host but the site's own, checked in CI. No cookies |
| Search and sharing | Title and description per page and language; `hreflang` between English and Japanese; `sitemap.xml`; a social preview image per page; `SoftwareApplication` structured data (Windows, free, the current version) |
| Links | Every internal link resolves (CI). External links are checked weekly |
| Phones | The layout works from 360 px wide with no sideways scrolling; the download section says Himawari runs on Windows PCs |

## 10. Milestones

| Step | What's done | Needs |
|---|---|---|
| **W0. Decisions** | The open questions in §11 answered; an art brief agreed | The owner |
| **W1. Skeleton** | `site/` with the tokens and components; the English home page with screenshots standing in for art; the download button from the release API; a preview deployment | W0 hosting decision |
| **W2. Japanese and the rest** | The Japanese home page; the download, news, privacy, and about pages; news posts for 0.4.0 and 0.4.1 | Native review of the Japanese |
| **W3. Docs and samples** | The docs rendered in the site; the sample games exported and attached to releases, so the Samples section can link to them; the Studio loop recorded | |
| **W4. Art and launch** | The owner's art in place; the accessibility, performance, and privacy checks pass; the news bar announces the site | The owner's art |

The site should launch **before 1.0**: it's where usability-round testers and early users will come from.

## 11. Questions for the owner

1. **The address.** A subdomain or path of moekoworks (on Vercel), a domain of its own, or `pastelsalt.github.io/himawari-c`?
2. **Hosting.** Vercel (recommended) or GitHub Pages?
3. **The hero character.** Hana from Sunflower Days, a new Himawari mascot, or the flowers alone?
4. **The art.** Who draws the hero, the ornament, the footer characters, and the social image, and when?
5. **A dark theme.** Light only for v1 (recommended, like the reference), or both from the start?
6. **Sample games as downloads.** Attach the exported samples to each release (recommended), or link only to the source folders?
7. **Press page terms.** What may press and streamers do with the logos (show them unchanged, for instance)?

## 12. Done when

- [ ] The first screen of both languages says what Himawari is, that it's free, and that it's for Windows, with a working download button that shows the current version and date.
- [ ] Every claim on the site is true today and matches the README.
- [ ] axe finds no serious problems on any page, and every text color meets 4.5:1.
- [ ] The site makes no request to any other host, and sets no cookies.
- [ ] A new release updates the button and the news bar with no hand editing.
- [ ] The Japanese pages have been read and approved by a native speaker.
- [ ] All art is the owner's, and nothing on the site is generated media.
