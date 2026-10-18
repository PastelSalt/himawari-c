# Himawari Script Data Contract

The specifications every Himawari tool agrees on (plan §5). `@himawari/core` implements them and is the authority on semantics; the runtime reads only compiled bytecode. License: CC-BY-4.0 (see [LICENSE.md](LICENSE.md)). Changes go through [`rfcs/`](../rfcs/).

| Document | What it covers | Version |
|---|---|---|
| [language.md](language.md) | The `.hws` script language | 0.2.0-draft |
| [grammar.ebnf](grammar.ebnf) | Its grammar | with the language |
| [manifest.schema.json](manifest.schema.json) | `himawari.json` (JSON Schema 2020-12) | 1.0.0-draft |
| [character.schema.json](character.schema.json) | Character frontmatter, including layered sprites | 1.0.0-draft |
| [ast.schema.json](ast.schema.json) | The AST as JSON (`read_scene` with `format: ast`) | 1.0 |
| [bytecode.md](bytecode.md) | The compiled `.hwb` format the runtime loads | 1.0, frozen |
| [agent-guide.md](agent-guide.md) | What AI assistants are told (layer 1 instructions) | 1.1 |
| [llm-reference.md](llm-reference.md) | The script language on two pages, for language models | with the language |
| [debug-protocol.md](debug-protocol.md) | How Studio drives the runtime in its preview (stdin/stdout JSON lines) | 1 |

[`examples/`](examples/) holds the plan's sample `himawari.json` and character file; the schema tests validate them.
