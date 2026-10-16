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
summaries omit the hash.

Existing-resource writes take an expected revision; successful writes increment
it once. Run revisions cover PR/tool attachments too, and run events commit with
the state change. Agent identity is immutable. Notes use expected revision **0**
for first creation, then the stored revision. Next-step instruction writes check
an immutable source-run precondition and never patch completion; P1-D must bind
that source to the authenticated worker and implement dispatcher reconciliation.
User completion and user-only manual close append audits in the same transaction.
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
