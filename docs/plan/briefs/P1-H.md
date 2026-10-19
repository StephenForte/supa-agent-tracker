DISPATCH · Model: Opus (a migration plus a background job that deletes production rows; deleting the wrong rows silently breaks idempotent replay) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 182fb22. If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 1–2 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-h, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p1-h-idempotency-retention → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P1-H — Bounded retention for idempotency_keys

## Read first (trust the repository over this brief)
- AGENTS.md (commit contract, clone-scoped process check).
- server/repo/idempotency-keys.ts (`withIdempotency`, the scope snapshot rule), server/mcp/registry.ts (every mutating MCP tool goes through `withIdempotency` with `requestHash({ tool: name, input })`), and the other callers: server/api/user-routes.ts, server/invites/routes.ts, server/tokens/routes.ts, server/steps/agent-steps.ts, server/steps/protocol.ts.
- server/README.md "Idempotency" and docs/integrations/reporting-protocol.md (agents "retain pending reports and retry the identical body with the same request_id").

## Why (measured)
- Every mutation, heartbeats included, writes one idempotency_keys row, and nothing ever deletes them.
- Production load check, 2026-10-17: 25 runs × 10 min produced 650 keys in 4.17 run-hours = **156 keys per run-hour**. That matches the P1-G1 local measurement exactly.
- **Heartbeats are 475 of 650 (73%).**
- At that rate one continuously active agent adds about 3.7k rows a day. The production disk is 1 GB (render.yaml).
- Replaying a heartbeat is harmless: it doesn't change the revision (D-024), and a re-executed heartbeat only records one more contact.
- A replayed real mutation (check_in, check_out, create_next_step, token issue, …) must keep returning the stored response for as long as a client could plausibly retry. An agent that went offline overnight or over a weekend still retries the same request_id.

## The retention rule (this brief is the spec; the planner records it as D-033 at write time)
- Keys whose operation is `heartbeat`: delete when `created_at` is older than **24 hours**.
- Every other key, including legacy rows with no recorded operation: delete when older than **30 days**.
- Pruning runs inside the web process (no new Render service, no cost): once shortly after boot, then hourly. It's a timer that doesn't keep the process alive and stops cleanly on shutdown. It's off in tests unless a test starts it.
- Deletes happen in bounded batches (e.g. 5,000 rows per statement, each its own short transaction), looping until a batch deletes fewer than the limit. A failure is logged without row contents or secrets and never crashes the process. One summary log line per run reports how many rows were deleted per class.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-h, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-h && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-h
    cd /Users/stephenforte/src/supa-agent-tracker-p1-h && git checkout -b p1-h-idempotency-retention origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Line of work and identifiers (pre-assigned; they override any "next number" convention)
- Branch p1-h-idempotency-retention. PR title "P1-H: Bounded retention for idempotency_keys". Commit subjects start with "P1-H: ".
- Migration: server/db/migrations/0005_idempotency_retention.sql. 0001–0004 exist on main and 0005 is free. If it's taken, stop and ask. Don't renumber.
- Don't edit docs/plan/**.

## Outcomes
1. **Record the operation.** Migration 0005:
   - adds a nullable `operation text` column to idempotency_keys (existing rows stay NULL and fall under the 30-day class);
   - adds the index(es) the prune needs, e.g. on `(created_at)`, or partial indexes per class; justify your choice.
   `withIdempotency` stores the operation for every new row:
   - the MCP tool name for MCP calls;
   - a stable action name for the REST callers (e.g. `token_issue`, `token_scope`, `invite_create`, or whatever names fit each route).
   Keep the Drizzle schema and server/db/schema.test.ts in sync.
2. **Prune** as specified above. Put the prune function in server/repo/idempotency-keys.ts (or a sibling file) and start the timer from server/index.ts. It takes `now` as a parameter so tests control time; tests call it directly.
3. **Docs:**
   - server/README.md (Idempotency): the retention windows and that replay is only guaranteed inside them;
   - docs/integrations/reporting-protocol.md: one sentence telling agents that retries with the same request_id are honoured for 30 days (heartbeats 24 h);
   - docs/api.md if it documents idempotency.

## The trap
`withIdempotency` holds an advisory lock per (scope, request_id), reads the row, then inserts after the operation. The prune runs in other transactions.
- Rows inside their window must never be deleted. A deleted check_in key followed by a client retry creates a **duplicate run**, silently.
- So the class boundary has to be right. The only rows that get 24 h are ones you **know** are heartbeats; anything unknown or NULL gets 30 days.
- Don't infer the class from request_id patterns (client-chosen) or from response shapes.

## Must hold (tests as properties; show each failing before the fix where possible)
- With `now` = T:
  - a heartbeat key created at T−23h survives and at T−25h is deleted;
  - a check_in key at T−29d survives and at T−31d is deleted;
  - a NULL-operation (legacy) key at T−2d survives;
  - a REST token-issue key at T−29d survives.
- After pruning, a replay of a surviving check_in key still returns the stored response (no new run). A replay of an expired heartbeat key re-executes harmlessly: revision unchanged, run still running.
- Batching: with limit L and 2.5·L expired rows, a single prune call deletes all of them in ⌈2.5⌉ = 3 statements. Assert the statement or batch count, not just the end result.
- The prune never touches other tables, and never deletes rows another user's or credential's scope still needs within their window.
- Migration 0005 forward on populated data: build a database at 0004 with users, a credential, runs, and idempotency keys from both MCP and REST; apply 0005; all old rows survive with operation NULL; new writes record the operation.
- Boot: the timer starts in the production entry point, doesn't run in the test suite unless started, and stops on shutdown with no open handle (Vitest exits cleanly).
- Existing checks are not weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free: server/db/migrations/0005_idempotency_retention.sql (new), server/repo/idempotency-keys.ts (+ an optional sibling file), server/index.ts, and tests for these.
- Change only as needed to pass the operation name, and say why: server/db/schema.ts, server/db/schema.test.ts, server/mcp/registry.ts, server/api/user-routes.ts, server/invites/routes.ts, server/tokens/routes.ts, server/steps/agent-steps.ts, server/steps/protocol.ts, server/invites/migration.test.ts (its applied-migrations list), server/README.md, docs/api.md, docs/integrations/reporting-protocol.md.
- Don't touch:
  - docs/plan/**;
  - render.yaml, Render or production;
  - the web app (src/**);
  - the scope-snapshot rule in `checkSavedScope` (P1-J relies on it);
  - auth limiter config (P1-L).
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- run_events retention (150 per run-hour): run history is user-visible product data, not a cache. That's a separate decision.
- A separate Render cron job: costs money, and the in-process timer is enough for one instance.
- Making windows configurable via env: not needed now; constants with a comment are fine. Say so if you disagree.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 182fb22: 57 files / 413 tests (planner measurement). Report your counts.
Manual: start the built server against a scratch database seeded with old keys; show the boot prune's summary log line; confirm the server still shuts down cleanly.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-h-idempotency-retention.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-h-idempotency-retention -t "P1-H: Bounded retention for idempotency_keys" -F <body file>. The body's first line: "Deploy runs migration 0005 on boot (additive nullable column + index); the first prune then deletes heartbeat keys older than 24 h." Then add a summary and the verification evidence. Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown, then end with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-H — Bounded retention for idempotency_keys
    LINE OF WORK: p1-h-idempotency-retention
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property red-before/green-after; batch count assertion; builds; manual boot prune log; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   0005_idempotency_retention — <forward-on-populated-data evidence>
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     migration 0005; branch p1-h-idempotency-retention; operation names <list>
    EXISTING CHECKS MODIFIED: <path — before → after> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-h; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified; surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think the retention windows or the approach are wrong, argue it with evidence in DECISIONS NEEDED rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, changing the retention windows, touching Render or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
