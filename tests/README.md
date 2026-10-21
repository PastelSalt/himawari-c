# Where the tests are

Himawari's tests live next to what they test, so each tool finds them where it
expects them. This page is the map. Day to day, `corepack pnpm check` runs
everything fast; the rest are run on purpose (see each row).

## Fast: every change (`corepack pnpm check`)

| What | Where | Notes |
|---|---|---|
| Unit tests | `packages/*/src/**/*.test.ts`, beside the code | Core, tools, MCP, CLI, Studio's main process and its helpers |
| Property tests (BREAK_IT.md E-7 to E-11) | `packages/core/src/properties.test.ts`, `packages/studio/src/main/screenplay-edit.properties.test.ts` | fast-check; `HW_PROPERTY_RUNS=20000` for more runs |
| Never-lose-work torture tests (FINALIZATION.md §11.7) | `packages/studio/src/main/torture.test.ts` | Japanese and long paths, locked files, crashes, `HW_FAULTS` disk faults |
| Hostile projects, the preview, the AI tools (BREAK_IT.md S-8 to S-23) | `packages/studio/src/main/hostile.test.ts`, `preview.test.ts`, `packages/tools/src/tools/hostile.test.ts` | |
| Conformance, compile half | `tests/conformance/` | Each case compiles to exact bytes; `UPDATE_CONFORMANCE=1` regenerates (review the diff) |
| Packs | `tests/packs/` | Byte-exact pack and patch fixtures |
| Templates and examples | `tests/projects.test.ts` | All check clean and compile |
| Scale | `tests/scale.test.ts` | A 36 000-line project compiles and playtests |
| Spec schemas, theme keys, the lint rule | `tests/spec/`, `tests/theme-keys.test.ts`, `tests/eslint/` | |
| Golden images | `tests/golden/` | Needs a built runtime; `HW_UPDATE_GOLDEN=1` regenerates (look at every image) |
| Studio's UI strings | `packages/studio/scripts/check-locales.mjs` | English and Japanese in sync |
| Markdown links | `scripts/check-links.mjs` | Every relative link resolves |

## The runtime (C)

From `runtime/`, after building a preset:

| What | Where | Run |
|---|---|---|
| Unit and conformance tests, saves anywhere (`test_saveany`) | `runtime/tests/` | `ctest --preset win64-debug` (and `win64-asan`) |
| Budgets (plan §8.1) | `runtime/tests/check_budgets.sh` | |
| Fuzz targets, seeds, and crash regressions | `runtime/fuzz/` (see its README) | `win64-fuzz` preset |

## Studio end to end

From `packages/studio/` (needs a built runtime):

| What | Where | Run |
|---|---|---|
| End-to-end: first run, edit → preview, export, the UI Designer, no code needed, accessibility, IPC garbage, Japanese UI | `e2e/studio.e2e.ts` | `corepack pnpm e2e` |
| The Studio monkey (BREAK_IT.md S-1 to S-4) | `e2e/monkey.chaos.ts` | `corepack pnpm chaos` (`HW_CHAOS_SEEDS`, `HW_CHAOS_ACTIONS`) |

## Longer runs, on purpose

| What | Where | Run |
|---|---|---|
| Generated stories through the runtime (BREAK_IT.md E-12 to E-16) | `scripts/break/stories.mjs` | `node scripts/break/stories.mjs --count 200` |
| The overnight run (optional, before a release) | `scripts/break/overnight.mjs` | `node scripts/break/overnight.mjs --hours 8` |
| Big-project timing | `scripts/stress/` | see `scripts/README.md` |
| A clean Windows machine | `scripts/release/` | Windows Sandbox; see `scripts/README.md` |
| AI evals (cost money) | `packages/evals/` | `node packages/evals/dist/main.js run` |

Every bug found gets a test that failed before the fix; the findings are logged
in [planning/BREAK_IT.md](../planning/BREAK_IT.md) §8.
