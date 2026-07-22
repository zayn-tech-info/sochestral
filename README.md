# SocialMCP

Open-source social media automation infrastructure for AI agents.

SocialMCP is a developer-first Model Context Protocol server that will let AI assistants create, validate, schedule, publish, and later analyze social content through official platform APIs.

The first version is **Bring Your Own App credentials**. Developers create their own platform apps, store app credentials locally, connect social accounts through OAuth, and keep encrypted account tokens in their own local or self-hosted storage.

## What This Is

SocialMCP is the social action layer an AI agent can call.

```text
AI client
  -> SocialMCP MCP tools
  -> SocialMCP core services
  -> platform adapters
  -> official platform APIs
```

The goal is to let a developer connect SocialMCP to tools such as Claude Desktop, Cursor, OpenClaw, n8n, LangGraph, CrewAI, AutoGen, or custom agents, then ask for workflows like:

```text
Schedule this announcement to Threads and LinkedIn tomorrow morning.
Validate this post for each platform before publishing.
Create platform-specific drafts from this launch note.
Check the status of a scheduled post.
```

## What BYOA Means

BYOA means:

- You create your own platform developer apps.
- You put app credentials in `.env`.
- Users connect accounts through OAuth.
- SocialMCP stores user access and refresh tokens encrypted in your database.
- No platform tokens are sent to a SocialMCP-owned service.

User account tokens must never be placed in `.env`.

## What We Do Not Do

SocialMCP v1 is not:

- A hosted SaaS dashboard.
- A multi-tenant managed OAuth cloud.
- A Buffer/Hootsuite-style end-user app.
- A scraping or browser-automation tool.
- A cookie-login automation system.
- A wrapper around unofficial private APIs.

SocialMCP must use official platform APIs only.

## Planned Platform Order

Available today: **Threads**, **LinkedIn Personal**, and **Instagram** (image + caption).

Later planned platforms include Facebook Pages, Discord, TikTok, X, and Reddit. Each connector must verify current official docs before implementation.

## Current Status

Runtime code is implemented for local BYOA use. The monorepo includes:

- **MCP server** (`apps/mcp-server`) with stdio transport and 19 high level tools
- **API server** (`apps/api`) for health checks and OAuth callbacks on port 3333
- CLI with `doctor` and `connect` for Threads, LinkedIn Personal, and Instagram
- **Worker** (`apps/worker`) that polls scheduled posts and publishes due jobs with retry backoff
- **Shared packages** for adapters, database (SQLite + Drizzle), OAuth, and crypto

### Platforms available today

| Platform | Connect | Publish | Schedule | Management |
|---|---|---|---|---|
| **Threads** | Yes | Yes | Yes (local worker) | Yes (list, replies, delete, analytics, limits) |
| **LinkedIn Personal** | Yes | Yes | Yes (local worker) | Publish only (no read/delete APIs on self serve path) |
| **Instagram** | Yes | Yes (image + caption) | Yes (local worker) | Local publish logs only in v1 |
| Facebook Pages, Discord, TikTok, X, Reddit | Scaffolded | No | No | No |

### Quick start

```bash
cp .env.example .env   # fill in app credentials and TOKEN_ENCRYPTION_KEY
pnpm install
pnpm db:migrate
pnpm dev:api           # OAuth callbacks (HTTPS recommended)
pnpm dev:worker        # scheduled post publisher
pnpm dev:mcp           # MCP stdio server for Cursor / Claude Desktop
```

See [BYOA setup](docs/byoa-setup.md) for OAuth and credential details.

## Safety Principles

High-impact social actions must be safe by default:

- Validate before publishing.
- Support dry runs.
- Require explicit `confirm: true` for execution.
- Use idempotency keys.
- Write audit logs with redacted payloads.
- Never expose raw access tokens, refresh tokens, client secrets, authorization codes, or cookies.

For stdio MCP servers, logs must not be written to stdout because stdout is reserved for JSON-RPC protocol messages.

## Repository Guides

- [Build plan](socialmcp_build_plan.md)
- [Master plan](socialmcp_developer_byoa_master_plan.md)
- [Architecture](docs/architecture.md)
- [BYOA setup](docs/byoa-setup.md)
- [MCP tools](docs/mcp-tools.md)
- [Security](docs/security.md)
- [Platform capabilities](docs/platform-capabilities.md)
- [Threads setup](docs/platform-setup/threads.md)
- [LinkedIn setup](docs/platform-setup/linkedin.md)

## License

License has not been selected yet.

