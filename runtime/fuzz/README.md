# Fuzz targets

libFuzzer targets for everything the runtime reads from outside (plan §16.1,
[planning/BREAK_IT.md](../../planning/BREAK_IT.md) §2.1). They build with the
`win64-fuzz` preset (MSYS2 CLANG64 first on `PATH`).

| Target | Reads | Seeds |
|---|---|---|
| `fuzz_hwb` | Compiled stories (`.hwb`), then plays whatever loads | `tests/conformance/cases/*/expected.hwb` |
| `fuzz_save` | Save files | written by `test_save` (`HW_WRITE_SAVE=…`) |
| `fuzz_pack` | Packs and patches (`.hwp`) | `tests/packs/*.hwp` |
| `fuzz_json` | Studio's messages to the docked runtime | none needed |
| `fuzz_utf8` | UTF-8 decoding | none needed |
| `fuzz_image` | JPEG and WebP (`src/app/hw_decode.c`); the first byte picks the decoder | `seeds/image/` |
| `fuzz_layout` | Text layout: line breaking, kinsoku, ruby (`src/text/hw_layout.c`) | `seeds/layout/` |

- **`regressions/<target>/`**: inputs that once crashed a target. `ctest --preset win64-fuzz` replays them on every fuzz build, so a fixed bug can't come back.
- **`seeds/<target>/`**: starting inputs for a corpus.

```bash
cd runtime
cmake --preset win64-fuzz && cmake --build --preset win64-fuzz
./build/win64-fuzz/fuzz_layout.exe -max_total_time=300 fuzz/seeds/layout
```

A crash writes `crash-<hash>`. Minimize it (`-minimize_crash=1`), add it to
`regressions/<target>/`, fix the bug, and log it in BREAK_IT.md §8.
