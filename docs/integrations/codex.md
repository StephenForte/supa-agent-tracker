# Codex setup

Verified: Production-verified 2026-10-20 (operator, Codex desktop)

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into private client configuration. Never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md).

Prefer Copy Codex config on the one-time token reveal: it pastes the server URL, the bearer token env var name SUPA_AGENT_TRACKER_TOKEN, and SUPA_AGENT_TRACKER_TOKEN set to the new token. In the Codex desktop app, set URL to the server URL and Bearer token env var to SUPA_AGENT_TRACKER_TOKEN, and leave Headers empty. Choose All my projects (including future ones) or specific projects when issuing the token.

The CLI form is from OpenAI's Codex docs, not a live check. The desktop app, the CLI, and the IDE extension share ~/.codex/config.toml. Add [mcp_servers.supa-agent-tracker] with url and bearer_token_env_var. Codex reads SUPA_AGENT_TRACKER_TOKEN from the process environment; do not put the token value in config.toml.

Paste the base prompt, or Copy prompt for this project on this page, into the Codex thread. This placement is guidance.

```text
URL: https://<your tracker host>/mcp
Bearer token env var: SUPA_AGENT_TRACKER_TOKEN
SUPA_AGENT_TRACKER_TOKEN=<YOUR_TOKEN>

The desktop app and the CLI read SUPA_AGENT_TRACKER_TOKEN from the Codex process environment. They share ~/.codex/config.toml. For the CLI, add [mcp_servers.supa-agent-tracker] with url and bearer_token_env_var. Do not put the token value in that file.

[mcp_servers.supa-agent-tracker]
url = "https://<your tracker host>/mcp"
bearer_token_env_var = "SUPA_AGENT_TRACKER_TOKEN"
```

The desktop check on 2026-10-20 used the app's MCP server form (URL, bearer token env var `SUPA_AGENT_TRACKER_TOKEN`, headers empty). The `config.toml` block above is the CLI form from OpenAI's docs. Codex reads the variable from the process environment on both surfaces; the docs say the desktop app, the CLI, and the IDE extension share `~/.codex/config.toml`.

## Evidence and sources

Vendor sources (read 2026-10-20):

- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
