# Supa MCP probe (P1-A1)

Throwaway compatibility diagnostic, separate from the application. No deployment occurs in this PR. Uses **Node 24** and the official MCP TypeScript SDK **@modelcontextprotocol/sdk 1.32.1** (npm latest checked 2026-10-15), imported from JavaScript ESM without a compilation step. Own package/lockfile; no app dependencies change. `zod` defines tool schemas.

## Run locally

From this directory, with Node 24 on PATH:

```sh
npm ci
npm test
node smoke.mjs
# Authless diagnostic (synthetic inputs only):
npm start
```

Endpoint: `http://localhost:8787/mcp`; health: `/health`. `PORT` defaults to 8787. Tests/smoke bind loopback on an ephemeral port and shut down in finally/cleanup. CLI binds `0.0.0.0` for Render. Stop a CLI server with Ctrl-C (SIGTERM also closes MCP sessions and HTTP connections).

To require authentication, set `PROBE_TOKEN` to an operator-generated high-entropy secret **through your environment**, then `npm start`. Never commit it, put it in a URL, type it in model chat, or print it in command output. For an interactive shell, `read -rs PROBE_TOKEN; export PROBE_TOKEN` reads an existing secret without echo/history. Empty/unset means authless. Every `/mcp` method and `/probe/log` request is checked; health/discovery are public. In authless mode `auth.valid` is null (no validation), even if a header was supplied.

## What it exposes

- `probe_whoami`: requested and negotiated protocol version, initialize clientInfo, Streamable HTTP, auth present/valid, and request headers. Authorization, cookies, arbitrary headers and session IDs have values redacted. Only accept/content-type/protocol-version/user-agent values are visible, also scrubbed for the configured token.
- `probe_check_in(project_id, agent_name, title, workload_type, harness?, model?)`: echoes synthetic input and a fresh fake `probe_…` run ID. Unknown optional identity fields should be omitted. Nothing creates a real tracker run. Fields max 200 characters; workload is coding or automation.
- `probe_heartbeat(run_id)`: echoes run ID and server timestamp; does not validate a real run or change state.
- `GET /probe/log`: last **200 events** across clients (initialize, tool calls, authentication rejections, discovery). Entries include timestamp, tool/event name, clientInfo when available, and auth presence/validity. No tool arguments, outputs, request URLs, arbitrary headers, or raw errors are logged. Stdout uses the same scrubbed metadata. Capture results between tests before they age out. Restart clears everything.

With `<PROBE_URL>` representing the HTTPS origin (without `/mcp`):

```sh
# PROBE_TOKEN already set privately; curl reads the header from stdin, not argv.
printf 'Authorization: Bearer %s\n' "$PROBE_TOKEN" |
  curl --fail-with-body --header @- '<PROBE_URL>/probe/log'
# Authless mode only:
curl --fail-with-body '<PROBE_URL>/probe/log'
```

Don't run that shell with tracing enabled. Log output contains no credential. Treat clientInfo as untrusted self-report, not authenticated model identity. SDK-generated validation errors are not printed by the HTTP wrapper. Known token substrings are scrubbed from echoes and logs, including malicious clientInfo. Do not send unrelated secrets in tool inputs.

Memory is bounded: 200 log entries; at most 50 active MCP sessions with 15-minute idle expiry checked on subsequent MCP traffic; 64 KiB HTTP POST body limit. Session metadata is transient protocol state, not retained run data. New sessions receive 503 at the cap and can reconnect after expiry or restart. Browser Origin requests are denied (403); use the target clients' server-to-server connectors. This is not a browser app, durable store, production auth service, or general rate-limited public endpoint.

## Protocol and OAuth discovery limits

The installed stable SDK implements initialize/session-era Streamable HTTP through **2025-11-25**; the current spec read is **2026-07-28**. See [the matrix](../../docs/integrations/compat-matrix.md) for versioned spec/vendor sources and the modern-only-client gap. No target was shown to require legacy HTTP+SSE; `/sse` is intentionally absent.

A missing/invalid bearer gets HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="…"` (and `error="invalid_token"` for supplied invalid credentials). The JSON error body is supplemental; the challenge is the MCP authorization discovery signal.

Public `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` advertise `/mcp` and a **diagnostic issuer at this service's origin**. `/.well-known/oauth-authorization-server` returns **501 oauth_not_implemented** and records that discovery was attempted. This deliberately stops the flow; it is not a working authorization server or an OAuth compliance claim. It issues no token, redirect, DCR registration or refresh. A client reaching 501 is evidence of discovery, not evidence of completed OAuth compatibility. An authless control distinguishes transport from auth failure. The planner decides actual OAuth after P1-A2.

`PROBE_PUBLIC_URL` sets the externally reachable origin used in discovery (required on Render). It must be an absolute origin, not an MCP path; forwarded/Host headers are not trusted to construct metadata URLs. Locally it defaults to the bound loopback port.

## Exact later manual Render settings (planner + operator approval)

Create a **new Web Service**, manually; do not modify root `render.yaml` or the synced Blueprint. Settings checked against Render’s [web service](https://render.com/docs/web-services), [monorepo root directory](https://render.com/docs/monorepo-support), and [Node version precedence](https://render.com/docs/node-version) documentation, read 2026-10-15.

| Setting | Value |
|---|---|
| Repository | `StephenForte/supa-agent-tracker` |
| Branch | `main` after this PR is merged |
| Name | `supa-mcp-probe` |
| Runtime | Node |
| Instance | Free |
| Root Directory | `spike/mcp-probe` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Auto deploy | Off (manual probe deployment) |
| `NODE_VERSION` env | `24.22.0` (Node 24; verify in deploy log) |
| `PROBE_TOKEN` secret env | Operator-generated at deployment; omit only for the explicit authless control |
| `PROBE_PUBLIC_URL` env | `https://supa-mcp-probe.onrender.com` **if Render assigns that hostname**; otherwise use its actual public origin |
| `PORT` | Render supplies it; don't override |

Do not provision disk, database, accounts, paid instance, or production data. Verify the assigned hostname before connecting. Free-service sleep/restart can erase the log/sessions; warm `/health`, reconnect, and record cold-start effects separately. Service deployment and any authless switch belong to P1-A2 with approval.

## Verification

`npm test` runs Node's test runner with official SDK clients over real loopback HTTP, including initialize/list/all tools, authenticated and authless requests, rejected credentials, redacted headers/echo/log/stdout, bounded logging, discovery and session isolation. `node smoke.mjs` is a separate SDK live-check script generating a random credential in memory; prints only a redacted summary and closes its server. Neither claims vendor-client testing.
