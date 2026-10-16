# HTTP API conventions

Phase 1 serves the built web app, `/api/*`, and `/mcp` from one Fastify process. This document is the contract later tasks implement. The foundation routes are `GET /health`, `GET /ready`, the SPA, and an empty `/api` router. Unknown `/api` and `/mcp` paths return JSON, never HTML.

## Errors

Failures use one JSON shape and a stable `code`:

```json
{ "error": { "code": "not_found", "message": "Not found" } }
```

`details` is included only when there is something to add. Messages are safe to show; they do not include connection strings, passwords, tokens, or stack traces.

| Code | HTTP | When |
|---|---|---|
| `validation_error` | 400 | Malformed JSON or a field the server will not accept |
| `unauthenticated` | 401 | Missing browser session or MCP credential |
| `forbidden` | 403 | Authenticated, but not allowed to see or change the resource |
| `not_found` | 404 | Unknown `/api` or `/mcp` path, or a missing resource |
| `conflict` | 409 | `expected_revision` does not match. `error.details.current` is the current resource |
| `idempotency_mismatch` | 409 | The same `request_id` was reused with a different body |
| `payload_too_large` | 413 | JSON body exceeds 1 MiB (1,048,576 bytes) |
| `internal_error` | 500 | Unexpected failure. The message is always `Internal server error` |
| `database_unreachable` | 503 | Readiness check could not query Postgres |
| `migrations_pending` | 503 | Readiness check found SQL files that are not applied |

## Request id

Every response sets `x-request-id`. If the request sends an id of 1–128 characters from `A-Za-z0-9._:-`, that value is echoed. Anything else is replaced with a UUID. Clients should log the response header when reporting a failure.

## Pagination

Collection routes accept `cursor` and `limit` and return:

```json
{ "items": [], "nextCursor": null }
```

`limit` defaults to 50 and is clamped to 100. A missing or empty `cursor` is the first page. `nextCursor` is null on the last page. Handlers fetch `limit + 1` rows and pass them to `pageItems` in `server/app/pagination.ts`. A limit that is not a positive integer is `validation_error`.

## Mutations

Defined here for the API and MCP tasks. They implement it; this task does not store idempotency keys.

- Every mutation body includes `request_id` (same character set as the request-id header).
- Repeating a `request_id` with the same body returns the original response and does not apply the change again.
- Repeating a `request_id` with a different body returns `idempotency_mismatch` and does not apply either body.
- A mutation of an existing resource includes `expected_revision`. On mismatch the response is `conflict` and `error.details.current` is the resource as stored, including its revision. The client retries with that revision.
- Authorization comes from the session or credential, never from a client-supplied owner id.

`server/app/conventions.ts` exports `mutationFields` (`request_id`, `expected_revision`) and `server/app/errors.ts` exports `conflictBody` / `sendConflict`.

## Bodies and logs

JSON bodies are limited to 1 MiB. Request logs are structured JSON. Header values are logged only for `accept`, `content-type`, `content-length`, `user-agent`, `x-request-id`, `mcp-protocol-version`, and `host`. Every other header value, including `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, and `proxy-authorization`, is `[Redacted]`. Do not log tokens, password hashes, or `DATABASE_URL`.

## Auth interfaces

`server/app/auth-context.ts` exports Fastify preHandlers. They are stubs until P1-B2 (`requireUser`) and P1-C1 (`requireMcpCredential`).

- `requireUser` sets `request.user` to `{ userId }`.
- `requireMcpCredential` sets `request.mcpCredential` to `{ userId, allowedProjectIds }` (D-018: bearer token, project scope).
- Outside `NODE_ENV=test` both respond `401 unauthenticated` and ignore headers.
- In tests, `requireUser` reads `x-test-user-id`. `requireMcpCredential` reads `Authorization: Bearer stub:<userId>` or `Bearer stub:<userId>:<projectId>[,<projectId>...]`.

Those headers are not authentication. P1-B2 and P1-C1 replace the stub bodies and keep the `request.user` / `request.mcpCredential` fields.

## Health

`GET /health` returns `200 { "status": "ok" }` and does not touch Postgres.

`GET /ready` returns `200 { "status": "ready" }` only when Postgres answers `SELECT 1` and every file in `server/db/migrations/` is recorded in `schema_migrations`. Otherwise it returns 503 with `database_unreachable` or `migrations_pending`. An empty migrations directory is current. The runner's ledger table is not an application migration; `0001` belongs to P1-B1.

## Route registration

`server/app/routes.ts` is the only registration point. Wave-3 tasks append one line each.

## Tokens (P1-C1)

These routes require `requireUser` (a browser session once P1-B2 lands; the existing
`x-test-user-id` seam only in tests). MCP bearer tokens cannot administer tokens.
Responses set `Cache-Control: no-store`. Token metadata uses the web `McpToken`
fields: `id`, `label`, `projectIds`, `display` (masked last four characters),
`createdAt`, `lastUsedAt`, `revokedAt`, plus `revision` for optimistic writes.
Timestamps are UTC ISO strings; nullable times remain null. Hashes are never returned.

| Route | Body | Response |
|---|---|---|
| `GET /api/tokens` | none | Array of the owner's token metadata, including revoked tokens |
| `POST /api/tokens` | `label`, `project_ids`, `request_id` | `{ token, plaintext }` |
| `POST /api/tokens/:id/rotate` | `request_id`, `expected_revision` | `{ token, plaintext }`; old token revoked and replacement issued atomically with identical label/grants |
| `POST /api/tokens/:id/revoke` | `request_id`, `expected_revision` | `{ token }` with revocation time and incremented revision |

Tokens are `sat_` followed by 32 cryptographically random bytes encoded base64url.
Only a SHA-256 hex hash and the last four characters are stored. The first successful
issuance/rotation returns plaintext once. The idempotency response stores metadata
and `plaintext: null`; every replay returns null. A lost first response requires
rotation or a new token. Revocation is irreversible, and a revoked token cannot be
rotated. Label/scope edits are outside this endpoint's contract. Labels are trimmed,
1–200 characters; project IDs are 1–128 characters and at most 100 grants per token.
Unknown fields are rejected. Empty scope is permitted and grants no project access.
Conflicts include safe current token metadata at `error.details.current`.

## MCP (P1-C1)

`/mcp` uses the pinned `@modelcontextprotocol/sdk` **1.31.0** Streamable HTTP transport
(JSON responses). Stable release published September 28, 2026; selected October 15,
2026 as the newest release at least two weeks old. It follows the
[SDK server and tool-registration documentation](https://ts.sdk.modelcontextprotocol.io/server).

Authenticate **every request** with `Authorization: Bearer sat_…`. Browser cookies,
URL query tokens, and the retired `stub:` bearer are never accepted. Authentication
loads identity and project grants from the database, checks revocation, and updates
last-used at most once per minute without changing the credential revision.
Repositories recheck revocation and stored grants for all tool reads/writes. A token
revoked or rotated during a session fails on its next HTTP request.

Missing, malformed, unknown and revoked credentials receive HTTP 401:

```http
WWW-Authenticate: Bearer resource_metadata="https://YOUR_ORIGIN/.well-known/oauth-protected-resource"
```

When an Authorization header was presented, the challenge additionally includes
`, error="invalid_token"`. The JSON body is the standard `unauthenticated` API error.
`GET /.well-known/oauth-protected-resource` returns RFC 9728 metadata with
`resource: "<PUBLIC_URL origin>/mcp"`, `resource_name: "Supa Agent Tracker"` and
`bearer_methods_supported: ["header"]`. No OAuth authorization server is advertised
or implemented. An `Origin` header, including an empty one, gets HTTP 403 `forbidden`
before authentication, parsing or tool dispatch.

HTTP sessions retain observed initialize `clientInfo` for reporting metadata. Each
session is bound to its authenticated credential; another credential cannot reuse it.
At most 200 sessions (including handshakes in progress) are held globally, expiring after 15 minutes idle; exceeding that
cap returns HTTP 429 `rate_limited`. A missing/expired session gets 404; initialize
again. DELETE closes a session. Restart loses sessions only; durable run/idempotency
state remains in Postgres. Server info includes `name: "supa-agent-tracker"`,
`version: "1.0.0"`, and extension `api_version: "1"` (also in `_meta`); SDK clients
that strip unknown server-info extensions can read it from `get_project`.

All tool results contain JSON in the first `content` text item. Tool failures set
`isError: true` and contain `{ "error": { "code", "message", "details"? } }`.
Stable codes include `not_found`, `forbidden`, `validation_error`, `conflict`,
`idempotency_mismatch`, `rate_limited`, and safe `internal_error`. Conflicts include
the current run at `error.details.current`, never private notes. Transport auth and
rate failures use HTTP 401/429 rather than tool results. Schema failures have the
same safe `validation_error` shape and do not echo arguments.

| Tool | Fields | Result |
|---|---|---|
| `list_projects` | optional `cursor`, `limit` | Authorized `{ items, nextCursor }` summaries; archived hidden; default 50, clamp 100 |
| `get_project` | `project_id` | `project`, `open_to_dos` (not done), `waiting_note`, `running_runs`, `reporting_policy`, `api_version: "1"` |
| `check_in` | `project_id`, `agent_name`, `title`, `workload_type` (`coding` or `automation`), `request_id`; optional `task_id`, `harness`, `model`, `parent_run_id`, `external_execution_id` | `run_id`, `revision`, `reporting_policy`; find/create logical agent by project/name, create execution; coding requires `task_id` |
| `update_status` | `run_id`, `expected_revision`, `request_id`; optional `work_status`, `message`, `blocker`, `completion_summary`, `pr_references`, `harness`, `model` | `run_id`, new `revision`; may update ended work without reopening execution |
| `heartbeat` | `run_id`, `request_id` | `run_id`, unchanged `revision`, `last_contact_at`; append heartbeat event; ended runs get `validation_error` |
| `check_out` | `run_id`, `expected_revision`, `execution_state` (`finished`, `failed`, `cancelled`), `work_status`, `request_id`; optional `completion_summary`, `pr_references`, `no_pr_reason`, `tools` | `run_id`, new `revision`, `finished_at`, `work_status`; coding requires a supplied summary and either a PR or explicit no-PR reason |
| `record_tool_usage` | `run_id`, `tools`, `request_id` | `run_id`, new `revision`; upsert cumulative aggregates by name/source, preserving absent rows |

Reporting policy fields are `reporting_instructions`, `stale_threshold_minutes`,
`heartbeat_expected`. Harness/model are never inferred. Observed clientInfo and
User-Agent are metadata only. All identity and parent-run inputs are checked against
the stored grants; no client-supplied owner field is accepted. Private notes have no
MCP tool or projection and are excluded from errors, conflicts, logs and exports.
The next-step mutation tools are deferred to P1-D2.

Every mutation uses actor-scoped `request_id` (1–128 characters `[A-Za-z0-9._:-]`)
and atomic repository idempotency. Canonical hashes include the tool/REST action and
resource identity. Same request/body replays the result without new rows; a different
body is `idempotency_mismatch`. Failed operations roll back and are retryable. Saved
scope is rechecked on replay. `update_status` and `check_out` require a positive safe
integer `expected_revision`; heartbeat and tool aggregates intentionally do not.
Heartbeat advances liveness and appends its event without revision churn (D-024).
Tool aggregates use the locked current revision and increment it once; callers must
retain the returned revision for their next status/check-out. Check-out ends execution
and sets finish time independently of work status, which may remain blocked or waiting
for review. A later heartbeat cannot reopen it.

Observed client name/version are truncated to 200 characters each and User-Agent to 512.

Input caps: IDs 128 characters; labels, titles, task IDs, harness/model, agent/tool names,
external execution IDs and PR repository/title fields 200; narrative fields 8,000;
PR URLs 2,048 (HTTP/HTTPS); at most 20 PR references (at most one primary) and 100 tool
rows per call. PR fields are `number` (positive int32), `title`, `url`, `repositoryName`,
optional `primary`. Tool rows use `name`, `source` (`mcp|native|shell|other`), `callCount`,
optional nullable `successCount`, `failureCount`, ISO `lastUsedAt`, and optional
`coverage` (`self_reported` default, or `adapter_captured`). Counts are nonnegative
int32 and success + failure cannot exceed calls. Missing rows mean no telemetry,
never zero. Unknown fields are rejected. JSON bodies retain the global 1 MiB cap.

The single-instance in-memory limiter permits **120 authenticated HTTP requests per
credential per fixed 60-second window**, including initialization and notifications.
It returns HTTP 429 `rate_limited` and `Retry-After: 60`; limits reset on restart.
It is a workload bound for the current single Render instance, not a distributed
limit. Session limits are separate. Request logs for token/MCP routes omit URLs,
headers and bodies so URL query credentials cannot leak through logging.
