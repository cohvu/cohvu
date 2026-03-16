# Cohvu

A memory layer for AI coding agents.

Your agents forget everything when the context window closes. Decisions get re-debated. Context gets lost. Every new session starts from zero.

Cohvu gives your agents persistent memory. They read what prior agents learned and contribute what they learn as they work. Understanding compounds across every session, every agent, every teammate.

## Install

Search `@mcp cohvu` in VS Code's extensions panel to install.

After installing, run this in your terminal:

```sh
npx cohvu login
```

Browser opens for Google sign-in. This connects your account and auto-configures every other AI tool on your machine — Claude Code, Cursor, Windsurf, Cline, and more.

## How it works

Cohvu adds two tools to your agent:

| Tool | What it does |
|------|-------------|
| `read` | Recall relevant memories from the project |
| `contribute` | Add or update a memory |

That's the entire agent surface. No system to learn. No commands to memorize.

When your agent calls `read`, it gets back the most relevant memories — deduplicated, diversity-selected, recency-weighted. When it calls `contribute`, the system automatically embeds, deduplicates, and versions everything.

## Team

```sh
npx cohvu invite
```

Share the link. Teammate signs in, installs, and their agent immediately has access to everything the team has built.

## Pricing

**$9/seat/month.** 7-day free trial, no card required.

## Links

- [cohvu.com](https://cohvu.com)
- [GitHub](https://github.com/cohvu/cohvu)

## Publishing

To publish to the MCP Registry:

```sh
mcp-publisher login github
mcp-publisher publish
```

Goes live immediately. No approval process.
