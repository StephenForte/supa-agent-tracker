# Backup and restore

`supa-agent-tracker-db` is Render Postgres on `basic-256mb` (a paid plan). Facts below are from Render's docs read on **2026-10-16**: [Postgres recovery and backups](https://render.com/docs/postgresql-backups) and the [pricing](https://render.com/pricing) feature table. Provisioning the database is a later step. This page is the procedure, plus a logical dump/restore drill run on local Postgres.

## What Basic-256mb provides

Paid Render Postgres, including Basic-256mb, is backed up continuously for point-in-time recovery (PITR). The Free compute plan has no recovery. The window depends on the **workspace** plan, not on a separate Basic-256mb retention number:

| Workspace | PITR window |
|---|---|
| Hobby | 3 days |
| Pro, Scale, or Enterprise | 7 days |

You cannot restore to a time within ten minutes of now. Upgrading a Hobby workspace to Pro does not backfill the older days; the window extends to 7 days going forward.

Logical exports are separate. From the database Recovery page, **Create export** builds a compressed directory archive (`.dir.tar.gz`). Render keeps each export for **seven days** after you create it, on every workspace plan. You can also take your own `pg_dump` and keep it as long as you want. PITR is the better recovery when it covers the moment you need. An export is for a copy you hold yourself.

## Restore through the dashboard (PITR)

1. Open the database in the Render Dashboard and go to **Recovery**.
2. Under Point-in-Time Recovery, choose **Restore Database**.
3. Name the new instance and pick a time inside the window, at least ten minutes ago.
4. Choose whether to copy existing settings. The new instance **always copies the IP allow list**, including an empty list.
5. Start the recovery. The new instance moves through Recovery In Progress and Creating to Available.
6. Check the data (row counts and `schema_migrations` below) before you point anything at it.
7. Point `supa-agent-tracker-app` at the new instance's internal connection string. `DATABASE_URL` in the Blueprint still names `supa-agent-tracker-db`, so a recovered instance with a new name needs that reference updated, or the app's `DATABASE_URL` set to the new internal URL in the dashboard.
8. When the app's `/ready` is 200 against the new instance, delete or suspend the old one.

Render's logical-export restore (`pg_restore` of a dashboard `.dir.tar.gz`) is documented on the same page. Prefer PITR when the window covers the loss. Restoring an export with `--clean` drops objects in the target. Use an empty database.

## Logical backup when external access is closed

`ipAllowList: []` means there is no public route to the database. The web service in the same region can still connect on the internal URL. `pg_dump` from a laptop cannot, until the allow list has your address.

1. On the database Info page, under Networking, add one entry: your current public IP as a `/32`, with a description such as `operator dump`. Save.
2. Copy the **external** URL from the dashboard Connect menu. Do not paste it into chat or commit it.
3. Dump, using a Postgres 18 client (the instance major is 18):

```sh
pg_dump --dbname="$EXTERNAL_DATABASE_URL" --format=custom --no-owner --no-privileges --file=supa-agent-tracker.dump
```

4. Remove the allow-list entry so the list is empty again. Confirm the Networking page shows no sources. An omitted list is not the same thing: omitting it opens the instance.
5. Store the dump somewhere that is not the git repo and not chat.

To restore that dump into an empty database you can reach:

```sh
pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-privileges --format=custom supa-agent-tracker.dump
```

`--clean` is for a target that already has the schema and does not hold data you need. A PITR instance is the safer undo for production data loss.

## Restore-verification checklist

Run this against the database you are about to trust, then against the app pointed at it.

- [ ] `schema_migrations` contains every file in `server/db/migrations/` (0001–0004 as of 2026-10-17), and no unexpected filename.
- [ ] Row counts for every application table match the source you restored from (or, after PITR, match what you expect at that time). Tables: `users`, `sessions`, `accounts`, `auth_verifications`, `projects`, `agents`, `runs`, `run_events`, `pull_request_refs`, `tool_usage_aggregates`, `next_steps`, `waiting_notes`, `private_notes`, `audit_events`, `mcp_credentials`, `mcp_credential_projects`, `idempotency_keys`.
- [ ] `GET /ready` on the web service returns 200 and `{ "status": "ready" }`.
- [ ] The temporary allow-list entry is gone.

```sql
SELECT id FROM schema_migrations ORDER BY id;
```

Per-table counts, from `psql` or any client:

```sql
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY relname;
```

`n_live_tup` is an estimate until `ANALYZE`. For a check that has to be exact, `SELECT count(*) FROM <table>` for each name above.

## Local dump/restore drill

Ran against Postgres.app 18.6 on localhost. Two scratch databases, both dropped afterward. The source was seeded with the same browser-and-MCP flow as `server/e2e/web-sources.test.ts`: one user, one project, one MCP token, one check-in, one next step, one private note. `pg_dump --format=custom` then `pg_restore` into an empty second database. Counts are `count(*)`.

Result, 2026-10-16, Postgres.app 18.6. `schema_migrations` on both databases: `0001_initial.sql`, `0002_auth.sql`. Every `count(*)` matched.

| table | source | restored |
|---|---:|---:|
| accounts | 1 | 1 |
| agents | 1 | 1 |
| audit_events | 2 | 2 |
| auth_verifications | 0 | 0 |
| idempotency_keys | 7 | 7 |
| mcp_credential_projects | 1 | 1 |
| mcp_credentials | 1 | 1 |
| next_steps | 1 | 1 |
| private_notes | 1 | 1 |
| projects | 1 | 1 |
| pull_request_refs | 0 | 0 |
| run_events | 2 | 2 |
| runs | 1 | 1 |
| schema_migrations | 2 | 2 |
| sessions | 1 | 1 |
| tool_usage_aggregates | 0 | 0 |
| users | 1 | 1 |
| waiting_notes | 0 | 0 |

Mismatch count: 0. Both scratch databases were dropped after the compare.

## Production PITR drill

Run 2026-10-18 by the operator in the Render dashboard, verified by the planner. Hobby workspace, so the PITR window is 3 days.

1. **Restore:** supa-agent-tracker-db → Recovery → Restore Database, named `supa-agent-tracker-db-drill`, target 2026-10-17 16:55 UTC (just after the P1-G2 load test). Basic-256mb, 1 GB, PG 18. It reached Available, and as documented it copied the empty IP allowlist.
2. **Access:** a single `/32` for the operator's IP was added to the **drill** instance only. Production's allowlist stayed empty (checked via the Render API before and after).
3. **Verify:** a hidden-prompt script ran `psql` against the drill's external URL and printed counts only.
   - `schema_migrations`: 0001_initial, 0002_auth, 0003_invites, 0004_token_all_projects.
   - Load-test fingerprint, against independently known client-side counts: load runs 25 (expected 25), finished 25 (25), their run_events 625 (625), load next steps 25 (25), `load-*` idempotency keys 650 (650). **Exact match.**
   - Row counts: users 2, accounts 2, sessions 3, invites 1, projects 3, agents 28, runs 28, run_events 637, next_steps 28, mcp_credentials 6, mcp_credential_projects 4, idempotency_keys 678. These fit 25 load runs plus 3 acceptance runs. audit_events 0 is expected, because audit rows come only from user step completion/reopen and manual close.
4. **Teardown:** the drill instance was deleted (gone from the Render API listing), and production `/ready` returned 200 afterwards. Cost: under an hour of a second Basic-256mb instance.

Result: PITR restores a consistent, migrated copy. Pointing the app at a restored instance (step 7 of the procedure) was not exercised, because the drill copy was never wired to the app.
