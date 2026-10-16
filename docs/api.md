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
