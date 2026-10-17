# RFC 0004: Bytecode additions before the 1.0 freeze

- **Status:** **Accepted** 2026-10-17 (Phase 2 start; the owner asked to continue with Phase 2, and these changes are needed to finish it)
- **Created:** 2026-10-17
- **Affects:** `spec/bytecode.md` (still a draft, major 1 minor 0), `spec/ast.schema.json`, `@himawari/core` (compiler, writer, reader, disassembler, formatter, l10n), the C loader
- **Plan references:** §5.4, §5.6, §7, §8.4, §8.5, §18 Phase 2

## Problem
The Phase 1 bytecode draft was enough to compile scripts, but not to run a game:
1. The runtime can't open a window of the right size or name it: the resolution, title, and character positions live only in `himawari.json`, which the runtime never reads (D01).
2. The Phase 2 exit needs the starter game to play in English and Japanese, but translations stayed in `locales/*.json` (Phase 1 left `LOCx` "reserved").
3. Menu prompts had no line ID, so they couldn't be translated, voiced, or tracked as read.
4. The draft loader rules left gaps the C loader must close before the "no further bounds checks" promise holds: string operands of story ops weren't range-checked, and a `SELECT` case could name its own text (an infinite loop when evaluated).
5. The RNG wasn't specified, so `rand()` results (and conformance transcripts) would depend on the implementation.

## Decision
Since the format isn't frozen yet (it freezes at the end of Phase 2), change **1.0 in place** instead of bumping the minor version:
- **`META` (required):** title, id, resolution, source language, every offered language (source first), and named positions in 1/10000 of the canvas.
- **`LOCL` (optional):** per target language, one TEXT index per LINE entry (or none = show the source) and one name per character. Translated text compiles to ordinary TEXT programs, so the runtime's text code doesn't change per language. Untranslated lines fall back to the source text, as plan §7 asks.
- **Menu prompts get line IDs.** `hwc fmt` adds `#line:` to `menu "Prompt":` headers (not to `menu:` without a prompt). The AST gains `promptLineId`; string tables collect prompts as `kind: "prompt"`.
- **Loader rules:** every string operand is range-checked; AUDIO/STOP channels and EFFECT kinds are range-checked; a `SELECT` case text must have a lower index than its parent.
- **RNG:** PCG32 XSH-RR, `rand(n) = (u32 × n) >> 32`, seeded the PCG way. Its state is part of the saved state.
- **Values as text:** ints in decimal, bools as `true`/`false`, strings as themselves.
- **VM limits:** a 256-value stack and 64 call frames; going past them is a content error, never an abort.

## Alternatives
- **A minor bump (1.1) for each addition.** Rejected for now: nothing has shipped against 1.0, and one format at the freeze is simpler for everyone. After the freeze, additions follow §5.6 (minor bumps, unknown sections skipped).
- **Numbered `{0}` placeholders in translations.** Rejected in session 9 (milestone 9c); translations use the source markup and parity checks.
- **Read `himawari.json` at runtime for `META`.** Rejected: it breaks D01 (the runtime reads compiled data only) and the single-file release.

## Consequences
- Existing `.hwb` files from Phase 1 no longer load (they lack `META`). Rebuild with `hwc build`.
- Conformance cases now commit `expected.hwb`; the C runtime's conformance test plays those exact bytes, so both halves are tied to one artifact.
