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
| `rate_limited` | 429 | A per-IP or per-credential request limit was exceeded |
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
- A stored response is replayed for 30 days. Heartbeat responses are replayed for 24 hours. After that window the same `request_id` runs as a new mutation.

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
The SPA consumes these routes through its HTTP sources when built with `VITE_DATA_SOURCE=http`.

## Tokens (P1-C1)

These routes require `requireUser` (a browser session once P1-B2 lands; the existing
`x-test-user-id` seam only in tests). MCP bearer tokens cannot administer tokens.
Responses set `Cache-Control: no-store`. Token metadata uses the web `McpToken`
fields: `id`, `label`, `allProjects`, `projectIds`, `display` (masked last four characters),
`createdAt`, `lastUsedAt`, `revokedAt`, plus `revision` for optimistic writes.
`allProjects: true` means every project this owner has now or creates later, and `projectIds` is empty.
`allProjects: false` means only the ids in `projectIds`.
Timestamps are UTC ISO strings; nullable times remain null. Hashes are never returned.

| Route | Body | Response |
|---|---|---|
| `GET /api/tokens` | none | Array of the owner's token metadata, including revoked tokens |
| `POST /api/tokens` | `label`, `project_ids`, `request_id`, optional `all_projects` (default `false`) | `{ token, plaintext }` |
| `POST /api/tokens/:id/rotate` | `request_id`, `expected_revision` | `{ token, plaintext }`; old token revoked and replacement issued atomically with the same label and scope |
| `POST /api/tokens/:id/revoke` | `request_id`, `expected_revision` | `{ token }` with revocation time and incremented revision |
| `POST /api/tokens/:id/scope` | `request_id`, `expected_revision`, `all_projects`, `project_ids` | `{ token }`; switches all-projects and a specific list without a new plaintext |

Tokens are `sat_` followed by 32 cryptographically random bytes encoded base64url.
Only a SHA-256 hex hash and the last four characters are stored. The first successful
issuance/rotation returns plaintext once. The idempotency response stores metadata
and `plaintext: null`; every replay returns null. A lost first response requires
rotation or a new token. Revocation is irreversible, and a revoked token cannot be
rotated or have its scope edited. Labels are trimmed,
1–200 characters; project IDs are 1–128 characters and at most 100 grants per token.
Unknown fields are rejected. Empty specific scope is permitted and grants no project access.
`all_projects: true` requires `project_ids` to be empty; omitting `all_projects` keeps the
historical specific-scope behavior so an existing client is not silently widened. The issue
form defaults to all-projects. Scope edits are owner-only, revision-checked and idempotent.
An all-projects token stores no grant rows. Authentication resolves that token to the owner's
current projects on every request. A revoked token's scope edit is `validation_error`.
Conflicts include safe current token metadata at `error.details.current`.

## MCP (P1-C1)

`/mcp` uses the pinned `@modelcontextprotocol/sdk` **1.31.0** Streamable HTTP transport
(JSON responses). Stable release published September 28, 2026; selected October 15,
2026 as the newest release at least two weeks old. It follows the
[SDK server and tool-registration documentation](https://ts.sdk.modelcontextprotocol.io/server).

Authenticate **every request** with `Authorization: Bearer sat_…`. Browser cookies,
URL query tokens, and the retired `stub:` bearer are never accepted. Authentication
loads identity and scope from the database, checks revocation, and updates
last-used at most once per minute without changing the credential revision.
An all-projects token's project ids are the owner's projects at that request, not a cached grant list.
Repositories recheck revocation and either the stored grants or the all-projects owner binding for all tool reads/writes. A token
revoked, rotated, or narrowed during a session fails closed on its next HTTP request.

Missing, malformed, unknown and revoked credentials receive HTTP 401.
`resource_metadata` stays on every challenge, and `error="invalid_token"` stays
when an Authorization header was presented, so a future OAuth client can still
discover the protected resource (D-018). OAuth sign-in is not implemented.

When no Authorization header was sent:

```http
WWW-Authenticate: Bearer resource_metadata="https://YOUR_ORIGIN/.well-known/oauth-protected-resource", error_description="Supa Agent Tracker uses bearer tokens; add Authorization: Bearer <token> (Settings -> MCP tokens). OAuth sign-in is not available."
```

When a header was presented and rejected, the challenge also includes
`, error="invalid_token"` and this description:

```http
error_description="Token missing, revoked or mistyped; create a new one in Settings -> MCP tokens."
```

The JSON body is the standard `unauthenticated` API error, and its `message`
repeats that same description. The description is static ASCII: it never includes
any part of the presented token. A non-ASCII character in `WWW-Authenticate` is
rejected by Node and the challenge is dropped. `GET /.well-known/oauth-protected-resource`
is unchanged.

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
same safe `validation_error` shape and do not echo arguments. The code, message,
and HTTP mapping stay `validation_error`; `details` is the only addition.

A `validation_error` tool result includes `error.details` only when it can name a
fix without repeating the call. Schema failures set `details.fields` to the
de-duplicated, dot-joined issue paths, including array indices. An empty path is
dropped, and `details` is omitted when no field remains. Unrecognized keys are
caller-supplied, so their names are not listed. `details` never contains received
values, issue messages, or unknown key names. Handler rules set `details.reason`
to a fixed constant, plus `details.fields` when the rule is about particular fields:

| `details.reason` | `details.fields` | When |
|---|---|---|
| `task_id_required_for_coding` | `task_id` | `check_in` with `workload_type` `coding` and no `task_id` |
| `run_not_running` | omitted | `check_out` when the run's execution is not `running` |
| `completion_summary_required_for_coding` | `completion_summary` | coding `check_out` without a completion summary |
| `pr_reference_or_no_pr_reason_required_for_coding` | `pr_references`, `no_pr_reason` | coding `check_out` without a pull request or `no_pr_reason` |

| Tool | Fields | Result |
|---|---|---|
| `list_projects` | optional `cursor`, `limit` | Authorized `{ items, nextCursor }` summaries; archived hidden; default 50, clamp 100 |
| `get_project` | `project_id` | `project`, `open_to_dos` (not done), `waiting_note`, `running_runs`, `reporting_policy`, `api_version: "1"` |
| `check_in` | `project_id`, `agent_name`, `title`, `workload_type` (`coding` or `automation`), `request_id`; optional `task_id`, `harness`, `model`, `parent_run_id`, `external_execution_id` | `run_id`, `revision`, `reporting_policy`; find/create logical agent by project/name, create execution; coding requires `task_id` |
| `update_status` | `run_id`, `expected_revision`, `request_id`; optional `work_status`, `message`, `blocker`, `completion_summary`, `pr_references`, `harness`, `model` | `run_id`, new `revision`; may update ended work without reopening execution |
| `heartbeat` | `run_id`, `request_id` | `run_id`, unchanged `revision`, `last_contact_at`; append heartbeat event; ended runs get `validation_error` |
| `check_out` | `run_id`, `expected_revision`, `execution_state` (`finished`, `failed`, `cancelled`), `work_status`, `request_id`; optional `completion_summary`, `pr_references`, `no_pr_reason`, `tools` | `run_id`, new `revision`, `finished_at`, `work_status`; coding requires a supplied summary and either a PR or explicit no-PR reason |
| `record_tool_usage` | `run_id`, `tools`, `request_id` | `run_id`, new `revision`; upsert cumulative aggregates by name/source, preserving absent rows |

### Next-step tools (P1-D2)

| Tool | Fields | Result |
|---|---|---|
| `list_next_steps` | `project_id` | `{ steps, waitingNote }`, including completed steps |
| `create_next_step` | `project_id`, `source_run_id`, `instruction`, `request_id`; optional `position` | Saved `NextStep`; omitted position appends after the current maximum |
| `update_next_step` | `project_id`, `step_id`, `source_run_id`, `expected_revision`, `request_id`; at least one of `instruction`, `position` | Saved `NextStep`; preserves user completion and its actor/time |
| `reorder_next_steps` | `project_id`, `order: [{ step_id, expected_revision }]`, `request_id` | Saved `NextStep[]` in order with positions `0..n-1` |
| `set_waiting_note` | `project_id`, `source_run_id`, `expected_revision`, `text`, `request_id` | Saved `WaitingNote`; use revision 0 to create |

Inputs reuse the exported schemas in `server/steps/agent-steps.ts`: IDs and request
IDs match `[A-Za-z0-9._:-]{1,128}`, revisions are nonnegative integers, positions
are integers from 0 through 1,000,000, instruction length is 1–10,000 characters,
waiting text length is 0–10,000, and reorder accepts at most 1,000 entries. Unknown
fields are rejected. Results are the service values without a status envelope or
added fields; resource fields are camelCase and timestamps are ISO-8601 strings.

D-023 binds authorship to the credential that checked in the source run. Only that
credential may create/edit its steps or set a waiting note with that run; another
token of the same user receives `forbidden`. After rotation, the new token cannot
edit the old token's steps. Any credential granted the project may reorder, but
must supply every current step exactly once at its current revision. Reorder leaves
text, source run and completion untouched. A stale or incomplete order returns
`conflict` with `error.details.current` and changes nothing; stale step/waiting-note
edits also return the current service value there. Ungranted projects return
`not_found`; authorship failures return `forbidden`; invalid inputs return
`validation_error`. Private notes appear in no step-tool result or error.

Retries with the same `request_id` and body return the original result for 30 days (24 hours for heartbeats). Reusing
that ID with a different body returns `idempotency_mismatch`. Step mutations use
only the service's idempotency layer, with the registrar's mutation wrapper disabled.

Reporting policy fields are `reporting_instructions`, `stale_threshold_minutes`,
`heartbeat_expected`. Harness/model are never inferred. Observed clientInfo and
User-Agent are metadata only. All identity and parent-run inputs are checked against
the stored grants; no client-supplied owner field is accepted. Private notes have no
MCP tool or projection and are excluded from errors, conflicts, logs and exports.
The next-step mutation tools are deferred to P1-D2.
P1-D2 update: those tools are now registered as documented above.

Every mutation uses actor-scoped `request_id` (1–128 characters `[A-Za-z0-9._:-]`)
and atomic repository idempotency. Canonical hashes include the tool/REST action and
resource identity. Same request/body replays the result without new rows for 30 days
(24 hours for `heartbeat`); a different
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
## Projects, agents and runs

P1-C2. All of these routes use `requireUser`. Another user's project, agent or run is `404 not_found` with no `details` and no write. A successful body uses the field names and nesting in `src/domain/types.ts` (`Project`, `LogicalAgent`, `Run`, `RunEvent`, `PrReference`, `ToolAggregate`) so a later HTTP client can map them without renaming. `WriteResult` is not a response envelope: `2xx` is the resource, and `409 conflict` puts that resource at `error.details.current`. `GET` of a missing id is `404`, which a client can treat as the contract's `null`.

`GET /api/account` returns `{ id, name, email, emailVerified, publicHandle, alerts, publicProfile }`. `name` is `users.display_name`. `publicHandle` is null until the owner sets one. `alerts` is `{ blocked, stale, review }`, each false until the owner opts in. `publicProfile` is `{ name, bio, github, x, linkedin, timezone, avatarUpdatedAt }`. The five text fields are null until set. `timezone` is `UTC` until set. `avatarUpdatedAt` is null until an avatar is stored, then an ISO-8601 timestamp. Avatar bytes are not in this body. There is no `demo` flag.

Collections return `{ items, nextCursor }` using the pagination rules above. An empty `cursor` or `limit` is treated as omitted. Cursors are opaque and apply only to the same filters.

| Method and path | Body | Success |
|---|---|---|
| `GET /api/projects?include_archived=&cursor=&limit=` | | `{ items: Project[], nextCursor }` |
| `POST /api/projects` | `ProjectInput` plus `request_id` | `201` Project |
| `GET /api/projects/:projectId` | | Project, including an archived project the caller owns |
| `PATCH /api/projects/:projectId` | partial `ProjectInput` plus `expected_revision` and `request_id` | Project |
| `GET /api/agents?project_id=&cursor=&limit=` | | `{ items: LogicalAgent[], nextCursor }` |
| `GET /api/runs?project_id=&cursor=&limit=` | | `{ items, nextCursor }` — each item is a `Run` **without** `events` |
| `GET /api/runs/:runId` | | `Run`, `events` included, oldest first |
| `PATCH /api/runs/:runId` | `RunMetadataPatch` plus `expected_revision` and `request_id` | `Run` with `events` |
| `POST /api/runs/:runId/close` | `{ outcome: "failed" \| "cancelled", reason, expected_revision, request_id }` | `Run` with `events` |
| `POST /api/runs/:runId/mark-done` | `{ expected_revision, request_id }` | `Run` with `events` |
| `POST /api/runs/:runId/dismiss` | `{ expected_revision, request_id }` | `Run` with `events` |

`include_archived` is `true` or `false`. Omitted and `false` hide `lifecycle: "archived"`. `true` includes them in the same order as `listProjects`. Any other value is `validation_error`. Archiving does not remove the project; `GET` by id still returns it.

`project_id` omitted means every agent or run on the caller's projects. A `project_id` the caller does not own is `404`, not an empty page. `GET /api/runs/:runId` has no project parameter. The server resolves the run to its project with `projects.owner_id` in the query, then loads it through the project repository. A client-supplied project id is ignored because the path does not accept one.

List items include `prReferences`, `tools` (`null` when the run has no tool row), `childRunIds` and `parentRunId`. They do not include `events` (D-026). Detail and mutation responses include `events` ordered by `receivedAt` then `id`, oldest first. `actorId` is the user id or the credential id stored on the event. Timestamps are UTC ISO-8601.

The flat columns `stale_threshold_minutes`, `heartbeat_expected` and `reporting_instructions` map to `reportingPolicy.{ staleThresholdMinutes, heartbeatExpected, instructions }` in both directions. `isPublic` maps to `projects.is_public`. Omitting it on create stores false. Run responses omit `observedClientInfo`, `observedUserAgent` and `externalExecutionId`.

Every mutation takes `request_id` and runs through `withIdempotency` on the supplied transaction. The hash is SHA-256 of the parsed body with object keys sorted, so key order does not matter and a different body is `idempotency_mismatch`. A replay returns the original status and body, including a stored `409`, for 30 days. Retries after a conflict need a new `request_id`. Existing-resource mutations take `expected_revision`. A mismatch is `409 conflict` with message `Revision conflict` and `error.details.current` set to the stored resource. The resource is unchanged.

`PATCH /api/runs/:runId` corrects metadata only (`title`, `taskId`, `harness`, `model`, `completionSummary`, `blocker`, `noPrReason`, `prReferences`). It cannot set execution state or work status. It does not advance `lastContactAt`. The repository still appends one `status` event for the correction. Pull-request references are upserted by repository name and number; omitted references stay. At most one primary reference remains.

`POST /api/runs/:runId/close` closes a **running** execution. `outcome` `failed` or `cancelled` becomes both `executionState` and `workStatus`. `reason` becomes the run `message` and the `manual_close` event message. The repository sets `finishedAt`, selects `manual_close`, and appends one audit event. Next steps are not changed and `lastContactAt` is not advanced. Closing an ended run — including a run that already has that outcome, and a `finished` run — is `409 conflict` with message `Run has already ended` and `error.details.current` set to the current run. Nothing else is written except the idempotency record for that `request_id`.

`POST /api/runs/:runId/mark-done` is owner-only, through the same `requireUser` guard as the other routes in this section. A bearer MCP credential is `401 unauthenticated`. It applies only when `executionState` is `finished` and `workStatus` is not `completed`. It sets `workStatus` to `completed`, increments `revision`, and appends one `audit_events` row (`action` `run_marked_done`, `target` the run id, `details.previousWorkStatus` the status being replaced). It does not append a `run_events` row, and it does not change `executionState`, `message`, `finishedAt`, or `lastContactAt`. A running, failed, or cancelled run is `409 conflict` with message `Only finished runs can be marked done` and `error.details.current` set to the current run. An already completed run is `409 conflict` with message `Run is already completed` and the current run. A stale `expected_revision` is `409 conflict` with message `Revision conflict`. Another owner's run is `404 not_found`. The idempotency operation name is `run_mark_done`. A replay of the same `request_id` and body returns the original response and does not append a second audit row.

`POST /api/runs/:runId/dismiss` is owner-only, through the same `requireUser` guard as the other routes in this section. A bearer MCP credential is `401 unauthenticated`. It applies only when `executionState` is `failed` or `cancelled` and `workStatus` differs from that execution state. It sets `workStatus` to `executionState`, increments `revision`, and appends one `audit_events` row (`action` `run_dismissed`, `target` the run id, `details.previousWorkStatus` the status being replaced). It does not append a `run_events` row, and it does not change `executionState`, `message`, `finishedAt`, or `lastContactAt`. A running or finished run is `409 conflict` with message `Only failed or cancelled runs can be dismissed` and `error.details.current` set to the current run. An already dismissed run is `409 conflict` with message `Run is already dismissed` and the current run. A stale `expected_revision` is `409 conflict` with message `Revision conflict`. Another owner's run is `404 not_found`. The idempotency operation name is `run_dismiss`. A replay of the same `request_id` and body returns the original response and does not append a second audit row.

Validation rejects the body before any write. Caps: short text (name, title, repository name, task id, harness, model, tag, pull-request title) is 1–300 characters after trim; description, reporting instructions, completion summary, blocker and no-PR reason are at most 8,000 characters; `reason` is 1–4,000 after trim; at most 32 tags, each 1–64 characters; at most 20 pull-request references; `staleThresholdMinutes` is an integer from 1 to 525,600. `repositoryUrl`, `prdUrl` and pull-request `url` must be absolute `http:` or `https:` after trim. `javascript:`, `data:` and any other scheme are `400 validation_error`. `error.details.fields` lists the rejected paths. A patch with no resource fields is `validation_error`. Unknown fields are rejected.
## Next steps and private notes

Browser session routes. Every one uses `requireUser`. A request that sends `Authorization: Bearer ...` and no session is `401 unauthenticated`, including a bearer value that names a real credential. These routes do not accept an MCP credential. Resource JSON uses the camelCase fields of `NextStep`, `WaitingNote`, `ProjectNextSteps`, and `PrivateNote` in `src/domain/types.ts` and `src/domain/privateNotes.ts`. Timestamps are ISO-8601 strings. Mutation bodies use `request_id` and `expected_revision`, and every mutation runs inside `withIdempotency` on the supplied transaction.

| Method | Path | Body | Success |
|---|---|---|---|
| `GET` | `/api/projects/:projectId/next-steps` | | `200` `{ steps, waitingNote }` |
| `POST` | `/api/projects/:projectId/next-steps/:stepId/completion` | `{ done, expected_revision, request_id }` | `200` the step |
| `GET` | `/api/projects/:projectId/private-note` | | `200` the note |
| `PUT` | `/api/projects/:projectId/private-note` | `{ text, expected_revision, request_id }` | `200` the note |

`GET` next steps returns every step, including completed ones, ordered by position then id. `waitingNote` is `null` when the project has none.

`done` is a boolean. The completion write records `completionChangedBy` (the signed-in user) and `completionChangedAt`, and appends an audit event (`next_step_completed` or `next_step_reopened`) in the same transaction. It succeeds after the source run has failed or ended. Repeating the same `request_id` and body returns the original step and does not append a second audit. A different body with that `request_id` is `409 idempotency_mismatch`. A stale `expected_revision` is `409 conflict` and `error.details.current` is the stored step.

`PUT` with `expected_revision: 0` creates the note. Later writes send the stored revision. An absent note reads as `{ projectId, text: "", revision: 0, updatedAt: null }`. `text` may be empty and is capped at **20,000** characters (JavaScript string length, UTF-16 code units). A longer text is `400 validation_error` and is not stored. The same cap is `PRIVATE_NOTE_MAX_CHARS` in `server/notes/routes.ts`.

Another user's project, or an unknown step, is `404 not_found`. The handler writes nothing.

Agent reorder is not an HTTP route. D-023, implemented by `reorderNextSteps` in `server/steps/agent-steps.ts`: any credential granted the project may reorder. The request must name every current step of that project exactly once with its current revision. Anything else — a missing step, a duplicate, an unknown id, or one stale revision — is a conflict and no row changes. On success, positions become `0..n-1` in the given order. A step whose position changes increments its revision. A step that stays at the same index keeps its revision, so checking it off is not invalidated by a reorder that did not move it. Instruction text, source run, `done`, and the completion actor and time are left as stored.
## Authentication

Browser auth is mounted under `/api/auth`. Requests and responses use JSON; errors
use the error envelope above. Unknown/unsupported auth paths return JSON 404. All
auth responses use `Cache-Control: no-store`. These endpoints are library flows,
not tracker mutations: they do not require `request_id`/`expected_revision` in bodies.

| Method | Path suffix | Body / behavior |
|---|---|---|
| POST | `/sign-up/email` | `{name,email,password,invite?}`; pending invite for that email or `ADMIN_EMAIL` bootstrap required. Invalid/missing/used/expired/revoked/mismatched invite returns 403 `forbidden`, "This invitation is invalid or has expired". Valid new/existing invited emails both return `{status:true}` |
| GET | `/verify-email` | `?token=...`; verifies the signed emailed token |
| POST | `/send-verification-email` | `{email,callbackURL?}`; generic `{status:true}` for unknown/known emails |
| POST | `/sign-in/email` | `{email,password}`; requires verified email and sets a signed session cookie |
| POST | `/sign-out` | `{}`; revokes current session and clears cookie |
| GET | `/get-session` | Current library session/user, or null |
| GET | `/list-sessions` | Current user's active sessions |
| POST | `/revoke-session` | `{token}`; revokes only a session owned by current user |
| POST | `/revoke-sessions` | `{}`; revokes all current user's sessions |
| POST | `/revoke-other-sessions` | `{}`; revokes other sessions |
| POST | `/change-password` | `{currentPassword,newPassword}`; always revokes old sessions and returns a new cookie, regardless of client `revokeOtherSessions` |
| POST | `/request-password-reset` | `{email,redirectTo?}`; generic `{status:true}` whether account exists or delivery fails |
| POST | `/reset-password` | `{token,newPassword}`; single use, one-hour expiry, revokes existing sessions |

Session lifetime is fixed at seven days. Cookies are HttpOnly, SameSite=Lax and
Secure for HTTPS PUBLIC_URL. `requireUser` resolves the session from cookies on
every request and sets `{userId}`; missing/expired/revoked sessions return 401
`unauthenticated`. Library/database lookup failures return 500 `internal_error`
with a fixed safe log diagnostic, preserving the session for retry. The `x-test-user-id` seam is restricted to process NODE_ENV=test;
it is not a production credential. MCP authentication remains separate.

State-changing `/api` requests reject foreign Origins and cross-site fetch metadata;
writes with cookies also require a matching Origin. Send `Origin: <PUBLIC_URL origin>`
with browser-authenticated writes. Callback URLs must be trusted by Better Auth.
Sign-in allows five attempts per email and socket IP in 60 seconds, counting success
and failure, and returns 429 `rate_limited` thereafter. See server/README.md for
memory-storage and proxy limitations, email configuration and storage disclosure.

Verification/reset emails link to existing web routes `/verify-email` and
`/reset-password`; P1-E must wire those screens to the API. Production console email
suppresses secrets and does not deliver messages. Auth request logging is silent to
keep URL tokens out of logs; no auth body or provider error is logged.


## Invites (P1-I, D-031)

`GET /api/account` adds `isAdmin`: true exactly when the signed-in user's verified email equals `ADMIN_EMAIL`, case-insensitively. An unset `ADMIN_EMAIL` leaves the server available but provides no administrator. There is no role column. Only this address can register without an invite; other addresses need a pending invite even when no administrator is configured. The `ADMIN_EMAIL` bootstrap only works until an account with that email exists.

All invite routes require a browser session and current administrator status. Missing sessions return 401; non-admins (including unverified admin addresses) return 403 `forbidden`. Responses use `Cache-Control: no-store`; route logs omit request and response contents.

| Route | Body | Response |
|---|---|---|
| `GET /api/invites` | none | Array of invites issued by this admin, with `pending`, `used`, `expired` or `revoked` status |
| `POST /api/invites` | `email`, `request_id` | `{invite, link, emailSent}`; link shown once and sent through the existing email sender |
| `POST /api/invites/:id/revoke` | `request_id` | `{invite}`; revocation immediately prevents registration; used invites return 409 |

Invite metadata contains `id`, normalized `email`, `createdAt`, `expiresAt`, `usedAt`, `revokedAt`, and `status`. It never includes the token or hash. Links use `PUBLIC_URL/register?invite=inv_…`. Tokens are 32 cryptographically random bytes encoded base64url after `inv_`; only their SHA-256 hex hash is stored. Default expiry is seven days. New invites require a valid email of at most 254 characters. Unknown fields are rejected. Revoke has no revision parameter; a row lock serializes it against registration.

Only safe metadata and `link: null` enter `idempotency_keys.response`. A create replay returns `link: null, emailSent: false` without sending again; a lost first response requires creating a new invite. Different inputs with the same request ID return 409 `idempotency_mismatch`. Delivery failure leaves the invite valid and returns its copy-once link with `emailSent: false`.

Registration locks the matching pending invite and runs Better Auth's user/credential writes in the same database transaction through an async-local adapter binding. Library transactions become nested savepoints. Only successful creation (or the existing-address generic result) commits consumption; errors roll back all writes. Competing uses of one invite serialize and yield one success and one generic 403. Every unusable invite yields the same error body. Existing-address registration with a fresh valid invite retains the generic `{status:true}` response.

The live register screen captures `invite` in component memory, replaces the URL to remove that parameter immediately, and sends it only in the sign-up body. The admin-only `/settings/invites` tab shows links only in a dismissible reveal, with no browser storage. Demo mode hides the tab and excludes invite HTTP code from its build.

## Account handle

`PATCH /api/account` requires a browser session and a mutation body with `request_id` plus at least one of `publicHandle`, `alerts` and `publicProfile`. `publicHandle` is either `null` (clear the page) or 3–32 characters from `a-z`, `0-9` and `-`, starting and ending with a letter or number. The server trims and lowercases it before storing. A handle that differs only by case is the same handle: the second account gets `409 conflict` with message `That public handle is already taken` and no other account in the body. A bad format is `400 validation_error`. Omitting `publicHandle` leaves the handle unchanged.

`alerts` is `{ blocked, stale, review }` with three booleans. Omitting it leaves the saved preferences unchanged. Each kind defaults to false, so a new account is not emailed. When a kind changes from false to true, every run that currently matches that kind for this user is recorded as a baseline in the same transaction and is not emailed. Turning a kind off stops further mail for it. Turning it back on baselines the runs that match at that moment. Sending the same preferences again does not baseline runs that started matching since the last change. Only a verified email address receives mail. The same `request_id` and body replays the original response. A different body is `409 idempotency_mismatch`. Success returns the same account object as `GET /api/account`, including `isAdmin`, `publicHandle`, `alerts` and `publicProfile`.

`publicProfile`, when sent, is `{ name, bio, github, x, linkedin, timezone }` and all six keys are required. `null` clears a text field. `name` is trimmed to 1–60 characters or null. `bio` is trimmed to 1–160 characters or null. `github` matches `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$` or is null. `x` matches `^[A-Za-z0-9_]{1,15}$` or is null. `linkedin` matches `^[A-Za-z0-9-]{3,100}$` or is null. `timezone` is `UTC` or one of `Intl.supportedValuesOf('timeZone')`. Anything else, including a missing key or an unknown key, is `400 validation_error` and writes nothing. Omitting `publicProfile` leaves the profile columns unchanged. Sending `publicProfile` does not change `publicHandle` or `alerts`, and sending those does not change the profile columns. It uses the same `request_id` idempotency path as the other account fields.

## Avatar

`PUT /api/account/avatar` and `DELETE /api/account/avatar` use the same browser-session guard as `PATCH /api/account`. An MCP bearer token is not a session: a request that presents only a bearer token is `401 unauthenticated`. There is no `request_id`. Neither route writes an audit row.

`PUT` sends the raw image bytes. `Content-Type` must be `image/png`, `image/jpeg` or `image/webp`, and the body must be at most 262144 bytes. Any other type, including `image/svg+xml`, `multipart/form-data` and `text/plain`, is `415` with `validation_error` and message `Unsupported media type`. A larger body is `413` `payload_too_large` with message `Avatar exceeds the size limit`. An empty body, or magic bytes that do not match the declared type (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, WebP `RIFF` at bytes 0–3 and `WEBP` at bytes 8–11), is `400 validation_error` and is not stored. Success replaces any previous avatar and returns the account object. The stored SHA-256 is the hash of those bytes.

`DELETE` removes the avatar and returns the account object. Deleting when there is no avatar is still `200`.

The image parsers and the 262144-byte limit are registered only on `PUT /api/account/avatar`. Every other route keeps the global 1 MiB JSON limit.

## Public profile

`GET /api/public/:handle/profile` is unauthenticated. It does not read a session cookie or an MCP credential, and it is not an MCP tool. `Cache-Control` is `no-store`. It uses the same per-IP limiter as `GET /api/public/:handle/agents` (60 requests per 60 seconds, then `429` `rate_limited` with `Retry-After: 60`), so the two routes share one budget. An unknown handle, a malformed handle, and a handle whose owner has no public non-archived project all return the same `404` body as the agents route. An owner who has only private projects, or only archived projects, still gets that `404`. `GET /api/public/:handle/agents` is unchanged.

The response is built field by field. These are the only keys:

| Object | Keys |
|---|---|
| Root | `owner`, `stats`, `activity`, `harnesses` |
| `owner` | `handle`, `name`, `bio`, `links`, `joinedAt`, `avatarUrl` |
| `links` | `github`, `x`, `linkedin` |
| `stats` | `agentRuns`, `longestRunSeconds`, `currentStreakDays`, `longestStreakDays` |
| `activity` | `start`, `end`, `counts` |
| `harnesses` | `start`, `end`, `series` |
| series item | `harness`, `counts` |

`joinedAt` is `users.created_at` as ISO-8601. `avatarUrl` is `/api/public/<handle>/avatar?v=<first 16 hex chars of the avatar sha256>`, or null when there is no avatar. `name`, `bio` and the link fields are the stored profile values, or null. They are not the account display name or email.

Stats count every run in every project this owner has, private projects and archived projects included, subagent runs included, for all time. The heatmap and the harness chart count those same runs. Runs that belong to any other owner are absent. No private project name, title or id appears in this body. `agentRuns` is the count of those runs. `longestRunSeconds` is `floor` of the maximum of `coalesce(finished_at, last_contact_at) - started_at`, or 0 when there are no runs. An active day is an owner-zone calendar day with at least one run started. `currentStreakDays` is the consecutive active days ending today, or ending yesterday when today has none, otherwise 0. `longestStreakDays` is the longest such run.

D-046 gives the heatmap and harness chart one shared activity anchor. All dates use the owner's profile timezone, including the join date (`users.created_at` converted to a calendar date), run-start days, and today. An active day has at least one of this owner's runs started, including private and archived projects (D-043). Activity periods are separated by at least 30 consecutive inactive days: exactly 29 inactive days between runs does not restart; exactly 30 or 31 does. The anchor is the later of the join date and the start of the latest activity period. If the last active day is at least 30 calendar days before today, or there are no runs, the period restarts today. A last active day exactly 29 days before today keeps its period. Future run-start dates do not affect today's anchor.

Both `activity.end` and `harnesses.end` are today in that zone. `activity.start` is the later of (`end` minus 364 days) and the anchor; `harnesses.start` is the later of (`end` minus 29 days) and that same anchor. Each start moves earlier if needed to make at least 7 inclusive days, even for a join date today or in the future. Activity `counts` therefore has 7–365 entries; every harness series has 7–30 entries. Dates are `YYYY-MM-DD`. Each count is the number of runs started on that day, with zeroes filling inactive dates. SQL buckets days with `started_at AT TIME ZONE <zone>`; process timezone is never used. `joinedAt` stays the original ISO-8601 instant.

| Example, ending today | Chart days | Heatmap days |
|---|---:|---:|
| Joined 3 days ago (or yesterday) | 7 | 7 |
| Joined 2 months ago, active throughout | 30 | Inclusive days since joining |
| Active for two years | 30 | 365 |
| Active, then 30 inactive days, resumed today | 7 | 7 |
| Resumed for 12 inclusive days after a 40-day break | 12 | 12 |
| Resumed for 50 inclusive days after a 40-day break | 30 | 50 |
| No runs for 45 days | 7 empty days | 7 empty days |
| A 29-day inactive break between runs | Keeps the period, capped at 30 | Keeps the period, capped at 365 |

Stats tiles remain all-time: restarting either window never resets `agentRuns`, `longestRunSeconds`, or either streak computation.

`harnesses.series` groups run starts in the chart window by harness. D-042 folding is unchanged: trim and case-insensitive grouping; null, empty, and whitespace-only names are `Unknown`. The label is the most-used trimmed spelling in the window, with plain string ascending order breaking ties. The top four groups by folded total are returned (ties by label ascending); remaining groups are combined into `Other`, omitted when empty. Each series has one count per inclusive chart day. Stored harness names are unchanged.

`GET /api/public/:handle/avatar` returns the stored bytes and the stored `Content-Type`. Response headers are `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `ETag: "<full sha256 hex>"` and `Cache-Control: no-cache`. `If-None-Match` equal to that ETag returns `304`. The `404` body matches the profile `404`, including when the profile exists but no avatar is stored. This route has its own per-IP limiter with the same 60/60s budget, separate from the agents and profile limiter. A miss still sends `Cache-Control: no-store`.

## Public agents

`GET /api/public/:handle/agents` is unauthenticated. It does not read a session cookie or an MCP credential, and it is not an MCP tool. `Cache-Control` is `no-store`. A missing cookie and a valid session cookie for any user return the same body.

The handle is matched case-insensitively. An unknown handle, a handle whose owner has no public non-archived project, and a malformed handle (anything that is not 3–32 characters of `a-z`, `0-9` and `-`, starting and ending alphanumeric, after lowercasing) all return the same `404` body: `{ "error": { "code": "not_found", "message": "Not found" } }`. Nothing in that body distinguishes the three cases.

Each IP, from `request.ip` after `TRUST_PROXY_HOPS`, may call this route 60 times per 60 seconds. The 61st response is `429` `rate_limited` with `Retry-After: 60`. A client-supplied `X-Forwarded-For` does not create a new bucket beyond the trusted hop count.

The response is built field by field. These are the only keys:

| Object | Keys |
|---|---|
| Root | `owner`, `projects` |
| `owner` | `handle` |
| Project | `name`, `agents` |
| Agent | `name`, `runs` |
| Run | `title`, `executionState`, `workStatus`, `stale`, `harness`, `startedAt`, `lastContactAt`, `finishedAt` |

`stale` is `true` only when the run is `running` and `lastContactAt` is older than that project's stale threshold. The threshold itself is not in the response. `harness` and `finishedAt` are null when unset. Projects and agents are included even when they have no runs. Runs are the 200 most recently contacted across that owner's public projects, newest first. A 30-day window would still be unbounded, so the cap is a count. Private projects, archived projects, and any other owner's public projects are absent. Descriptions, repository fields, tags, messages, summaries, task ids, models, pull requests, tools, events, next steps, notes, tokens, and account identity are absent.

