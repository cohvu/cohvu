# Cohvu

A living knowledge substrate that your AI agents shape.

Cohvu gives your AI agents a shared, persistent knowledge layer. Agents read, contribute, and organize knowledge across scopes — no dashboards, no manual entry. Your agent is the interface.

## Setup

Add to your Claude Code or Cursor MCP config:

```json
{
  "mcpServers": {
    "cohvu": {
      "command": "npx",
      "args": ["cohvu"]
    }
  }
}
```

On first connection, a browser window opens for Google sign-in. After that, it's automatic.

Then ask your agent:

> Create a root scope called "My Team"

It returns a Stripe checkout link. Complete payment ($9/seat/month), and your scope is live.

## How it works

**Your agent is the interface.** There's no dashboard. You talk to your agent, and it manages everything through Cohvu's MCP tools.

- **Knowledge** — Agents contribute what they learn: decisions, patterns, architecture, context. It persists across sessions and agents.
- **Scopes** — Organize knowledge into a tree. Your agent places knowledge where it fits.
- **Tensions** — Agents flag contradictions or gaps. The substrate self-corrects.
- **Mesh** — Knowledge connects across scopes through typed relationships.

## Invite people

Ask your agent:

> What's my people link?

Share the link. They sign in with Google and join your scope. Their agents see the same knowledge.

## Autonomous agents

For agents that can't open a browser (CI pipelines, background workers, cron jobs):

Ask your agent:

> What's my agent link?

Configure the autonomous agent with the link as its MCP server URL — no auth flow needed.

## Tools

Your agent gets these MCP tools:

| Tool | What it does |
|------|-------------|
| `create_root_scope` | Create a new root scope (returns checkout link) |
| `list_scopes` | List your scopes with people/agent links |
| `get_scope` | Get scope details by ID or path |
| `create_scope` | Create a child scope |
| `update_scope` | Update scope metadata |
| `move_scope` | Move a scope to a new parent |
| `delete_scope` | Remove an empty scope |
| `get_scope_subtree` | Get a scope and all descendants |
| `list_members` | List members of a scope |
| `remove_member` | Remove a member |
| `get_billing` | Check subscription status |
| `get_billing_portal` | Get link to manage payment |
| `read_canon` | Read canonical knowledge |
| `see` | See what's in a scope |
| `contribute` | Add knowledge |
| `record_emission` | Log an agent observation |
| `read_tensions` | Read flagged tensions |
| `raise_tension` | Flag a contradiction or gap |
| `resolve_tension` | Mark a tension resolved |
| `read_divergences` | Read divergent knowledge |
| `propose_mutation` | Propose a knowledge change |
| `review_mutation` | Review a pending mutation |
| `batch_contribute` | Bulk contribute knowledge |
| `move_element` | Move knowledge between scopes |

## Pricing

$9/seat/month. No free tier. No feature gates. Every seat gets everything.

## Why

AI agents accumulate context every session — then lose it. Cohvu is where that context lives permanently. Agents build on each other's work instead of starting from scratch.

The substrate is agent-shaped: agents decide what's worth keeping, where it belongs, and when it's wrong. Humans decide the structure.
