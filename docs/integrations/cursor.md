# Cursor setup

Verified: Production-verified 2026-10-16 with Cursor 3.25.6 on macOS (P1-G2): full cycle get_project → check_in → heartbeat → update_status → create_next_step → check_out, no tool errors. Heartbeat hooks not yet production-tested.

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into private client configuration. Never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md).

In ~/.cursor/mcp.json, add the server URL and headers.Authorization as shown below. Merge with existing servers.

Paste the base prompt into the project’s agent instructions or a Cursor rule. This placement is guidance; P1-A2 verified MCP calls, not automatic prompt loading.

Cursor subagents inherited MCP tools on the parent session in P1-A2. Each still needs its own check-in and parent_run_id. Omit model when unavailable.

```json
{
  "mcpServers": {
    "supa-agent-tracker": {
      "url": "https://<your tracker host>/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

## Optional heartbeat hooks

Install the [heartbeat adapter](../../adapters/heartbeat/README.md) and private env file first. With Node 24 on PATH, merge this into the workspace-root `.cursor/hooks.json`. Replace both absolute paths. Project hooks run from the workspace root, so `.supa/run-id` resolves there. User-level hooks run from `~/.cursor/`; if you use those instead, set an absolute `SUPA_RUN_ID_FILE` for a single workspace.

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [{ "command": "node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs", "timeout": 12 }],
    "postToolUseFailure": [{ "command": "node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs", "timeout": 12 }]
  }
}
```

The documented `postToolUse` and `postToolUseFailure` events cover successful and failed tools after check-in, without using a permission hook that could block execution on empty output. The adapter ignores hook stdin, emits no stdout, and throttles attempts to one per 60 seconds per run. It does not start a background timer: long inference, long tools and idle sessions can become stale. This wiring is documentation-checked against current Cursor hooks docs (2026-10-16), not live-client verified; P1-G2 must test it. Do not add a periodic timer without lifecycle cleanup.

One workspace file cannot represent concurrent parent/subagent runs. Give each run a separate `SUPA_RUN_ID_FILE` and independently configured hook environment if supported; otherwise let those agents heartbeat directly. Merely sharing the parent MCP session does not solve file routing.

## Evidence and sources

[P1-A2 observations](../plan/p1-a2-results.md) establish only the tested connection path. Probe versions: Cursor 3.24.18, Claude Desktop 2.42304.0 Max (Chat), Grok Bot via mcp-remote 0.15.1. Production, periodic liveness and cross-tool telemetry remain unverified. Vendor sources (from the [compatibility matrix](compat-matrix.md)):

- [Cursor MCP](https://cursor.com/docs/mcp)
- [Cursor header configuration](https://prod.cursor.com/help/customization/mcp)
- [Cursor subagents](https://cursor.com/docs/subagents)
- [Cursor hooks](https://cursor.com/docs/hooks)
