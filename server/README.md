# Server

Node 24 Fastify process for Phase 1. It serves the built SPA from `dist/`, a JSON API under `/api`, and will serve MCP under `/mcp`. This task is the foundation: configuration, a Postgres pool, a SQL migration runner, health checks, and the conventions in [docs/api.md](../docs/api.md). The domain schema and access-controlled repositories are implemented; authentication is still a stub.

The Phase 0 static site is still `npm run build` → `dist/`. That command does not need `DATABASE_URL` or the server compile. Render keeps publishing `dist/` until a later task changes the deploy.

## Local Postgres

The operator's Mac runs Postgres.app (PostgreSQL 18) on `localhost:5432` with trust auth for the macOS user. Do not start or reconfigure it. Create a database you own, then point `DATABASE_URL` at that database. Tests never use it: they create and drop `supa_test_<random>` databases and must fail if `DATABASE_URL` is unset.

```sh
createdb supa_agent_tracker
export DATABASE_URL=postgresql://localhost:5432/supa_agent_tracker
export PUBLIC_URL=http://localhost:3000
export PORT=3000
npm run db:migrate
npm run build
npm run dev:server
```

`NODE_ENV=production` is the only switch that applies migrations when the process boots. There is no separate migrations env var. `npm run db:migrate` applies them in any environment.

`npm start` runs the compiled server (`dist-server/`) and listens on `0.0.0.0:$PORT`. Build the SPA and the server first: `npm run build && npm run build:server`.

## Scripts

| Script | What it does |
|---|---|
| `dev` | Vite, the Phase 0 web app |
| `dev:server` | Server with reload (`tsx watch`) |
| `build` | SPA only, output `dist/`. No database |
| `build:server` | Compile `server/` to `dist-server/` |
| `start` | `node dist-server/index.js` |
| `db:migrate` | Apply `server/db/migrations/*.sql` |
| `typecheck` | Web project, then `tsconfig.server.json` |
| `test` | Vitest. Web project `web` (jsdom), server project `server` (node) |

Run one project with `npx vitest run --project server` or `--project web`.

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string for the pool and the migration runner |
| `PORT` | no | Listen port. Default 3000. Render sets this |
| `NODE_ENV` | no | `development` (default), `test`, or `production`. Production runs migrations before listen |
| `PUBLIC_URL` | yes | Externally visible origin, for example `http://localhost:3000` |

The process exits before listen if any required value is missing or invalid. The error names the variable and does not print the value.

## Folder map

| Path | Role |
|---|---|
| `server/index.ts` | Load config, maybe migrate, listen |
| `server/config.ts` | Env parsing |
| `server/app/routes.ts` | Only route registration point. Wave-3 tasks append one line |
| `server/app/auth-context.ts` | `requireUser` and `requireMcpCredential` stubs |
| `server/app/errors.ts` | Error body, conflict helper, body-size constant |
| `server/app/pagination.ts` | `cursor` / `limit` helpers |
| `server/app/conventions.ts` | `request_id` and `expected_revision` names |
| `server/db/pool.ts` | `pg` pool |
| `server/db/client.ts` | Schema-aware Drizzle client |
| `server/db/migrate.ts` | SQL migration runner |
| `server/db/migrations/` | Versioned SQL. `0001_initial.sql` domain schema |
| `server/db/cli.ts` | `npm run db:migrate` |

The runner records applied filenames in `schema_migrations`. That ledger is not an application table. Each file runs in one transaction and must not contain its own `BEGIN` / `COMMIT`. Files are applied in filename order.

## Tests and CI

Server tests that need Postgres import `server/test/database.ts`. That module throws if `DATABASE_URL` is unset, so a green run means the database tests executed. Each test creates one `supa_test_<16 hex>` database and drops that exact name. Do not point `DATABASE_URL` at a database you cannot `CREATE DATABASE` from, and do not reuse a name by hand.

CI sets `DATABASE_URL` to the `postgres:18` service. Locally:

```sh
export DATABASE_URL=postgresql://localhost:5432/postgres
npm test
```

The URL's database is only an admin connection for `CREATE DATABASE` / `DROP DATABASE`. Tests do not write application data there.

## P1-B1 data layer

`0001_initial.sql` owns domain tables only. IDs are **text**, defaulting to
`gen_random_uuid()::text`, so P1-B2 can supply auth-library string IDs. All times are
`timestamptz`; Drizzle reads them as `Date`. `users.email` has a unique `lower(email)`
index. Better-auth mappings are `display_name`, `email_verified`, `created_at`, and
`updated_at`; sessions, accounts, verification/reset tokens and invites belong to
P1-B2's 0002 (confirmed by the operator). No password/token plaintext is stored.

| Table | Purpose |
|---|---|
| users | Minimal identity, verified email, display name, timezone |
| projects | Owner, configuration, lifecycle, reporting policy, revision |
| agents | Immutable logical labels unique within a project |
| runs | Immutable execution identity; separate execution/work state and revision |
| run_events | Append-only actor-attributed status/heartbeat history |
| pull_request_refs | Multiple references per run, at most one primary |
| tool_usage_aggregates | Per-run/name/source aggregates with explicit coverage |
| next_steps | Ordered instructions, immutable source, user-controlled completion |
| waiting_notes | One agent-visible waiting note per project |
| private_notes | Separate owner/session-only text and revision |
| audit_events | Append-only project or account activity |
| mcp_credentials | Supplied hash, display suffix, revocation and revision |
| mcp_credential_projects | Grants with composite owner/project constraints |
| idempotency_keys | Actor-scoped request hash, saved JSON response and effective scope snapshot |

`server/db/schema.ts` mirrors the migration. `schema.test.ts` compares every table
and column, type and nullability in both directions using Postgres catalogs and
`information_schema`. Composite FKs prevent cross-project agents, parents and
source runs, and prevent credential grants to another owner's project. FKs use
RESTRICT, never cascading history deletion. SQL triggers reject event/audit
updates and deletes, run identity changes and reopening an ended execution.
Those triggers live in SQL because Drizzle table definitions do not model them.

Repository modules take `(db, access, ...)`. `access` is either `UserAccess` from
browser authentication or `CredentialAccess` from bearer authentication. It is
trusted authentication output, never client JSON. The latter includes user ID,
credential ID and the caller's allowed project IDs. Every operation verifies the
user, current credential revocation and stored project grant; caller scope only
narrows the stored grant. A project ID or foreign aggregate ID cannot authorize
access. Unknown/unauthorized resources throw `AccessError` with `not_found` or
`forbidden`; expected-revision mismatches return `{ status: 'conflict', current }`.

Private notes and account/token administration require `UserAccess` statically
and at runtime. Agent projections never join notes or include note content in
conflicts. `findCredentialByHash` is an **owner-scoped** lookup; P1-C1 owns the
trusted initial hash-to-identity authentication bootstrap before an access context
exists, and all subsequent access goes through these repositories. Hash generation,
plaintext issuance and HTTP/MCP validation are outside this layer. Credential
summaries omit the hash; credential last-use summaries also intersect the caller's project scope.

Existing-resource writes take an expected revision; successful writes increment
it once. Run revisions cover PR/tool attachments too, and run events commit with
the state change. User metadata/review edits preserve last_contact_at; only credential
reports advance agent liveness. Agent identity is immutable. Notes use expected revision **0**
for first creation, then the stored revision. Next-step instruction writes check
an immutable source-run precondition and never patch completion; P1-D must bind
that source to the authenticated worker and implement dispatcher reconciliation.
User completion and user-only manual close append audits in the same transaction.
User execution-state changes automatically select manual_close and accept only
failed/cancelled recovery outcomes; an omitted event label cannot omit the audit.
Credential revocation is irreversible here.

Lock order is user → credential → project → grant → aggregate. Credential and
project locks serialize operations with revocation/scope changes and project
mutations. This favors correctness for the initial workload; it is not a measured
load guarantee. Repositories accept a Drizzle transaction for composition.
`withIdempotency(db, access, requestId, requestHash, async (tx) => ...)` serializes
one actor/request pair and commits callback writes and its saved response together.
**Use the supplied `tx`** for every repository call inside that callback. Replays
return the stored response only while the credential retains every project in the
response's saved effective scope (a conservative check because the JSON is opaque).
Removed grants and narrowed caller scope reject stale responses, even if the token
is still active. Different hashes return `idempotency_mismatch` without
running the callback. Pass hashes of a canonical request body from the protocol
layer. No TTL or deletion is implemented.

Project lists hide archived projects by default and use non-stale running work
first, then latest run update descending (project update if there are no runs), followed
by case-insensitive name and ID ascending as deterministic tie-breakers.
Cursors preserve database timestamp precision; limits use `docs/api.md` defaults
and validation. Runs have bounded ID-keyset list pages. A missing tool row returns
`tools: null`; a reported zero-count row remains a real aggregate, never absence.

## User API (P1-C2)

`server/api/user-routes.ts` registers the signed-in user's account, project, agent and run routes. `registerRoutes` calls `registerUserApiRoutes` once. The handlers are `requireUser` only: `UserAccess { kind: 'user', userId: request.user.userId }`. Tokens, next steps, private notes and real sessions are other tasks.

Cross-project and account reads live in `server/repo/views.ts`: the account row, agents across the user's projects, run pages across the user's projects, and run-by-id. Each takes `UserAccess` and filters with `projects.owner_id` inside the query. `GET /api/runs/:runId` resolves the project there, then calls `getRun`. It does not accept a client project id. Agent pages are ordered by name then id. Run pages use the same id-descending keyset as `listRuns`. List rows load pull requests, tools and child ids for that page and do not load events.

`listProjects` takes `includeArchived`. The default is unchanged: archived projects stay out of the list. `include_archived=true` on `GET /api/projects` sets the option. `GET` by id still returns an archived project to its owner.

Field mapping is in `server/api/map.ts`. Reporting policy is nested on the way in and out. Event actors become `actorId`. Timestamps are UTC ISO-8601. Mutation bodies are validated with zod before `withIdempotency`, and the callback uses the transaction `withIdempotency` supplies. Caps, the events rule and the manual-close rule are in [docs/api.md](../docs/api.md). Closing a run that is not `running` returns `409 conflict` with the current run (`Run has already ended`) and does not call `updateRun`. A running close sets execution state and work status to `failed` or `cancelled`, stores the reason as the run message, and lets the repository append the `manual_close` event and the audit row. A metadata patch never sends execution state and does not advance `last_contact_at`; the repository still appends a `status` event.
## Steps and notes (P1-D)

Browser routes live in `server/steps/routes.ts` and `server/notes/routes.ts` and are registered with one call, `registerStepsAndNotesRoutes(app, deps)`. They are session-only. See [docs/api.md](../docs/api.md) for the paths, the private-note cap (20,000 characters), and the conflict body.

`server/steps/agent-steps.ts` is the protocol-neutral service P1-D2 will expose as MCP tools. It contains the rules; the tools should not grow their own. Each function takes `(db, access: CredentialAccess, input: unknown)`, validates `input` with the exported zod schema, and returns plain JSON (timestamps are strings). Private notes are not imported here and never appear in a result, error, or conflict body.

| Function | Schema | Input | Result |
|---|---|---|---|
| `listNextStepsForAgent` | `listNextStepsInput` | `{ project_id }` | `{ steps, waitingNote }` |
| `createNextStep` | `createNextStepInput` | `{ project_id, source_run_id, instruction, position?, request_id }` | mutation |
| `updateNextStep` | `updateNextStepInput` | `{ project_id, step_id, source_run_id, expected_revision, instruction?, position?, request_id }` | mutation |
| `reorderNextSteps` | `reorderNextStepsInput` | `{ project_id, order: [{ step_id, expected_revision }], request_id }` | mutation |
| `setWaitingNote` | `setWaitingNoteInput` | `{ project_id, source_run_id, expected_revision, text, request_id }` | mutation |

A mutation result is `{ status: 'saved', value }`, `{ status: 'conflict', current }`, or `{ status: 'idempotency_mismatch' }`. `not_found`, `forbidden`, and `validation_error` throw `AccessError`. `updateNextStep` requires an instruction or a position. It has no `done` field. Instruction text is 1–10,000 characters (`INSTRUCTION_MAX_CHARS`). Waiting-note text is 0–10,000 (`WAITING_NOTE_MAX_CHARS`). An omitted `position` on create appends after the current maximum.

P1-D2 tools: `list_next_steps`, `create_next_step`, `update_next_step`, plus a reorder tool and a waiting-note tool. Pass the zod schemas through as the tool schemas.

**Authorship.** The repository checks only that `source_run_id` belongs to the project. This module additionally requires a `check_in` event on that run whose `actor_credential_id` is the calling credential. Another credential's run, a user-created run, or a run in another project is `forbidden` and writes nothing. The run may already have ended; workers add follow-ups at check-out. After a token rotation the new credential cannot edit steps the old credential checked in (D-023, accepted for Phase 1).

**Reorder (D-023).** Any credential granted the project may reorder. The order must list every current step once at its current revision, or the call is a conflict and nothing changes. Positions become `0..n-1`. Only a step whose position changes increments its revision. Text, source run, and completion are untouched. `reorderNextSteps` in `server/repo/next-steps.ts` is the transactional write.

**Completion.** User completion goes through `setStepCompletion` and is not a column `updateNextStep` can patch. An agent edit after the user checks a step, or reopens it, leaves `done`, `completionChangedBy`, and `completionChangedAt` as the user wrote them.

**Idempotency.** Each mutation hashes a canonical form of its parsed input, including the operation name, and calls `withIdempotency` with the callback's `tx`. The same `request_id` and body returns the stored result and does not insert a second step. A different body returns `idempotency_mismatch` without running the write. A conflict throws out of the callback, so the key is not stored and the rows stay as they were.
## Auth (P1-B2)

Better Auth **1.7.7** (released 2026-09-30, pinned exactly) supplies password
hashing, verified-email login, sessions and single-use reset consumption. Migration
0002 adds its models and a nullable `users.image`; existing domain fields remain
intact. Its required OAuth account fields are nullable and SQL-constrained to NULL
because only email/password authentication is exposed. All auth/user FKs RESTRICT.

| Variable | Required | Meaning |
|---|---|---|
| `BETTER_AUTH_SECRET` | outside test | At least 32 characters; signs cookies and verification links |
| `REGISTRATION_ALLOWLIST` | no | Trimmed, case-insensitive comma-separated emails; empty denies all registration |
| `EMAIL_PROVIDER` | no | `console` (default) or `resend` |
| `RESEND_API_KEY` | when resend | Resend API credential, never logged |
| `EMAIL_FROM` | when resend | Operator-controlled verified sender |

Sessions have a fixed **7-day** lifetime without refresh or cookie caching. Cookie
attributes are HttpOnly, SameSite=Lax, Secure for HTTPS PUBLIC_URL. Each protected
request queries server-side session state. Session lookup failures return a sanitized
500 and a fixed diagnostic, so an outage is not mistaken for a logout. Password changes force revocation of all
old sessions and issue a replacement cookie; resets revoke all existing sessions.
Reset links expire after **one hour** and their database identifiers are hashed by
the library. Verification links are signed JWTs with a one-hour expiry.

Sign-in is limited to **5 attempts per normalized email and 5 per socket IP per
60-second fixed window**, including successful attempts. Both must allow the
attempt. The email/IP map is capped at 10,000 keys and rejects new attempts while
full; expired entries are pruned. Better Auth also limits sign-in to 5/IP/60s,
other sensitive operations to its built-in defaults (3/IP/10s), and other endpoints
to 100/IP/60s. Storage is process memory, resets on restart and is not shared across
replicas. Client proxy headers do not determine limiter identity; behind a proxy
this conservatively limits the proxy IP until trusted-proxy policy is dispatched.

All state-changing `/api` requests reject a mismatching Origin or cross-site fetch
metadata. Cookie-authenticated writes also require Origin. Better Auth validates
callback URLs against PUBLIC_URL. Auth handlers accept only the documented routes;
unknown routes remain JSON 404s. The test identity header works only with the real
process `NODE_ENV=test` and is ignored in development/production.

Console email prints complete development messages to stdout and captures messages
in memory in tests. **Production console email suppresses message contents** to
avoid logging tokens; configure Resend for actual production delivery. Resend uses
fetch with a 10-second timeout; provider responses/errors never reach logs or error
bodies. Auth-route logs are silent because Fastify logs query strings before hooks;
other API request logging retains the existing header redaction. Auth failures use
safe generic messages, and reset/resend responses do not expose delivery failures.

Storage disclosure: `accounts.password_hash` contains Better Auth's scrypt hash;
`sessions.token` contains the **plain random session identifier** (the browser
cookie is signed, but the database token is not hashed). This is an explicit planner
decision before merge. The existing `mcp_credentials.token_hash` remains a hash.
Unused account token columns and their expiry fields are constrained to NULL.
`auth_verifications.identifier` holds hashed reset identifiers; `value` holds the
user ID, not the reset secret. Verification JWTs are emailed, not stored.

Email links use existing `/verify-email?token=...` and `/reset-password?token=...`
web routes. Those screens remain the Phase 0 demo until P1-E wires their token to
`GET /api/auth/verify-email` or `POST /api/auth/reset-password`; the server API works
independently. No web bundle or deployment configuration is changed here.
