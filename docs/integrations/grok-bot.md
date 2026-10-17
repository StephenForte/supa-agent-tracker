# Grok Bot setup

Verified: Production-verified 2026-10-16 (P1-G2)

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into private client configuration. Never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md).

Prefer Copy Grok Bot config on the one-time token reveal: it pastes the MCP URL and the token for Grok's masked secret field, which keeps the token out of chat. Use Grok's own setup; do not paste the token into the chat transcript. Choose All my projects (including future ones) or specific projects when issuing the token.

Production verification on 2026-10-16 used Grok's own setup with a masked secret field and its MCP bridge (mcp-remote style, seen as 0.15.1 in P1-A2). Report a missing field rather than inventing a command.

Paste the base prompt into bot instructions/settings, or provide it as a nonsecret instruction message. Persistent prompt placement was not verified in P1-A2.

No hook path is known for Grok Bot. Rely on agent heartbeats at natural pauses. Routines or inbound webhooks do not prove an existing run is alive.

Grok Bot presents as Cursor through mcp-remote; clientInfo is metadata only. Set harness from actual runtime knowledge and omit model when unknown. Subagent inheritance was not tested.

```text
Connector settings
MCP URL: https://<your tracker host>/mcp
Masked secret: <YOUR_TOKEN>
Observed bridge: mcp-remote 0.15.1
```

## Evidence and sources

[P1-A2 observations](../plan/p1-a2-results.md) establish the first tested connection path. Probe versions: Cursor 3.24.18, Claude Desktop 2.42304.0 Max (Chat), Grok Bot via mcp-remote 0.15.1. The scripted connect, check-in, update, next step and check-out cycle was production-verified on 2026-10-16. Heartbeat hooks and cross-tool telemetry were not part of that check. Vendor sources (from the [compatibility matrix](compat-matrix.md)):

- [Grok Bot guide](https://x.ai/bot/guides/grok-bot-101)
- [Grok Bot plugin settings](https://cursor.com/help/grok-bot/connect-plugins)
- [Grok Bot settings](https://cursor.com/docs/grok-bot/settings)
- [Grok Bot routines](https://cursor.com/help/grok-bot/routines)
