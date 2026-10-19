DISPATCH · Model: Opus (a background job that sends real email from production, with a migration and dedup state; a mistake spams the owner or leaks data across owners) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 3f37e5d (P2-F merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 2–3 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-g, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-g-email-alerts → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-G — Opt-in email alerts: a 5-minute digest of what needs you

## Operator decisions (2026-10-19; recorded as D-037 on the planner's docs branch, not on main yet; this brief is the full spec)
- Channel: **email**, using the existing Resend sender. No web push in this task.
- Delivery: a **batched digest**, at most one email per user every 5 minutes, listing everything new.
- **Off by default.** The operator doesn't currently use alerts, so nothing is sent until a user opts in.

## What "needs you" means: the same rules as the Needs me screen (D-036)
For a user, look at their runs in **their own non-archived projects** only:
- **Blocked**: `work_status = 'blocked'` (any execution state). It takes precedence: a blocked run is never also reported as stale or review.
- **Stale**: `execution_state = 'running'` and `last_contact_at < now − project.stale_threshold_minutes`. Same rule as `stale()` in src/domain/runs/grid.ts; implement it in SQL and test both against the same cases.
- **Waiting for review**: `execution_state = 'finished'` and `work_status = 'waiting_for_review'`.

## Read first (trust the repository over this brief)
AGENTS.md; server/email/index.ts (`EmailSender`; console capture in test, Resend in production; errors never echo provider bodies); server/repo/idempotency-retention.ts and server/index.ts (P1-H: an in-process job started after listen, unref'd timers, stopped on shutdown, SQLSTATE-only failure logs); server/api/user-routes.ts `PATCH /api/account` and src/pages/settings/AccountSettings.tsx (P2-B); src/domain/needs-me/attention.ts (P2-F's client-side rules, which the SQL must agree with); server/config.ts (`PUBLIC_URL`).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-g, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-g && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-g
    cd /Users/stephenforte/src/supa-agent-tracker-p2-g && git checkout -b p2-g-email-alerts origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker ("Agent Dashboard"). If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-G", title "P2-G: Opt-in email alert digest", workload_type "coding", task_id "P2-G" and a fresh request_id.
  - Include harness and model only if you know them.
  - Keep run_id and revision, and write only the run_id to .supa/run-id.
- R2. update_status at each milestone. Always send the latest expected_revision.
  - Gate green.
  - PR opened (pr_references with the PR URL).
  - **Bot review settled:** every automated review comment (Bugbot and similar) on the PR head is fixed or answered, and CI is green. Send a message like "PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>". Send it again if a later push draws new bot comments.
  - Blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown, check_out with:
  - execution_state finished (or failed);
  - work_status waiting_for_review (or blocked);
  - a one-paragraph completion_summary and the PR reference.
  Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure, retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work and identifiers (pre-assigned; they override any "next number" convention)
- Branch p2-g-email-alerts. PR title "P2-G: Opt-in email alert digest". Commit subjects start with "P2-G: ".
- Migration: server/db/migrations/0007_alerts.sql. 0001–0006 exist on main. If 0007 is taken, stop and ask. Don't renumber.
- Don't edit docs/plan/**.

## Outcomes
1. **Data (migration 0007)**, additive, with defaults that send nothing:
   - `users.alert_blocked`, `users.alert_stale` and `users.alert_review`, each `boolean NOT NULL DEFAULT false`.
   - `alert_deliveries`:
     - columns: user_id, run_id, kind, delivered_at (or `baselined_at`/`source`, so a baseline row is distinguishable from a sent one);
     - primary key `(run_id, kind)`;
     - `kind IN ('blocked','stale','review')`;
     - foreign keys to users and runs with **RESTRICT**, consistent with the rest of the schema (nothing cascades).
   - Update the Drizzle schema and server/db/schema.test.ts.
2. **Preferences (owner only).**
   - Extend `PATCH /api/account` (and GET) with `alerts: { blocked, stale, review }`, idempotent like the existing handle update. The response includes the current preferences.
   - **Baseline on enable:** when a kind goes from off to on, record every run that *currently* matches that kind for this user in `alert_deliveries` as baselined, in the same transaction. So enabling never emails existing history, only things that become true later.
   - Turning a kind off sends nothing more for it. Turning it back on baselines again.
   - Only users with a verified email are ever emailed.
3. **Digest job (in-process, like P1-H).**
   - Runs about 1 minute after boot, then every 5 minutes. Timers are unref'd and stop on shutdown. Guard the cycle with `pg_try_advisory_lock` so two processes can never send the same digest. Only one instance exists today, but don't rely on it.
   - For each verified user with at least one kind enabled, find runs matching their enabled kinds (rules above) that have **no** `alert_deliveries` row for `(run_id, kind)`.
   - If there are any, send **one** email and record a delivery row for every run included.
   - Order of operations: insert the rows and send inside one transaction, and commit only after the send succeeds. If the send fails, roll back so the next cycle retries. Never double-send on success.
   - Cap the listed items at 20 per email with "and N more" (still record all of them), so a backlog can't produce a giant email.
   - One summary log line per cycle: users checked, emails sent, items, failures. Log no addresses, no run titles and no provider bodies (SQLSTATE or "send failed" only).
   - With `EMAIL_PROVIDER=console` (dev and test), the existing capture or suppression applies, so nothing is sent outside production.
4. **Email content** (plain text required; simple HTML optional):
   - Subject: "Supa Agent Tracker: N item(s) need you".
   - Body: grouped Blocked / Stale / Waiting for review. Each item gives the run title, agent name and project name, plus a link to `${PUBLIC_URL}/agents?run=<id>`. Blocked items also show the blocker text; stale ones show "last contact N min ago".
   - The top links to `${PUBLIC_URL}/needs-me`; the footer says "Turn off in Account settings" and links to `${PUBLIC_URL}/settings`.
   - No tokens, emails of others, private notes or anything from another owner's projects. Text is plain-text escaped; the optional HTML is escaped.
5. **Settings UI.** In Account settings, an "Email alerts" section with three checkboxes (Blocked, Stale, Waiting for review), all off by default. Add one line explaining the 5-minute digest and that existing items aren't emailed when you turn one on. Keep the demo build working (local state is fine there).
6. **Docs:** docs/api.md (account alert fields) and server/README.md (the job, its cadence, dedup and baseline).

## The trap
This job emails real people from production on a timer. The three ways it goes wrong:
- **Storm:** without baseline-on-enable and per-run dedup, turning alerts on (or a restart) emails every old run, and every cycle repeats it.
- **Cross-owner leak:** a query that forgets `projects.owner_id = user.id` emails one owner about another's runs.
- **Duplicate or lost sends** around failures: rows recorded but no email sent, or email sent and rows rolled back.
Write each as a test that fails on the broken version.

## Must hold (tests as properties, with a fixed clock and the captured sender)
- **Defaults:** after migration 0007, every user has all three flags false. A cycle sends nothing.
- **Baseline:** a user with 2 runs already waiting for review enables review → the next cycle sends nothing. A third run then reaches waiting_for_review → the next cycle sends exactly one email listing only that run, and the cycle after sends nothing.
- **Precedence:** a blocked run that is also stale is reported only as blocked. With only stale enabled, a blocked+stale run isn't reported at all.
- **Scope:** another owner's runs, archived-project runs and unverified users are never included or emailed.
- **Batching:** 3 new items across groups in one cycle → one email with all 3, grouped. 25 new items → one email listing 20 plus "and 5 more", and all 25 recorded.
- **Failure:** the sender throws → no rows recorded; the next cycle (sender OK) sends once.
- **Concurrency:** two cycles started together (two job instances on one database) → one email, enforced by the advisory lock.
- **Settings:** PATCH toggles persist and are idempotent; enabling baselines in the same transaction; another user can't change mine.
- **SQL rules agree with P2-F:** the SQL rules and src/domain/needs-me/attention.ts produce the same run set for a shared fixture.
- **Migration 0007 forward on populated data:** a database at 0006 with users, projects and runs in all states; after 0007 nothing is enabled and nothing is delivered.
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free: server/db/migrations/0007_alerts.sql (new), server/alerts/** (new), server/index.ts (start and stop the job), tests for these.
- Change only as needed, and say why:
  - server/db/schema.ts, server/db/schema.test.ts, server/invites/migration.test.ts (its applied list);
  - server/api/user-routes.ts, server/api/schemas.ts, server/api/map.ts, server/repo/views.ts (account alert fields), server/public/account.ts (only if the account update lives there);
  - src/pages/settings/AccountSettings.tsx, src/domain/types.ts, src/data/contracts.ts, src/data/http/tracker.ts, src/data/mock/** (account fields);
  - docs/api.md, server/README.md.
- Don't touch:
  - the email sender's provider logic (reuse `createEmailSender`; constructing a second instance for the job is fine);
  - auth rate limits; MCP and tokens;
  - the public page boundary; idempotency retention;
  - docs/plan/**, render.yaml, Render env or production.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- Web push: a separate task if the operator wants it later.
- Per-project alert settings, quiet hours, other channels (Slack and so on): not requested.
- Re-alerting a run that leaves a state and re-enters it: once per run per kind is the rule (D-037).

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 3f37e5d: 69 files / 490 tests (planner measurement). Report your counts.
Manual: run the built server locally with `EMAIL_PROVIDER=console` (development) against a scratch database:
- enable review alerts and move a run to waiting_for_review through MCP or the API;
- show the one logged digest after the next cycle (shorten the interval via a test-only option, not production code paths), and that a second cycle logs nothing new.
**Never** set EMAIL_PROVIDER=resend locally or send real email.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-g-email-alerts.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-g-email-alerts -t "P2-G: Opt-in email alert digest" -F <body file>. The body's first line: "Deploy runs migration 0007 on boot (additive; all alerts off), so nothing is emailed until a user opts in under Account settings." Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-G — Opt-in email alert digest
    LINE OF WORK: p2-g-email-alerts
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each Must-hold property red-before/green-after; manual console digest; builds; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   0007_alerts — <forward-on-populated-data evidence>
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     migration 0007; branch p2-g-email-alerts; table alert_deliveries; columns users.alert_blocked/alert_stale/alert_review
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-g; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. a real Resend delivery); surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, sending real email, touching Render or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
