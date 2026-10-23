DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): one owner-only route modelled on mark-done, plus client wiring · Order: wave 16, now, parallel with P2-X; no shared files; any merge order.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (GitHub)
Baseline: origin/main at 815c7d8. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites.
Runtime: unmeasured; expect about 1 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-w, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-w-dismiss-ended-blocked → a new PR into main, title "P2-W: Dismiss ended blocked runs from Needs me".
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-W — An ended run that reported "blocked" can leave Needs me

## Why (operator, 2026-10-23)
"When a run failed (worker-SEC-2026-10-22 · 10179deb) it stays that way in the tracker, which is fine. One problem is that in the Needs me list, it never goes away nor has any way to remove it."

Planner diagnosis from main 815c7d8 (verified in source; the run row itself was not queried):
- src/domain/needs-me/attention.ts puts a run in Blocked when `run.workStatus === 'blocked'`, whatever its executionState. Stale needs `executionState === 'running'`; Waiting for review needs `finished` + `waiting_for_review`. So the only way an ended run stays on the page is executionState failed/cancelled/finished with workStatus blocked. MCP check_out accepts that pair (server/mcp/protocol.ts workStatus enum is independent of execution_state), and the dispatch-worker reporting step tells workers "execution_state failed, work_status blocked" on failure.
- Every exit is closed for that run:
  - Blocked cards render only "Open run" (src/pages/needs-me/NeedsMePage.tsx, `group === 'blocked'`).
  - Mark done: canMarkDone (src/features/runs/MarkDoneButton.tsx) and POST /api/runs/:runId/mark-done (server/api/user-routes.ts ~L165, server/repo/runs.ts markRunDone) require executionState `finished` → a failed run is 409 "Only finished runs can be marked done".
  - Close run: POST /api/runs/:runId/close returns 409 for an ended run (user-routes.ts ~L157 comment).
  - The agent has checked out; it will never send another status.
- The email digest (server/alerts/match.ts matchesQuery, `WHEN r.work_status = 'blocked' THEN 'blocked'`) uses the same rule, so it keeps matching too. server/alerts/attention-agreement.test.ts enforces SQL ↔ needsAttention parity.

## Decision D-047 (on the docs branch, not on main — this brief is the full spec)
The owner can dismiss an ended run from Needs me. The run's executionState is never changed ("stays failed in the tracker"). Dismiss sets workStatus to the terminal value that matches how it ended:
- executionState failed → workStatus failed; cancelled → cancelled.
- executionState finished → this already has an exit: Mark done (→ completed). Show the existing Mark done button on a Blocked card for a finished run; do not add a second path.
- A running blocked run keeps today's behaviour (Open run only): the agent is live and may unblock itself.
No change to the attention derivation or the alert SQL: once workStatus is no longer `blocked` both stop matching on their own, and the parity test keeps passing untouched.

## What must hold (outcome)
1. New owner-only route `POST /api/runs/:runId/dismiss`, body `{ expected_revision, request_id }`, success `Run` with `events` — mirror mark-done exactly in guard, idempotency and error shapes:
   - Applies only when executionState is `failed` or `cancelled` and workStatus differs from executionState. Sets workStatus := executionState, increments revision, bumps updatedAt, appends one audit_events row `action` `run_dismissed`, `target` run id, `details.previousWorkStatus`. No run_events row; executionState, message, finishedAt, lastContactAt unchanged.
   - running or finished run → 409 conflict, message `Only failed or cancelled runs can be dismissed`, details.current. Already dismissed (workStatus === executionState) → 409 `Run is already dismissed`. Stale revision → 409 `Revision conflict`. Another owner's run → 404. Bearer MCP credential → 401. Idempotency operation name `run_dismiss`; a replay returns the original response and no second audit row.
2. Data layer: add `dismissRun(runId)` to src/data/contracts.ts, src/data/http/tracker.ts and src/data/mock/trackerStore.ts (mock enforces the same rule, like its markRunDone).
3. UI: a Dismiss button component in src/features/runs/ (pattern: MarkDoneButton — pending state, error text, demo label "Demo: dismiss", aria-label with the short id, renders nothing when not applicable). Shown:
   - on Needs me Blocked cards whose run has ended: failed/cancelled → Dismiss; finished → the existing MarkDoneButton. Card also shows the ended state, e.g. "Failed · ended 3h ago" (use existing format helpers), so the operator sees why it is different from a live blocked run.
   - in RunDetails next to MarkDoneButton (same applicability), so it is reachable from the project page too.
   After success the card leaves the Blocked list and the nav badge drops by one without a reload (follow how MarkDoneButton's refresh reaches useAttention).
4. docs/api.md: add the route to the table near L294 and a paragraph after the mark-done paragraph (~L310) in the same style.

## The trap
Making the problem disappear by changing the derivation (e.g. Blocked only while running) instead of adding the action. That silently drops every ended-blocked run from Needs me and the email digest, including ones the operator has never seen, and it breaks the SQL/TS parity contract unless both sides move together. The operator asked for a way to remove an item, not for items to vanish. Do not touch attention.ts or server/alerts/**.
Second trap: widening mark-done to failed runs. Its 409 for failed runs is documented and tested; "done" is the wrong word for a failure. Keep mark-done byte-identical.

## Scope
Free: new files in src/features/runs/ (button + test), server/api/user-routes.ts (add one route, no edits to others), server/api/schemas.ts (add one schema), server/repo/runs.ts (add one function), src/pages/needs-me/NeedsMePage.tsx, src/features/runs/RunDetails.tsx (add the button only), docs/api.md (additions only), tests next to each.
Add-only: src/data/contracts.ts, src/data/http/tracker.ts, src/data/mock/trackerStore.ts (one method each; P2-X does not touch them).
Do not touch: src/domain/needs-me/attention.ts and server/alerts/** (see trap); src/features/tokens/**, src/components/ui/**, src/styles/app.css (P2-X owns them this wave); server/mcp/** (agent protocol unchanged); migrations (none needed — audit_events.action is free text); docs/plan/**, docs/prd/** (planner-owned).
If the task appears to need anything outside this list, stop and report instead of widening scope.

## Must survive
mark-done and close routes and their tests unchanged. server/alerts/attention-agreement.test.ts passes unmodified. Existing checks may not be weakened, skipped or deleted; any test you change is declared in the return block with before/after/why.

## Coverage (as properties)
- A failed+blocked run: dismiss → 200, workStatus failed, executionState still failed, one audit row run_dismissed with previousWorkStatus blocked; the run no longer appears in needsAttention and no longer matches selectAttention.
- cancelled+blocked behaves the same with cancelled.
- running+blocked and finished+blocked → 409 with the stated message; second dismiss → 409 already dismissed; replayed request_id → same response, still one audit row; other owner → 404; bearer → 401.
- Needs me: an ended failed blocked card shows Dismiss and the ended state; a finished blocked card shows Mark done; a running blocked card shows only Open run; clicking Dismiss removes the card and decrements the badge (mock source).

## Read first (trust the repository over this brief)
AGENTS.md, docs/plan/PLAN.md, docs/plan/DECISIONS.md (D-036 Needs me, D-037 alerts), docs/api.md (mark-done paragraph), docs/integrations/reporting-protocol.md. The P2-D mark-done implementation is the template: server/repo/runs.ts markRunDone, the mark-done route, MarkDoneButton and their tests (server/api/user-api.test.ts, src/data/mock/stores.test.ts, src/data/http/http.test.ts, src/pages/needs-me/NeedsMePage.test.tsx, src/features/runs/RunGrid.test.tsx).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-w, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-w && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-w
    cd /Users/stephenforte/src/supa-agent-tracker-p2-w && git switch -c p2-w-dismiss-ended-blocked origin/main
Never stash/switch/reset in a folder whose branch you did not create.

## Reporting — Supa Agent Tracker MCP tools, if available
R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7, agent_name "<your surface>-P2-W", title "P2-W: Dismiss ended blocked runs", workload_type "coding", task_id "P2-W", a fresh request_id; harness and model only if known. Keep run_id and revision; write only run_id to .supa/run-id.
R2. update_status at milestones: gate green; PR opened (pr_references with the PR URL); bot review settled — every automated review comment on the PR head fixed or answered and CI green, message "PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", re-sent if a later push draws new comments; blocked (with reason). Always send the latest expected_revision.
R3. heartbeat at natural pauses during long phases.
R4. After H4, before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary, and the PR reference. Delete .supa/run-id only after check_out succeeds.
R5. Reporting never blocks the task: retry a transient failure with the same request_id; if the tools are missing or keep failing, carry on and say so on TRACKING. Never print, log or commit the token.

## Verification (re-run after merging current main at hand-back)
    SCRATCH=$(mktemp -d -t p2w); trap 'rm -rf "$SCRATCH"' EXIT
    npm ci && npm run typecheck && npm run lint && npm test && npm run build 2>&1 | tee "$SCRATCH/gate.log"
Run the gate once on the untouched clone first and record its file/test counts as the baseline; report before/after counts — unexplained movement is a finding. Server suites need the local Postgres; drop any database you create.
Manual: run the demo build, put a demo run into failed+blocked (mock seed or devtools), confirm the card shows Dismiss, click it, card and badge go away; run details show the same button.

## Out of scope
Auto-dismiss / expiry of ended blocked runs (operator has not asked). Changing what workers send on failure (protocol unchanged). A bulk "dismiss all". Undo (the audit row keeps the previous status; an undo is a later decision).

## Decisions needed
If you think Dismiss should apply to running blocked runs too, or that the derivation change is actually right, argue it with evidence in DECISIONS NEEDED rather than implementing it.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-w-dismiss-ended-blocked to StephenForte/supa-agent-tracker; subjects start "P2-W: ". Fetch main; if it moved, merge it and rerun the gate.
H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-w-dismiss-ended-blocked -t "P2-W: Dismiss ended blocked runs from Needs me" -F <body file in $SCRATCH> (summary + verification evidence). Never leave only a pushed branch. Do not merge.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment: gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>.
H4b. R4 check_out, then teardown (processes, databases, clone, scratch).
H5. End with the return block as your final message, in one fenced code block, unprompted.

## Return format (labels in this order, one fenced code block; disclosure in the last fields counts as diligence)
TASK: P2-W — Dismiss ended blocked runs from Needs me
LINE OF WORK: p2-w-dismiss-ended-blocked
REVIEW ARTIFACT:
STATUS: complete | complete-with-caveats | blocked
VERIFICATION: (each check, pass/fail, counts; against main as of hand-back)
MIGRATION: none
SHARED FILES TOUCHED:
IDENTIFIERS USED: P2-W, D-047, route /api/runs/:runId/dismiss, audit action run_dismissed, idempotency op run_dismiss
EXISTING CHECKS MODIFIED:
CLONE:
TRACKING:
TEMP:
DECISIONS NEEDED:
RESIDUAL GAPS:

The /goal below authorises fixing CI and bot findings on this PR only — not widening scope, weakening checks, or deciding anything listed as an operator decision.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
