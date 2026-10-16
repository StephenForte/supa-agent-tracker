# Grok Bot setup

Verified: Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into private client configuration. Never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md).

Use the connector settings screen to set the MCP URL below and the Authorization header value Bearer <YOUR_TOKEN>. Never enter the token through chat-driven add-server setup or paste it into chat.

P1-A2 connected through an mcp-remote 0.15.1 bridge. Exact bridge installation and additional settings navigation were not recorded; use the existing connector settings path and report a missing field rather than inventing a command.

Paste the base prompt into bot instructions/settings, or provide it as a nonsecret instruction message. Persistent prompt placement was not verified in P1-A2.

No hook path is known for Grok Bot. Rely on agent heartbeats at natural pauses. Routines or inbound webhooks do not prove an existing run is alive.

Grok Bot presents as Cursor through mcp-remote; clientInfo is metadata only. Set harness from actual runtime knowledge and omit model when unknown. Subagent inheritance was not tested.

```text
Connector settings
MCP URL: https://<your tracker host>/mcp
Authorization: Bearer <YOUR_TOKEN>
Observed bridge: mcp-remote 0.15.1
```

## Evidence and sources

[P1-A2 observations](../plan/p1-a2-results.md) establish only the tested connection path. Probe versions: Cursor 3.24.18, Claude Desktop 2.42304.0 Max (Chat), Grok Bot via mcp-remote 0.15.1. Production, periodic liveness and cross-tool telemetry remain unverified. Vendor sources (from the [compatibility matrix](compat-matrix.md)):

- [Grok Bot guide](https://x.ai/bot/guides/grok-bot-101)
- [Grok Bot plugin settings](https://cursor.com/help/grok-bot/connect-plugins)
- [Grok Bot settings](https://cursor.com/docs/grok-bot/settings)
- [Grok Bot routines](https://cursor.com/help/grok-bot/routines)
