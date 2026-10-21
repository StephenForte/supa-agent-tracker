DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): one component and one pure helper, client only · Order: now, in parallel with P2-P (P2-P is server-only; no shared files).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: origin/main at c952f7b (P2-N merged). Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites.
Runtime: unmeasured; expect 20–40 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-q, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-q-heatmap-latest → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-Q — Open the public profile heatmap at the latest week

## Why (planner, production check 2026-10-21, https://supa-agent-tracker-app.onrender.com/public/stevef)
The heatmap's scroll container (.public-scroll in src/pages/public/ActivityHeatmap.tsx) opens at scrollLeft 0, i.e. at the oldest week. All of the operator's activity is in the last three days (2026-10-19 7 runs, -20 12, -21 12), so the heatmap looks empty:
    viewport 1024 px: container clientWidth 748, scrollWidth 810, scrollLeft 0; active cells at x=1058 (> viewport)
    viewport 375 px: clientWidth 343, scrollWidth 810, scrollLeft 0; visible 2025-10-22 … 2026-03-15; no active cell visible
The page itself doesn't scroll sideways (document scrollWidth = viewport), which is correct and must stay. Cursor's and GitHub's heatmaps show the most recent weeks.
Second, smaller defect in the same header row: the first month label sits one column before the next, so the page reads "OctNov". The 365-day window starts 2025-10-22, which leaves October with a one-week column before November's label.

## Read first (trust the repository over this brief)
AGENTS.md (gate, hygiene). src/pages/public/ActivityHeatmap.tsx, src/domain/public/heatmap.ts (buildActivityGrid; months come from the first cell of each month), src/domain/public/heatmap.test.ts, src/pages/public/PublicProfilePage.test.tsx, src/styles/app.css (.public-scroll, .public-heat-*). Note: CI runs in UTC only, so date code must also be tested under TZ=America/Los_Angeles (planner trap from the P2-N review; recorded on the docs branch, not yet on main).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-q, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-q && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-q
    cd /Users/stephenforte/src/supa-agent-tracker-p2-q && git checkout -b p2-q-heatmap-latest origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-Q", title "P2-Q: Open the profile heatmap at the latest week", workload_type "coding", task_id "P2-Q", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-q-heatmap-latest, cut from origin/main. PR title "P2-Q: Open the profile heatmap at the latest week". Commit subjects start with "P2-Q: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).
## Pre-assigned identifiers
- No decision or migration. This implements D-040's heatmap as intended (latest weeks visible, like Cursor's).

## Outcomes
1. **Opens at the latest week.** When the heatmap renders, and whenever activity.end changes, the .public-scroll container scrolls fully right (scrollLeft = scrollWidth − clientWidth) before paint (useLayoutEffect or equivalent), so the newest cell is visible at any width. The user can still scroll left. Nothing else on the page scrolls horizontally.
2. **No crowded first month label.** A month label is dropped when it would sit fewer than 3 columns before the next label (GitHub's rule for a partial first month). Other labels and the cells don't move. Put this in buildActivityGrid's months (pure, tested), not in the component.

## The trap
- **jsdom has no layout.** scrollWidth and clientWidth are 0 in tests, so a scroll effect "passes" while doing nothing. Required test: stub scrollWidth/clientWidth on the container (Object.defineProperty on the element or HTMLElement.prototype, restored afterwards) and assert scrollLeft ends at scrollWidth − clientWidth after render, and again after a rerender with a later activity.end.
- **Date math west of UTC.** If the month rule is computed from Date objects in local time, the first label shifts a column in Pacific and passes CI. Keep it on the existing column/YYYY-MM strings. Run the heatmap tests under TZ=UTC and TZ=America/Los_Angeles and report both. Required test: start 2025-10-22, end 2026-10-21 → no "Oct" label at column 0, and "Nov" is the first label; a window starting on the 1st of a month keeps that month's label.

## Must survive
365 cells and their labels, Monday-first rows, quartile levels, the existing heatmap tests, the 375 px no-page-scroll rule, and everything else on the public page.

## Out of scope (with reasons)
- server/** — P2-P is changing server/public/stats.ts right now.
- Chart, tiles, agents grid/table — they render correctly in production.

## Scope
- Owns: src/pages/public/ActivityHeatmap.tsx, src/domain/public/heatmap.ts, src/domain/public/heatmap.test.ts.
- Add only: src/pages/public/PublicProfilePage.test.tsx (or a new ActivityHeatmap test file), src/styles/app.css (only if the scroll needs a CSS change).
- Must not touch: server/**, any other src file, docs/plan/**, docs/prd/**, package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
    TZ=America/Los_Angeles npx vitest run src/domain/public src/pages/public     # date code: run west of UTC too, CI only runs UTC
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the server, the payload, or anything outside the heatmap, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-q-heatmap-latest to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-q-heatmap-latest -t "P2-Q: Open the profile heatmap at the latest week" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-Q — <one line>
    LINE OF WORK: p2-q-heatmap-latest
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-q (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
