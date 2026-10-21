DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): one pure function and its tests; the public payload shape doesn't change · Order: after P2-N merges (operator's call; the files don't overlap, so starting earlier is safe).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: current origin/main (P2-M merged at 0a03e8c; P2-N expected on main by dispatch time). Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites.
Runtime: unmeasured; expect 20–40 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-p, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-p-harness-fold → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-P — Fold harness names case-insensitively on the public profile chart

## Why (evidence, production 2026-10-21)
GET https://supa-agent-tracker-app.onrender.com/api/public/stevef/profile returned harness series:
    Cursor 13 · cursor 5 · Claude Code desktop 4 · Codex 3 · Other 6
Harness is self-reported per run, so the same client shows up as two series on the operator's public chart. The operator decided (D-042, on the planner docs branch PR #74, not main; **this brief is the full spec**) to fold names case-insensitively for the chart only.

## Read first (trust the repository over this brief)
AGENTS.md (gate, hygiene). server/public/stats.ts (harnessSeries), server/public/profile.ts (the harness SQL query and the coalesce(runs.harness, 'Unknown') there), server/public/stats.test.ts and server/public/profile.test.ts (the six-harness ranking test, the exact-key test, the query-count test), docs/api.md (the harnesses paragraph). P2-M's PR #76 is the context for all of these.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-p, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-p && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-p
    cd /Users/stephenforte/src/supa-agent-tracker-p2-p && git checkout -b p2-p-harness-fold origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-P", title "P2-P: Fold harness names on the profile chart", workload_type "coding", task_id "P2-P", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-p-harness-fold, cut from origin/main. PR title "P2-P: Fold harness names on the profile chart". Commit subjects start with "P2-P: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).
## Pre-assigned identifiers
- Decision: D-042 (planner-written; cite it). No migration.

## Outcomes
1. **Grouping.** For harnesses.series only, runs group by key = harness trimmed and lower-cased (toLowerCase is enough; no Unicode normalisation needed). null, "" and whitespace-only all count as "Unknown". Do the folding in TypeScript (harnessSeries), not by changing the SQL to lower(), so the original spellings stay available for the label: change the harness SQL to return the raw harness (null stays null) and let harnessSeries map null/blank → Unknown.
2. **Label.** Each group shows its most-used trimmed original spelling across the 30-day window; a tie goes to the code-unit-smallest spelling (plain < comparison, so "Cursor" beats "cursor").
3. **Ranking.** Top 4 and Other run on the folded totals, tie by label ascending, exactly as today otherwise. A harness that only reached the top 4 because a rival was split must now drop to Other when the rival is folded.
4. **docs/api.md** says harness names fold case-insensitively for this chart and how the label is chosen.

## The trap
- **Folding in SQL loses the label.** GROUP BY lower(harness) gives you "cursor" for everyone, so the operator's chart would read in lower case. Keep the raw spellings until harnessSeries.
- **Splitting the counts.** If the label choice runs per day instead of across the window, or the folded total is computed after the top-4 cut, a day can count twice or a group can land in Other wrongly. Required tests: the production case above ("Cursor" 13 + "cursor" 5 → one "Cursor" series totalling 18, per-day counts summed); a tie (2 + 2 → "Cursor"); " Cursor " and "CURSOR" join the same group; "", "   " and null all land in "Unknown"; a fifth harness that was in the top 4 only because "Cursor"/"cursor" were split now goes to Other.

## Must survive
Every other key of the profile payload, the exact-key test, the query-count bound, the privacy scoping (the owner, is_public and archived filters in the harness query, which this task must not loosen), the agents endpoint, and stored run data (no UPDATE of runs.harness).

## Out of scope (with reasons)
- Rewriting runs.harness or adding a migration: the operator asked for the chart, and stored data is the agents' own report.
- The agents table / run grid harness column: per-run display stays as reported (D-042).
- src/**: the client renders whatever labels the server sends.

## Scope
- Owns: server/public/stats.ts, server/public/stats.test.ts.
- Add only: server/public/profile.ts (the harness query's SELECT and nothing else), server/public/profile.test.ts, docs/api.md (the harnesses paragraph).
- Must not touch: src/**, server/db/**, any other server file, docs/plan/**, docs/prd/**, package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the Contract, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-p-harness-fold to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-p-harness-fold -t "P2-P: Fold harness names on the profile chart" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-P — <one line>
    LINE OF WORK: p2-p-harness-fold
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-p (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
