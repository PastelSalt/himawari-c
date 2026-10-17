# Himawari Bytecode (`.hwb`) Specification

> **Version:** 1.0 (format major 1, minor 0) · **Status:** Phase 1 draft; frozen once the Phase 2 runtime loads it.
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
| 6 | u16 | minor | 0 |
| 8 | u32 | flags | bit 0: has `DBUG` section |
| 12 | u32 | section_count | |
| 16 | u32 | file_size | total size in bytes |
| 20 | u32 | crc32 | CRC-32 (IEEE 802.3, as in zlib) of the whole file with this field set to 0 |

A runtime accepts a file when `major` equals its own and `minor` is equal or lower (plan §5.6).

### 1.2 Section table

`section_count` entries of `{ u8[4] tag, u32 offset, u32 size }`. Tags are ASCII. Each section appears at most once. Unknown tags are skipped (forward compatibility within a major version).

| Tag | Required | Content |
|---|---|---|
| `STRS` | yes | String pool |
| `VARS` | yes | Variables |
| `CHAR` | yes | Characters |
| `SCNE` | yes | Scenes |
| `LINE` | yes | Line table |
| `TEXT` | yes | Rich text programs |
| `CODE` | yes | Instructions |
| `DBUG` | no | pc → source location (stripped in release builds) |

Reserved for later minor versions: `ASST` (asset table and per-scene prefetch lists), `LOCx` (per-language text), `XTNS` (extension statements). Layer tables for layered sprites (plan §6.5) extend `CHAR` in a later minor version.

## 2. Sections

All counts and fields are u32 unless noted.

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
Every dialogue line, narration line, menu option, and menu prompt has an entry.
```
count
entries[count] = { line_id: u32, speaker: str, text: u32, flags: u32 }
```
- `line_id`: the 30-bit value of the `#line:` ID (Crockford base32, first character most significant), or `0xFFFFFFFF` for lines without one (menu prompts, untagged lines).
- `speaker`: string index of the character id; 0 for narration, options, and prompts.
- `text`: index into `TEXT`.
- `flags`: bit 0 menu option, bit 1 `once` option, bit 2 menu prompt.

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
| RAND | 0x32 | | n → a uniform value in [0, n) from the seeded RNG; 0 if n ≤ 0 |

Integer overflow wraps (two's complement); language.md open question 3 tracks whether release builds should clamp instead.

### 2.8 `DBUG`: debug info
```
count
entries[count] = { pc: u32, file: str, line: u32 }
```
Sorted by `pc`; an entry applies from its pc until the next entry. `line` is 1-based.

## 3. Loader rules (runtime)

The loader validates everything **once**, before running (plan §5.4), and rejects the file with a friendly error otherwise (content errors never `abort()`):
1. Magic, major/minor, `file_size`, and CRC.
2. Every section lies inside the file, is 4-byte aligned, and its counts fit its size.
3. Every string index < string count; every string is NUL-terminated inside `STRS`.
4. Every var, char, line, text, and scene index is in range; `TEXT` programs end with `END` inside the section and nested `SELECT` texts are in range.
5. Every instruction's `argc` matches its opcode (fixed for most ops; computed for SHOW and MENU), every instruction ends inside `CODE`, and every pc argument (JMP, JZ, CALL, MENU targets, scene entries) points at an op word.

After validation the interpreter needs no further bounds checks.

## 4. Compilation notes

- Scenes are compiled in name order; each scene's body ends with `END` when it can fall off its end (warned as HW0320).
- `speaker attrs "text"` compiles to `SHOW speaker` (attributes only, position kept) followed by `SAY`.
- `if/elif/else` compiles to `JZ`/`JMP` chains. A menu compiles its option conditions (`PUSH 1` for options without one), then `MENU`, then each option body; bodies that fall through end with `JMP` to the gather point after the menu.
- `$ x += e` compiles to `LOAD x`, `e`, `ADD`, `STORE x`.
- The compiler is deterministic: the same project always produces identical bytes.
