# Contributing to Himawari

Thank you for wanting to help! Himawari is a visual novel engine that should be **easy enough for anyone, open enough for coders, and light enough for any Windows PC**. Every contribution, from a typo fix to a new feature, should move toward that.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first, and [GOVERNANCE.md](GOVERNANCE.md) to see how decisions get made.

## Ways to help
- **Try it and tell us what confused you.** A writer getting stuck is a bug, even if nothing crashed. Open an issue.
- **Fix a small thing.** Issues labelled `good first issue` are meant for this.
- **Translate.** Studio's Japanese text needs native-speaker review, and other UI languages are welcome after v1.
- **Improve the docs.** They live in [`docs/`](docs/index.md). Plain, friendly wording beats clever wording.
- **Propose a bigger change** through an [RFC](#changing-the-language-or-a-spec-the-rfc-process).

If you're unsure whether a change fits, open an issue or a Discussion first. It saves everyone time.

## What Himawari won't do
Some things are decided already, so please don't spend effort on them. The full list is in [GOVERNANCE.md](GOVERNANCE.md#not-planned). The short version: no Linux support before v1, no AI-generated images, audio, voice, or video (ever), and no live AI inside shipped games.

## Setting up
Himawari is **Windows only** (Windows 10/11, 64-bit), for games and for development. You need:

- Git, Node.js 24 or newer, and pnpm (used through corepack: `corepack pnpm …`).
- For the runtime: MSYS2 **UCRT64** with GCC, CMake, and Ninja on your `PATH`. Setup is in `planning/DETAILED_PLAN.md` §14.2.

### The TypeScript parts (compiler, CLI, MCP, Studio)
```bash
corepack pnpm install
```
```bash
corepack pnpm check
```
`check` runs the type checks, the linter, all tests, and the Studio text check. Run it before you open a pull request. Afterwards the command-line tool is `node packages/cli/dist/main.js` (we call it `hwc`).

### The runtime (`himawari.exe`)
From `runtime/`:
```bash
cmake --preset win64-debug
```
```bash
cmake --build --preset win64-debug
```
```bash
ctest --preset win64-debug
```
The first configure downloads the pinned libraries and checks their hashes. Use `win64-release` for the shipping build. `win64-asan` and `win64-fuzz` need MSYS2 CLANG64 (see CLAUDE.md for how).

### Studio
```bash
corepack pnpm --filter @himawari/studio dev
```
Studio's preview needs the runtime built. To test the end-to-end flows, run `corepack pnpm --filter @himawari/studio e2e`. Set `HIMAWARI_STUDIO_TEST_HOME` to a throwaway folder when testing, and never point it at real data.

## Which tests to run
| You changed… | Run |
|---|---|
| Anything in TypeScript | `corepack pnpm check` |
| The script language, validator, or compiler | `corepack pnpm vitest run tests/conformance`. **Conformance tests are required** for every language change. Regenerate expected files with `UPDATE_CONFORMANCE=1` and review the diff. |
| The runtime (`runtime/`) | `ctest --preset win64-debug` from `runtime/`. If you changed the VM or the loaders, also run the conformance transcripts and, where you can, the fuzz preset. |
| How things look (runtime UI, themes, text) | `corepack pnpm vitest run tests/golden` (needs a built runtime). Regenerate with `HW_UPDATE_GOLDEN=1` and look at every image. |
| Packs or patches | `corepack pnpm vitest run tests/packs` |
| A template or example | `corepack pnpm vitest run tests/projects.test.ts`. They must check clean and compile. |
| Studio | `corepack pnpm check`, and `corepack pnpm --filter @himawari/studio e2e` for flows you touched |

Pull requests need a passing CI run before they can be merged.

## Rules that protect the project
These come from the plan and are checked in review:

- **Core is the only authority on the language.** The parser, validator, and compiler live in `@himawari/core`. Studio, `hwc`, and the MCP server all use it. Don't write a second parser.
- **The runtime never parses source text.** It plays compiled bytecode (`.hwb`) and packs (`.hwp`). Content errors in the runtime must never `abort()`.
- **`core/` in the runtime has no SDL and no I/O**, and `text/hw_layout.c` has no SDL and no font library. Keep them portable.
- **AI is a development assistant only.** No image, audio, voice, or video generation, and no AI running inside a shipped game.
- **AI edits are validated proposals** anchored on line IDs, never line numbers or diffs.
- **Windows only.** Don't add Linux presets, jobs, or code paths.

## Studio text must be translatable
**Never hard-code a user-visible string in Studio.** Every message is an ICU message in `packages/studio/locales/`:

- Add the English text to `en.json` and the Japanese text to `ja.json`, with the **same key and the same placeholders**. English is the default, and Japanese is required.
- Use ICU syntax for plurals and variables (`{count, plural, one {# line} other {# lines}}`), never string concatenation.
- Write for a non-programmer: short, friendly, no jargon.
- A lint rule and `corepack pnpm check:i18n` fail the build if a string is hard-coded or the two files disagree. If you aren't sure of the Japanese, write your best attempt and say so in the pull request, and a reviewer will check it.
- Don't write colors directly in Studio's CSS. Use the tokens in `styles.css` so the light, dark, and match-Windows themes keep working.

## Changing the language or a spec: the RFC process
Anything that changes the Script Data Contract (`spec/`: the language, bytecode, schemas, or pack format), or any engine decision that needs a written record, goes through an RFC. The steps are in [`rfcs/README.md`](rfcs/README.md):

1. Copy `rfcs/0000-template.md` to `rfcs/NNNN-short-title.md` with the next free number.
2. Open a pull request. Discussion happens there.
3. The project lead accepts or rejects it. Accepted RFCs are merged with status **Accepted**.
4. The spec change itself follows in its own pull request, with conformance tests. Spec versions bump according to `planning/DETAILED_PLAN.md` §5.6.

Bug fixes, docs, and changes that don't touch the contract don't need an RFC.

## Making a pull request
1. Fork the repo and make a branch.
2. Keep the change focused: one idea per pull request.
3. Add or update tests. Add Studio messages in both languages.
4. Run the tests in the table above.
5. Open the pull request and say **what** changed and **why**. Screenshots help for anything visual.

### Commit style
- A short summary line in plain English, in the imperative: "Fix save loading after a scene rename", not "Fixed" or "fixes".
- If it needs more, leave a blank line, then a few lines saying what and why. Bullets are fine.
- Mention the RFC or issue when there is one (`rfcs/0011`, `#123`).
- **Sign off every commit** (`git commit -s`). That adds a `Signed-off-by:` line, which means you agree to the [Developer Certificate of Origin](https://developercertificate.org/): you wrote the change, or have the right to submit it, under the project's license.
- Don't mix formatting-only changes with real ones.

## Licenses
By contributing, you agree that your work is released under the license of the part you changed:

| Part | License |
|---|---|
| Runtime (`runtime/`) | zlib ([LICENSE-zlib](LICENSE-zlib)) |
| Tooling (`packages/`, `scripts/`, `tests/`) | MIT ([LICENSE-MIT](LICENSE-MIT)) |
| Specs (`spec/`) and RFCs (`rfcs/`) | CC BY 4.0 ([spec/LICENSE.md](spec/LICENSE.md)) |
| Templates and example content (`templates/`, `examples/`) | CC0 1.0 (a `LICENSE` file in each folder) |

Please don't add code or assets with licenses that don't fit, and add any new third-party dependency to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Anything copyleft needs a conversation first.

## Reporting security problems
Please **don't** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Questions
Use GitHub Discussions on [PastelSalt/himawari-c](https://github.com/PastelSalt/himawari-c). We're glad you're here. 🌻
