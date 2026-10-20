DISPATCH · Model: Sonnet (one client-side ordering change on one page, no server, no schema) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 75c4573 (P2-G merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; expect 30-60 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-h, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-h-public-recent-first → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-H — Public agents page: most recent first

## Why (operator, 2026-10-19)
"On the public agent list, can you sort by the most current agents, currently the most current are at the bottom."

## Diagnosis (planner, read from main 75c4573; trust the repository over this)
- server/public/read.ts orders projects by lower(name), then agents by name, then each agent's runs by last_contact_at desc (overall limit PUBLIC_RUN_LIMIT = 200, newest first).
- src/pages/public/PublicAgentsPage.tsx (PublicBody) flattens that into one table: project → agent → runs, in that order, with no re-sort.
- So the table is grouped alphabetically by project and agent. A run that is current shows wherever its agent's name falls, often near the bottom.

## Read first
AGENTS.md (gate, workspace and process hygiene); server/public/read.ts and server/public/public.test.ts (the response shape and its allowlist tests); src/pages/public/PublicAgentsPage.tsx and PublicAgentsPage.test.tsx.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-h, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-h && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-h
    cd /Users/stephenforte/src/supa-agent-tracker-p2-h && git checkout -b p2-h-public-recent-first origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-H", title "P2-H: Public agents page, most recent first", workload_type "coding", task_id "P2-H" and a fresh request_id.
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

## Line of work
Branch p2-h-public-recent-first. PR title "P2-H: Public agents page, most recent first". Commit subjects start with "P2-H: ". No migrations. Don't edit docs/plan/**.

## Outcome
The public agents table at /public/<handle>/agents (PublicAgentsPage) lists rows most recent first:
1. Rows that have a run sort by that run's lastContactAt, newest first. Tie-break by startedAt, newest first. If those tie too, keep the server's order (use a stable sort).
2. Rows with no run (an agent with no runs, or a project with no agents) go after every row with a run, in the project → agent order they arrive in today.
3. The columns, cells, badges, labels and refresh-while-visible behaviour stay as they are. Only the row order changes.
4. Re-sort on every refresh, so a run that checks in moves to the top on the next poll.

## Scope
- Free: src/pages/public/PublicAgentsPage.tsx, src/pages/public/PublicAgentsPage.test.tsx. A small pure helper beside the page is fine, if you test it.
- Don't touch: server/** (including server/public/read.ts). The JSON response's shape and nesting are an allowlisted public contract, pinned by server/public/public.test.ts. The 200-run limit already keeps the newest runs, so the server needs no change. Don't touch src/data/public/** either (same contract on the client side).
- If the outcome seems to need anything outside the Free list, stop and report rather than widen scope.

## The trap
Comparing the ISO strings is right only while every timestamp has the same format. The server always emits toISOString() (UTC, ms, Z), so string order equals time order today. Parse to time (Date.parse) anyway, so a format change can't reorder the table silently. Don't sort the nested page.projects arrays in place: they are the loader state, and mutating them leaks the order into the next refresh's comparison and into tests.

## Coverage (properties, in PublicAgentsPage.test.tsx)
- Two agents where the alphabetically later agent's run has the newer lastContactAt: its row renders first.
- Runs from different projects interleave by recency, not grouped by project.
- A row with no run renders after all rows that have one.
- Equal lastContactAt falls back to startedAt, newest first.
- Existing tests stay green, unmodified. If one encoded the old order, declare it under EXISTING CHECKS MODIFIED.
Mutation check you run and report: reverse the comparator, or remove the sort, and confirm at least one new test goes red. Then restore it.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 75c4573: 72 files / 505 tests (planner measurement at P2-G). Report your counts. Unexplained movement is a finding.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Out of scope
- Sorting the signed-in screens (Projects, All agents, Needs me): not asked for.
- A sort toggle or clickable column headers: not asked for. Recency-first is the fixed order.
- Changing which runs the server returns, or the limit.

## Decisions
"Most current" is read as the run's latest contact (lastContactAt). That is the planner's assumption. If you think another key, such as running-first, fits the page better, argue it in DECISIONS NEEDED and implement lastContactAt meanwhile.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-h-public-recent-first.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-h-public-recent-first -t "P2-H: Public agents page, most recent first" -F <body file>. The body includes a summary and the verification evidence. Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-H — Public agents page, most recent first
    LINE OF WORK: p2-h-public-recent-first
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; mutation result; builds; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why> (or: none)
    IDENTIFIERS USED:     P2-H; branch p2-h-public-recent-first
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-h; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified; surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, server changes, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
