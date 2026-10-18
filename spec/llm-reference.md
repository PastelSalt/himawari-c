# Himawari Script: reference for language models

> Compact guide to `.hws` (language 0.3), published as `himawari://spec/llm-reference`. The full specification is `spec/language.md`; `@himawari/core` is the authority. Check your work with the `validate` tool.

## Files
- `himawari.json`: name, entry scene, languages, resolution, positions, **variables** (type `int`/`bool`/`str`, `default`, `scope: save|global`, optional `enum` for `str`).
- `characters/<id>.md`: YAML frontmatter (`name`, `color`, `sprite` groups/presets/rules) + a prose bible.
- `script/*.hws`: scenes and macros. `locales/<lang>.json`: translations by line ID. `extensions/<name>.schema.json`: extension statements this game's runtime adds. `theme/theme.json`: UI colors, textbox, fonts, UI strings. `assets/`: `bg/`, `cg/`, `sprites/<id>/<group>/<attr>.png`, `music/`, `sfx/`, `ambient/`, `voice/<lang>/<line id>.ogg`, `rules/`.

## Syntax
UTF-8, **4 spaces per indent level**, one statement per line, `#` comments. Identifiers: `[a-z_][a-z0-9_]*`.

```hws
scene ch1_intro:
    bg classroom_day with dissolve(800)
    music morning_theme fade(1000)
    show hana smile at left with fade(300)
    hana "Good morning, [player_name]! You're late {b}again{/b}."
    me "Sorry, sorry..."
    "The bell rang before I could finish."
    $ hana_affection += 1
    menu "What do you say?":
        "I overslept.":
            hana annoyed "Classic."
        "I was helping someone." if courage >= 2:
            $ hana_affection += 2
            jump ch1_helped
        once "Ask about the festival.":
            call talk_festival
    hana "Anyway, let's go."
    jump ch1_class
```

| Statement | Form |
|---|---|
| Dialogue | `speaker "text"` · `speaker attr -attr "text"` (changes the sprite, then speaks) · `me "text"` (the player) |
| Narration | `"text"` |
| Stage | `show char [attr…] [-attr…] [at pos] [with trans]` · `hide char [with trans]` · `move char at pos [with trans]` · `bg asset [with trans]` · `cg asset [with trans]` |
| Audio | `music asset [fade(ms)]` · `ambient asset [fade(ms)]` · `sfx asset` · `voice asset` · `stop music|ambient|voice [fade(ms)]` |
| Effects | `wait(ms)` · `shake[(ms)]` · `flash[(ms)]` |
| Transitions | `fade(ms)` `dissolve(ms)` `slide_left|slide_right|slide_up|slide_down(ms)` `wipe(ms)` `rule(mask, ms)` (ms optional) |
| Flow | `jump scene` · `call scene` + `return` · `end` · `if expr:` / `elif expr:` / `else:` |
| Menu | `menu ["prompt"]:` then options `"text":`, `"text" if expr:`, `once "text":`, each with an indented body |
| Variables | `$ v = expr` · `+=` `-=` `*=` (declare them in himawari.json first) |
| Textbox | `textbox nvl` (full-page novel mode) · `textbox clear` (new page) · `textbox adv` (back to the default) · `textbox hide` / `textbox show` |
| Macros | top level: `define statement name(p: type [= default], …):` + an indented body of stage and flow statements; call it as `name(arg, key=value)` |
| Extensions | `name(arg, key=value)` for each `extensions/<name>.schema.json`; one quoted `"text"` argument at most (it gets a line ID) |

- **Expressions:** ints, `true`/`false`, `"enum_value"`, variables, `+ - * / %` (integer division), `== != < <= > >=`, `and or not`, parentheses, `rand(n)` (0 ≤ r < n). No floats, no functions of your own.
- **Menus:** an option whose body doesn't `jump`/`return`/`end` continues after the menu. `once` options disappear after being chosen. Options can't be empty.
- **Scenes** end the story when they reach their end without `jump` (the validator warns). `return` goes back to whoever `call`ed the scene; with no caller it ends the story.
- **Sprites:** a character's words come from `get_character`: **presets** (e.g. `smile`, set several layer groups at once) and **attributes** (e.g. `casual`, replaces the other attribute of its group). `-attr` removes one. Attributes stick until changed.
- **Positions:** `left`, `center`, `right` unless himawari.json defines more. A new character appears at `center`.
- **Macros** save repeating stage directions. Parameter types: `character position scene bg cg music sfx ambient voice transition word int bool`. A parameter's name in the body is replaced by the argument. Bodies can't contain dialogue, narration, or menus, and macros can't call themselves. Before writing a call, check the signatures (`project_info` lists macros and extensions).

## Text markup (inside `"…"`)
- `[var]` inserts a variable. `{select var: m="he" f="she" other="they"}` picks by an enum variable (`other` is required).
- `{b}…{/b}` `{i}…{/i}` `{color=#rrggbb}…{/color}` `{size=N}…{/size}` `{speed=N}…{/speed}` `{shake}…{/shake}`, ruby `{rb=reading}漢字{/rb}`, pause `{w=500}`, no-wait `{nw}`, accessibility `{alt=text}`.
- Escape `\"`, `\\`, `\[`, `\{`. Quotes inside a `{…}` tag need no escaping.

## Line IDs
Lines end with `#line:xxxxxx` (6 characters). They anchor translations, voice, saves, read tracking, and your edits. **Never write or change them**; tools assign them. When rewriting a scene with `update_scene`, keep the tags of lines you keep.

## Common errors
`HW0202` unknown character · `HW0204` unknown expression word · `HW0205` unknown position · `HW0208` unknown scene · `HW0210` undeclared variable · `HW0211` type mismatch · `HW0212` not a value of that enum · `HW0213` (note) asset not drawn yet, a placeholder shows · `HW0216` duplicated line ID · `HW0310` (warning) `return` in a scene nothing calls · `HW0320` (warning) scene can reach its end without `jump`/`return`/`end` · `HW0321` (note) scene never reached · `HW0331` (warning) a menu of only `once` options can run out · `HW0001` tab indentation · `HW0005` a block statement needs an indented body · `HW0220` no macro or extension of that name · `HW0221`–`HW0224` bad arguments (unknown, missing, wrong type, too many) · `HW0227` dialogue in a macro body · `HW0229` two quoted texts in one call.
