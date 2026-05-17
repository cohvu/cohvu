# Cohvu

**The living substrate of project understanding for AI-native development.**

Code tells an agent *what*. It never tells it *why* — the decisions, the
constraints discovered the hard way, the intent that shaped the
architecture, the alternatives that were ruled out. That reasoning lives
in someone's context window, and without a substrate it's gone the
moment the session ends.

Cohvu is that substrate. It captures the *why* from natural work,
maintains its own coherence, and surfaces it back into the session where
the work is happening. Every agent's session works through the
accumulated reasoning of every prior session.

This repository is the **Claude Code plugin marketplace** for Cohvu.

## Install

**1. Install the `cohvu` CLI and authenticate** (one-time, per machine):

```
npm install -g cohvu
cohvu auth
```

**2. Add this marketplace and install the plugin** (inside Claude Code):

```
/plugin marketplace add cohvu/cohvu
/plugin install cohvu@cohvu
```

**3. Link a project** — run this once in a repo you want Cohvu on:

```
cohvu init
```

That writes a `.cohvu` file (commit it — teammates inherit the link).
Cohvu is active only in repos that have one.

## What the plugin gives Claude Code

- **Ambient hooks** — every session event (a prompt submitted, a tool
  about to run, a turn finishing, a session opening or compacting) flows
  through Cohvu's substrate-aware reasoner. It's quiet by default and
  intelligent when it speaks — delivering the project's *why* into the
  moment the agent is about to act.
- **The `substrate` tool** — the `cohvu` MCP server exposes one tool,
  `substrate(action)`: search, read, contribute, flag, and curate the
  project's understanding directly. The agent explores the substrate
  itself, whenever it wants.

## How it stays honest

Code stays in code. Source artifacts stay in their files. The substrate
stores *understanding* — and every entry carries a trail of every event
that touched it, with provenance and reasoning. Privacy and audit are
properties of the architecture, not features bolted on.

## Links

- [cohvu.com](https://cohvu.com)
- [support@cohvu.com](mailto:support@cohvu.com)

## License

MIT — see [LICENSE](LICENSE).
