# Himawari Bytecode (`.hwb`) Specification

> **Version:** 1.1 (format major 1, minor 1) · **Status:** 1.0 was **frozen** at the end of Phase 2 (2026-10-17). `META`, `LOCL`, menu prompt line IDs, and the stricter loader rules were added before the freeze (rfcs/0004), then `SPRT` (rfcs/0005). **1.1** (Phase 5, rfcs/0007) adds `TEXTBOX`, `XCALL`, the `XTNS` and `THEM` sections, and the `LINE` call flag. Additions bump the minor version (§5.6) and unknown sections are skipped.
> **License:** CC-BY-4.0 · **Producer:** `@himawari/core` compiler (`hwc build`) · **Consumer:** Himawari-C runtime.
> Plan references: DETAILED_PLAN.md §5.4, §5.6, §8.4.

A `.hwb` file is the compiled form of a whole project's scripts. The runtime never parses source text (D01): everything it needs, including the structure of text markup, is in here. All integers are **little-endian**. All offsets are **byte offsets from the start of the file** unless stated otherwise. Strings are referenced by **index** into the string pool.

## 1. File layout

```
Header (24 bytes)
Section table (section_count × 12 bytes)
Sections (each 4-byte aligned)
```

### 1.1 Header

| Offset | Type | Field | Value |
|---|---|---|---|
| 0 | u8[4] | magic | `48 57 42 01` (`"HWB\x01"`) |
| 4 | u16 | major | 1 |
| 6 | u16 | minor | 0 or 1 |
| 8 | u32 | flags | bit 0: has `DBUG` section |
| 12 | u32 | section_count | |
| 16 | u32 | file_size | total size in bytes |
| 20 | u32 | crc32 | CRC-32 (IEEE 802.3, as in zlib) of the whole file with this field set to 0 |

A runtime accepts a file when `major` equals its own and `minor` is equal or lower (plan §5.6). **Writers emit the lowest minor that holds the module:** 1 only when it uses a 1.1 op or section, so games without 1.1 features still load in 1.0 players.

### 1.2 Section table

`section_count` entries of `{ u8[4] tag, u32 offset, u32 size }`. Tags are ASCII. Each section appears at most once. Unknown tags are skipped (forward compatibility within a major version).

| Tag | Required | Content |
|---|---|---|
| `META` | yes | Game information from `himawari.json` |
| `STRS` | yes | String pool |
| `VARS` | yes | Variables |
| `CHAR` | yes | Characters |
| `SCNE` | yes | Scenes |
| `LINE` | yes | Line table |
| `TEXT` | yes | Rich text programs |
| `CODE` | yes | Instructions |
| `LOCL` | no | Translations: per-language line texts and character names |
| `SPRT` | no | Layered sprites: groups, presets, and rules per character (rfcs/0005) |
| `XTNS` | no (1.1) | Extension statement signatures (rfcs/0007) |
| `THEM` | no (1.1) | The compiled theme (rfcs/0007) |
| `DBUG` | no | pc → source location (stripped in release builds) |

A 1.0 file's `XTNS` or `THEM` is an unknown section and is skipped. Reserved for later minor versions: `ASST` (asset table and per-scene prefetch lists).

## 2. Sections

All counts and fields are u32 unless noted.

### 2.0 `META`: game information
```
title: str, id: str, width, height, source_language: str
language_count, languages[language_count]: str     every language the game offers; the first is the source language
position_count, positions[position_count] = { name: str, x: i32, y: i32 }
```
`width`/`height` are the virtual canvas (`resolution`), 1–16384. Positions (`at left`) are in 1/10000 of the canvas: `x` is the sprite anchor's horizontal position, `y` its vertical position (10000 = bottom edge). Sorted by name.

### 2.1 `STRS`: string pool
```
count
offsets[count]       byte offset of each string, relative to the section start
bytes                UTF-8 strings, each followed by a 0 byte
```
Index 0 is always the empty string and means "none" wherever a string index is optional. Strings are deduplicated, so two equal strings have the same index (string enum values compare by index).

### 2.2 `VARS`: variables
```
count
entries[count] = { name: str, type: u8, scope: u8, reserved: u16, default: i32, enum_first: u32, enum_count: u32 }
```
- `type`: 0 int, 1 bool, 2 str (string enum or free string).
- `scope`: 0 save, 1 global.
- `default`: the integer value; 0/1 for bool; a string index for str.
- `enum_first`/`enum_count`: a run of string indices in the `enum` list that follows the entries (`enum_count` = 0 when not an enum).
```
enum_total
enum[enum_total]     string indices
```
Entries are sorted by name. Instructions refer to variables by entry index.

### 2.3 `CHAR`: characters
```
count
entries[count] = { id: str, name: str, color: u32 }
```
`name` is the display name in the source language. `color` is `0xRRGGBB`, or `0xFFFFFFFF` when unset. Entries are sorted by id.

### 2.4 `SCNE`: scenes
```
count
entries[count] = { name: str, entry_pc: u32, file: str }
```
`entry_pc` is a word index into `CODE`. Entries are sorted by name. The game starts at the scene named by the `entry` field of `himawari.json`, recorded as `entry_scene` (a scene index) right after the entries:
```
entry_scene          index into entries, or 0xFFFFFFFF if none
```

### 2.5 `LINE`: line table
Every dialogue line, narration line, menu option, menu prompt, and extension statement text (1.1) has an entry.
```
count
entries[count] = { line_id: u32, speaker: str, text: u32, flags: u32 }
```
- `line_id`: the 30-bit value of the `#line:` ID (Crockford base32, first character most significant), or `0xFFFFFFFF` for lines without one (menu prompts, untagged lines).
- `speaker`: string index of the character id; 0 for narration, options, and prompts.
- `text`: index into `TEXT`.
- `flags`: bit 0 menu option, bit 1 `once` option, bit 2 menu prompt, bit 3 (1.1) the text of an extension statement (shown by the extension, not the textbox).

Menu prompts carry a line ID like dialogue (`menu "Where to?":   #line:k3f9a1`), so they can be translated.

### 2.6 `TEXT`: rich text programs
Text markup is compiled into small word programs so the runtime never parses tags.
```
count
offsets[count]       word offset of each program, relative to the start of `words`
word_count
words[word_count]
```
Each program is a sequence of ops ending with `END`:

| Op | Code | Operands | Meaning |
|---|---|---|---|
| END | 0 | | end of this text |
| RUN | 1 | str | literal text |
| VAR | 2 | var | the variable's current value, as text |
| OPEN | 3 | tag, value: str | start a wrapping tag (`b`, `i`, `color`, `size`, `speed`, `shake`, `rb`) |
| CLOSE | 4 | | end the innermost open tag |
| MARK | 5 | tag, value: str | a standalone tag (`w`, `nw`, `alt`) |
| SELECT | 6 | var, case_count, then case_count × { key: str, text: u32 } | choose the case whose key equals the variable's value, else the `other` case |

`tag` is the string index of the tag name; `value` is 0 when the tag has none. Ruby is `OPEN rb <reading>` … `CLOSE`, which the runtime turns into a ruby run for its layout (rfcs/0003).

A `SELECT` case's text index is always **lower** than the index of the text that contains it (the compiler emits case texts first), so evaluating text can never loop.

**Values as text** (`VAR`): an int prints in decimal with a leading `-` when negative; a bool prints `true` or `false`; a str prints the string.

### 2.7 `CODE`: instructions
```
word_count
words[word_count]
```
An instruction is one **op word** followed by its arguments: `op word = opcode (bits 0–7) | argc (bits 8–15)`, then `argc` 32-bit words. (This is word-aligned and variable-length rather than the fixed-width design sketched in plan §5.4: statements like `show` carry a variable number of attributes, and `argc` makes every instruction trivially bounds-checkable.) A **pc** is a word index into `words` and always points at an op word.

The VM is a stack machine of signed 32-bit integers. Booleans are 0/1. String values are string indices.

**Story ops** (block or emit commands to the presentation layer, plan §8.4):

| Op | Code | Arguments | Effect |
|---|---|---|---|
| SAY | 0x01 | line | show the line (speaker and text from `LINE`); wait for the player |
| SHOW | 0x02 | char, at, ttype, targ0, targ1, n_add, n_remove, add × n_add, remove × n_remove | show or update a character. `at` 0 = keep current position. Strings: char, at, ttype, attributes |
| HIDE | 0x03 | char, ttype, targ0, targ1 | |
| MOVE | 0x04 | char, at, ttype, targ0, targ1 | |
| BG | 0x05 | asset, ttype, targ0, targ1 | |
| CG | 0x06 | asset, ttype, targ0, targ1 | also unlocks the gallery entry |
| AUDIO | 0x07 | channel, asset, fade_ms | channel: 0 music, 1 ambient, 2 sfx, 3 voice. `fade_ms` −1 = none |
| STOP | 0x08 | channel, fade_ms | channel: 0 music, 1 ambient, 3 voice |
| WAIT | 0x09 | ms | |
| EFFECT | 0x0A | kind, ms | kind: 0 shake, 1 flash. `ms` −1 = default |
| TEXTBOX | 0x0C | mode | 1.1. mode: 0 `adv`, 1 `nvl`, 2 `clear`, 3 `hide`, 4 `show` (`spec/language.md` §2.8). The mode is saved |
| XCALL | 0x0D | ext, n, value × n | 1.1. Runs extension statement `ext` (an `XTNS` index) with one value per parameter, in parameter order (`n` equals its parameter count). Values: `int` as itself, `bool` 0/1, `text` a `LINE` index (0xFFFFFFFF = left out), every other type a string index. A `blocking` extension holds the story until its handler finishes. With no handler registered for the name, the player skips it (reported in dev builds and playtests) |
| MENU | 0x0B | prompt_line, n, then n × { line, target_pc } | pops n condition values (the first option's value deepest); shows the options whose value is non-zero and that are not spent `once` options; jumps to the chosen option's `target_pc`. If none can be shown, continues at the next instruction. `prompt_line` 0xFFFFFFFF = none |
| JMP | 0x10 | pc | |
| JZ | 0x11 | pc | pop; jump if zero |
| CALL | 0x12 | pc | push a return frame, jump |
| RET | 0x13 | | return to the caller; with no caller, end the game |
| END | 0x14 | | end the game (back to the title screen) |

Transitions use three words `ttype, targ0, targ1`: `ttype` is the string index of the transition name (0 = none); for `rule`, `targ0` is the mask string index and `targ1` the duration; for the others `targ0` is the duration and `targ1` is −1. A missing duration is −1 (use the theme default).

**Expression ops:**

| Op | Code | Arguments | Stack |
|---|---|---|---|
| PUSH | 0x20 | value | → value |
| LOAD | 0x21 | var | → value |
| STORE | 0x22 | var | value → |
| ADD SUB MUL DIV MOD | 0x23–0x27 | | a b → a∘b. DIV and MOD truncate toward zero; division by zero yields 0 and is reported in dev builds |
| NEG | 0x28 | | a → −a |
| EQ NE LT LE GT GE | 0x29–0x2E | | a b → 0/1 |
| NOT | 0x2F | | a → !a |
| AND OR | 0x30, 0x31 | | a b → 0/1 (both sides are always evaluated; expressions have no side effects except `rand`) |
| RAND | 0x32 | | n → `(u32 × n) >> 32` where u32 is the next PCG32 output; 0 if n ≤ 0 |

Integer overflow wraps (two's complement), in every build (`spec/language.md` §5).

**RNG.** PCG32 (XSH-RR, 64-bit state, multiplier 6364136223846793005, increment 1442695040888963407). Seeding with `s`: state = 0, step, state += s, step. The RNG state is part of the saved game state, so rollback and loading replay the same values. Playtests and conformance transcripts seed with 1 unless told otherwise.

**Limits.** The value stack holds 256 values and the call stack 64 frames. Exceeding either, or popping an empty stack, stops the game with a content error (it never aborts); the compiler never produces code that does this, except through unbounded `call` recursion, which it can't rule out.

### 2.8 `LOCL`: translations
```
language_count
entries[language_count] = { language: str, table: u32 }     table = word offset into words
word_count
words[word_count]
```
Each language's table holds `line_count` TEXT indices (one per `LINE` entry, in order; 0xFFFFFFFF = untranslated, show the source text), then `char_count` string indices (one per `CHAR` entry; 0 = use the source name). Only target languages with a string table appear; the source language never does. Entries are sorted by language. Translated texts are ordinary `TEXT` programs.

### 2.9 `SPRT`: layered sprites
```
sprite_count
sprites[sprite_count] = { char, root: str, anchor_x, anchor_y, scale, group_first, group_count, preset_first, preset_count, rule_first, rule_count }
group_total, groups[group_total] = { name: str, flags, default_first, default_count, attr_first, attr_count }
preset_total, presets[preset_total] = { name: str, layer_first, layer_count }
rule_total, rules[rule_total] = { hide: str, show: str, when_first, when_count }
pool_total, pool[pool_total]
```
- `char` is a `CHAR` index; `root` the sprite folder under `assets/`. `anchor_*` and `scale` are in 1/10000.
- Groups are listed **bottom to top**. `flags`: bit 0 `always` (drawn whatever the attributes), bit 1 `multiple` (several attributes at once), bit 2 `blink`, bit 3 `lipflap`. `default_*` and `attr_*` are runs of string indices in `pool`.
- A preset's layers are `layer_count` pairs in `pool` starting at `layer_first`: `{ group index within this sprite, attribute: str }`.
- A rule hides (`hide` ≠ 0) or shows (`show` ≠ 0) an attribute while every word in its `when` run is active: an attribute in effect, or a preset whose attributes are all in effect.

**Attribute state** (what `SHOW` does with its words when the character has a sprite):
- A preset sets each of its layers; an attribute sets its group (the first group that lists it). In a group without `multiple`, a new attribute **replaces** the group's previous one; in a `multiple` group it is added.
- `-attr` removes the attribute. If it is one of its group's defaults, the default stays off until the attribute is added again (so `-glasses` hides default glasses).
- **In effect** per group: its set attributes, else its defaults (minus removed ones); an `always` group draws all of its attributes. Then rules apply.
- Without a sprite (or for words no group lists), attributes are a plain set, as before.

The runtime draws `<root>/<group>/<attr>.png` for each attribute in effect, bottom to top. **Auto-blink:** a `blink` group with `<attr>_half` and `<attr>_closed` frames blinks every 2–6 s. **Lip-flap:** a `lipflap` group with `<attr>_open` alternates while that character's line is appearing or their voice is playing.

### 2.10 `XTNS`: extension statements (1.1)
```
ext_count
exts[ext_count] = { name: str, flags, param_first, param_count }
param_total, params[param_total] = { name: str, type }
```
- Every extension the project declares, sorted by name. `flags` bit 0: blocking.
- `type`: 0 character, 1 position, 2 scene, 3 bg, 4 cg, 5 music, 6 sfx, 7 ambient, 8 voice, 9 transition, 10 word, 11 int, 12 bool, 13 text.
- The runtime matches names against its registered handlers (`hw_register_statement`) when it loads the file.

### 2.11 `THEM`: theme (1.1)
```
count
entries[count] = { key: str, type, value }
```
- Sorted by key, keys unique. `type`: 0 int, 1 color (`0xRRGGBB`), 2 string (`value` is a string index).
- Keys are `theme.schema.json`'s settings flattened with dots: `color.accent`, `textbox.opacity`, `textbox.slice.left`, `font.main`, `title.music`, …, and `string.<lang>.<key>` for UI strings. The runtime uses the keys it knows and ignores the rest.

### 2.12 `DBUG`: debug info
```
count
entries[count] = { pc: u32, file: str, line: u32 }
```
Sorted by `pc`; an entry applies from its pc until the next entry. `line` is 1-based.

## 3. Loader rules (runtime)

The loader validates everything **once**, before running (plan §5.4), and rejects the file with a friendly error otherwise (content errors never `abort()`):
1. Magic, major/minor, `file_size`, and CRC.
2. Every section lies inside the file, is 4-byte aligned, and its counts fit its size.
3. Every string index < string count, including every string operand of SHOW, HIDE, MOVE, BG, CG, and AUDIO (and a `rule` transition's mask); every string is NUL-terminated inside `STRS` and is valid UTF-8.
4. Every var, char, line, text, and scene index is in range; `TEXT` programs end with `END` inside the section and `SELECT` case texts have a lower index than their text. `META` has a valid resolution and lists the source language first; `LOCL` tables fit and their texts are in range; every `SPRT` range, string, and preset group index is in range and the scale is non-zero.
5. Every instruction's `argc` matches its opcode (fixed for most ops; computed for SHOW, MENU, and XCALL), every instruction ends inside `CODE`, and every pc argument (JMP, JZ, CALL, MENU targets, scene entries) points at an op word. AUDIO and STOP channels are 0–3; EFFECT kinds are 0–1.
6. (1.1) TEXTBOX and XCALL appear only in files with minor ≥ 1. TEXTBOX modes are 0–4. An XCALL's `ext` is an `XTNS` index, `n` matches its parameter count, and each value fits its type (strings in range, bools 0/1, texts a `LINE` index or 0xFFFFFFFF). `XTNS` ranges and types and `THEM` types and strings are in range, and `THEM` keys are sorted and unique.

After validation the interpreter needs no further bounds checks.

## 4. Compilation notes

- Scenes are compiled in name order; each scene's body ends with `END` when it can fall off its end (warned as HW0320) or when a jump lands right after its last statement. Code that can never run gets no `END`, so headless playtests don't report it as an unreachable ending.
- `speaker attrs "text"` compiles to `SHOW speaker` (attributes only, position kept) followed by `SAY`.
- `if/elif/else` compiles to `JZ`/`JMP` chains. A menu compiles its option conditions (`PUSH 1` for options without one), then `MENU`, then each option body; bodies that fall through end with `JMP` to the gather point after the menu. `MENU` is followed by a `JMP` to the gather point (taken when no option can be shown) only when the menu can run out: when no option is both unconditional and not `once`.
- `$ x += e` compiles to `LOAD x`, `e`, `ADD`, `STORE x`.
- Macro calls are expanded before compiling (rfcs/0008); nothing of a macro remains in the bytecode except its statements, whose debug entries point at the call.
- The compiler is deterministic: the same project always produces identical bytes.
