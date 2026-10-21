# RFC 0006: Studio's docked preview, the debug protocol, and AI live sync

- **Status:** **Accepted** 2026-10-18 (Phase 4, under the owner's go-ahead)
- **Author:** Claude (Opus 5.5) for Moeko Works
- **Created:** 2026-10-18
- **Affects:** `spec/debug-protocol.md` (new, version 1) · `spec/agent-guide.md` 1.0 → 1.1 · runtime (`--link`, `--parent-window`) · `@himawari/tools` (`ToolContext.propose`, `rationale`) · himawari-mcp (`/http`, `/studio-link`) · studio
- **Plan references:** §2 P1–P4, P12 · §4.1 · §4.2 · §10.7–§10.9 · §11.3 · §11.4

## Summary
Studio shows the real runtime inside its preview pane and drives it over a JSON-lines pipe on stdin/stdout (`spec/debug-protocol.md`). While Studio has a project open it owns writes: AI writes, from a Claude app through himawari-mcp (Mode A) or from the built-in assistant (Mode B), become proposals a person accepts or rejects.

## Motivation
P2–P4 need the preview to be the real game (same renderer, same text layout, same saves) that reloads in place after each edit, highlights the line being played, and can play from any line. P12 and §4.2 need every AI change reviewed, with one gate for both ways of working with AI.

## Design
- **Docking.** `--parent-window HWND` makes the SDL window a borderless child of Studio's window (the approach Unity's `-parentHWND` uses). Studio reserves a 16:9 area in the pane and sends its rectangle in device pixels; it hides the game while a dialog covers the pane, because the game is a separate native window drawn above the page.
- **The pipe.** Commands and events as in `spec/debug-protocol.md`. The runtime reports state changes by diffing what the player sees once per frame, rather than hooking every code path. The JSON reader (`core/hw_json.c`) handles only flat objects, never crashes on malformed input, is unit-tested, and is fuzzed in CI (`fuzz_json`). Reload reuses F5's save-and-remap, so play-as-you-write keeps the player's position, choices included.
- **Play-as-you-write.** Studio autosaves each text file 250 ms after typing stops (new script lines get their hidden line IDs first), rebuilds `build/game.hwb` 60 ms later, and sends `reload`. Measured: an edit reaches the running game in about 0.3 s; a new project's first line plays about 1.5 s after Create (P1 budgets: 1 s and 60 s; checked in CI).
- **One gate for AI writes.** `ToolContext.propose` (in `@himawari/tools`): when set, a write that passed validation isn't written; it's handed to the host, which answers *accepted*, *rejected* (with the person's reason), *pending* (no decision within 90 s; the AI is told not to resend), or *withdrawn*. Every write tool takes an optional `rationale`, the AI's one-line explanation, shown as the proposal's headline. Accepting writes through Studio's project service; if the file changed since the AI read it, the change is merged by context, and if the same lines changed, nothing is written and the AI is asked to read the file again.
- **Mode A live sync** (plan §4.2). Studio serves the same himawari-mcp server over HTTP on 127.0.0.1 (random bearer token, Host-header validation, MCP SDK v2 `createMcpHandler`, stateless) and writes `.himawari/session.json` with `{version, url, token, pid}`. The stdio himawari-mcp a Claude app runs reads that file for each write tool and forwards the call (reads, dry runs, and exec tools stay local). A file whose process is gone, or an endpoint that doesn't answer, means writing directly as before. The plan's `.himawari/lock` and undo journal for Studio-less writes are not part of this RFC.
- **Mode B** uses the same registry as SDK tools (Anthropic TypeScript SDK `betaZodTool` and the streaming tool runner) and the same `propose` gate.

## Ease-of-use check
P1 (measured, in CI), P2 (reload in place), P3 (line highlight both ways; the editor follows the game), P4 (▶ and Ctrl+Enter play from any line; skip to the next choice), P9 (AI changes go into the unified history and can be undone), P12 (rationale, diff, and validation results per proposal).

## Alternatives considered
- **Streaming frames into a canvas** instead of docking a window: avoids native-window layering, but costs bandwidth and latency and needs an encoder in the runtime. Docking is simpler and shows the true picture.
- **A separate preview window** next to Studio: no layering problems, but it breaks "write and play in one place" (P2).
- **A custom JSON-over-HTTP endpoint** for live sync instead of MCP: less code, but MCP lets other MCP clients talk to Studio directly later, and reuses the same server.
- **Writing AI changes immediately with undo** instead of proposals: faster, but against P12 and plan §11.4.

## Compatibility and versioning
New spec document `debug-protocol.md` at version 1. `agent-guide.md` 1.1 (proposals, `rationale`). Tool input schemas gain the optional `rationale` field (additive). No bytecode or save changes.

## Open questions
- Docking relies on Windows' cross-process child windows, which share an input queue with the parent; a hung runtime could make Studio's window unresponsive until it's killed. Studio restarts a preview that exits, but doesn't yet watch for a hung one.
- The 90 s wait before *pending* is a guess at MCP clients' tool timeouts.
