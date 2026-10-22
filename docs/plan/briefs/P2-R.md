DISPATCH · Model: strongest tier (Opus 5.5 or GPT-6): it deliberately widens what an unauthenticated endpoint counts, so the risk is widening the wrong thing (another owner's runs, the agents list, the 404 rule) · Order: wave 14, now, parallel with P2-S (client); no shared files; either can merge first.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: origin/main at 15f05ec. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432).
Runtime: unmeasured; expect 45–90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-r, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-r-profile-all-runs → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-R — Count all of the owner's runs on the public profile; size the heatmap to account age

## Why (operator, 2026-10-22, after using /public/stevef)
"On the public profile page include ALL agents in the counts, not just the public ones, but only display the public ones." And: "The usage calendar is out of date, I only joined 3 days ago but it goes back a year. Use dynamic sizing on the calendar of usage where a week is the smallest and a year is the largest."
The planner recorded these as D-043 and D-044 on the docs branch (not on main yet), so **this brief is the full spec**:
- D-043: stats tiles, the activity heatmap and the harness chart count every run in every project the owner has, private and archived included. Still public-only: GET /api/public/:handle/agents, the 404 when the owner has no public non-archived project, and the field allowlist. No private project names, titles or IDs appear anywhere.
- D-044: activity.end = today in the owner's zone. activity.start = the later of (end − 364 days) and the join date (users.created_at as a calendar date in the owner's zone), then moved earlier if needed so the window is at least 7 days. counts has one entry per day, start..end inclusive: 7 to 365 entries. The harness chart stays at 30 days.

## Read first (trust the repository over this brief)
AGENTS.md. server/public/profile.ts (readPublicProfile: the owner lookup, the public-project gate, the day query and the harness query, each with owner_id + is_public + lifecycle filters today), server/public/stats.ts (activityWindow and friends), server/public/read.ts (the agents endpoint: must not change), server/public/profile.test.ts, server/public/stats.test.ts, docs/api.md (the profile section). Note: CI runs in UTC only, so date code must also be tested under TZ=America/Los_Angeles.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-r, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-r && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-r
    cd /Users/stephenforte/src/supa-agent-tracker-p2-r && git checkout -b p2-r-profile-all-runs origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-R", title "P2-R: Count all runs on the public profile; size the heatmap to account age", workload_type "coding", task_id "P2-R", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-r-profile-all-runs, cut from origin/main. PR title "P2-R: Count all runs on the public profile; size the heatmap to account age". Commit subjects start with "P2-R: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).
## Pre-assigned identifiers
- Decisions: D-043, D-044 (planner-written; cite them). No migration (users.created_at already exists).

## Outcomes
1. **All runs counted.** In readPublicProfile, the day/stats query and the harness query keep `projects.owner_id = <owner>` and drop the is_public and lifecycle conditions. The owner lookup and the "has at least one public, non-archived project, else 404" gate stay exactly as they are.
2. **Dynamic window.** activityWindow takes the join instant (or join date) as well as now and the zone, and returns the D-044 window. Do the join date with the same calendarDate(instant, zone) helper, never the process zone. joinedAt in the payload is unchanged.
3. **docs/api.md** describes both changes: which runs count, the 7–365-day window, and that the agents endpoint and 404 rule are unchanged.

## The trap
- **Widening the wrong thing.** Removing two predicates is easy; removing the owner one by accident counts everyone's runs on everyone's profile, and nothing on the page looks wrong. The same goes for touching read.ts (it would list private projects) or the public-project gate (a user with only private projects would get a page). Required tests: another owner's runs never change this owner's counts; a private project's runs and an archived project's runs now DO count (agentRuns, longest, streaks, activity, harnesses); the agents endpoint for the same owner still lists only public, non-archived projects (unchanged payload); an owner with only private projects still gets the identical 404 on /profile and /agents; the exact-key profile test passes unchanged; no private project or run title appears anywhere in the profile body (string search).
- **The join date in the wrong zone.** created_at 2026-10-21T06:30Z is Oct 20 in Los Angeles. Required tests with an injected now: joined 3 days ago → start = end − 6 (7 entries); joined 30 days ago → start = join date (31 entries); joined 2 years ago → 365 entries; joined at 06:30Z on the zone boundary gives a different start in Los Angeles vs UTC; joined today → 7 entries; a DST-crossing window still has the right count. Run server/public under TZ=UTC and TZ=America/Los_Angeles and report both.

## Must survive
The 404 body and rules, rate limits and no-store, the avatar route, the agents endpoint byte-for-byte, the query-count bound, D-042 harness folding, and every key of the profile payload (only the activity length and the counts' scope change).

## Existing checks this task changes on purpose
The profile.test.ts case "…ignores private, archived, and other owners" and the query-count case "…still filters private work" assert the old D-040 scoping. Update them to D-043 (private and archived now count; other owners still don't) and declare each change under EXISTING CHECKS MODIFIED, with before and after. Any test asserting exactly 365 activity entries for a new account changes to the D-044 length: declare it too. Nothing else may be weakened.

## Out of scope (with reasons)
- src/**: P2-S is changing the client now; the client already renders any start..end range.
- The harness chart window (stays 30 days, D-044).
- Any migration.

## Scope
- Owns: server/public/profile.ts, server/public/stats.ts, server/public/stats.test.ts, server/public/profile.test.ts.
- Add only: docs/api.md (the profile section).
- Must not touch: server/public/read.ts, server/public/routes.ts, server/public/avatar.ts, server/db/**, src/**, docs/plan/**, docs/prd/**, package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
    TZ=America/Los_Angeles npx vitest run server/public     # date code: run west of UTC too, CI only runs UTC
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the agents endpoint, the 404 rule, or any profile key other than the stats, activity and harness counts and the activity window, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-r-profile-all-runs to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-r-profile-all-runs -t "P2-R: Count all runs on the public profile; size the heatmap to account age" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-R — <one line>
    LINE OF WORK: p2-r-profile-all-runs
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-r (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
