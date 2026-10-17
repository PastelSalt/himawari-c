# RFC 0005: Layered sprites in bytecode (`SPRT`) and attribute merge

- **Status:** **Accepted** 2026-10-17 (Phase 2, under the owner's go-ahead; the format is still a pre-freeze 1.0 draft, see rfcs/0004)
- **Created:** 2026-10-17
- **Affects:** `spec/bytecode.md` §2.9, `@himawari/core` (character reader, compiler, writer, reader, disassembler), the C loader, VM, saves, and player
- **Plan references:** §6.1, §6.2, §6.5, §18 Phase 2 ("renderer with layered characters, blink and lip-flap")

## Problem
Phase 2's renderer must draw layered characters, but the runtime only knew a character's id, name, and color. The VM treated attributes as a plain set, so `show hana annoyed` after `show hana smile` left both expressions active (visible in the session 10 transcripts), and `-glasses` could not hide a *default* attribute.

## Decision
- A new optional section **`SPRT`** carries, per character with a sprite: the root folder, anchor, scale, groups bottom to top with flags (`always`, `multiple`, `blink`, `lipflap`), defaults and known attributes, presets as (group, attribute) layers, and `hide`/`show` rules with `when` words. Plan §6.5 said "layer tables extend `CHAR`"; a separate optional section keeps `CHAR` fixed-size and costs nothing for games without sprites.
- **Attribute merge** moves into the VM (it owns the display state that saves and rewinds restore): presets set their layers; an attribute replaces its group's previous one unless the group is `multiple`; `-attr` on a default keeps it off until re-added (stored as a "removed" marker). The renderer resolves what is in effect (set attributes, else defaults, `always` groups, then rules).
- A rule's `when` word matches an attribute in effect, **or a preset whose attributes are all in effect** (so `hide: glasses, when: surprised` works with presets, as the plan's example writes it).
- Files: `<root>/<group>/<attr>.png`; frames `<attr>_half`, `<attr>_closed` (blink), `<attr>_open` (lip-flap), as in plan §6.2 and the validator.

## Alternatives
- **Integer masks per character (plan §6.5's wording).** Deferred: string indices are already deduplicated, so comparisons are integer compares; masks can come with the packer if profiling asks for it.
- **Resolve attributes in the renderer only.** Rejected: saves and rewinds would then restore a different picture than the player saw.

## Consequences
- Conformance transcripts change where characters have sprites (`basic`): `show` now prints the merged state.
- Save format v1 stores removed markers as `-name` strings.
- Views (`side` portraits) and tints remain for later.
