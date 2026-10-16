# Claude Desktop (macOS) setup

Verified: Production-verified 2026-10-16 with Claude Desktop on macOS (P1-G2): custom connector, "No sign in" + request header `authorization: Bearer …`; full cycle with no tool errors. Requests arrive from Anthropic's servers (UA `Claude-User`), not your machine.

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into private client configuration. Never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md).

Open Customize → Connectors → Add custom connector. Set the remote MCP URL below, choose No sign in, and add Request header authorization with value Bearer <YOUR_TOKEN>.

Request headers are a limited beta and may be missing on your account. If absent, stop setup and report the gap; OAuth fields are not bearer-token fields. Organization-shared headers do not establish individual identity.

Paste the base prompt into the conversation or project instructions. This placement is guidance; P1-A2 did not verify persistent instruction loading or Cowork subagent inheritance.

No hook path is known for Claude Desktop. Rely on agent heartbeats at natural pauses; scheduled Cowork tasks cannot prove the current execution is alive. Include model only from authoritative session configuration.

```text
Remote MCP URL: https://<your tracker host>/mcp
Sign in: No sign in
Request header: authorization
Value: Bearer <YOUR_TOKEN>
```

## Evidence and sources

[P1-A2 observations](../plan/p1-a2-results.md) establish only the tested connection path. Probe versions: Cursor 3.24.18, Claude Desktop 2.42304.0 Max (Chat), Grok Bot via mcp-remote 0.15.1. Production, periodic liveness and cross-tool telemetry remain unverified. Vendor sources (from the [compatibility matrix](compat-matrix.md)):

- [Claude connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Claude request headers](https://claude.com/docs/connectors/custom/add-unlisted)
- [Claude authentication beta limitations](https://claude.com/docs/connectors/building/authentication)
