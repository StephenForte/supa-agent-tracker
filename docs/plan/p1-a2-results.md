# P1-A2 live client results (2026-10-15)

Probe: `supa-mcp-probe` (Render free web service `srv-db8lfanavr4c73879p1g`, https://supa-mcp-probe.onrender.com, main @ 23ee833),
bearer-protected with an operator-generated `PROBE_TOKEN` that never entered chat, PRs or logs. Auth enforcement checked
first: no token, or a wrong token, gets 401 with an RFC 9728 `resource_metadata` challenge. Operator ran each client; the planner read the
scrubbed `/probe/log` the operator pasted. Times are UTC.

| Row | Cursor 3.24.18 (macOS, local) | Claude Desktop 2.42304.0 (Max, Chat) | Grok Bot (x.ai/bot) |
|---|---|---|---|
| R1 remote MCP | ✅ live | ✅ live (Anthropic's servers call the probe) | ✅ live |
| R2 transport | Streamable HTTP, protocol 2025-11-25 | Streamable HTTP, 2025-11-25 | Streamable HTTP, 2025-11-25, **via `mcp-remote` 0.15.1 bridge** |
| R3 auth: pasted bearer | ✅ `headers.Authorization` in `~/.cursor/mcp.json` | ✅ Custom connector → **No sign in** + Request header `authorization: Bearer …` (offered on this Max account; docs call it a limited beta) | ✅ via connector **settings** screen header field. Grok's chat-driven "add server" could not use its own masked secret store and asked for the token in chat (declined) |
| R3 auth: OAuth | Without a header: 401 → protected-resource → AS metadata (501), retried every 10–40 s. Real sign-in not tested (no AS) | During connector setup: same discovery sequence reached 501 (23:09–23:17). Real sign-in not tested | Not tested |
| R4 config surface | personal file | Customize → Connectors (UI) | Connector settings UI; chat-add only without secrets |
| R5 subagents | ✅ delegated task had the tools and made its own calls, **on the parent's MCP session** (same clientInfo, no new initialize) | Not tested (needs Cowork; operator chose to skip) | Not tested |
| R6 model identity | Agent omitted model (picker: "Grok 4.7 High Fast"): not available reliably | Agent reported `claude-opus-5-5` from session config, matching the picker | Agent omitted model |
| R7 periodic heartbeat | Not tested (needs hook adapter) | Not tested | Not tested |
| R8 other-tool telemetry | Not tested (hooks documented) | Not tested | Not tested |
| clientInfo / UA seen | `cursor-vscode 1.0.0`, UA `Cursor/3.24.18 (darwin arm64)` | `Anthropic/ClaudeAI 1.0.0`, UA `Claude-User` | `Cursor (via mcp-remote 0.15.1) 1.0.0`, UA `undici` (plus one `mcp-remote-fallback-test` initialize) |

## Design consequences for Phase 1
1. **Personal bearer tokens work in all three initial clients today.** No client required OAuth to connect.
2. Claude's header support is a limited beta per its docs. It works on this Max account, but other future users' accounts may lack
   it, and in Team orgs a header is one shared credential. Cursor and Claude both attempt standard OAuth discovery, so OAuth
   can be added later without changing the MCP surface.
3. **The server cannot identify the harness or a subagent from connection metadata.** Grok Bot presents as Cursor; subagents
   reuse the parent session. Harness, `agent_name` and `parent_run_id` must come from the check-in payload (optional,
   agent-reported), with observed clientInfo/user-agent stored separately as metadata, never as identity.
4. Model is optional: two of three agents can't report it reliably. Never default or infer it.
5. Grok Bot's token entry must be documented as **settings screen, not chat**.
6. R7/R8 (heartbeats, cross-tool telemetry) remain open and need client-side hook adapters, which the PRD already plans for (P1-F).
