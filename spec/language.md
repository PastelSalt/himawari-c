# Himawari Script (`.hws`) Language Specification

> **Version:** 0.2.0-draft · **Status:** Phase 0 draft. Not stable; changes do not need an RFC until 1.0.
> **License:** CC-BY-4.0 · **Source of truth for semantics:** `@himawari/core` (D03). Where this document and Core disagree before 1.0, file an issue; one of them is a bug.
> Plan references: DETAILED_PLAN.md §5.1–5.2, §6, §7, §12.

Himawari Script is a **closed, declarative** language for visual novels. It looks like Ren'Py, but has no embedded general-purpose code. Every construct can be statically analyzed, so the editor, the validator, and AI tools can all reason about a script without running it.

## 1. Files and lexical structure

| Rule | Value |
|---|---|
| Encoding | UTF-8, no BOM. A BOM is accepted and removed by the formatter. |
| Line endings | LF. CRLF is accepted on input and normalized by `hwc fmt`. |
| Indentation | **4 spaces per level.** Tabs in indentation are an error (`HW0001`) with a quick fix. |
| Statements | **One statement per line** (§1.2 of the plan). There is no line continuation. |
| Comments | `#` to end of line, outside string literals. |
| Line IDs | A trailing comment of the form `#line:xxxxxx` (§3). |
| Identifiers | `[a-z_][a-z0-9_]*`, at most 64 characters. Scene, character, variable, attribute, asset, and position names all use this form. |
| Keywords | `scene` `jump` `call` `return` `end` `if` `elif` `else` `menu` `once` `show` `hide` `move` `bg` `cg` `music` `sfx` `ambient` `voice` `stop` `wait` `shake` `flash` `with` `at` `define` `statement` `true` `false` `and` `or` `not` `me` |

A file contains top-level `scene` blocks and `define` blocks. Everything else lives inside a scene.

```hws
# script/ch1.hws
scene ch1_intro:
    bg classroom_day with dissolve(800)
    hana "Good morning!"
```

## 2. Statements

### 2.1 Structure

| Statement | Form | Notes |
|---|---|---|
| Scene | `scene <id>:` | Scene IDs are global across the project. |
| Jump | `jump <scene>` | Transfers control. Does not return. |
| Call | `call <scene>` | Runs a scene and comes back after its `return`. |
| Return | `return` | Returns from a `call`. In a scene that was jumped to, `return` is an error (`HW0310`). |
| End | `end` | Ends the game (to the title screen). |
| Conditional | `if <expr>:` / `elif <expr>:` / `else:` | Blocks are indented. |
| Menu | `menu ["prompt"]:` | See §2.3. |

If control reaches the end of a scene's body without `jump`, `call`, `return`, or `end`, the validator reports a dead end (`HW0320`, warning) and the runtime ends the game.

### 2.2 Dialogue and narration

```hws
    "The bell rang before I could finish."            # narration
    hana "Good morning, [player_name]!"              # speaker + text
    hana surprised -glasses "Really?"                # change sprite attributes, then speak
    me "Sorry, sorry..."                             # `me` is the player character
```

- `speaker <attrs…> "text"`: attributes before the text apply to the speaker's sprite exactly like `show` (§2.4), then the line is spoken.
- Strings use `"…"`. Escapes: `\"`, `\\`, `\n`, `\[`, `\{`.
- Inside a `{…}` tag, quotes don't end the string, so `"{select g: m="he" other="they"} waved."` needs no escaping. A literal `{` in text is written `\{`.
- **Interpolation:** `[var]` inserts a variable's value.
- **Variants:** `{select var: m="he" f="she" other="they"}` picks text by a string-enum variable. `other` is required and used as the fallback. Translators may add or remove cases for their language.
- **Inline tags:** `{b}…{/b}`, `{i}…{/i}`, `{color=#rrggbb}…{/color}`, `{size=N}…{/size}`, `{w=ms}`, `{speed=N}…{/speed}`, `{nw}`, `{shake}…{/shake}`, ruby `{rb=reading}base{/rb}`, `{alt=text}`. Unknown tags are errors.

### 2.3 Menus

```hws
    menu "What do you say?":
        "I overslept.":
            hana annoyed "Classic."
        "I was helping someone." if courage >= 2:
            $ hana_affection += 2
            jump ch1_helped
    # options without a jump continue here (gather)
    hana "Anyway, let's go."
```

- Each option is a string, an optional `if <expr>` condition, and an indented body.
- **Fall-through gather:** when an option's body finishes without transferring control, execution continues with the first statement after the `menu` block (Ink-style).
- **`once` options** disappear after they have been chosen once in this playthrough (per save). If every option is hidden, the menu is skipped and execution continues after it; the validator warns when that can happen (`HW0331`).
- An option with an empty body is an error (`HW0330`).

### 2.4 Stage

| Statement | Form |
|---|---|
| Show | `show <char> [attr…] [-attr…] [at <position>] [with <transition>]` |
| Hide | `hide <char> [with <transition>]` |
| Move | `move <char> at <position> [with <transition>]` |
| Background | `bg <asset> [with <transition>]` |
| CG | `cg <asset> [with <transition>]`. Unlocks the gallery entry automatically. |
| Audio | `music <asset> [fade(ms)]`, `sfx <asset>`, `ambient <asset> [fade(ms)]`, `voice <asset>`, `stop music\|ambient\|voice [fade(ms)]` |
| Effects | `wait(ms)`, `shake [(ms)]`, `flash [(ms)]` |

**Attribute merge** (Ren'Py's model, plan §6.1): `show hana casual` changes only the outfit group and keeps every other group. A word can be an attribute or a preset; presets expand to several attributes at once. `-attr` removes an attribute. Unknown words are compile errors with suggestions (`HW0204`).

**Transitions:** `fade(ms)`, `dissolve(ms)`, `slide_left(ms)`, `slide_right(ms)`, `slide_up(ms)`, `slide_down(ms)`, `wipe(ms)`, `rule(<mask>, ms)`. The argument may be omitted to use the theme default.

### 2.5 State

```hws
    $ hana_affection += 1
    $ heard_rumor = true
```

- `$ <var> = <expr>` and the compound forms `+=`, `-=`, `*=`.
- Variables must be declared in `himawari.json` (plan §5.5) with a type and a scope (`save` or `global`).
- Types: `int` (32-bit signed; overflow behavior is open question 3), `bool`, `str` (string enums only; free-text strings can only be set by the engine, e.g. a name-entry screen).
- **Expressions:** integer and boolean literals, string-enum literals, variables, `+ - * / %` (integer division truncates toward zero), `== != < <= > >=`, `and or not`, parentheses, and `rand(n)` (seeded, `0 ≤ r < n`). **No floats in logic.**

### 2.6 Macros (Tier A extensibility)

```hws
define statement entrance(char, side = "left"):
    show {char} at offscreen_{side}
    move {char} at {side} with slide_right(400)
```

Macros are expanded at compile time with typed parameters, so every expansion is fully analyzable. Details are deferred to an RFC in Phase 5.

## 3. Line IDs

- Every dialogue line, narration line, and menu option has a **line ID**: a trailing `#line:xxxxxx` comment.
- An ID is **6 characters of lowercase Crockford base32**: `0123456789abcdefghjkmnpqrstvwxyz` (no `i`, `l`, `o`, `u`). That gives 2³⁰ ≈ 1.07 billion IDs.
- IDs are **persistent tags, not hashes.** Tooling (`hwc fmt`, Studio, MCP) assigns them; writers never type them, and Studio hides them.
- Moving a line keeps its ID. Editing keeps the ID, but a large change marks translations and voice as `needs-review`. Duplicated IDs (from copy-paste) are reassigned on the copy.
- IDs anchor AI edits, translations (`locales/<lang>.json`), voice files (`voice/<lang>/<id>.ogg`), saves, read tracking, and provenance.

## 4. Excluded by design

Floats in story logic, user-defined functions, embedded general-purpose code (except opt-in sandboxed Lua in v1.x), and file or network access. These are what make the language safe to analyze and safe for AI edits.

## 5. Open questions (resolve in Phase 1)

1. Exact grammar in `grammar.ebnf`, including how `once` and `if` combine on one option line.
2. Whether `return` from a jumped-to scene should be a compile error or end the game.
3. Overflow behavior of `int` in release builds (clamp vs wrap).
4. Whether `speaker` attributes before text persist after the line (current draft: yes, like `show`).
5. How macro parameter types are declared.
