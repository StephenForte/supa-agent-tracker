# Server

Node 24 Fastify process for Phase 1. It serves the built SPA from `dist/`, a JSON API under `/api`, and will serve MCP under `/mcp`. This task is the foundation: configuration, a Postgres pool, a SQL migration runner, health checks, and the conventions in [docs/api.md](../docs/api.md). There is no schema and no real authentication yet.

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
| `server/db/client.ts` | Drizzle client. No tables yet |
| `server/db/migrate.ts` | SQL migration runner |
| `server/db/migrations/` | Versioned SQL. Empty until P1-B1 adds `0001` |
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
