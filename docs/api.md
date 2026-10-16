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
| `rate_limited` | 429 | Authentication request limit exceeded |
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

## Authentication

Browser auth is mounted under `/api/auth`. Requests and responses use JSON; errors
use the error envelope above. Unknown/unsupported auth paths return JSON 404. All
auth responses use `Cache-Control: no-store`. These endpoints are library flows,
not tracker mutations: they do not require `request_id`/`expected_revision` in bodies.

| Method | Path suffix | Body / behavior |
|---|---|---|
| POST | `/sign-up/email` | `{name,email,password}`; allowlist only; 403 `forbidden`, "Registration is by invitation only" otherwise. Valid new/existing invited emails both return `{status:true}` |
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
