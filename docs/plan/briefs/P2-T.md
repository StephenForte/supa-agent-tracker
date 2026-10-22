DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): layout and one default flag, client only · Order: wave 15, now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: origin/main at ea52b53. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites, and a browser you can size to 1024×768, 1280×800 and 375 px.
Runtime: unmeasured; expect 1–2 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-t, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-t-profile-compact → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-T — Compact public profile; table is the default agents view

## Why (operator, 2026-10-22)
"Can we tighten it up somewhat, the Cursor page has a lot of info 'above the fold'. Also, can we make the table view the default?" (Cursor's page for reference: https://cursor.com/@stevef — avatar and name in a compact header, joined date and links in a narrow column, four stat tiles in one row, heatmap directly under them, short charts.)
Planner measurement of https://supa-agent-tracker-app.onrender.com/public/stevef at 1024×768, today (top / height in px; the fold is 768):
    header (96 px avatar, name, @handle, bio)   84 / 153
    stats tiles                                 261 / 78
    activity heatmap                            339 / 156
    harness chart section                       495 / 412   (its SVG alone is 303 px tall: it scales with width)
    agents section                              951 / 5443  (grid cards are 302 px each)
Nothing of the agents list is above the fold. Planner decision D-045 is on the docs branch (not on main), so **this brief is the full spec**.

## Read first (trust the repository over this brief)
AGENTS.md. src/pages/public/{PublicAgentsPage,ProfileSummary,ActivityHeatmap,AgentsChart,PublicAgentSection}.tsx and their tests (PublicAgentsPage.test.tsx, PublicProfilePage.test.tsx, ActivityHeatmap.test.tsx), src/domain/public/agents.ts (publicAgentsView: today grid is the default) and its test, src/styles/app.css (.public-* rules, mobile tap targets). Note: CI runs in UTC only, so date code must also be tested under TZ=America/Los_Angeles.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-t, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-t && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-t
    cd /Users/stephenforte/src/supa-agent-tracker-p2-t && git checkout -b p2-t-profile-compact origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-T", title "P2-T: Compact public profile; table is the default view", workload_type "coding", task_id "P2-T", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-t-profile-compact, cut from origin/main. PR title "P2-T: Compact public profile; table is the default view". Commit subjects start with "P2-T: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).
## Pre-assigned identifiers
- Decision: D-045 (planner-written; cite it). No migration.

## Outcomes
1. **Above the fold.** In a real browser at 1024×768 and at 1280×800 (signed out, on a profile with data, e.g. the dev server pointed at seeded data, or the built app), the header, the four stat tiles, the heatmap, the harness chart and the agents table's header row plus at least its first run row are all visible without scrolling. Report the measured top of the agents table's first row at both sizes in the PR (it must be below 768 and 800 respectively), with screenshots attached to the PR.
2. **Header.** Avatar about 64 px (was 96). Name, @handle and bio beside it; the "Joined N days ago" line and the GitHub/X/LinkedIn links move into the header (one compact line), so the separate left column goes away and the content uses the full width.
3. **Charts.** On wide screens (≥ 1024 px) the heatmap and the harness chart sit side by side. The harness chart has a fixed height (about 140–180 px) that doesn't grow with width; bars, legend and the heading/date range stay readable. Below 1024 px they stack.
4. **Tiles.** One row of four on desktop, tighter padding; values stay the dominant text.
5. **Table by default (D-045).** publicAgentsView returns "table" for a missing or invalid value, "grid" only for ?view=grid; ?view=table still works. The toggle shows Table first. The table keeps the P2-H order and its columns.
6. **Phones.** At 375 px everything stacks, with no page-level horizontal scroll (the table and heatmap scroll inside their own containers, as today) and 44 px tap targets.

## The trap
- **"Fits" only in jsdom.** jsdom has no layout, so tests can't prove anything is above the fold. The fold claim is proven only by the measured numbers and screenshots from a real browser at both sizes (Outcome 1). The unit tests cover structure: the view default, the toggle, and that the chart's SVG has a fixed height attribute rather than a width-derived one.
- **Breaking old links and the P2-H order.** /public/:handle/agents, ?view=table and ?view=grid must keep working; the table rows must stay in the P2-H order (most recent last contact first). Tests that assumed grid as the default change on purpose: declare each under EXISTING CHECKS MODIFIED (before → after: default grid → default table).
- **Squeezing the heatmap.** Side by side, the heatmap container is narrower. It must still scroll to the latest week (P2-Q) and render 7–365 days correctly (D-044). Keep the existing heatmap tests green in both timezones.

## Must survive
D-035/D-043 data rules (nothing new is shown; layout only), noindex, the 30 s visible-only agents poll, the /agents alias, the heatmap's scroll-to-latest and month-label rules, avatar fallback initials, fixed-host profile links, and no page-level horizontal scroll at 375 px.

## Out of scope (with reasons)
- server/** and the payload: this is layout only.
- Changing the harness chart's 30-day window (D-044 keeps it).
- The settings page.

## Scope
- Owns: src/pages/public/** (components and tests), src/domain/public/agents.ts and its test.
- Add only: src/styles/app.css (public-page rules only).
- Must not touch: server/**, src/data/**, src/pages/settings/**, src/domain/public/{profile,heatmap,calendar}.ts, docs/plan/**, docs/prd/**, package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
    TZ=America/Los_Angeles npx vitest run src/domain/public src/pages/public     # date code: run west of UTC too, CI only runs UTC
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the server, the payload, or the settings page, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-t-profile-compact to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-t-profile-compact -t "P2-T: Compact public profile; table is the default view" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-T — <one line>
    LINE OF WORK: p2-t-profile-compact
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-t (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
