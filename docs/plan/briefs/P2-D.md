DISPATCH · Model: Sonnet (an owner-only run write modelled on the existing close route, plus web UX; no migration) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at bfe9ee7 (P2-C merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 1.5–2.5 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-d, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-d-run-ux → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-D — Mark runs done, mobile run grid, back to project, latest status in the grid

## Why (operator feedback, 2026-10-19; snapshot of main, verify)
1. **Finished runs can't be closed out.** Workers check out as finished / `waiting_for_review`, and the owner has no way to mark them done.
   - The user run patch in server/api/schemas.ts (`runPatchKeys`) excludes `workStatus`.
   - `POST /api/runs/:runId/close` (server/api/user-routes.ts) only applies to running runs ("Run has already ended" → 409).
   - So "Waiting for review" sticks forever.
2. **The run grid is unusable on a phone.** src/features/runs/RunGrid.tsx is a table with `min-w-[1100px]`. The agent cell prints the full run UUID, and the close action's link text is "Close <full uuid>".
3. **No way back to the project from a run.** A run's details or deep link (`/agents?run=…`, `/projects/:id?run=…`) has no link back to its project page.
4. **Status updates are invisible in the grid.** Briefs now make workers send update_status milestones, e.g. "PR #57: all 3 bot comments resolved; CI green". The latest message is stored on `runs.message`, but the grid doesn't show it.

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-024 (revisions; heartbeat exempt), D-026 (run lists without events) and D-034 (archived hidden on All agents); server/api/user-routes.ts (the `/close` route is the pattern to copy: `commit` idempotency, `findOwnedRun`, revision check, `detailFromGetRun`); server/repo/runs.ts (`updateRun`, and the `manual_close` audit event); src/features/runs/{RunGrid,RunDetails,CloseRunDialog}.tsx.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-d, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-d && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-d
    cd /Users/stephenforte/src/supa-agent-tracker-p2-d && git checkout -b p2-d-run-ux origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker ("Agent Dashboard"). If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-D", title "P2-D: Mark done, mobile grid, back to project, latest status", workload_type "coding", task_id "P2-D" and a fresh request_id.
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
Branch p2-d-run-ux. PR title "P2-D: Mark runs done, mobile run grid, back to project, latest status". Commit subjects start with "P2-D: ". **No migrations**, no new identifiers. Don't edit docs/plan/**.

## Outcomes
1. **Mark done (server + web).**
   - Add `POST /api/runs/:runId/mark-done` with body `{request_id, expected_revision}`, modelled on `/close`:
     - owner only, via `findOwnedRun`; another owner's run → 404, as today;
     - idempotent through `commit` with operation name `run_mark_done`;
     - revision-checked (stale → 409 carrying the current run).
   - Allowed only when `execution_state = 'finished'` and `work_status <> 'completed'`. It sets `work_status = 'completed'`, bumps the revision, writes an `audit_events` row (action `run_marked_done`, target the run id, details with the previous work status), and returns the updated run detail.
   - Running, failed or cancelled runs → 409 "Only finished runs can be marked done". An already-completed run → 409 carrying the current run.
   - **No new run_events kind.** `run_events_kind_valid` is a DB constraint and this task has no migration.
   - Web: a "Mark done" action on finished runs that aren't completed, in the grid row actions or the mobile card, and in run details. No confirm dialog. Conflicts show the existing conflict path.
   - Demo build: the mock source supports the same action.
2. **Mobile run grid.**
   - Below the md breakpoint, render runs as compact cards instead of the 1100 px table. Each card shows:
     - the agent name and run title;
     - project, execution and work badges, and live/stale with last contact (as P2-C);
     - the PR link if any;
     - the latest status message (item 4);
     - actions.
   - md and up keep the table.
   - Everywhere, show IDs short (the first 8 characters) with the full id in a title or tooltip, and copy behaviour if a copy button exists.
   - Rename "Close <uuid>" to "Close run", keeping an accessible name that includes the short id.
   - No horizontal page scroll at 375 px.
3. **Back to project.** Run details (the panel or page opened from `?run=`) show a "← <project name>" link to `/projects/:projectId`. On the project page, it returns to the project with the run closed.
4. **Latest status in the grid.** Show `runs.message`, truncated to one line in the table (full text on hover or in details) and two lines in mobile cards. Show nothing when it's empty. It must not appear on the public page: P2-B's allowlist is unchanged.

## Must hold (tests as properties)
- mark-done:
  - finished + waiting_for_review → 200, completed, revision+1, one audit row;
  - an idempotent replay → the same body and no second audit row;
  - a stale revision → 409;
  - running, failed and cancelled → 409, and so is an already-completed run;
  - another owner's run → 404;
  - a credential (MCP token) can't call it (it's a user route; assert 401 or 403 as the existing guard returns).
- The MCP side is unchanged: an agent's update on a completed run behaves exactly as before.
- Mobile: rendering at 375 px uses cards (no table) and shows the short id, the status message and a working Mark done. At ≥768 px the table is unchanged. No element's width forces horizontal scroll (assert the container has no fixed min-width at mobile).
- The back-to-project link goes to the run's project.
- The status message appears in the grid row and card. An empty message renders nothing. The public page response is unchanged (P2-B's key-set tests still pass).
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free: server/api/user-routes.ts (new route only), server/api/schemas.ts (the mark-done body only), server/repo/runs.ts (a new function or an additive branch for mark-done only), src/features/runs/**, src/pages/agents/AgentsPage.tsx, src/pages/project-detail/ProjectDetailPage.tsx, src/domain/runs/**, src/domain/format.ts, src/data/contracts.ts, src/data/http/tracker.ts, src/data/mock/** (the mark-done action), docs/api.md, and tests for all of these.
- Don't touch:
  - migrations or server/db/**;
  - server/mcp/** and server/tokens/**;
  - server/public/** and src/pages/public/** (P2-B's boundary);
  - the auth limiter, idempotency retention, docs/plan/**, render.yaml, Render or production.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- Auto-completing runs when the PR merges: needs a GitHub integration, which is a separate operator decision.
- Un-marking done or reopening a run: not requested. The audit row keeps the history.
- A timeline entry for mark-done: it would need a new run_events kind, which means a migration. The audit row covers it.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main bfe9ee7: 63 files / 451 tests (planner measurement). Report your counts.
Manual: in the http build with local Postgres:
- mark a finished run done;
- check the grid at 375 px (browser device mode) and at desktop width;
- follow back-to-project from a run;
- see a status message in the row.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-d-run-ux.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-d-run-ux -t "P2-D: Mark runs done, mobile run grid, back to project, latest status" -F <body file> (body = summary + verification evidence). Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-D — Mark runs done, mobile run grid, back to project, latest status
    LINE OF WORK: p2-d-run-ux
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; builds; manual checks incl. 375 px; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     route POST /api/runs/:runId/mark-done; audit action run_marked_done; idempotency operation run_mark_done
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-d; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified; surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, adding a migration, touching the public boundary or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
