DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): one settings form, one pure helper, heatmap tests · Order: wave 14, now, parallel with P2-R (server); no shared files; either can merge first.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: origin/main at 15f05ec. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites.
Runtime: unmeasured; expect 45–90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-s, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-s-profile-form → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-S — Profile form: say what each field expects, make errors impossible to miss; heatmaps of any length

## Why (operator, 2026-10-22, after saving their profile in production)
1. "When saving the GH and Twitter, etc, alert the user in advance as what is expected in the field, I got an error on save."
2. "Make the profile save errors Red and a summary by the button as I did not realize I had an error, I thought it was broken."
3. (D-044, server side in P2-R) The heatmap will be 7 to 365 days long instead of always 365. The planner recorded D-044 on the docs branch (not on main), so **this brief is the full spec** for it: activity.start..activity.end inclusive, 7 to 365 entries, end = today in the owner's zone.
Today in src/pages/settings/PublicProfileForm.tsx: the GitHub / X / LinkedIn inputs have no hint or placeholder; field errors render as plain black <p role="alert"> under the field; the save result renders as a plain <p role="status"> below the whole section, far from the Save button. The validation rules (src/domain/public/profile.ts) are: GitHub ^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$, X ^[A-Za-z0-9_]{1,15}$, LinkedIn ^[A-Za-z0-9-]{3,100}$, all handles, not URLs. The likeliest causes of the operator's error are a leading "@" or a pasted profile URL; the planner couldn't see which.

## Read first (trust the repository over this brief)
AGENTS.md. src/pages/settings/PublicProfileForm.tsx (+ PublicProfileForm.test.tsx), src/domain/public/profile.ts (+ profile.test.ts), src/domain/public/heatmap.ts (+ heatmap.test.ts), src/pages/public/ActivityHeatmap.tsx (+ ActivityHeatmap.test.tsx), src/styles/app.css, src/components/ui (existing colour tokens and ErrorState for the red). Note: CI runs in UTC only, so date code must also be tested under TZ=America/Los_Angeles.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-s, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-s && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-s
    cd /Users/stephenforte/src/supa-agent-tracker-p2-s && git checkout -b p2-s-profile-form origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-S", title "P2-S: Profile form hints and visible errors; heatmaps of any length", workload_type "coding", task_id "P2-S", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-s-profile-form, cut from origin/main. PR title "P2-S: Profile form hints and visible errors; heatmaps of any length". Commit subjects start with "P2-S: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).
## Pre-assigned identifiers
- Decision: D-044 (planner-written; cite it). No migration.

## Outcomes
1. **Expectations up front.** Each of GitHub, X and LinkedIn shows a visible hint before any typing, linked with aria-describedby, plus a matching placeholder: GitHub "Your GitHub username, e.g. octocat. Not the full URL."; X "Your X handle without the @, e.g. jack."; LinkedIn "The part after linkedin.com/in/, e.g. jane-doe." Name and Bio show their limits (60 and 160 characters).
2. **Forgiving input.** Before validation, normalize: trim; strip one leading "@"; and if the value is a profile URL on the matching host, take the handle from it: https://github.com/<h>, https://x.com/<h> or https://twitter.com/<h>, https://www.linkedin.com/in/<h> (with or without "www.", "http", a trailing slash, query or fragment). URLs on other hosts are not stripped and fail validation as today. Pure function in src/domain/public/profile.ts with tests; the saved value is the bare handle.
3. **Errors you can't miss.** On a failed save (client validation or a 400/413/415 from the server): each bad field gets red text below it (aria-describedby) and a red border with aria-invalid; and a red summary right next to the Save button says what failed, e.g. "Not saved: fix GitHub and X." (role="alert"). Focus moves to the first invalid field. A server error with no field shows its message in the same red summary. A success shows "Public profile saved." next to the button in the normal (not red) style. Use the existing colour tokens or Tailwind red-700 on white, with AA contrast.
4. **Heatmaps of any length.** The heatmap renders correctly for 7-, 31- and 365-day activity windows: the right number of cells, the last cell labelled with activity.end, Monday-first rows, month labels (a 7-day window still shows its month), and no horizontal page scroll at 375 px. If the code already does all of this, the deliverable is the tests; change code only where a test fails.

## The trap
- **Normalization that invents a handle.** Taking "the last path segment" of any URL turns "https://evil.example/x" into "x" and saves it. Only the three hosts above may be stripped; everything else stays as typed and fails validation. Required tests: "@jack" → "jack"; "https://github.com/octocat/" → "octocat"; "https://www.linkedin.com/in/jane-doe/?trk=x" → "jane-doe"; "https://twitter.com/jack" for X → "jack"; "https://gitlab.com/octocat" for GitHub stays as typed and shows the GitHub error; links on the public page still use only the fixed hosts.
- **A red message nobody can find.** The summary must sit beside the Save button (same row or directly under it), not at the bottom of the section. A test asserts the role="alert" summary is the Save button's next sibling (or within its wrapper) and names the failing fields.
- **Short windows in Pacific.** A 7-day window ending on a Monday or Sunday is where Monday-first placement and month labels go wrong. Run the heatmap tests under TZ=UTC and TZ=America/Los_Angeles and report both.

## Must survive
Existing settings tests (validation for every field, saving against the demo store, timezone preselect), publicHandle and alerts flows, the avatar upload path (canvas blob only), the PATCH body shape (all six publicProfile keys), the heatmap's scroll-to-latest behaviour (P2-Q) and month-crowding rule, and no page-level horizontal scroll at 375 px.

## Out of scope (with reasons)
- server/**: P2-R is changing the window and the counts now.
- Validation rules themselves (unchanged; the server enforces the same patterns).

## Scope
- Owns: src/pages/settings/PublicProfileForm.tsx, src/pages/settings/PublicProfileForm.test.tsx, src/domain/public/profile.ts, src/domain/public/profile.test.ts, src/domain/public/heatmap.test.ts, src/pages/public/ActivityHeatmap.test.tsx.
- Add only: src/domain/public/heatmap.ts and src/pages/public/ActivityHeatmap.tsx (only if a length test fails), src/styles/app.css.
- Must not touch: server/**, src/data/**, other pages, docs/plan/**, docs/prd/**, package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
    TZ=America/Los_Angeles npx vitest run src/domain/public src/pages/public src/pages/settings     # date code: run west of UTC too, CI only runs UTC
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the server or the payload, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-s-profile-form to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-s-profile-form -t "P2-S: Profile form hints and visible errors; heatmaps of any length" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-S — <one line>
    LINE OF WORK: p2-s-profile-form
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-s (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
