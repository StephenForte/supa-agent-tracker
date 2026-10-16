DISPATCH · Model: Sonnet 5.5 (a reviewed, proven 10-line fix plus two tests) · Order: now; nothing else touches these files. P1-G1 may be running in parallel in its own clone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: branch p1-f-integrations at 01fd008 (PR #43), which you update in place. If main has moved, merge current main into the branch first.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 20–40 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-f-fix1, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new commits on p1-f-integrations, so PR #43 updates.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P1-F fix 1 — Heartbeat adapter must reclaim a leaked lock

The planner's review of PR #43 (https://github.com/StephenForte/supa-agent-tracker/pull/43#issuecomment-6223288928) reproduced a silent, permanent failure.

adapters/heartbeat/heartbeat.mjs takes `<run-id-file>.<sha256(runId)>.heartbeat.lock` with `openSync(lockPath, 'wx', 0o600)` and never reclaims it. If the process is killed (SIGTERM during the network call: a hook-runner timeout, quitting the client, Ctrl-C; or SIGKILL/crash), the lock stays. Every later invocation for that run then prints `supa heartbeat: throttled` and sends nothing.

Measured: SIGTERM mid-request → exit 143, lock left; the next run → `throttled`. A lock dated 2026-01-01 → still `throttled`, heartbeat count unchanged. The run then shows stale while the agent is alive. A duplicate heartbeat is harmless (it doesn't change the revision, D-024), so reclaiming an aged lock is the safe trade.

## Line of work
Branch p1-f-integrations (existing PR #43). Commit subjects start with "P1-F: ". No new identifiers.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-f-fix1, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-f-fix1 && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-f-fix1
    cd /Users/stephenforte/src/supa-agent-tracker-p1-f-fix1 && git checkout p1-f-integrations
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Outcomes
1. In adapters/heartbeat/heartbeat.mjs (the planner proved this exact change in scratch):
   - import `statSync` from node:fs;
   - directly before `openSync(lockPath, 'wx', 0o600)`, remove the lock if `Date.now() - statSync(lockPath).mtimeMs > 30000` (well past the 10 s deadline, so its owner must be dead). Ignore a missing lock. Comment why;
   - register `process.on` handlers for `SIGTERM`, `SIGINT` and `SIGHUP` that call `finish('interrupted')`, which already releases the lock and exits 0;
   - update the "never steal a lock by age" comment and adapters/heartbeat/README.md to describe the 30 s reclaim and the signal handling. Remove the SIGKILL caveat from the docs only where it's now false.
2. Add to server/e2e/heartbeat-adapter.test.ts:
   - a lock file with mtime older than 30 s (use `utimesSync`) and an old stamp → the adapter sends, the heartbeat count increases, and exit is 0;
   - spawn the adapter against an unroutable https URL (for example `https://10.255.255.1/mcp`), send SIGTERM after it has taken the lock → exit 0, stderr `supa heartbeat: interrupted`, no lock file left;
   - a lock file younger than 30 s → still `throttled`, no new event.
3. Everything else in PR #43 stays as it is.

## Must hold
- Edit only adapters/heartbeat/heartbeat.mjs, adapters/heartbeat/README.md and server/e2e/heartbeat-adapter.test.ts (plus docs/integrations/cursor.md only if it repeats the SIGKILL caveat).
- Never print the token; always exit 0 within 10 s; no new dependencies.
- Existing checks not weakened, skipped or deleted.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Expected: web 27 / 248 unchanged; server 20 files / 122 + your new cases. Show each new test failing against the old adapter (temporarily revert the adapter, run, restore) and passing with the fix.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours. P1-G1 may own others; never touch those.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push to p1-f-integrations.
H2. PR #43 updates automatically. Add a short "Fix 1" section to its body.
H3. Wait for CI on the new head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment 43 -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown, then end with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-F fix 1 — Heartbeat adapter reclaims leaked lock
    LINE OF WORK: p1-f-integrations
    REVIEW ARTIFACT: https://github.com/StephenForte/supa-agent-tracker/pull/43
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; new tests red on old adapter / green on fix; builds; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-f-fix1; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's still unverified; surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below authorises fixing CI and review-bot findings on PR #43 only. It does not authorise widening scope, touching other databases or processes (P1-G1 is running), weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
