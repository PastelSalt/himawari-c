# Scripts

Development tools, run with Node from the repo root. None of them ship with
Himawari. The test map is in [tests/README.md](../tests/README.md).

| Folder or file | What it's for |
|---|---|
| `check-links.mjs` | Checks that every relative link in the Markdown files resolves (part of `corepack pnpm check`). |
| `break/` | Breaking the app on purpose ([planning/BREAK_IT.md](../planning/BREAK_IT.md)). `stories.mjs` writes random valid stories and plays them through the runtime (every path, saves and rollback at every line, saves into edited stories, patches). `overnight.mjs` runs every fuzz target and the property tests for hours, with a morning report: optional, before a release. Output goes to `runtime/build/break/` (not committed). |
| `stress/` | Big projects. `make-project.mjs <folder>` writes a ≈ 36 000-line game; `tools.mjs <folder>` and `studio.mjs <folder> <out>` time the AI tools and Studio on it. |
| `release/` | The clean-machine test ([FINALIZATION.md](../planning/FINALIZATION.md) §11.5): `clean-machine.mjs` starts a fresh Windows Sandbox (no network, no Node, no developer tools) that installs Studio from the installer, builds a sample game with only what the installer brought, plays a few frames, and writes `scripts/release/out/clean-machine/report.txt` and `game.png`. `inside-sandbox.ps1` runs inside it. Needs Windows Sandbox turned on and a packaged installer. |

Studio's own build scripts (staging resources, the standalone tools exe, the
locale check) live in `packages/studio/scripts/`.
