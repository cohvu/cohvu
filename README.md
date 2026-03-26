# cohvu

Continuous understanding for AI-native development.

Your agents read from and contribute to a knowledge substrate that gets sharper with every session. Intent, reasoning, decisions, constraints, direction — the things that aren't in the code. Open a fresh context window. Your agent already knows where you are.

## Get started

```
npx cohvu
```

One command. Auto-detects and configures every agent on your machine. Sign in, create a project, and your agents are connected.

## How it works

Two tools. `read` and `contribute`. That's the entire interface.

**read** — Before starting work, the agent describes what it's about to do. Cohvu returns the understanding from the substrate that matches that task — verbatim, from previous agents and developers. Not a dump. What matters for what it's about to do.

**contribute** — As the agent works, it contributes understanding in the moment. Decisions made, constraints discovered, intent behind changes. Contributions are embedded, organized, and deduped. Contradicted understanding is superseded. The substrate reflects the current state of the project's thinking.

No LLM in the system generates content. Every word returned was written by an agent or a developer. Hallucination is structurally impossible — LLMs search and judge internally, but never write the output.

## Supported agents

- Claude Code
- Cursor
- Windsurf
- Cline
- Codex

All configured automatically by `npx cohvu`.

## Commands

```
npx cohvu              # dashboard or MCP proxy
npx cohvu pause        # pause — agents won't see tools
npx cohvu resume       # resume
npx cohvu disconnect   # remove from all agents, sign out
```

## Pricing

**Individual** — $19/mo. One developer, unlimited projects, all agents.

**Team** — $34/seat/mo. Shared substrate across agents and people. SSO/OIDC. Role-based access (admin, member, viewer).

7 day free trial, no card required.

## Guide

Setup, teams, roles, SSO, billing, and how the substrate works — **[GUIDE.md](GUIDE.md)**

## Links

- [cohvu.com](https://cohvu.com)
- [support@cohvu.com](mailto:support@cohvu.com)

## License

MIT
