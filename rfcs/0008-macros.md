# RFC 0008: Macros (`define statement`)

- **Status:** **Accepted** 2026-10-18 (Phase 5, under the owner's go-ahead)
- **Author:** Claude (Opus 5.5) for Moeko Works
- **Created:** 2026-10-18
- **Affects:** `spec/language.md` 0.3.0-draft (§2.6, §5 item 5) · `spec/grammar.ebnf` · `spec/ast.schema.json` 1.1 · `@himawari/core` (parser, `project/invoke.ts`, checker, compiler)
- **Plan references:** §5.1, §12 (Tier A), §18 Phase 5

## Summary
`define statement name(param: type [= default], …):` defines a macro: a reusable block of stage and flow statements, expanded at compile time. Calls look like extension statements: `enter(hana, side=right)`.

## Motivation
Stage directions repeat (an entrance is `show`, `move`, a sound, a variable bump). Copy-paste makes scripts long and inconsistent, and AI edits multiply the copies. Plan §12 makes macros the first tier of extensibility because they add no runtime code: everything still compiles to the same ops and stays analyzable. The spec left the design open (language.md §5 item 5) until this phase.

## Design
- **Definition:** at the top level of any script file; names are project-wide and share a namespace with extension statements (`HW0225` duplicate, `HW0226` clash with an extension). Parameters are `name: type [= default]` with the extension types except `text` (`HW0228`); duplicate parameter names are errors.
- **Body rules:** stage and flow statements only. No dialogue, narration, or menus (`HW0227`): every line needs a stable line ID of its own, and an ID can't be shared by every expansion. Calls to other macros are allowed; recursion, direct or indirect, is an error (`HW0230`), and nesting is capped at 16.
- **Expansion:** whole-token substitution. The body's source is re-parsed with each parameter identifier replaced by its argument's text and every span moved to the call, so diagnostics and debug info point at the call (body problems carry a "from a macro" note and no quick fix, which would edit the wrong text). Arguments are checked first, as typed references at the argument, with quick fixes.
- **What sees what:** the AST (and Studio's editor, the formatter, line-ID tools, and AI reads) keeps the call as written. `ProjectCheck.expanded` holds the expansion for flow analysis, reachability, the story graph, and the compiler. Nothing macro-specific reaches the bytecode.

## Ease-of-use check
P5 (argument errors with suggestions, at the argument), P7 (one obvious way: a macro reads like the statements it replaces), P10 (AI tools list signatures in `project_info`; validation of AI edits includes the expansion).

## Alternatives considered
- **Text templates with `{param}` placeholders** (the plan's early sketch): flexible, but substitutions inside words make expansions impossible to check before use, and placeholders confuse the formatter and AI edits.
- **Allowing dialogue in macros** with IDs derived from the call's ID: breaks translation and voice files when a macro's body changes, and makes one source line produce many lines with invisible IDs.
- **Scenes with parameters (`call enter(hana)`):** needs runtime frames with arguments and dynamic names, losing static checks of what is shown and where.
