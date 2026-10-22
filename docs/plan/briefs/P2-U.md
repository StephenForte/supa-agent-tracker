DISPATCH · REISSUED 2026-10-22 (adds the heatmap): if a P2-U run already started from the earlier brief, stop it, delete its clone and branch, and start fresh from this one. · Model: strongest tier preferred (Opus 5.5 or GPT-6): calendar math with a gap rule, where off-by-one errors are silent · Order: wave 15, now, parallel with P2-T (client); no shared files; **merge after P2-T** (until P2-T lands, the client draws exactly 30 bar slots).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: origin/main at ea52b53. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432).
Runtime: unmeasured; expect 45–90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-u, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-u-chart-window → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-U — Chart and heatmap windows follow the account and restart after a 30-day break

## Why (operator, 2026-10-22)
"Let's have the chart match the account, same dynamic charting. Account for gaps in usage too, so if you stop usage for 30 days, the next chart should be 1 week, etc." Then: "Apply the 30-day restart to the heatmap as well."
Today `harnesses` on GET /api/public/:handle/profile is always the last 30 days (harnessWindow in server/public/stats.ts), while `activity` already follows the join date (D-044, 7–365 days). The operator's account is 7 days old, so the chart is 23 empty days and 7 active ones.
Planner decision D-046 is on the docs branch (not on main), so **this brief is the full spec**:
- Days are owner-zone calendar days; an active day has ≥ 1 run started (all of the owner's runs, D-043, the same set the day query already builds).
- `harnesses.end` = today. The **anchor** is the later of the join date and the start of the current activity period, where periods are separated by 30 or more consecutive inactive days. If the last active day is 30 or more days before today, the anchor is today.
- `harnesses.start` = the later of (end − 29) and the anchor, then moved earlier if needed so the window is at least 7 days. `counts` length: 7 to 30.
- Worked examples (end = today): joined 3 days ago → 7 days; joined 2 months ago, active throughout → 30; active, 30 idle days, active again today → 7; resumed 12 days ago after a 40-day break → 12; no runs for 45 days → 7 empty days; a 29-day break does NOT restart the window.
- **The heatmap uses the same anchor:** `activity.start` = the later of (end − 364) and the anchor, then moved earlier if needed so the window is at least 7 days (7 to 365). Examples: active for two years → 365; joined 3 days ago → 7; active, 30 idle days, active again today → 7; resumed 50 days ago after a 40-day break → 50.
- The stats tiles (agentRuns, longestRunSeconds, current and longest streak) stay all-time and unchanged.

## Read first (trust the repository over this brief)
AGENTS.md. server/public/stats.ts (calendarDate, shiftCalendarDate, activityWindow, harnessWindow, harnessSeries), server/public/profile.ts (the day query builds the active-day set before the harness query; the harness query filters by the window), server/public/stats.test.ts, server/public/profile.test.ts, docs/api.md (profile section). Note: CI runs in UTC only, so date code must also be tested under TZ=America/Los_Angeles.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-u, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-u && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-u
    cd /Users/stephenforte/src/supa-agent-tracker-p2-u && git checkout -b p2-u-chart-window origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-U", title "P2-U: Chart and heatmap windows follow the account", workload_type "coding", task_id "P2-U", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-u-chart-window, cut from origin/main. PR title "P2-U: Chart and heatmap windows follow the account". Commit subjects start with "P2-U: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).
## Pre-assigned identifiers
- Decision: D-046 (planner-written; cite it). No migration.

## Outcomes
1. **Pure window functions.** One shared anchor function (now, owner zone, join instant, active-day set → anchor date) feeds both windows: the chart (7–30 days) and the heatmap (7–365 days). All of it is pure and unit-tested and never uses the process zone.
2. **Wired in.** readPublicProfile computes the anchor from the active days it already has, builds both windows, fills activity.counts from the day map, and filters the harness query by the chart window. No extra query (the query-count bound stays). harnessSeries is unchanged (D-042 folding stays).
3. **docs/api.md** describes both D-046 windows with the examples above.

## The trap
- **Off by one at the 30-day boundary.** "30 or more consecutive inactive days" is easy to code as 29, 30 or 31. Required tests: a gap of exactly 29 inactive days does not restart; exactly 30 does; 31 does. The last active day exactly 29 days ago keeps the window; exactly 30 days ago → anchor today → 7 days. Every example in the Why section, for both windows, is a test.
- **Ignoring the join date or the caps.** Joined yesterday → 7 and 7; joined 2 years ago with steady use → chart 30, heatmap 365 (never more); restart today → 7 and 7 (never fewer).
- **Moving the stats with the window.** The streaks and run counts are all-time; a restart must not reset them. Required test: after a 40-day break, longestStreakDays and agentRuns still include the earlier period.
- **Zone.** Active days and the join date are owner-zone dates. Run server/public under TZ=UTC and TZ=America/Los_Angeles and report both; include one case where a run at 06:30Z lands on a different owner-zone day and moves the anchor.

## Must survive
Everything else in the profile payload, and the exact-key test: stats (all-time), D-042 folding, D-043 scoping, the 404 rule, rate limits, the query-count bound, the agents endpoint.

## Out of scope (with reasons)
- src/**: P2-T is making the chart draw any length now (the heatmap already does).

## Scope
- Owns: server/public/stats.ts, server/public/stats.test.ts.
- Add only: server/public/profile.ts (window computation, activity counts and the harness query's date filter only), server/public/profile.test.ts, docs/api.md (profile section).
- Must not touch: server/public/read.ts, routes.ts, avatar.ts, server/db/**, src/**, docs/plan/**, docs/prd/**, package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
    TZ=America/Los_Angeles npx vitest run server/public     # date code: run west of UTC too, CI only runs UTC
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to any profile key other than the harnesses and activity windows (start, end, counts length), stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-u-chart-window to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-u-chart-window -t "P2-U: Chart and heatmap windows follow the account" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-U — <one line>
    LINE OF WORK: p2-u-chart-window
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-u (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
