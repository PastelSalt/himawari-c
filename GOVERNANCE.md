# Governance

Himawari is made by **Moeko Works** (GitHub: [`PastelSalt`](https://github.com/PastelSalt)). This page says, plainly, how decisions are made, so nobody has to guess.

## The model: a benevolent dictator (BDFL)
For v1, **Moeko Works decides**. That means the project lead (the owner of the repository) has the final say on what goes into Himawari, what doesn't, and when it ships. We chose this on purpose: Himawari has a clear core idea, and a single decision-maker keeps it focused.

The core idea, which every decision is measured against:

> **Easy enough for anyone, open enough for coders, light enough for any Windows PC.**

In practice, that means:
1. **No code needed.** Everything can be done in Studio's UI.
2. **Coders are welcome.** The same project is plain text files, a command line, and git.
3. **Games run on any Windows 10/11 PC**, from a double-click, with nothing to install.
4. **AI is an optional helper**, never required and never in the way.

Being "BDFL" doesn't mean decisions are made in secret or on a whim. Reasons are written down in public, in [`LOG.md`](planning/LOG.md) (the decision register) and in [`rfcs/`](rfcs/).

## How things get decided
| Kind of change | How it's decided |
|---|---|
| Bug fixes, docs, tests, small improvements | A pull request, reviewed by a maintainer. CI must pass. |
| New features that don't change the language or file formats | A pull request or an issue discussion. The lead may ask for a design note first. |
| **Anything that changes the language, bytecode, schemas, pack format, or other files in `spec/`** | **An RFC is required.** See below. |
| Big engine decisions that need a written record (a new dependency, a new rendering approach) | An RFC. |
| Moving something onto or off the "not planned" list | The lead decides, with a note in the decision register. |

### The RFC gate
Changes to the Script Data Contract are risky because games, tools, and AI assistants all rely on it. So they pass through the [RFC process](rfcs/README.md):

1. Write the proposal (`rfcs/NNNN-short-title.md`) and open a pull request.
2. Anyone can comment. Discussion happens on the pull request.
3. The lead accepts or rejects it, and writes down why.
4. Only then does the spec change land, in its own pull request, with conformance tests.

Once v1.0 ships, Himawari follows [SemVer](https://semver.org/) for each package and for each spec. Engine 1.x keeps bytecode, save, and manifest compatibility. A feature is deprecated for **at least two minor versions** before it's removed.

## Not planned
These are decisions, not oversights. Please don't send pull requests for them, and don't wait for them. If you really think one should change, open an RFC that explains what has changed since.

| Not planned | Why |
|---|---|
| **Linux (games, Studio, or CI) before v1.** | Windows-only keeps the first release small, tested, and reliable. A Linux port is a *future improvement after v1*. The portable code (`core/`, `text/`) is kept clean so it stays a small change. |
| **AI-generated images, music, sound, voice, or video. Ever.** | AI in Himawari is a development assistant for text and checking. Missing art shows as procedural placeholders until you add your own. This is a promise to creators and players, not just a roadmap choice. |
| **Live AI inside shipped games.** | Games are small, offline, predictable programs. They contain no AI, make no network calls to AI services, and need no key. |
| **Telemetry or analytics in Studio or in games.** | See [PRIVACY.md](PRIVACY.md). |
| **Locking engine features behind payment.** | The engine is never feature-gated. |

## Maintainers
- **Project lead:** Moeko Works ([`PastelSalt`](https://github.com/PastelSalt); [website](https://moekoworks.vercel.app/), [contact](https://moekoworks.vercel.app/contact)).
- **Maintainers** can review and merge pull requests. They're added by the lead, based on a record of good contributions and good judgment. Maintainers can be removed the same way, or step down whenever they like.
- **Contributors** are everyone else. Your name stays in the git history, and you keep the credit for what you did.

If the lead becomes unable to continue, they'll try to name a successor in the repository. If they haven't, the active maintainers may agree on one in public. The licenses (zlib, MIT, CC BY 4.0, CC0) let anyone fork the project at any time.

## Code of Conduct
Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). The lead and the maintainers enforce it.

## Changing this document
Changes to GOVERNANCE.md are proposed as pull requests and decided by the lead, with a note in the decision register.
