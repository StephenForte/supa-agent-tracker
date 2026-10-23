DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): client layout only, no API change · Order: wave 16, now, parallel with P2-W; no shared files; any merge order.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (GitHub)
Baseline: origin/main at 815c7d8. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites, and a browser you can size to 1280×800, 1024×768 and 375×812.
Runtime: unmeasured; expect about 1 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-x, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-x-token-dialog-layout → a new PR into main, title "P2-X: Token dialog — readable scope list, actions always visible".
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-X — Token create / edit-scope dialog: readable scope list, Save always visible

## Why (operator, 2026-10-23)
"Clean up the token MCP page: the scope is too bunched up and now that we have several MCPs, when you create a token the page just scrolls long and you can't see the save button on the bottom."
(Planner reading: "several MCPs" = several projects in the scope list; the operator's account has 9 active projects today, more over time. Flag it if you read it differently.)

Planner reading of main 815c7d8 (source, not a screenshot):
- src/features/tokens/ScopeFields.tsx renders the two radios and then, for "Specific projects", one `<label><input type="checkbox"/>{project.name}</label>` per project, all inline inside a bare `<fieldset>`: no per-row layout, no gap, no space between checkbox and name, so the labels run together and wrap as a paragraph.
- The scope list is shown in a `Dialog` (src/components/ui/Dialog.tsx, native `<dialog>` + showModal) from LiveTokensPanel.tsx (live: "Create token", "Edit scope") and TokensPanel.tsx (demo). The action button ("Create token" / "Save scope") is the last child before the shared "Close" button, and the dialog has no height rule beyond the browser default (src/styles/app.css L29 sets only width/margin/border/padding). With enough projects the whole dialog scrolls and the action button sits below the visible area.

## What must hold (outcome)
1. Scope list is legible at any project count: one project per row, a visible gap between rows, space between checkbox and name, whole row is the click target (≥44 px on touch widths, per the existing mobile tap-target rule in app.css). The radios read as two clear choices.
2. With "Specific projects" selected and 30 projects, the primary action (Create token / Save scope), the Close button and any error text stay visible without scrolling the dialog at 1280×800, 1024×768 and 375×812. Only the project list scrolls (bounded height, internal scroll). The title stays visible.
3. Selection is easy to keep track of: show "N of M selected", and offer Select all / Clear when "Specific projects" is chosen. Selected projects stay where they are (no reordering while the user clicks).
4. When there are more than 8 projects, a filter text box above the list narrows it by name (case-insensitive substring); filtering never deselects hidden projects, and the count still reflects all selections.
5. Both the live panel and the demo panel get the same behaviour (they share ScopeFields; keep it that way).
6. Create with "Specific projects" and zero selected keeps today's server-side validation behaviour (whatever it is on main — check, do not change it); the error appears next to the action, visible.

How you lay out the footer is your call. One reasonable shape: give Dialog an optional `footer` slot (add-only — existing callers unchanged) rendered in a non-scrolling area, with `max-height` on the dialog and a flex column so only the body scrolls. Keep native `<dialog>` + showModal (it supplies focus trap, inert background and Escape).

## The trap
Fixing it only for the live panel, or only by making the whole dialog taller: the next account with 40 projects is back to a hidden Save. The property is "action visible regardless of project count", so test it with a long list, not with today's 9.
Second trap: changing Dialog for everyone. CloseRunDialog (src/features/runs/) and RunGrid/Shell/NeedsMePage also use Dialog; they must render exactly as before unless they opt in. P2-W is editing src/features/runs/** this wave — do not touch it.

## Scope
Free: src/features/tokens/** (ScopeFields, LiveTokensPanel, TokensPanel, tests), new pure helpers in src/domain/tokens/ if useful.
Add-only: src/components/ui/Dialog.tsx (an optional prop; default rendering byte-identical for existing callers); src/styles/app.css (append rules; do not edit the existing `dialog` rule's width — append overrides scoped to a class if needed).
Do not touch: src/features/runs/**, src/pages/needs-me/**, src/data/**, server/** (P2-W owns or edits them this wave; no API change is needed); src/features/integrations/** (separate card, not in the complaint); docs/plan/**, docs/prd/** (planner-owned).
If the task appears to need anything outside this list, stop and report instead of widening scope.

## Must survive
Token create/rotate/revoke/scope flows and the one-time plaintext reveal (TokenReveal) behave exactly as today; src/features/tokens/tokens.test.tsx and tokenReveal.setup.test.tsx pass. Existing checks may not be weakened, skipped or deleted; any test you change is declared with before/after/why.

## Coverage (as properties)
- With 30 projects, "Specific projects" selected: the action button and Close are rendered outside the scrolling list region (assert structure — e.g. the button is not a descendant of the scroll container — since jsdom has no layout).
- Select all selects the currently visible rows (all projects when no filter is set) and keeps earlier selections; Clear empties the whole selection; the count text matches.
- Filter narrows visible rows, does not change the selection, and the selection submitted to createToken/updateTokenScope is the full set.
- Existing Dialog callers render the same DOM as before (snapshot or explicit assertion for CloseRunDialog's dialog).
Manual (required, report what you saw): demo build at 1280×800, 1024×768 and 375×812 with ≥30 demo projects (add them in your test setup or devtools, not by editing the shared mock seed): action visible without scrolling; no page-level horizontal scroll at 375. Attach screenshots to the PR description, not committed files.

## Read first (trust the repository over this brief)
AGENTS.md, docs/plan/PLAN.md (P2-A hid revoked tokens + sort; P2-O added the Muse card), src/features/tokens/*, src/components/ui/Dialog.tsx, src/styles/app.css (dialog rule, mobile tap targets).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-x, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-x && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-x
    cd /Users/stephenforte/src/supa-agent-tracker-p2-x && git switch -c p2-x-token-dialog-layout origin/main
Never stash/switch/reset in a folder whose branch you did not create.

## Reporting — Supa Agent Tracker MCP tools, if available
R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7, agent_name "<your surface>-P2-X", title "P2-X: Token dialog layout", workload_type "coding", task_id "P2-X", a fresh request_id; harness and model only if known. Keep run_id and revision; write only run_id to .supa/run-id.
R2. update_status at milestones: gate green; PR opened (pr_references with the PR URL); bot review settled — every automated review comment on the PR head fixed or answered and CI green, message "PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", re-sent if a later push draws new comments; blocked (with reason). Always send the latest expected_revision.
R3. heartbeat at natural pauses during long phases.
R4. After H4, before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary, and the PR reference. Delete .supa/run-id only after check_out succeeds.
R5. Reporting never blocks the task: retry a transient failure with the same request_id; if the tools are missing or keep failing, carry on and say so on TRACKING. Never print, log or commit the token.

## Verification (re-run after merging current main at hand-back)
    SCRATCH=$(mktemp -d -t p2x); trap 'rm -rf "$SCRATCH"' EXIT
    npm ci && npm run typecheck && npm run lint && npm test && npm run build 2>&1 | tee "$SCRATCH/gate.log"
Run the gate once on the untouched clone first and record its file/test counts as the baseline; report before/after counts — unexplained movement is a finding.

## Out of scope
Integrations panel / setup cards; token list table layout; any server or API change; renaming scopes. If the operator meant something else by "several MCPs" (e.g. per-integration tokens), report it — do not build it.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-x-token-dialog-layout to StephenForte/supa-agent-tracker; subjects start "P2-X: ". Fetch main; if it moved, merge it and rerun the gate.
H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-x-token-dialog-layout -t "P2-X: Token dialog — readable scope list, actions always visible" -F <body file in $SCRATCH> (summary, verification evidence, screenshots). Never leave only a pushed branch. Do not merge.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment: gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>.
H4b. R4 check_out, then teardown (processes, databases, clone, scratch).
H5. End with the return block as your final message, in one fenced code block, unprompted.

## Return format (labels in this order, one fenced code block; disclosure in the last fields counts as diligence)
TASK: P2-X — Token dialog: readable scope list, actions always visible
LINE OF WORK: p2-x-token-dialog-layout
REVIEW ARTIFACT:
STATUS: complete | complete-with-caveats | blocked
VERIFICATION: (each check, pass/fail, counts; against main as of hand-back; manual viewport checks listed separately)
MIGRATION: none
SHARED FILES TOUCHED:
IDENTIFIERS USED: P2-X
EXISTING CHECKS MODIFIED:
CLONE:
TRACKING:
TEMP:
DECISIONS NEEDED:
RESIDUAL GAPS:

The /goal below authorises fixing CI and bot findings on this PR only — not widening scope, weakening checks, or deciding anything listed as an operator decision.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
