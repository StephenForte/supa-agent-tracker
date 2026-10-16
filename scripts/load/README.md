# Load driver

`run-load.mjs` is a Node 24 script with no dependencies. It talks JSON-RPC to `/mcp` and stands in for concurrent agents. It does not print tokens.

## Issue two tokens

You need two accounts, each with one project and one MCP token granted only that project. Register the first account using the `ADMIN_EMAIL` bootstrap, verify it and sign in; create one invite link for the second account, register through that link, verify it and sign in. Browser writes need `Origin` equal to `PUBLIC_URL`.

Create a project (`POST /api/projects`) with `type: "automation"`, a `request_id`, and a reporting policy. The response `id` is `LOAD_PROJECT_A` or `LOAD_PROJECT_B`.

Issue a token (`POST /api/tokens`) with `label`, `project_ids` set to that one project, and a `request_id`. The response `plaintext` is shown once. Put it in `LOAD_TOKEN_A` or `LOAD_TOKEN_B` in the shell that runs the script. Do not echo it, commit it, or paste it into chat.

## Run

```sh
export LOAD_MCP_URL=http://127.0.0.1:3000/mcp
export LOAD_TOKEN_A=...
export LOAD_TOKEN_B=...
export LOAD_PROJECT_A=...
export LOAD_PROJECT_B=...
export LOAD_RUNS=25
export LOAD_MINUTES=10
node scripts/load/run-load.mjs
```

`LOAD_RUNS` defaults to 25 and `LOAD_MINUTES` defaults to 10. The runs are split across the two tokens, with `ceil(LOAD_RUNS / 2)` on A and the rest on B.

Each run opens its own MCP session, then `check_in`, `heartbeat` every 30 seconds, `update_status` every 2 minutes, `create_next_step` once, and `check_out` at the deadline. Every call uses a new `request_id`. A late call schedules the next one from the time it finished, so missed intervals are not replayed as a burst. The script reports per-tool counts, p50/p95/max latency, errors by code, sessions opened, and whether every run checked out.

## Rate limit

`/mcp` allows 120 HTTP requests per credential per minute. Every request counts, including `initialize` and `notifications/initialized`.

The busier credential has `ceil(LOAD_RUNS / 2)` agents (13 when `LOAD_RUNS` is 25). In the first minute each of those agents sends five requests: initialize, initialized, check_in, create_next_step, and one heartbeat at 30 seconds. That is 13 × 5 = 65, which is the peak. After that, each agent sends two heartbeats per minute and one status update every two minutes, at most 3 requests per agent per minute (13 × 3 = 39), then one `check_out` at the end. The peak stays under 120 by that schedule. It is not enforced by sleeping to dodge a 429.

## Growth

The server writes a `run_events` row for check-in, heartbeat, status, and check-out, and an `idempotency_keys` row for each of those mutations plus `create_next_step`. There is no retention on `idempotency_keys`. Read the counts before and after a run:

```sql
SELECT count(*) AS run_events FROM run_events;
SELECT count(*) AS idempotency_keys FROM idempotency_keys;
```

Per-run-hour rate is `(after - before) / (LOAD_RUNS * LOAD_MINUTES / 60)`.
