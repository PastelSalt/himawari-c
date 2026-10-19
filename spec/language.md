# Himawari Script (`.hws`) Language Specification

> **Version:** 0.3.0-draft · **Status:** draft, implemented by `@himawari/core` and the runtime (Phases 1–5). 0.3 adds macros (rfcs/0008), extension statements, `textbox`, and themes (rfcs/0007). Not stable yet; changes don't need an RFC until 1.0.
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
| Keywords | `scene` `define` `jump` `call` `return` `end` `if` `elif` `else` `menu` `once` `show` `hide` `move` `bg` `cg` `music` `sfx` `ambient` `voice` `stop` `wait` `shake` `flash` `textbox` `with` `at` `true` `false` `and` `or` `not`. `statement` is only special after `define`, and `me` is the player as a speaker; neither is reserved ([grammar.ebnf](grammar.ebnf)). |

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
| Return | `return` | Returns from a `call`. In a scene nothing calls, `return` is a warning (`HW0310`) and ends the story at runtime (§5). |
| End | `end` | Ends the game (to the title screen). |
| Conditional | `if <expr>:` / `elif <expr>:` / `else:` | Blocks are indented. |
| Menu | `menu ["prompt"]:` | See §2.3. |
| Macro | `define statement <name>(<params>):` | Top level, like `scene`. See §2.6. |

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
- An option with an empty body is an error (`HW0005`, like any block statement without its block).

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
| Textbox | `textbox adv\|nvl\|clear\|hide\|show` (§2.8) |

**What the stage keeps** (the runtime's display state, which saves and rewinds restore): one background, one CG (drawn over the characters; a new `bg` ends it), the characters on stage in the order they appeared (a new one starts at `center` unless `at` says otherwise), and the looping music and ambient tracks. `sfx` and `voice` play once.

**Attribute merge** (Ren'Py's model, plan §6.1, `spec/bytecode.md` §2.9): `show hana casual` changes only the outfit group and keeps every other group. A word can be an attribute or a preset; presets expand to several attributes at once. `-attr` removes an attribute. Unknown words are compile errors with suggestions (`HW0204`).

**Transitions:** `fade(ms)`, `dissolve(ms)`, `slide_left(ms)`, `slide_right(ms)`, `slide_up(ms)`, `slide_down(ms)`, `wipe(ms)`, `rule(<mask>, ms)`. The argument may be omitted to use the theme default.

### 2.5 State

```hws
    $ hana_affection += 1
    $ heard_rumor = true
```

- `$ <var> = <expr>` and the compound forms `+=`, `-=`, `*=`.
- Variables must be declared in `himawari.json` (plan §5.5) with a type and a scope (`save` or `global`).
- Types: `int` (32-bit signed; arithmetic wraps on overflow, §5), `bool`, `str` (string enums only; free-text strings can only be set by the engine, e.g. a name-entry screen).
- **Expressions:** integer and boolean literals, string-enum literals, variables, `+ - * / %` (integer division truncates toward zero), `== != < <= > >=`, `and or not`, parentheses, and `rand(n)` (seeded, `0 ≤ r < n`). **No floats in logic.**

### 2.6 Macros (Tier A extensibility, rfcs/0008)

```hws
define statement enter(who: character, side: position = left, ms: int = 400):
    show who at side with dissolve(ms)
    $ met_count += 1

scene school:
    enter(hana)
    enter(ren, side=right, ms=0)
```

- A macro is defined at the top level of any script file and can be called from every scene in the project: `name(arg, …, key=value, …)`. Positional arguments come first.
- **Parameters are typed:** `character`, `position`, `scene`, `bg`, `cg`, `music`, `sfx`, `ambient`, `voice`, `transition`, `word` (an attribute or any bare word), `int`, and `bool`. A parameter with `= default` is optional. Arguments are checked like names written in place (`hanna` gets "did you mean hana?" at the argument), and wrong kinds of values are errors (`HW0223`).
- **Expansion:** each parameter name in the body is replaced by its argument as a whole token, at compile time. The expanded statements are checked, compiled, and shown in the story graph like hand-written ones; problems inside a body are reported at the call with a note.
- **Bodies hold stage and flow statements only**: no dialogue, narration, or menus (`HW0227`), because every line needs its own line ID. A macro may call other macros, but not itself, directly or indirectly (`HW0230`).
- Macro names share one namespace with extension statements (§2.7) and can't be keywords.

### 2.7 Extension statements (Tier B, rfcs/0007)

```hws
    screen_tint(sepia)
    phone(hana, "Running late, sorry!")   #line:9xk2mp
```

A game can add statements the language doesn't have. Each one is declared in `extensions/<name>.schema.json` ([extension.schema.json](extension.schema.json)) with typed parameters, and implemented in C in the game's runtime with `hw_register_statement()`. The call syntax and type checks are the same as for macros. In addition:
- One parameter may have type `text`: a quoted string that is translated and gets the line ID (§3). A statement can have only one quoted text (`HW0229`).
- `blocking: true` means the story waits until the extension says it's done (like `wait`).
- A player without the extension skips the statement and reports it in dev builds and playtests; it never crashes.

### 2.8 Textbox modes

| Form | Effect |
|---|---|
| `textbox adv` | The default: one line at a time in the textbox at the bottom. |
| `textbox nvl` | Novel mode: lines accumulate on a full-screen page. The page starts over when it's full. Menus appear on the page. |
| `textbox clear` | Starts a new NVL page. |
| `textbox hide` | Hides the textbox until the next line (to show off a CG, say). |
| `textbox show` | Shows it again without waiting for a line. |

The mode is part of the saved state.

### 2.9 Themes

`theme/theme.json` ([theme.schema.json](theme.schema.json) 2.0, rfcs/0007 and rfcs/0010) restyles the built-in UI without code:
- **Look:** colors, rounded corners, borders, shadows, how a pointed-at button shows it, text size and outline, fonts, a nine-slice textbox image, the title and menu backgrounds, and the title music.
- **Layout:** where the textbox, its text area, the name plate, the choices, the quick buttons, the novel-mode page, the game's title, and the title and game menus are, and how big. Places are in percent of the screen; sizes are in pixels at a 1080-pixel-high screen.
- **Motion and sound:** how choices appear, and hover and click sounds.
- **Text:** per-language UI strings, and the default transition time.

A theme can start from a `preset` (`himawari`, `pastel`, `minimal`, `paper`, `night`, `retro`, `high-contrast`); its own settings override the preset's. Studio's UI Designer edits it visually. Core validates it (`HW0130`; unknown settings `HW0131` with suggestions) and warns about elements past the edge of the screen (`HW0132`) and hard-to-read text (`HW0133`, below 4.5:1). It compiles the theme into the bytecode, so the runtime never reads JSON. The player's accessibility settings still apply over any theme.

## 3. Line IDs

- Every dialogue line, narration line, menu option, menu prompt (`menu "Where to?":`), and extension statement with a quoted text has a **line ID**: a trailing `#line:xxxxxx` comment.
- An ID is **6 characters of lowercase Crockford base32**: `0123456789abcdefghjkmnpqrstvwxyz` (no `i`, `l`, `o`, `u`). That gives 2³⁰ ≈ 1.07 billion IDs.
- A comment that starts with `#line:` but isn't a valid ID (`#line:evl001`, `#line:K3F9A1`) is a warning (`HW0022`) and is read as an ordinary comment, so tools give the line a new ID in front of it.
- IDs are **persistent tags, not hashes.** Tooling (`hwc fmt`, Studio, MCP) assigns them; writers never type them, and Studio hides them.
- Moving a line keeps its ID. Editing keeps the ID, but a large change marks translations and voice as `needs-review`. Duplicated IDs (from copy-paste) are reassigned on the copy.
- IDs anchor AI edits, translations (`locales/<lang>.json`), voice files (`voice/<lang>/<id>.ogg`), saves, read tracking, and provenance.

## 4. Excluded by design

Floats in story logic, user-defined functions, embedded general-purpose code (except opt-in sandboxed Lua in v1.x), and file or network access. These are what make the language safe to analyze and safe for AI edits.

## 5. Decisions on the Phase 0 open questions

1. **Grammar:** written in [`grammar.ebnf`](grammar.ebnf). An option line is `[once] "text" [if expr]:`, in that order.
2. **`return` in a scene nothing calls:** a warning (`HW0310`), not an error. At runtime, `return` with no caller ends the story, like `end` (`spec/bytecode.md` §2.7).
3. **`int` overflow:** wraps (two's complement) in every build, so a story behaves the same in development and release. Division by zero gives 0 and is reported in dev builds and playtests.
4. **Speaker attributes persist:** `hana happy "…"` changes Hana's sprite exactly like `show hana happy`, and it stays changed after the line.
5. **Macros** (`define statement`): decided in rfcs/0008 (§2.6): typed parameters, whole-token substitution, no lines in bodies.
