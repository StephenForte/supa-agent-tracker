DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): two CSS declarations plus measurement · Order: wave 16, now; P2-W is merged, nothing else in flight on these files.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (GitHub)
Baseline: the existing branch p2-x-token-dialog-layout at 7fb2644 (PR #88, already merged with main ff8892c). Merge current main again before hand-back if it moved.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites, and a browser you can size to arbitrary viewports.
Runtime: unmeasured; expect 20–40 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-xa, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new commits on p2-x-token-dialog-layout → the existing PR #88 (do not open a new PR).
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-Xa — Token dialog: keep the project list usable on short viewports (follow-up to P2-X, PR #88)

## Why (planner review of PR #88, 2026-10-23)
PR #88 meets the brief at 1280×800, 1024×768 and 375×812. On shorter viewports the project list collapses or disappears, because `.dialog-body` and `.token-scope-list` both have `min-height: 0`, the list is the only shrinkable child, and the dialog has `overflow: hidden`. On main before #88 the whole dialog scrolled, so this is a regression for short windows. Planner measurements on the PR's demo build with 30 projects ("Specific projects" selected; px from viewport top):

    viewport   list top–bottom (height)        Create/Close     dialog bottom
    1280×800   500–694 (192)                   719–759          784
    1024×768   500–662 (160)                   687–727          752
    375×812    535–710 (173)                   735–779          796
    1024×600   500–512 (10)                    519–559          584     ← list unusable
    812×375    500–512, below the dialog (359) 294–334          359     ← list clipped and unreachable: no project can be selected (phone in landscape)

Planner-proven fix (injected as CSS in the live demo build and measured, not yet committed):

    .dialog-with-footer .dialog-body { overflow-y: auto; }
    .token-scope-list { min-height: min(10rem, 40dvh); }

Result with the fix: 1280×800 list 192, 1024×768 list 160, 375×812 list 173, none of them scrolling the body (identical to #88); 1024×600 list 158 and 812×375 list 148, with the body scrolling and Create/Close still visible (519–559 and 294–334). No page-level horizontal scroll at any size.

## What must hold (outcome)
1. At every viewport height ≥ 320 px with 30 projects and "Specific projects" selected: title, Create token / Save scope, Close and any error text stay visible without scrolling the dialog, and the project list stays at least about 140 px tall (enough for 3 rows) and reachable. When everything does not fit, the dialog body scrolls; the footer never does.
2. At 1280×800, 1024×768 and 375×812, behaviour is unchanged from #88 at 7fb2644 (no body scroll; list heights as in the table, ±2 px).
3. Both the live and the demo dialogs (they share the CSS).
You may use the planner's two lines or an equivalent; argue with measurements if you think something else is better.

## The trap
Fixing short viewports by letting the whole dialog scroll again (dropping `overflow: hidden` on the dialog, or removing the footer split). That brings back the original bug: Save below the fold. The footer must stay outside the scrolling region.

## Scope
Free: src/styles/app.css (the P2-X block only), src/features/tokens/** tests.
Do not touch: anything else, including src/components/ui/Dialog.tsx (its structure is right) and the existing `dialog` rule. If the fix appears to need more, stop and report.

## Must survive
All P2-X tests and the existing token tests pass unchanged. Existing checks may not be weakened, skipped or deleted.

## Coverage
jsdom has no layout, so the evidence is the manual measurement: report list height, Create/Close top–bottom, dialog bottom and whether the body scrolls at 1280×800, 1024×768, 375×812, 1024×600 and 812×375, with 30 demo projects (inject them in your browser's devtools or localStorage, not in the shared mock seed). Attach screenshots for 1024×600 and 812×375 to the PR description (not committed files).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-xa, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-xa && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-xa
    cd /Users/stephenforte/src/supa-agent-tracker-p2-xa && git switch p2-x-token-dialog-layout && git log -1 --format=%h
The last command must print 7fb2644 (or a later commit on that branch you can explain). Never stash/switch/reset in a folder whose branch you did not create.

## Reporting — Supa Agent Tracker MCP tools, if available
R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7, agent_name "<your surface>-P2-Xa", title "P2-Xa: Token dialog short viewports", workload_type "coding", task_id "P2-Xa", a fresh request_id; harness and model only if known. Keep run_id and revision; write only run_id to .supa/run-id.
R2. update_status at milestones: gate green; PR #88 updated (pr_references with its URL); bot review settled — every automated review comment on the PR head fixed or answered and CI green, message "PR #88: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", re-sent if a later push draws new comments; blocked (with reason). Always send the latest expected_revision.
R3. heartbeat at natural pauses.
R4. After H4, before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary, and the PR reference. Delete .supa/run-id only after check_out succeeds.
R5. Reporting never blocks the task: retry a transient failure with the same request_id; if the tools are missing or keep failing, carry on and say so on TRACKING. Do not change any MCP or agent configuration file to make reporting work; report the problem instead. Never print, log or commit the token.

## Verification (re-run after merging current main at hand-back)
    SCRATCH=$(mktemp -d -t p2xa); trap 'rm -rf "$SCRATCH"' EXIT
    set -o pipefail; ( npm ci && npm run typecheck && npm run lint && npm test && npm run build ) 2>&1 | tee "$SCRATCH/gate.log"
Expected on 7fb2644: 90 files / 665 tests. Unexplained movement is a finding.

## Out of scope
Anything beyond the short-viewport layout. No new features, no Dialog changes.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push to p2-x-token-dialog-layout; subjects start "P2-Xa: ". Fetch main; if it moved, merge it and rerun the gate.
H2. Update PR #88's description with the measurement table and the two screenshots (gh pr edit 88 -R StephenForte/supa-agent-tracker --body-file <file in $SCRATCH>, keeping the existing content). Do not open a new PR. Do not merge.
H3. Wait for CI on the new head; fix failures within scope.
H4. Post the return block as a PR comment: gh pr comment 88 -R StephenForte/supa-agent-tracker -F <file>.
H4b. R4 check_out, then teardown (processes, databases, clone, scratch).
H5. End with the return block as your final message, in one fenced code block, unprompted.

## Return format (labels in this order, one fenced code block; disclosure in the last fields counts as diligence)
TASK: P2-Xa — Token dialog: project list usable on short viewports
LINE OF WORK: p2-x-token-dialog-layout
REVIEW ARTIFACT: https://github.com/StephenForte/supa-agent-tracker/pull/88
STATUS: complete | complete-with-caveats | blocked
VERIFICATION: (gate counts against main as of hand-back; the five-viewport measurement table)
MIGRATION: none
SHARED FILES TOUCHED:
IDENTIFIERS USED: P2-Xa
EXISTING CHECKS MODIFIED:
CLONE:
TRACKING:
TEMP:
DECISIONS NEEDED:
RESIDUAL GAPS:

The /goal below authorises fixing CI and bot findings on this PR only — not widening scope, weakening checks, or deciding anything listed as an operator decision.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
