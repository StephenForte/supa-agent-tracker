DISPATCH · Model: Sonnet 5.5 (a reviewed, proven 4-line auth fix plus one regression test) · Order: now; nothing else touches these files.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: branch p1-i-invites at 4bcfe0a (PR #48), which you update in place. If main has moved, merge current main into the branch first.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 20–40 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-i-fix1, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new commits on p1-i-invites, so PR #48 updates.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P1-I fix 1 — The admin bootstrap must not reveal the admin's address

The planner's review of PR #48 (https://github.com/StephenForte/supa-agent-tracker/pull/48#issuecomment-6225332040) found an enumeration leak.

In server/invites/signup.ts, `bootstrap = !!adminEmail && email === adminEmail` applies forever. With the admin already registered, a sign-up with no invite for the admin email returns `200 {"status":true}`, while any other email returns the generic 403. Anyone can therefore confirm which address is the admin.

The planner proved the fix in scratch: admin email with no invite → the identical generic 403; all 34 invite and auth tests pass (including first-time bootstrap); typecheck and lint are clean.

## Line of work
Branch p1-i-invites (existing PR #48). Commit subjects start with "P1-I: ". No new identifiers.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-i-fix1, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-i-fix1 && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-i-fix1
    cd /Users/stephenforte/src/supa-agent-tracker-p1-i-fix1 && git checkout p1-i-invites
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Outcomes
1. server/invites/signup.ts, inside the signup transaction: bootstrap applies only when `ADMIN_EMAIL` is set, the body email equals it, **and no user exists with `lower(email)` equal to it** (look it up with the transaction `tx`). Otherwise the admin email takes the normal invite path and gets the same generic 403. Add a short comment saying why. The planner's proven version replaces the single `const bootstrap = …` line with an `adminTaken` lookup plus `bootstrap = … && !adminTaken`.
2. server/invites/invites.test.ts: add a regression. With the admin already registered, a no-invite sign-up for ADMIN_EMAIL returns status 403 and exactly the same body as a no-invite sign-up for a random email. Keep the existing first-time bootstrap test passing.
3. docs/api.md and server/README.md: one sentence each, saying the ADMIN_EMAIL bootstrap only works until that account exists.

## Must hold
- Edit only server/invites/signup.ts, server/invites/invites.test.ts, docs/api.md and server/README.md.
- No other behaviour change; no new dependencies; existing checks not weakened, skipped or deleted.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Expected: 51 files / 391 + your new test. Show the new test failing on 4bcfe0a (revert the signup.ts change, run, restore) and passing with the fix.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push to p1-i-invites.
H2. PR #48 updates automatically. Add a short "Fix 1" section to its body, and keep its first line (the ADMIN_EMAIL cutover instruction) unchanged.
H3. Wait for CI on the new head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment 48 -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown, then end with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-I fix 1 — Admin bootstrap no longer reveals the admin address
    LINE OF WORK: p1-i-invites
    REVIEW ARTIFACT: https://github.com/StephenForte/supa-agent-tracker/pull/48
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; new test red on old / green on fix; builds; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-i-fix1; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below authorises fixing CI and review-bot findings on PR #48 only. It does not authorise widening scope, touching other databases or Render, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
