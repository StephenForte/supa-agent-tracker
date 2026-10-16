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

## Projects, agents and runs

P1-C2. All of these routes use `requireUser`. Another user's project, agent or run is `404 not_found` with no `details` and no write. A successful body uses the field names and nesting in `src/domain/types.ts` (`Project`, `LogicalAgent`, `Run`, `RunEvent`, `PrReference`, `ToolAggregate`) so a later HTTP client can map them without renaming. `WriteResult` is not a response envelope: `2xx` is the resource, and `409 conflict` puts that resource at `error.details.current`. `GET` of a missing id is `404`, which a client can treat as the contract's `null`.

`GET /api/account` returns `{ id, name, email, emailVerified }`. `name` is `users.display_name`. There is no `demo` flag.

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

`include_archived` is `true` or `false`. Omitted and `false` hide `lifecycle: "archived"`. `true` includes them in the same order as `listProjects`. Any other value is `validation_error`. Archiving does not remove the project; `GET` by id still returns it.

`project_id` omitted means every agent or run on the caller's projects. A `project_id` the caller does not own is `404`, not an empty page. `GET /api/runs/:runId` has no project parameter. The server resolves the run to its project with `projects.owner_id` in the query, then loads it through the project repository. A client-supplied project id is ignored because the path does not accept one.

List items include `prReferences`, `tools` (`null` when the run has no tool row), `childRunIds` and `parentRunId`. They do not include `events` (D-026). Detail and mutation responses include `events` ordered by `receivedAt` then `id`, oldest first. `actorId` is the user id or the credential id stored on the event. Timestamps are UTC ISO-8601.

The flat columns `stale_threshold_minutes`, `heartbeat_expected` and `reporting_instructions` map to `reportingPolicy.{ staleThresholdMinutes, heartbeatExpected, instructions }` in both directions. Run responses omit `observedClientInfo`, `observedUserAgent` and `externalExecutionId`.

Every mutation takes `request_id` and runs through `withIdempotency` on the supplied transaction. The hash is SHA-256 of the parsed body with object keys sorted, so key order does not matter and a different body is `idempotency_mismatch`. A replay returns the original status and body, including a stored `409`. Retries after a conflict need a new `request_id`. Existing-resource mutations take `expected_revision`. A mismatch is `409 conflict` with message `Revision conflict` and `error.details.current` set to the stored resource. The resource is unchanged.

`PATCH /api/runs/:runId` corrects metadata only (`title`, `taskId`, `harness`, `model`, `completionSummary`, `blocker`, `noPrReason`, `prReferences`). It cannot set execution state or work status. It does not advance `lastContactAt`. The repository still appends one `status` event for the correction. Pull-request references are upserted by repository name and number; omitted references stay. At most one primary reference remains.

`POST /api/runs/:runId/close` closes a **running** execution. `outcome` `failed` or `cancelled` becomes both `executionState` and `workStatus`. `reason` becomes the run `message` and the `manual_close` event message. The repository sets `finishedAt`, selects `manual_close`, and appends one audit event. Next steps are not changed and `lastContactAt` is not advanced. Closing an ended run — including a run that already has that outcome, and a `finished` run — is `409 conflict` with message `Run has already ended` and `error.details.current` set to the current run. Nothing else is written except the idempotency record for that `request_id`.

Validation rejects the body before any write. Caps: short text (name, title, repository name, task id, harness, model, tag, pull-request title) is 1–300 characters after trim; description, reporting instructions, completion summary, blocker and no-PR reason are at most 8,000 characters; `reason` is 1–4,000 after trim; at most 32 tags, each 1–64 characters; at most 20 pull-request references; `staleThresholdMinutes` is an integer from 1 to 525,600. `repositoryUrl`, `prdUrl` and pull-request `url` must be absolute `http:` or `https:` after trim. `javascript:`, `data:` and any other scheme are `400 validation_error`. `error.details.fields` lists the rejected paths. A patch with no resource fields is `validation_error`. Unknown fields are rejected.
