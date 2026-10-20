# Himawari: Finalization Plan

> **Status:** v0.5 · 2026-10-20 · in progress; the marks in §3–§8 show what's built (LOG session 19). Earlier versions the same day:
> - v0.1: common sense, quiet AI, optional translation.
> - v0.2: the core concept in §1 and §3–§5.
> - v0.3: your answers in §13, and crediting Himawari (OC-10).
> - v0.4: every question settled; the usual Windows installer (OC-1); credit optional and off by default (OC-10). Execution started (LOG session 19).
> - v0.5: stages A–D and F built, and the release tests (no-code e2e, axe, torture tests); status marks updated. The runtime's side branch is merged, and single-file export is in Studio and `hwc`.
> **Where it fits:** Phase 8 of [DETAILED_PLAN.md](DETAILED_PLAN.md) §18 becomes **"Finalization and open-source launch"**. This file is the finalization half; the launch items (docs site, installer signing, governance) stay in the plan and are cross-referenced here.
> **Evidence:** the testing methods and platform facts come from [RESEARCH.md](RESEARCH.md) §17.

**Your answers and requests that shape this plan (2026-10-20):**

| Topic | Your answer |
|---|---|
| **The core concept** | Studio is **so easy that nobody needs to code**: everything can be done in the UI. It still serves people who *can* code, at the same time. Games run on **any Windows PC** because the runtime is optimized C. **One click** installs Studio with everything it needs, and a game runs by **double-clicking its exe** |
| How AI appears by default | **Present but quiet**: AI features exist, but the assistant starts closed and AI controls are secondary |
| Translation | **One language by default**: translation tools stay hidden until a second language is added |
| Where finalization sits | **Merged into the launch phase** (Phase 8) |
| Which kinds of common sense | **All four**: safety nets, writer-aware hints, smart defaults, player-side polish |

---

## 0. In short

Himawari works. Finalization makes it **effortless**:
- **Anyone can make a whole visual novel without writing code.** Every feature has a button, a picker, or a form.
- **People who code can still use text, git, the CLI, and C extensions on the same project**, at the same time, with nothing lost in between.
- **The games are tiny native programs** that start with a double-click on any Windows 10 or 11 PC, including old laptops, with nothing to install.
- **Studio itself installs with one click** and needs nothing else.
- **On top of that, it behaves like a thoughtful person would expect.** It never loses your work, it notices what a careful editor would notice, and it starts with good choices.
- The AI stays available but in the background, and translation appears only when you decide to translate.

It's done when **real writers who can't code** make, test, and export a small game without docs or help, in English or Japanese, and rate it highly. In the same rounds, **people who code** must find nothing in the way (§11, §12).

Status marks used below: ✅ already works · ◐ partly there · ⬜ new work.

---

## 1. The core concept

**Easy enough for anyone, open enough for coders, light enough for any PC.**

Three promises, each one testable:

| Promise | What it means | How we prove it |
|---|---|---|
| **1. No code needed, code welcome** | Every feature of the engine can be used through Studio's UI: pickers, forms, toggles, drag and drop. Nobody has to type script syntax, JSON, or commands. People who prefer text get the same project as plain `.hws` files, the Script view, `hwc`, git, and C extensions. Both ways edit the same files and can be mixed freely. | The **no-code test** (§11.3): every statement in the language, made with the Script view hidden. And the **coder test**: edits in text and in the UI round-trip without loss. |
| **2. Runs on any Windows PC** | A finished game runs on any Windows 10 or 11 PC (64-bit), including Arm laptops through Windows' own x64 emulation, low-end laptops with integrated graphics, and machines with no GPU driver. It starts in well under a second and uses little memory and battery. | A **device lab** (§11.4) and the budgets in §4. |
| **3. One click** | Studio installs with **one click**, with the runtime, templates, examples, fonts, and tools inside: no Node, Python, Git, compiler, SDK, or account. Export is **one button**. The game is **one double-click**, with no installer, no admin rights, and no internet. | A **clean-machine test** in Windows Sandbox with networking off (§11.5). |

Why C, in one sentence: a static, 2.6 MB executable with no DLLs and no runtime to install starts on anything that runs Windows 10, and a careful C core keeps memory and power use low on the weakest machines.

### 1.1 Two kinds of users, one project

| | Writes visual novels, doesn't code | Codes, or wants text and tools |
|---|---|---|
| **Writes** | Screenplay view: lines, choices, and stage directions as rows and forms | Script view or any text editor: `.hws` files |
| **Branches and logic** | "Remember that…", "Only if…", point counters, all in plain words (§3.1) | `$ var = …`, `if`, expressions |
| **Reuses steps** | "Saved steps" made from a selection (§3.1) | `define statement` macros |
| **Extends the engine** | Uses extensions others made, through generated forms | Writes C extension statements (`HW_EXTENSIONS`) |
| **Automates** | Buttons: Playtest every path, Export | `hwc check/build/playtest`, CI, git hooks |
| **Uses AI** (optional) | The assistant panel, `/` recipes | Claude Code through `himawari-mcp` |

Rules that keep both happy:
- **The UI never hides or rewrites what coders wrote.** Comments, formatting, and order stay (the lossless syntax tree, plan §5).
- Anything the UI can't show as a form is shown as one readable row, and stays editable.
- **Coder features never appear for writers who don't use them** (progressive disclosure, P7). Settings → Advanced has a "Show the Script view first" option for coders.

---

## 2. Principles for finalization

These sit on top of the ease-of-use principles P1–P12 (plan §2; P13–P15 there now match F9–F11) and are checked the same way.

| # | Principle | In practice |
|---|---|---|
| F1 | **Your work is never lost** | No action, crash, or full disk can destroy what you wrote. Anything deleted can be brought back. |
| F2 | **Behave like a thoughtful colleague** | Notice what a careful human editor would notice, say it once in plain words, and never nag or block. |
| F3 | **You're the author; the AI assists** | Every task can be done without AI. AI never acts unless you ask, and its controls are quieter than yours. |
| F4 | **Only show what this project uses** | One-language projects see no translation tools; projects without variables see no variable panels. |
| F5 | **Good choices by default** | A new project, an export, and a new game's settings are right without touching Settings. |
| F6 | **Games feel like good visual novels** | Players get the behavior they know from the genre (§8.4), without the developer configuring it. |
| F7 | **Ask before anything you can't undo** | Confirmation only where undo is impossible; everywhere else, act and offer Undo. |
| F8 | **Honest about limits** | When something can't work, say why and what to do, in one sentence. |
| F9 | **No code needed, code welcome** | Every feature has a UI; text, tools, and C stay first-class for those who want them (§3). |
| F10 | **Runs on any Windows PC** | Windows 10 and 11, weak hardware, no installs; budgets in §4. |
| F11 | **One click** | One click to install Studio, one button to export, one double-click to play (§5). |

---

## 3. No code needed, code welcome

### 3.1 Everything in the UI (no-code completeness)

Today the Screenplay shows stage directions, conditions, variable changes, and jumps as rows, but **editing them means typing script syntax** into a text box. Text styling (bold, colors, furigana, pauses) is also typed as markup. These are the gaps.

| # | Feature | The no-code way | Status |
|---|---|---|---|
| NC-1 | **Backgrounds and CGs** | A picker with thumbnails of `assets/bg` and `assets/cg`, and the transition with a live preview | ✅ (a form with thumbnails and the transition; session 19) |
| NC-2 | **Characters on stage** (show, hide, move) | Character → expression thumbnails → a position on a small stage diagram, with a transition picker | ✅ (character, expressions, position, transition) |
| NC-3 | **Sound** (music, sound effects, ambience, voice, stop) | A picker with a ▶ button, plus fade and volume as sliders | ◐ (picker with ▶ and fades; no volume slider yet) |
| NC-4 | **Waits and the textbox** (wait, textbox modes, novel mode, hide or show) | Small rows with a number or a toggle | ✅ |
| NC-5 | **Where the story goes** (jump, call, return, end) | "Go to scene ▾", "Visit scene ▾ and come back", "The end", with the scene picker (also drag on the graph: ✅) | ✅ |
| NC-6 | **Remembering things** (variables) | "Remember that *Hana trusts you*" (a yes/no), "Add *1* to *Hana's affection*" (a number), "Set *name* to …" (text). Creating a new one from the same form. Words, not `$ x += 1` | ✅ (yes/no, numbers, text; new ones from the same form) |
| NC-7 | **Conditions** (if, elif, else, option conditions, once) | "Only if *Hana's affection* *is at least* *3*", built from dropdowns, with *and* and *or*; on options, "Only if…" and "Only once" toggles | ✅ (dropdowns with and/or; "Only if…" and "Only once" on options) |
| NC-8 | **Text styling** | A small toolbar in the line editor: bold, italic, color, size, pause, speed, shake, **furigana** (select text → type the reading), "insert a remembered value" as a chip, "he/she/they by a choice" (select) | ◐ (toolbar with furigana and remembered values; "he/she/they" not yet) |
| NC-9 | **Saved steps** (macros) | "Save these steps as…" from a selection; parameters become blanks in a form | ⬜ |
| NC-10 | **Extension statements** | A form generated from the extension's signature (`extensions/*.schema.json`) | ✅ (a form from the signature) |
| NC-11 | **Project settings** (name, ID, version, resolution, start scene, languages, icon) | A Project page in Settings instead of `himawari.json` | ✅ (Settings → This game) |
| NC-12 | **Characters** (names per language, color, sprite groups, presets, bible) | The Characters page | ✅ (audit for anything only editable in the file) |
| NC-13 | **The look** (theme, layout, colors, fonts, UI words) | The UI Designer | ✅ (the UI's words are editable in the Designer) |
| NC-14 | **Gallery and music room** | A page listing what will unlock, with toggles | ✅ (Assets → Gallery and music room lists what unlocks and where; no toggles, since unlocks follow the story) |
| NC-15 | **Fixing problems** | Every diagnostic's quick fix opens the right form or applies the fix; never "edit the text" | ◐ |
| NC-16 | **Files the writer shouldn't need**: `himawari.json`, `*.schema.json`, `theme.json`, locale JSON | Hidden from the Explorer unless Settings → Advanced → "Show project files" is on | ✅ |
| NC-17 | **AGENTS.md** (notes for AI helpers) | Plain prose, edited as text; that's writing, not code. Shown only when AI help is set up | ✅ |

Design rules for these forms:
- **One row, one sentence.** "Show **Hana** (smiling) **on the left**, fading in", not `show hana smile at left with fade(300)`.
- Every picker shows **what exists** (thumbnails, names, ▶ sounds), and offers **"+ New…"** in place.
- Missing assets stay allowed (P5): a placeholder shows, and the picker marks it "not drawn yet".

### 3.2 Code welcome

| # | For people who code | Status |
|---|---|---|
| C-1 | `.hws` files stay plain, readable, git-friendly text; the UI's edits are minimal and keep comments and formatting | ✅ (lossless syntax tree, property-tested) |
| C-2 | The Script view: highlighting, completion, go to definition, rename, quick fixes | ✅ |
| C-3 | **Every row has "Show as script"** and the Script view has "Show as screenplay" at the cursor | ◐ (the views switch; the per-row toggle is new) |
| C-4 | `hwc` comes with Studio (no separate Node install) and works from any terminal | ✅ (`himawari-tools.exe` inside Studio; Settings → Advanced puts `hwc` on PATH) |
| C-5 | Extensions in C (`HW_EXTENSIONS`) with a documented, versioned API and a sample | ◐ (works; docs and sample to finish) |
| C-6 | Any external editor works alongside Studio (changes picked up live; conflicts asked about, S-6) | ◐ |
| C-7 | Settings → Advanced: "Show the Script view first", "Show project files", "Show line IDs" | ◐ (Script view first and project files; line IDs not yet) |

---

## 4. Runs on any Windows PC

| # | Item | Status |
|---|---|---|
| RA-1 | **What "any Windows PC" means:** Windows 10 and 11, 64-bit. Arm laptops run the x64 game through Windows 11's built-in emulation (Prism). Windows 7 and 8.1 are out: Microsoft no longer supports them, and the C runtime library the game uses (UCRT) is built into Windows 10 but needs an update there (see question Q8). | ◐ (state it, test Arm) |
| RA-2 | **No dependencies:** one static exe, no DLLs, no Visual C++ redistributable, no .NET, no DirectX installer | ✅ (static link, 2.6 MB) |
| RA-3 | **Weak hardware works:** integrated graphics, 4 GB RAM, a hard disk, 1366×768. With no usable graphics driver (some VMs, Remote Desktop), the game falls back to software rendering instead of failing. | ✅ (software fallback done in the runtime) |
| RA-4 | **Quick to start:** first frame ≤ 250 ms on an SSD and ≤ 1.5 s on a hard disk. Games with rule wipes: GPU start moved off the critical path (Phase 5 follow-up). | ◐ (135 ms measured; about 350 ms with rule wipes) |
| RA-5 | **Small:** memory ≤ 150 MB for a 1080p scene; images decoded at display size when much larger | ◐ (≤ 106 MB measured; large-image downscaling is new; HW0358 points out oversized images) |
| RA-6 | **Kind to batteries:** when nothing moves (waiting for a click), the game stops redrawing every frame. It wakes for input, blinking, or animations. CPU near zero while idle. | ✅ (done in the runtime: idle CPU 0–0.2 %) |
| RA-7 | **High DPI and multiple monitors**; windows that come back where they were | ✅ (window place remembered in the runtime) |
| RA-8 | **Any path:** Japanese characters in the folder or user name, long paths, read-only folders, USB sticks | ✅ (verified in the runtime; Studio's side is in the torture tests) |
| RA-9 | **No admin, no internet, no install** for games; saves go to the player's AppData under the game's name | ◐ (verify) |
| RA-10 | **No false alarms:** no exe packers (they trigger antivirus); the download page explains SmartScreen for unsigned or new games, and how developers can sign theirs | ⬜ (docs) |

---

## 5. One click

| # | Item | Status |
|---|---|---|
| OC-1 | **The usual Windows setup** (your choice): a normal installer wizard (Welcome → install for me only (no admin) or for everyone → folder → Install → "Run Himawari Studio"). It installs everything Studio needs; nothing else has to be installed first. A portable zip stays available. | ✅ (NSIS wizard: per-user or all users, folder, run after finish) |
| OC-2 | **Everything inside:** runtime, templates, examples, fonts, the MCP server, and `hwc` | ✅ |
| OC-3 | **No Node needed for tools:** `hwc` and `himawari-mcp` run from a small executable inside Studio (`himawari-tools.exe`), and Studio puts `hwc` on the user's PATH when you ask (Settings → Advanced; D63) | ✅ (a Node single executable; Studio itself never runs as Node, its fuses keep that off) |
| OC-4 | **First launch:** no account, no sign-in, no network; straight to the Welcome screen in Windows's language | ◐ |
| OC-5 | **Export is one button:** "Export game" → `<Game>` folder and a zip, then "Play it" and "Show in folder". It remembers its last settings, and there's nothing to configure the first time. | ◐ (export, "Play it", and "Show in folder"; remembering settings to check) |
| OC-6 | **Optionally one file:** "Single file" export puts the data pack inside the exe (like Godot's "Embed PCK"), so a game is literally one file to send. Folder export stays the default, because patches (`patch*.hwp`) work best with a separate pack. | ✅ (Build → "Put the whole game in one file", `hwc build --release --single-file`; patches still apply) |
| OC-7 | **The game is one double-click:** a fresh Windows PC, an unzipped folder (with the downloaded-file mark), and no prompt but SmartScreen's | ◐ (test in Sandbox) |
| OC-8 | **One-click updates** of Studio, never during an export; release notes in plain words | ⬜ (launch item) |
| OC-9 | **Clean uninstall** from Windows Settings: projects are never touched; it asks whether to keep Studio's settings and history | ◐ (projects and settings are kept; asking is new) |
| OC-10 | **Crediting Himawari, kindly:** the first export of each project asks once how to credit the engine, remembers the answer, and offers to change it later in Settings → Project. Never a splash screen; never forced: the runtime's zlib license makes credit "appreciated but not required". Choices (**optional; the default is credits only**, your answer to Q11):<br>· **Credits only** (default): `CREDITS.txt` and the exe's file properties, nothing visible in play<br>· **A small "Made with Himawari" line on the title screen**, styled by the theme and placed in the UI Designer<br>· **The window title**: "Game Title (made with Himawari)"<br>The exe's file properties ("Made with Himawari" in its description) and `CREDITS.txt` carry the credit in every choice; they're invisible in play. | ✅ (asked at the first export, changeable in Settings; the title-screen line and the window title are drawn by the runtime) |

---

## 6. AI: present but quiet

The AI stays a development assistant (plan §1.5: no media generation, ever). Finalization makes it **secondary in the interface**, not just in principle.

| # | Change | Status |
|---|---|---|
| AI-1 | The assistant panel **starts closed** in every new workspace. It remembers whether *you* opened it. | ✅ |
| AI-2 | The **AI Proposals** tab appears only once a proposal exists (from the assistant or a connected Claude app). | ✅ |
| AI-3 | AI buttons (such as "Translate with AI") use the quiet secondary style, sit after the human actions, and say "AI" plainly. Tools that only look like AI stay prominent: "Playtest every path" is the engine, not AI. Nothing AI-related appears on the Welcome screen or in the New Project wizard. | ◐ |
| AI-4 | Settings: AI options move into one section at the bottom, **"AI help (optional)"**: connect your Claude app, or add an API key. It says what is sent where. | ✅ |
| AI-5 | The assistant's default model becomes **Claude Sonnet 5.5** (half Opus's price); Opus stays one click away. | ✅ |
| AI-6 | **Every AI feature has a human path**, reachable without a key: | ✅ mostly |
| | · Continuity → the engine's hints and your own notes · Translation → the Localization table, CSV/XLIFF · Proofreading → search and replace · Route balance → the graph's route coloring · Playtest report → "Playtest every path" | |
| AI-7 | AI never runs on its own: no background calls, no suggestions while you type, no AI on project open. | ✅ (keep) |
| AI-8 | Review notes are presented as **your** to-do list first ("Notes"); notes the AI left carry a small "AI" label. | ◐ |
| AI-9 | Wording: "assistant", "suggestion", "proposal", never "AI will write your story". The docs' first pages don't start with AI. | ◐ (docs and the agent guide reworded; full review at launch) |

---

## 7. Translation: optional

| # | Change | Status |
|---|---|---|
| T-1 | New projects are **one language**. The wizard asks only "What language do you write in?"; translating is a later, separate decision. | ✅ |
| T-2 | **Localization** leaves the sidebar until the project has a second language. Adding one stays easy: Settings → Project → "Translate this game…", the command palette, and the Explorer's Languages section. | ✅ |
| T-3 | Translation diagnostics (HW04xx), the glossary, and language pickers appear only with a second language. | ◐ |
| T-4 | The shipped game shows no language menu for one-language games. | ✅ |
| T-5 | "Translate with AI" exists only when translation is on **and** AI help is set up. | ✅ |
| T-6 | **Removing a language** is possible and safe: the table goes to the Recycle Bin, with Undo. | ✅ |
| T-7 | Line IDs stay on every line even in one-language projects (saves, read tracking, and notes depend on them), hidden. | ✅ |

---

## 8. "Human-like common sense"

A good human collaborator:
- doesn't lose your things,
- tells you once, kindly, when something looks wrong,
- doesn't make you fill in what they could guess,
- and finishes the job so the result works for the next person: the player.

### 8.1 Safety nets (Studio and CLI): F1, F7

| # | Item | Status |
|---|---|---|
| S-1 | **Atomic saves with retries:** temporary file, then rename; retry when antivirus or OneDrive holds the file; say so plainly if it still fails, keeping your text in memory. | ✅ (reads and writes retried while held; plain message when it still fails) |
| S-2 | **Local history on disk** (like VS Code's): a copy of each changed file on save, merged while you type, kept outside the project, about 50 versions per file; restore yesterday's version even after a restart. | ✅ |
| S-3 | **Deletes go to the Recycle Bin** (scripts, characters, assets, languages), with Undo. | ✅ |
| S-4 | **Crash recovery:** after an unexpected close, the next start says what was restored. | ✅ |
| S-5 | **One Studio per project:** opening an already open project brings that window forward. | ✅ |
| S-6 | **Changes from outside** (another editor, git, OneDrive) are picked up; when the same file changed in both places, Studio asks which to keep, showing both. Never merges silently. | ✅ |
| S-7 | **OneDrive's conflict copies** are recognized and explained, with a comparison. | ◐ (recognized and explained; compare through Versions) |
| S-8 | **A restore point before big changes:** wide renames, accepting many AI proposals, imports, theme packs. | ✅ |
| S-9 | **Confirmation only when there's no undo:** clearing history, overwriting an export folder, deleting a save slot. | ◐ (audit) |
| S-10 | **Low disk space** warnings before export and when saving fails. | ◐ (export checks free space; saving failures say so) |
| S-11 | **Robust to clock changes:** builds decide what's stale from content, not timestamps. | ✅ (builds always compile from content; torture-tested) |
| S-12 | **Project format versioning:** a newer project says so; an older one is upgraded only after asking, with a restore point. | ◐ (a newer project says so; no older format exists yet) |

### 8.2 Writer-aware hints: F2

Hints are **info-level** and worded like an editor's margin note. Each is shown once per place, each kind can be muted per project, and none blocks building or playing.

| # | A careful editor would notice… | Status |
|---|---|---|
| W-1 | A speaker name that's almost a character's name | ✅ |
| W-2 | A line too long to fit the textbox at the game's text size, in each language | ✅ (HW0357) |
| W-3 | A menu with a single option, or two options with the same text | ✅ (HW0350, HW0351) |
| W-4 | The same line twice in a row | ✅ (HW0352) |
| W-5 | An empty scene, or a scene with no way on | ◐ (HW0320) |
| W-6 | A character who never speaks; an asset or expression never used | ✅ (HW0355; unused assets are badged) |
| W-7 | A character speaking after being hidden | ✅ (HW0340) |
| W-8 | A flag nothing checks; a condition that can never change | ✅ (HW0341, HW0342) |
| W-9 | An unreachable ending; a route much shorter than the others | ✅ |
| W-10 | An image far larger than the game's resolution, or the wrong shape for a background | ✅ (HW0358, HW0359) |
| W-11 | Two files whose names differ only in case | ✅ (HW0356) |
| W-12 | Unbalanced quotes or brackets in a line, doubled spaces, mixed "..." and "…" | ◐ (HW0353, HW0354; mixed "..." and "…" not yet) |
| W-13 | A glossary term translated two ways | ◐ |
| W-14 | A renamed character still named the old way in narration: an offer, not an automatic change | ⬜ |

**Restraint:** at most one hint per line in the gutter; hints never pop up; Problems lists them under "Suggestions", below real problems; the status bar counts only errors and warnings.

### 8.3 Smart defaults: F5

| # | Default | Status |
|---|---|---|
| D-1 | The project ID comes from the name; the folder defaults to `Documents\Himawari`; the wizard remembers the last folder. | ✅ |
| D-2 | Studio's language follows Windows on first launch, then remembers your choice. | ◐ |
| D-3 | A game's first-launch language follows the player's Windows language when the game has it. | ⬜ (check) |
| D-4 | Export names the exe after the game, with its **icon** and version. | ✅ (icon, version, and "Made with Himawari" in the file properties) |
| D-5 | Studio reopens the last project, open files, view, and panel sizes. | ◐ |
| D-6 | New characters get distinct pastel colors; new scenes unique names; imported sprites are sorted by layer. | ◐ |
| D-7 | Plain words: no "bytecode", "AST", "MCP", or "Mode A/B" outside Settings → Advanced. | ◐ (Settings reworded; a full pass at launch) |
| D-8 | Empty states teach what goes there and offer the first action. | ◐ |
| D-9 | Windows shortcuts (Ctrl+S says "Saved automatically"; Ctrl+Z/Y; F5 plays), listed in Help. | ◐ (Ctrl+S, Ctrl+Z, F5, listed in Settings; no Ctrl+Y outside text boxes) |

### 8.4 Player-side polish (the runtime): F6

The genre baseline is Ren'Py's defaults (RESEARCH §17.6).

| # | Behavior | Status |
|---|---|---|
| P-1 | Skip passes read text only (an option allows unread) | ✅ |
| P-2 | Quitting asks first and says how long ago the last save was; **autosave on quit and at each choice** keeps Continue safe | ✅ (autosave and the time since the last save in the runtime) |
| P-3 | "Continue" on the title screen resumes the latest save | ✅ |
| P-4 | Overwriting a save asks first; slots show a thumbnail, date, and scene | ✅ (done in the runtime) |
| P-5 | Settings, window size, position, and fullscreen are remembered | ✅ (done in the runtime) |
| P-6 | A sensible window size for the player's screen; Alt+Enter and F11 for fullscreen | ✅ (done in the runtime) |
| P-7 | Audio keeps playing when unfocused, with an option to mute in the background | ✅ (done in the runtime) |
| P-8 | Mouse wheel for history and rewind; right-click hides the textbox or opens the menu; gamepads work when plugged in mid-game | ◐ |
| P-9 | No language menu in one-language games | ✅ |
| P-10 | Runs from a read-only folder and a Japanese path; saves in AppData under the game's name | ✅ (verified in the runtime) |
| P-11 | A game that can't start says why in plain words | ◐ |
| P-12 | Accessibility settings apply everywhere, including custom themes | ✅ |

---

## 9. Things you might have forgotten

**Trust and privacy**
- A one-page privacy statement: Himawari sends nothing anywhere; only AI help, when you set it up, sends text to Anthropic or your Claude app.
- No telemetry. Crash reports stay on disk until the user chooses to share them.
- "Report a problem": a pre-filled GitHub issue with versions and the error, never project text or paths unless the user adds them.

**Windows realities** (RESEARCH §17.3–17.4, §17.7)
- A Japanese (non-ASCII) user name, in Studio, the tools, and exported games.
- `Documents` inside OneDrive, including online-only files.
- Long paths in deep route folders.
- Antivirus scanning while saving and exporting.
- A small screen (1366×768) and high DPI (150–200 %).
- An Arm laptop.
- A PC or VM with no graphics driver.
- Studio installed per user (no admin rights).
- SmartScreen warns about early releases even when signed: explain it, don't promise it away.

**Updates and versions**
- One-click Studio updates (OC-8); a project made by a newer Studio (S-12).
- A game update (`patch*.hwp`) keeps players' saves: test with a real edited game.
- An About box with versions and third-party licenses.

**Shipping a game**
- The exe's icon, version, and company name (plan §14.4).
- `CREDITS.txt` and font licenses (exists); an easy way to add the developer's own credits.
- Template and example content licensed so people can ship games built on them (Q5).
- `hwc report ai-content` mentioned at export only if AI-written text exists.
- A ready-to-upload zip (butler integration is in the launch half).

**Learning and help**
- The tutorial project, redone for no code, no AI, and one language.
- "What's this?" on every panel, linking a short help page (EN and JA); a shortcuts sheet.
- Examples open as a copy (already the case).

**Studio's own accessibility and comfort**
- Every action reachable by keyboard, visible focus, labels for Narrator.
- UI zoom and reduced motion.
- WCAG AA contrast in both themes (checked automatically, §11.6).

**Project hygiene**
- Japanese UI strings reviewed by a native speaker before v1.0.
- A default `.gitignore` in new projects.
- `LOG.md`, the plan, and CLAUDE.md updated as items land.

---

## 10. Order of work

Rough estimates, one developer with AI help, as so far.

| Stage | Contents | ⏱ |
|---|---|---|
| A. Quiet AI, optional translation | §6, §7 | 0.5 week |
| B. No-code forms | §3.1 NC-1 to NC-11, NC-15, NC-16, in that order (the story's everyday statements first) | 3 weeks |
| C. Safety nets | §8.1, with the torture tests | 1.5 weeks |
| D. Any PC, one click | §4, §5, and the device lab | 1.5 weeks |
| E. Common-sense review | the heuristic evaluation, walkthroughs, and audit (§11.1); fix the cheap findings | 0.5 week |
| F. Hints, defaults, code-welcome items | §8.2, §8.3, §3.2, the rest of §3.1 | 1.5 weeks |
| G. Player polish | §8.4, the players' test | 1 week |
| H. Usability rounds 1–3 with fixes | §11.2 | 2–3 weeks (mostly waiting for testers) |
| I. Release readiness | clean machines, accessibility, updates, dogfooding (§11.5–13.8) | 1 week |
| J. Launch | the plan's Phase 8 launch items | 3 weeks (as planned) |

**Total ≈ 16–17 weeks** for the merged Phase 8 (was 3). Stages A–G can overlap with recruiting testers for H.

---

## 11. How we test it (RESEARCH §17)

### 11.1 Expert review first
1. **Heuristic evaluation** of every Studio and game screen against Nielsen's ten heuristics, weighting *user control and freedom* and *error prevention*. Each finding gets a severity (0–4) and an owner.
2. **Cognitive walkthrough** of the core tasks (§11.2), asking at each step:
   - Will a first-time user know what to do next?
   - Will they see the control for it?
   - Will they understand that it does what they want?
   - Will they see that it worked?
3. **Audit:** every item in §3–§9 marked ✅, ◐, or ⬜ on the real build.

### 11.2 Usability rounds
- **Three rounds**, each with **5–6 writers who don't code** (3 working in English, 3 in Japanese), plus **2 people who code**. Problems are fixed between rounds.
- **Think-aloud**; the moderator doesn't help; sessions recorded with consent.
- **Core tasks** (no docs, no AI unless the task says so):
  1. Install Studio from the download.
  2. Make a new project and change the first line; see it in the game.
  3. Add a character with expressions from your own images.
  4. Write a scene with a background, music, two characters, and a choice that leads to two endings; play both.
  5. Make one choice count: remember it, and show a different line later because of it.
  6. Find and fix a planted mistake.
  7. Restyle the textbox and colors.
  8. Get back a deleted scene, and yesterday's version of a file.
  9. Export the game and run it.
  10. *(Round 2 on)* Add Japanese as a second language and translate three lines by hand.
  11. *(Optional)* Ask the assistant to proofread a scene, and accept one suggestion.
  12. *(Coders)* Do task 4 in the Script view or their own editor, then switch to the Screenplay and back. Check git shows only their change.
- **Measures:**
  - Task completion.
  - Time on task.
  - The **Single Ease Question** after each task (1–7).
  - The **System Usability Scale** at the end.
  - Every moment of confusion, with what they expected instead.
  - Any moment a non-coder had to type script syntax. That's a failure of F9, whatever else happened.
- **Targets by round 3:**
  - Every core task completed by at least 5 of 6 writers.
  - Nobody types script syntax.
  - Average SEQ **≥ 5.5** on every task.
  - SUS **≥ 80** (top 10 %), with 68 as the floor.
  - With 6 people the numbers are directional. The observed problems decide what to fix.
- The M2 and Phase 6 hallway tests are folded into round 1.

### 11.3 The no-code test and the coder test (automated)
- **No-code:** an e2e suite that, **with the Script view disabled**, creates every statement kind in `spec/llm-reference.md` through the UI alone:
  - lines and choices,
  - every stage direction,
  - variables and conditions,
  - text styles and furigana,
  - a saved step (macro),
  - an extension call,
  - project settings.

  Then it compiles and plays the result. A language feature without a UI path fails CI.
- **Coder:** property tests already check that UI edits keep text intact. Add an e2e step: hand-written `.hws` with comments and unusual formatting, edited through every form, keeps everything it didn't change (a byte-for-byte diff outside the edited line).

### 11.4 Device lab (any PC)

| Machine | Checks |
|---|---|
| Low-end laptop: integrated graphics, 4–8 GB RAM, hard disk, 1366×768, 150 % scaling | Start time, frame rate, memory, idle CPU and battery drain (RA-3 to RA-6) |
| Arm laptop (Snapdragon), Windows 11 | The x64 game through emulation; Studio (x64 Electron) through emulation |
| A VM with no GPU driver, and Remote Desktop | The software-rendering fallback (RA-3) |
| Windows 10 22H2, clean | Oldest supported OS |
| Japanese Windows with a Japanese user name | Paths, input (IME) in Studio, fonts |

### 11.5 Clean machines and one click
- **Windows Sandbox** (`.wsb`, networking off, the installer mapped read-only), for each release candidate:
  1. Install Studio with one click and see it open.
  2. Make a project from a template and export it, all offline.
  3. Copy the zip to a fresh Sandbox and unzip it, with the downloaded-file mark.
  4. Double-click the exe and see it run.
- **Updates:** install the previous release, update, and check that projects, settings, and the API key survive.
- **SmartScreen:** download the candidate as a user would, and check the download page's explanation matches.

### 11.6 Accessibility
- `@axe-core/playwright` in the Studio e2e suite (WCAG 2.2 AA tags, both themes, every main panel and form). A new violation fails CI.
- A manual keyboard-only and Narrator pass on the core tasks.
- The game: its accessibility settings against the Game Accessibility Guidelines' basic list, checked by a player who uses them.

### 11.7 Never-lose-work torture tests

| Scenario | Expected |
|---|---|
| Kill Studio during a save | The file is old or new, never half-written; the next start says what was restored |
| Full disk | "No space", the text stays in memory, nothing truncated |
| Read-only project folder | Opens read-only and says so |
| `Documents` in OneDrive, online-only files, a conflict copy | Opens, saves, explains the conflict copy |
| Japanese user name and project path | Studio, tools, and exported games all work |
| A 300-character project path | Works, or explains the limit first |
| Antivirus scanning every write | Saves succeed (retries) |
| Two Studio windows on one project | The second brings the first forward |
| The clock moved backwards | Builds still rebuild |
| The same file edited outside and inside Studio | Asks which to keep |

### 11.8 Players and dogfooding
- **Players:** 3–5 visual novel players play an exported sample (no Studio) on their own PCs. Check §8.4, and ask what felt unlike the VNs they know.
- **Dogfooding:** one complete small game (about 30 minutes, two routes, one language) made **without code and without AI**, from the one-click installer on a clean PC, with every moment of friction logged. Then add Japanese, once by hand for a scene and once with "Translate with AI".

### 11.9 Keeping it fixed
Every fixed issue gets a regression test where it can:
- a unit test for a hint (W-*),
- an e2e step for a Studio behavior or form (S-*, NC-*),
- a runtime smoke test for a player or platform behavior (P-*, RA-*).

---

## 12. Done means

- [ ] Every item in §3–§8 is ✅, or moved to "after v1" on purpose with a reason.
- [ ] **The no-code test passes:** every language feature can be made in the UI (§11.3).
- [ ] **No round-3 writer typed script syntax** to finish a core task.
- [ ] The coder test passes, and the round-3 coders found nothing in their way.
- [ ] The device lab passes (§11.4): the low-end laptop meets the budgets, the Arm laptop and the GPU-less VM run games.
- [ ] One-click install and double-click play pass in a fresh Windows Sandbox with no network (§11.5).
- [ ] The torture tests pass (§11.7).
- [ ] Round 3 meets its targets: every core task completed by at least 5 of 6 writers, SEQ ≥ 5.5 on every task, SUS ≥ 80.
- [ ] No open severity-3 or severity-4 findings.
- [ ] axe: no WCAG 2.2 AA violations; the manual keyboard and Narrator pass completed.
- [ ] A complete small game was made without code and without AI (§11.8).
- [ ] The Japanese UI was reviewed by a native speaker.
- [ ] `corepack pnpm check`, the e2e suite, ctest (debug and ASan), and the golden images pass.

---

## 13. Questions for you

**Answered 2026-10-20:** you accepted the suggestions for 1, 2, 6, 8, 9, and 10, and answered 5:
- **1:** a per-project AI-off switch; "present but quiet" stays the default.
- **2:** Sonnet 5.5 is the assistant's default model.
- **5:** template and example *content* is CC0, but **the engine should be credited** (OC-10, Q11).
- **6:** games autosave on quit and at each choice.
- **8:** Windows 7 and 8.1 are left out.
- **9:** folder export by default, single file as an option.
- **10:** changed: **the usual Windows installer wizard** (OC-1), with the portable zip too.
- **11:** crediting Himawari is **optional**; the default is credits only (`CREDITS.txt` and file properties), so nobody is annoyed. The title-screen line and the window title are opt-in.
- **3, 4, 7:** my suggestions, as you asked:
  - Testers: start with whoever you can reach (at least 3 + 3 writers and 1–2 coders per round). Fewer people means more rounds, not skipped rounds.
  - Signing: ship the betas unsigned, with the SmartScreen explanation on the download page. Before v1.0, sign with Azure Artifact Signing if the publisher's country is eligible, else an OV certificate.
  - Nothing in §9 is cut.

**Nothing is open.**

1. **An "AI off" switch.** You chose "present but quiet", without a switch. The plan (§10.9) promised a per-project "AI off" switch, for teams or schools that don't allow AI. Keep a simple switch in Settings that hides AI completely, while the default stays "present but quiet"? *My suggestion: yes.*
2. **The assistant's default model.** Switch from Opus 5.5 to Sonnet 5.5 to keep costs low for new users? *My suggestion: yes.*
3. **Testers.** Can you recruit 3 English-writing and 3 Japanese-writing non-coders, plus 2 coders, per round? If not, how many?
4. **Code signing.** Which country will the publisher be registered in? Azure Artifact Signing's public trust is limited to some regions (reported: USA, Canada, EU, UK). Otherwise we buy a standard (OV) certificate, or ship the first betas unsigned with a clear explanation.
5. **Template license.** Can template and sample content be CC0, so people can ship games built on them without credit?
6. **Autosave in games (P-2).** Autosave on quit and at each choice, on by default, in one hidden slot? *My suggestion: yes.*
7. **Anything in §9 to cut**, or anything missing you've seen go wrong in other tools?
8. **Windows 7 and 8.1.** "Any Windows PC" here means Windows 10 and 11 (about 94 % of Steam users run one of them; Microsoft no longer supports 7 or 8.1). Supporting 7 and 8.1 would need the UCRT update on those PCs, or a different C runtime, plus testing on unsupported systems. Leave them out? *My suggestion: yes, leave them out, and say so on the download page.*
9. **Single-file export (OC-6).** Offer it as an option, with the folder as the default (better for patches)? Or make one file the default?
10. **Installer choice (OC-1).** One click with no folder question, and the portable zip for people who want a custom place. Is that all right, or should one click still show a small "Customize" link?
11. **The default credit (OC-10).** A small "Made with Himawari" line on the title screen, or the window title? *My suggestion: the title-screen line as the default, and the window title as an option.*
