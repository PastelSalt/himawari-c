# RFC 0003: Text stack, FreeType + libunibreak vs SDL3_ttf (Spike C)

- **Status:** Draft. Verified on Windows 2026-10-17; Linux and CI pending
- **Created:** 2026-10-17
- **Affects:** runtime (`text/`), `spec/language.md` (ruby), plan §7, §8.2, §8.6
- **Plan references:** §7, §8.6, §18 Phase 0 · RESEARCH.md §4.3, §4.4, §15

## Question
Should Himawari-C use SDL3_ttf as its font, atlas, and shaping layer under our own VN layout, or FreeType directly with our own glyph atlas?

## What was built
- **`runtime/src/text/hw_layout.{h,c}`**, our VN paragraph layout. Pure C: no SDL, no font library; advances come from a callback.
  - UAX #14 break opportunities from **libunibreak 8.0** (Unicode 17), with `lang = "ja"`.
  - A **strict JLREQ kinsoku override table**. No line may start with a closing bracket, hyphen, `！？`, middle dot, `。．`, `、，`, an iteration mark, `ー`, or small kana (cl-02 to cl-11), and none may end with an opening bracket (cl-01). Inseparables (`——`, `……`) never split.
  - **Hanging punctuation** (burasagari) for `、。，．`, which can be switched off (then those marks push the previous character down).
  - **Ruby**: each ruby group is unbreakable and as wide as max(base, ruby). The narrower side is spread 1:2:1, so ruby never overhangs neighbors (W3C Simple Ruby). Ruby is half the base size, and every line reserves a ruby band, so line pitch stays constant.
  - Output: positioned glyphs with a **reveal index** for typewriter display. Ruby appears with the first character of its base group.
  - Input is pre-structured runs (`{text, ruby}`), never markup: the runtime does not parse source text (D01). Core compiles `{rb=…}…{/rb}` into runs.
  - Tests: `runtime/tests/test_layout.c`, deterministic with fixed advances. Covers every kinsoku class, hanging on and off, inseparables, Latin wrapping, emergency splits, and both ruby spreading cases.
- **Two glyph backends** behind one interface (`runtime/spikes/c_text/glyphs.h`) with a shared shelf-packed atlas and an outline-under-fill renderer:
  - `glyphs_ft.c`: FreeType directly. Fallback chain by `FT_Get_Char_Index`, outlines with `FT_Stroker`. 141 lines.
  - `glyphs_ttf.c`: SDL3_ttf 3.2.2 glyph API: `TTF_AddFallbackFont`, `TTF_SetFontOutline`, `TTF_GetGlyphImage`, `TTF_GetGlyphMetrics`. 124 lines.
  - Built as `spike_c_ft.exe` and `spike_c_ttf.exe`, so each size can be measured alone.
- Test paragraph: about 110 characters of original Japanese with four ruby groups, mixed with Latin, using the fallback chain Segoe UI → Yu Gothic, at 48 px base / 24 px ruby with a 3 px outline.

## Results (Windows 11, RX 580, GCC 16.2 UCRT64, release builds, 3 runs each)

| | FreeType direct | SDL3_ttf |
|---|---|---|
| Output | ✅ correct | ✅ visually identical |
| Ruby, fallback, mixed Latin/JP baseline | ✅ | ✅ |
| Outline placement | ✅ exact from `FT_Stroker` bitmap offsets | ⚠️ needed a workaround: outline metrics don't line up with the fill, so the outline image is centered on the fill box |
| Font init (2 fonts × 2 sizes) | ~0.75 ms | ~2.6 ms (8 `TTF_Font`s: outline needs its own fonts) |
| First layout (loads glyph metrics) | ~0.72 ms | ~1.72 ms |
| Warm layout, 110-char paragraph | ~7 µs | ~7.5 µs |
| Rasterize 156 glyphs (outline + fill) into the atlas | **~8.9 ms** (~57 µs/glyph) | **~15.2 ms** (~96 µs/glyph) |
| Working set after raster | 27.7 MB | 29.3 MB |
| Release `.exe` | 5,372,928 B (5.12 MB) | 5,394,944 B (5.15 MB, **+22 KB**) |

Size breakdown: SDL alone is 4.14 MB (Spike B). FreeType + libunibreak + our layout add ~1.0 MB. Per library (debug objects, so code is inflated but tables are not): FreeType ~0.9 MB (all modules built in), libunibreak ~135 KB (mostly UAX #14 tables), our layout 6.5 KB. Atlas: 156 glyphs at 48 px with outlines fill 5.3 % of one 2048² page, so roughly 2,900 glyphs per page.

**Kinsoku on real font metrics:** 131 textbox widths (300–1600 px) × 3 modes × 2 backends, with the spike checking its own output:

| Mode | Widths with violations | Hanging marks | Non-hangable overflow |
|---|---|---|---|
| Strict + hanging | **0** / 131 | 74 | 0 |
| Strict, no hanging | **0** / 131 | 0 | 0 |
| UAX #14 only (libunibreak, `lang="ja"`) | **19** / 131 (`っ` at line start) | 0 | 0 |

Both backends gave identical results. Screenshots: [paragraph](assets/0003-paragraph-freetype.png), [the three modes at width 600](assets/0003-kinsoku-modes-w600.png), [outline FreeType (top) vs SDL3_ttf (bottom), 4×](assets/0003-outline-ft-vs-ttf.png).

## Answers to the spike's questions
1. **JP paragraph with ruby and kinsoku:** done, with our layout over either backend. libunibreak alone is **not** enough for Japanese: it allows small kana at line starts, so the JLREQ override table is required.
2. **Per-glyph reveal and outlines:** SDL3_ttf's text objects (`TTF_Text`, with built-in wrapping) cannot do kinsoku, ruby, or per-glyph reveal. We would use only its glyph-level API, which is what this spike compared. Outlines work in both; FreeType's are exact, SDL3_ttf's need a placement workaround.
3. **Fallback chains:** both work (SDL3_ttf: `TTF_AddFallbackFont`; FreeType: one short `face_for` loop in `glyphs_ft.c`).
4. **Atlas:** ours in both cases, shelf-packed, about 2,900 outlined 48 px glyphs per 2048² page. Multi-page and LRU eviction are still to do (plan §8.6).
5. **Size:** a tie (+22 KB for SDL3_ttf). The text stack's real cost is FreeType (~0.9 MB unstripped).

## Proposed decision
**Use FreeType directly, plus libunibreak and our own layout (`src/text/hw_layout.c`). Do not use SDL3_ttf.**
- SDL3_ttf's higher-level features don't fit VN layout, and its glyph API offers little over FreeType: the FreeType backend is only 17 lines longer than the SDL3_ttf one, including fallback and outlines.
- FreeType direct is ~1.7× faster to rasterize and initialize, uses ~1.6 MB less memory, and places outlines exactly.
- One fewer pinned dependency (SDL3_ttf's latest release is from March 2025).
- **Revisit at Tier 2 (HarfBuzz, plan §7):** SDL3_ttf bundles HarfBuzz integration, which is its strongest argument. Using `hb-ft` directly with our FreeType faces is the expected path.
- The plan's dependency table (§8.2) needs no change: FreeType + libunibreak were already the plan of record. Update RESEARCH.md §4.4: libunibreak 8.0 implements Unicode 17, not 15.0.

## Follow-ups
- [ ] Trim FreeType to the modules we need (TrueType, CFF/OpenType, sfnt, smooth, autofit) with a custom `ftmodule.h`. Measure the saving.
- [ ] JLREQ justification (ryōdori) for full lines, and optional punctuation compression (plan §7).
- [ ] Latin kerning (`FT_Get_Kerning`); neither backend applied it in the spike.
- [ ] Ruby reveal timing: currently all at once with the group's first character; consider spreading it across the group.
- [ ] Atlas pages + LRU; glyph rasterization off the main thread (plan §8.5 prefetch).
- [ ] The layout allocates with `malloc` per paragraph; fine per line shown, but the runtime should use its arena (no frame-loop allocations, §8.1).
- [ ] Linux preview build (WSL2) and CI.
