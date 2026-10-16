# Deploying Phase 1

This is the operator record for the paid web service and Postgres in `render.yaml`. Merging that file onto `main` can provision both immediately, because the Blueprint syncs from `main`. **Do not merge until you explicitly approve the cost gate below.** Nothing in this document creates a Render resource.

The Phase 0 static site `supa-agent-tracker` is unchanged. Its build stays `npm ci && npm run build`, with no environment variables and no compute plan. See [Deploying the Phase 0 demo](../deploy.md).

Checked against Render's docs on 2026-10-16: [Blueprint spec](https://render.com/docs/blueprint-spec), [Blueprint JSON Schema](https://render.com/schema/render.yaml.json), [pricing](https://render.com/pricing), [Postgres backups](https://render.com/docs/postgresql-backups), [creating and connecting](https://render.com/docs/postgresql-creating-connecting), [web services](https://render.com/docs/web-services), and [rollbacks](https://render.com/docs/rollbacks).

## What the Blueprint adds

| Resource | Name | Plan | Region |
|---|---|---|---|
| Web service | `supa-agent-tracker-app` | `starter` (legacy name for `0.5c-512mb`, 0.5 CPU / 512 MB) | `oregon` |
| Postgres | `supa-agent-tracker-db` | `basic-256mb` (legacy name for `0.1c-256mb`, 256 MB, 100 connections) | `oregon` |

Postgres major version is `"18"`, the newest major in the Blueprint schema and the version Render's docs call the latest supported for new instances (13 through 18). The operator's Postgres.app is PostgreSQL 18.6, the same major.

`DATABASE_URL` is the database `connectionString` property. In the Blueprint spec that property is the private-network URL, which is what a web service in the same region should use.

Pull request previews are `off` on the new web service, same as the static site. `autoDeployTrigger` is `commit`. The health check path is `/ready`.

### Prices, as of 2026-10-16

From [Render pricing](https://render.com/pricing), the legacy names above map to these compute prices:

- Web `starter` / `0.5c-512mb`: $7/month
- Postgres `basic-256mb` / `0.1c-256mb`: $6/month
- Postgres storage: 1 GB included, then $0.30/GB/month

That is about $13/month of compute before bandwidth and extra storage, which matches the estimate in D-020. A Hobby workspace adds no workspace fee. Confirm the pricing page again on the day you approve the merge. Billing starts when the resources exist, not when this pull request is opened.

## Cost gate

Merge this Blueprint only after an explicit approval to spend that money. With Blueprint sync, `render.yaml` on `main` can create `supa-agent-tracker-app` and `supa-agent-tracker-db` on the next sync. Opening or updating the pull request does not. Do not mark the pull request ready, and do not merge it, until that approval is on the record.

Region `oregon` is the operator's choice (Portland; the operator is in Menlo Park). It is one of the current Render regions (`oregon`, `ohio`, `virginia`, `frankfurt`, `singapore`). The web service and the database are both there. They have to stay in the same region or the internal database URL will not work.

## Secrets

Enter these in the Render Dashboard when the Blueprint asks, or on the service's Environment page. Do not put them in git, in this document, or in chat.

| Variable | What to enter |
|---|---|
| `REGISTRATION_ALLOWLIST` | Comma-separated emails allowed to register. Empty means nobody can register |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender address on a domain you have verified in Resend |

`BETTER_AUTH_SECRET` is `generateValue: true`. Render generates it. Do not invent one and do not copy it out into chat. `EMAIL_PROVIDER` is already `resend`.

`sync: false` means Render prompts for those three values when the Blueprint is first created, and later Blueprint syncs do not overwrite them. If you add another secret after the service exists, set it on the service yourself. Render does not copy `sync: false` variables into preview environments. Previews are off.

## Resend sender domain

Resend will not deliver verification or password-reset mail until the sender domain is verified in the Resend dashboard and `EMAIL_FROM` is an address on that domain. Do that before asking anyone to register. Until then, production console email is not the configured provider: the service is set to Resend, and a missing or rejected key fails delivery without putting the provider response in the logs.

## Public URL

`PUBLIC_URL` is `https://supa-agent-tracker-app.onrender.com`. Browser cookie writes require the browser origin to equal `PUBLIC_URL` exactly. After the first deploy, compare the service URL Render actually assigned. If the subdomain differs, change `PUBLIC_URL` to that origin before anyone signs in. A mismatch returns 403 on cookie-authenticated writes.

## Database is not public

`ipAllowList: []` is set on `supa-agent-tracker-db`. An omitted list allows every external address (Blueprint spec, 2026-10-16). An empty list allows only internal connections, which is what the web service uses. Inbound IP rules for Postgres are available on a Hobby workspace. Do not remove the empty list.

A shell on your Mac cannot open a connection until you add your address and remove it again. That procedure is in [Backup and restore](backup-restore.md).

## A healthy first deploy

The service builds with `npm ci --include=dev && VITE_DATA_SOURCE=http npm run build && npm run build:server` and starts with `npm start`. `--include=dev` is required: Render exposes the service's env vars (including `NODE_ENV=production`) during the build, and `npm ci` would otherwise skip the devDependencies (`typescript`, `vite` plugins) the build needs. `NODE_ENV=production` applies pending SQL migrations before listen. The files today are `0001_initial.sql` and `0002_auth.sql`.

The process does not print those filenames. A local production boot against an empty scratch database confirmed that: the log showed the process listening, `GET /ready` returned `200` and `{"status":"ready"}`, and `schema_migrations` listed both files. Nothing in that log named the SQL files. A healthy deploy is:

- the deploy stays up (the start command is listening on `0.0.0.0:$PORT`);
- `GET /ready` returns 200 and `{ "status": "ready" }`.

`/ready` returns 503 while the database is unreachable or a migration file is not in `schema_migrations`. After you have a temporary database connection, `SELECT id FROM schema_migrations ORDER BY id` should list both filenames.

## Roll back a bad deploy

On the web service's Deploys page, choose **Rollback** on an earlier successful deploy. Render runs that deploy's build again. A dashboard rollback turns auto-deploy off, so turn it back on from Settings after the fix is on `main`. See [rollbacks](https://render.com/docs/rollbacks).

Rolling back the web service does not undo a migration that already committed. `0001` and `0002` only add tables. A later migration that changes or deletes data needs a database restore, not only a service rollback. See [Backup and restore](backup-restore.md).
