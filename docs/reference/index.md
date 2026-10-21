# Reference

Precise descriptions to look things up in. If you're learning, start with the [tutorial](../tutorials/first-game.md) instead.

## The Script Data Contract (`spec/`)
The files every Himawari tool agrees on. They are licensed CC BY 4.0, so you can implement them in your own software.

| Document | What it covers |
|---|---|
| [Overview](../../spec/README.md) | What's in the contract, and its versions |
| [Script language](../../spec/language.md) | The `.hws` language for scenes |
| [Grammar](../../spec/grammar.ebnf) | The language's grammar |
| [Project manifest](../../spec/manifest.schema.json) | `himawari.json` |
| [Characters](../../spec/character.schema.json) | Character files, including layered sprites |
| [Themes](../../spec/theme.schema.json) | `theme/theme.json`: the look and layout of the built-in menus |
| [Extensions](../../spec/extension.schema.json) | Signatures for custom statements written in C |
| [Bytecode](../../spec/bytecode.md) | The compiled `.hwb` format the runtime plays |
| [Asset packs](../../spec/pack.md) | `.hwp` packs and patches |
| [Debug protocol](../../spec/debug-protocol.md) | How Studio drives the game in its preview |
| [AST](../../spec/ast.schema.json) | The script as JSON |
| [License](../../spec/LICENSE.md) | CC BY 4.0 |

## For AI assistants
| Document | What it covers |
|---|---|
| [Agent guide](../../spec/agent-guide.md) | The rules Himawari gives an AI assistant |
| [Script language for models](../../spec/llm-reference.md) | The language on two pages |
| [AI setup](../ai-setup.md) | Connecting Claude Code or the Claude desktop app |

## Tools
| Tool | What it is |
|---|---|
| **Himawari Studio** | The editor, with the game playing beside it |
| **`hwc`** | The command line: `check`, `fmt`, `build [--release] [--patch]`, `run`, `playtest`, `graph`, `l10n`, `report ai-content`, `ai setup`, `init`, `disasm` |
| **`himawari-mcp`** | The server that lets Claude apps work on a project |
| **`himawari.exe`** | The runtime that plays a game, for example `himawari --project <folder>` while you're developing |

The README in the repository has [the build and command details](../../README.md).

## Decisions and history
| Document | What it covers |
|---|---|
| [RFCs](../../rfcs/README.md) | Written records of language and engine decisions |
| [The plan](../../planning/DETAILED_PLAN.md) | The full design and roadmap |
| [Research](../../planning/RESEARCH.md) | The evidence behind decisions |
| [Log](../../planning/LOG.md) | Progress and the decision register |

## Project policies
[Contributing](../../CONTRIBUTING.md) · [Governance](../../GOVERNANCE.md) · [Privacy](../../PRIVACY.md) · [Security](../../SECURITY.md) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
