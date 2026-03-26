# Guide

Everything you need to set up and use Cohvu.

## Setup

```
npx cohvu
```

This does everything:

1. Opens your browser to sign in with Google (or SSO if your team requires it)
2. Detects every AI coding agent on your machine
3. Writes the MCP config for each one
4. Writes the instruction file that tells agents how to use Cohvu
5. Creates your first project if you don't have one

After setup, your agents will call `read` and `contribute` automatically on their next session. You don't need to do anything else.

### Supported agents

| Agent | MCP config | Instructions |
|---|---|---|
| Claude Code | `.claude.json` | `.claude/CLAUDE.md` |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/cohvu.mdc` |
| Windsurf | `.codeium/windsurf/mcp_config.json` | `.codeium/windsurf/memories/global_rules.md` |
| Cline | VS Code globalStorage | `Documents/Cline/Rules/cohvu.md` |
| Codex | `.codex/config.toml` | `.codex/AGENTS.md` |

All paths are relative to your home directory. Configs are written once and not overwritten if they already contain a `cohvu` entry.

### Re-running setup

Run `npx cohvu` again at any time. It's idempotent — it will update instruction files if the content has changed and skip everything else.

## The dashboard

`npx cohvu` opens an interactive terminal dashboard with five tabs:

- **Knowledge** — Browse, search, and manage the substrate
- **Team** — View members, change roles, invite people
- **Billing** — Subscription status, upgrade, manage payment
- **Project** — Switch projects, create new ones, rename, delete
- **You** — Your account, connected platforms, sign out

Navigate between tabs with `Tab` or number keys. Use arrow keys to scroll lists. Press `Enter` to select or confirm. Press `Escape` to go back or close modals.

## Projects

A project is a knowledge substrate. Each project has its own set of contributions, its own members, its own billing.

### Personal projects

Created when you first run `npx cohvu`. Owned by you. Only your agents read and contribute.

### Team projects

Created inside a team. All team members' agents read and contribute to the same substrate. Create a team project from the dashboard (Project tab → create).

### Switching projects

If you have multiple projects, switch between them from the dashboard (Project tab). Your active project determines which substrate your agents use for `read` and `contribute`.

## Teams

Teams share a knowledge substrate across multiple people and their agents. What one person's agent learns, every person's agent knows.

### Creating a team

From the dashboard, go to the Project tab and create a team. You become the admin. A 7-day free trial starts automatically.

### Inviting members

Admins can generate invite links from the Team tab. There's one link per role — admin, member, or viewer. Share the link. The person signs in and joins with that role.

Invite links can be regenerated at any time, which invalidates the old link for that role.

### Roles

**Admin** — Full control over the project and team.
- Create and delete projects
- Manage members (invite, change roles, remove)
- Configure SSO
- Clear the knowledge substrate
- Access billing and manage the subscription
- Delete the team

**Member** — Read and contribute to the substrate.
- Agents read and contribute automatically
- Can delete memories they contributed
- Cannot delete other people's contributions
- Cannot manage members or billing

**Viewer** — Read-only access.
- Agents can call `read` but not `contribute`
- Cannot delete any memories
- Cannot manage anything
- Useful for PMs, leads, or anyone who needs visibility without write access

### Changing roles

Admins can change any member's role from the Team tab. Select the member, press Enter, and choose the new role. The last admin cannot be demoted — promote someone else first.

### Removing members

Admins can remove any member. Members can remove themselves (leave the team). The last admin cannot leave — promote someone else first.

When a member is removed, the team's Stripe seat count is automatically adjusted.

## Billing

### Trial

Every new personal project and every new team gets a 7-day free trial. No card required. Agents work normally during the trial.

### Individual plan — $19/mo

One developer, unlimited projects, all agents. Subscribe from the Billing tab in the dashboard.

### Team plan — $34/seat/mo

Per-seat pricing. The seat count adjusts automatically when members join or leave — you don't manage it manually. Prorated when seats change mid-cycle.

Subscribe from the Billing tab. Only team admins can manage team billing.

### Managing your subscription

The Billing tab shows your current status, renewal date, and whether cancellation is pending. Press Enter to open the Stripe customer portal where you can update payment methods, view invoices, or cancel.

### What happens when billing lapses

Agents get an error message telling them the subscription needs attention. No contributions are lost — the substrate is preserved. Agents resume working as soon as billing is restored.

## SSO

Team admins can configure OIDC single sign-on for their team.

### Setting up SSO

From the dashboard, go to the Team tab and configure SSO. You need:

- **Issuer URL** — Your identity provider's OIDC issuer (e.g., `https://accounts.google.com`, your Okta domain, etc.)
- **Client ID** — From your identity provider
- **Client secret** — From your identity provider (encrypted at rest with AES-256-GCM)
- **Allowed domains** — Email domains that can sign in via this SSO connection (e.g., `company.com`)

Cohvu validates the issuer via OIDC discovery before saving the configuration.

### Require SSO

When enabled, users with email addresses on the allowed domains are blocked from signing in with Google. They must use SSO. This is enforced server-side — there is no way to bypass it.

### How SSO sign-in works

1. User enters their work email on the sign-in page
2. Cohvu looks up the SSO connection for that email domain
3. User is redirected to the identity provider (PKCE + nonce)
4. After authentication, the user is auto-provisioned into the team with the configured default role
5. The CLI detects the confirmed session and issues an API key

New users authenticated via SSO are automatically added to the team. The seat count on Stripe is updated automatically.

### Default role

When a new user is provisioned via SSO, they get the default role configured on the SSO connection (admin, member, or viewer). Admins can change the role afterward.

## The knowledge substrate

### What agents contribute

Agents are instructed to contribute understanding — not code, not implementation details obvious from the code, not narration of what they did. The things that would be lost when the session ends:

- Why a decision was made, not just what was decided
- Constraints discovered during work
- Intent behind changes
- Direction for the project
- What was tried and didn't work, and why

### How read works

When an agent calls `read`, it describes what it's about to work on. Cohvu uses vector search to find the contributions most relevant to that task. The agent receives those contributions verbatim — exactly as they were written by previous agents or developers.

No LLM generates the response. The search is LLM-driven (it chooses good queries and follows threads), but the output is the raw contributions. This is how hallucination is structurally prevented.

### How the substrate self-organizes

When a new contribution arrives:

1. It's stored immediately (the agent gets "Remembered." in ~50ms)
2. A background worker embeds it (vector representation for semantic search)
3. An LLM searches the existing substrate and classifies the new contribution:
   - **Keep** — default. The substrate is richer with more understanding.
   - **Supersede** — the new contribution explicitly reverses a prior decision. The old contribution is marked as superseded.
   - **Redundant** — nearly identical to something that already exists. The newer phrasing replaces the older one, and the old version is preserved in history.

The system biases heavily toward keeping contributions. Supersede requires an actual contradiction. Two contributions about the same topic with different details are always kept — that's added richness, not redundancy.

### Browsing the substrate

The Knowledge tab in the dashboard shows all active contributions, newest first. Use arrow keys to scroll. Press `/` to search by natural language. Press `f` to enter forget mode and select contributions to remove.

### Deleting contributions

- **Admins** can delete any contribution
- **Members** can only delete contributions they made
- **Viewers** cannot delete anything

Deletion is permanent. The contribution is removed from the substrate and from search results.

## Pause and resume

Pause Cohvu when you don't want agents using it for a session — a throwaway prototype, a sensitive refactor, or just a break.

**From the dashboard:** Press `p` on the You tab. Press `p` again to resume. The header shows "paused" from any tab.

**From the command line:**

```
npx cohvu pause
npx cohvu resume
```

When paused, agents don't see Cohvu's tools at all. They behave as if Cohvu was never installed. Your substrate, account, and configs are untouched — everything comes back on resume.

The pause state is checked once when an agent session starts. If you pause mid-session, the current session continues normally. The next session sees the paused state.

## Disconnect

Remove Cohvu from all agents and sign out.

```
npx cohvu disconnect
```

This reverses everything `npx cohvu` set up:

- Removes the `cohvu` MCP entry from every detected agent config
- Removes instruction sections from CLAUDE.md, .mdc rules, etc.
- Removes permissions (Claude Code settings.json)
- Deletes your local credentials

Your account and substrate on the server are not affected. Run `npx cohvu` to sign back in and reconnect everything.

## API key

Your API key is stored at `~/.cohvu/credentials` with `0600` permissions (owner read/write only). It's created during sign-in and used for all API communication.

The key format is `chv_` followed by 64 hex characters. It's hashed with SHA-256 on the server — the raw key is never stored.

## Troubleshooting

### Agent says "No projects found"

Run `npx cohvu` to create a project or switch to an existing one.

### Agent says "subscription requires attention"

Your trial ended or payment failed. Run `npx cohvu` and check the Billing tab.

### Agent isn't reading or contributing

Check that the MCP config exists for your agent. Run `npx cohvu` to re-run setup. The setup is idempotent and will fix missing configs.

### Agent says "Cohvu is paused"

You or someone on your machine ran `npx cohvu pause`. Run `npx cohvu resume` or press `p` on the You tab in the dashboard.

### Session expired

Run `npx cohvu`. If your API key is no longer valid, it will detect this and start a new sign-in flow.

### Want to remove Cohvu completely

Run `npx cohvu disconnect`. This removes all configs and signs you out. Run `npx cohvu` to reconnect.
