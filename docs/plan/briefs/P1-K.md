DISPATCH · Model: Sonnet (a small test-harness fix plus a three-line pool listener; the hard part is proving a CI-only race, not the code) · Order: now, in parallel with P1-J (which runs in its own clone and doesn't touch these files).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 529f112. If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 30–60 min, most of it waiting on repeated CI runs.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-k, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Never touch /Users/stephenforte/src/supa-agent-tracker-p1-j (P1-J is running there) or its processes and databases. Landing: new branch p1-k-test-teardown → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P1-K — Stop the CI teardown flake (57P01 unhandled error) and handle idle pool errors

## Evidence
CI fails intermittently with every test passing. Two of the last few otherwise-green runs:
- Run 38983589001 (PR #47 at 275ef04), first attempt: "Test Files 51 passed (51)", then "Vitest caught 1 unhandled error … error: terminating connection due to administrator command", code 57P01. "This error originated in server/auth/auth.test.ts". It passed on rerun.
- Run 38984291404 (push to main at 529f112): the identical failure, "originated in server/app/ready.test.ts". This one is red on main right now.
The serialized client in the error shows database supa_test_<hex>, `_ending: true`, `_connected: true`, `_poolUseCount: 37`. So the client belonged to a test's pool and had already been told to end when the server's termination notice arrived.

## The planner's diagnosis (unconfirmed; reproduce or refute it)
- server/test/database.ts drop() runs `pg_terminate_backend` on every backend of the scratch database, then DROP DATABASE.
- Tests call `await pool.end()` before `scratch.drop()` (e.g. ready.test.ts afterAll).
- pg-pool 8.x (pg 8.23.1): `end()` → `_remove(client)` drops the client from `_clients` synchronously and calls `client.end()` without waiting. So `pool.end()` can resolve while backends are still closing. A pool's idle timeout (default 10 s) removes clients the same way.
- If drop() terminates such a backend, Postgres sends FATAL 57P01 to a client that has `_ending: true` and no error listener left → Vitest reports an unhandled error → exit 1.
The planner could NOT reproduce this locally: 200 iterations of create pool → query → `await end()` → immediate terminate gave 0 errors over localhost, against CI's postgres:18 service container on slower runners. Treat the mechanism as a hypothesis. If you find a different cause (e.g. a pool that is never ended), fix that instead and say so.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-k, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-k && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-k
    cd /Users/stephenforte/src/supa-agent-tracker-p1-k && git checkout -b p1-k-test-teardown origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Line of work
Branch p1-k-test-teardown. PR title "P1-K: Fix CI teardown flake (57P01) and handle idle pool errors". Commit subjects start with "P1-K: ". No migrations, no new identifiers. Don't edit docs/plan/**.

## Outcomes
1. **Teardown is race-free.** In server/test/database.ts, drop() must no longer kill backends that are already closing. Suggested approach:
   - poll pg_stat_activity for that database until no backends remain, bounded (about 5 s, short sleeps);
   - only then terminate any stragglers, which are genuine leaks;
   - then DROP.
   If you keep a terminate path for stragglers, make it impossible for that termination to surface as an unhandled error in the test process. Keep the safety rules: only the database this process created, the name regex, and the ledger lines.
2. **Production pool handles idle-client errors.** server/db/pool.ts attaches a `pool.on('error', …)` listener that logs the error without connection strings or secrets and doesn't crash the process. node-postgres documents that an idle client error with no pool listener crashes the process. On Render, a database restart or maintenance that drops idle connections would otherwise kill the app.
   - The pool already has an error listener? Say so and skip this outcome.
   - Logging needs a logger the pool doesn't have? Use the simplest safe option and explain it.
3. **Regression coverage, as properties:**
   - a test proves pool.ts's listener exists and absorbs an emitted idle error (emit 'error' on the pool, process survives, the message is logged without the connection string);
   - a test for drop() with a backend still closing (e.g. end a client without awaiting, then call drop()) produces no unhandled error, and the database is gone.
   Show each failing against main's code where that's possible. Where the race can't be made deterministic, say so plainly rather than claiming a red run.

## Must hold
- Edit only server/test/database.ts, server/db/pool.ts, and tests for them (new test files are fine). If the fix needs anything else (e.g. a specific test file that leaks a pool), stop and report with evidence, unless it's a one-line `await` or `end()` in a test file, which you may make and declare.
- No new dependencies. Don't add retries, `dangerouslyIgnoreUnhandledErrors`, or onUnhandledError filters to Vitest config. Hiding the error isn't a fix.
- Existing checks aren't weakened, skipped or deleted.
- Never touch databases you didn't create; P1-J's supa_test_* databases may exist at the same time.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Baseline on main: 51 test files / 392 tests (planner measurement). Report your counts.
Stability evidence:
- run `npm test` 5 times locally;
- after opening the PR, rerun the CI job until you have 4 green runs on your final head (gh run rerun <id> -R StephenForte/supa-agent-tracker), and report the run ids;
- if any run shows the 57P01 error, the fix isn't done.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-k-test-teardown.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-k-test-teardown -t "P1-K: Fix CI teardown flake (57P01) and handle idle pool errors" -F <body file> (body = cause found, fix, stability evidence). Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; collect the 4 green runs; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown, then end with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-K — Fix CI teardown flake (57P01) and handle idle pool errors
    LINE OF WORK: p1-k-test-teardown
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <cause confirmed or refuted, and how; test counts; local 5× runs; 4 CI run ids on <sha>; leftover-DB check>
    MIGRATION:   none
    SHARED FILES TOUCHED: <files and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-k; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. the race not reproducible deterministically); surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If the planner's diagnosis is wrong, say so with evidence.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, touching other databases or P1-J's clone, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
