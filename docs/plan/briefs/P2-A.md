DISPATCH · Model: Sonnet (web-only UI behaviour on existing APIs; no schema, auth or data-deletion surface) · Order: now, in parallel with P2-B (separate clone; file ownership below keeps them apart).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 83a8da2. If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 45–90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-a, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-a-cleanup → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-A — Put old projects and tokens out of the way

## Why
The operator can't easily archive, hide or sort old items (feedback 2026-10-19). Current state on main (verify):
- **Projects:**
  - archiving exists only inside the project Edit form (Lifecycle select in src/features/projects/ProjectForm.tsx);
  - the Projects list hides archived by default (src/domain/projects/dashboard.ts, filter `unarchived`);
  - a sort control exists (Active / Latest / Name / Created in src/features/projects/ProjectFilters.tsx), but its state is `useState` in src/pages/projects/ProjectsPage.tsx, so it resets on every reload or navigation.
- **All agents** (src/pages/agents/AgentsPage.tsx, `ownedScope` in src/domain/agents/allAgents.ts) always includes archived projects' runs ("including archived history"). Two archived load-test projects add 25 finished runs of clutter.
- **Tokens** (src/features/tokens/LiveTokensPanel.tsx): revoked tokens stay listed forever in insertion order. No hide, no sort.

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-007 (routes) and D-026 (run lists without events). The planner records this task's behaviour as D-034 at write time; this brief is the spec.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-a, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-a && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-a
    cd /Users/stephenforte/src/supa-agent-tracker-p2-a && git checkout -b p2-a-cleanup origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker. If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-A", title "P2-A: Put old projects and tokens out of the way", workload_type "coding", task_id "P2-A" and a fresh request_id.
  - Include harness and model only if you know them.
  - Keep run_id and revision, and write only the run_id to .supa/run-id.
- R2. update_status when the gate is green, when the PR is opened (pr_references with the PR URL) and if you're blocked. Always send the latest expected_revision.
- R3. Heartbeat at natural pauses in long phases.
- R4. After H4 and before teardown, check_out with:
  - execution_state finished (or failed);
  - work_status waiting_for_review (or blocked);
  - a one-paragraph completion_summary and the PR reference.
  Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure, retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-a-cleanup. PR title "P2-A: Archive button, hide archived runs and revoked tokens, sticky project sort". Commit subjects start with "P2-A: ". No migrations, no new identifiers. Don't edit docs/plan/**.

## Outcomes
1. **Archive / Unarchive in one click.**
   - The project detail page gets an "Archive project" button (and "Unarchive" when archived) next to Edit.
   - It uses the existing project update path: lifecycle `archived`; Unarchive sets `active`. It's revision-checked and handles a conflict the way the form does.
   - No confirm dialog: it's reversible. After archiving, the page shows the Archived badge and the button flips.
   - On the Projects list, the card for an archived project (visible when the filter shows archived) shows "Archived".
2. **All agents hides archived projects by default.**
   - Runs and agents of archived projects are excluded unless the user turns on "Show archived projects".
   - Keep that state in the URL (e.g. `?archived=1`) so it survives reload and back/forward, and works with the existing `view` and `run` params.
   - When some are hidden, a status line says how many runs are hidden, e.g. "25 runs from archived projects hidden".
   - A `?run=` deep link to a run in an archived project must still open it. Either show archived automatically for that link, or show it with a notice; don't silently drop it.
   - Update the page's subtitle and the `ownedScope` comment to match.
3. **Tokens list:**
   - revoked tokens are hidden by default behind a "Show revoked (N)" toggle;
   - active tokens are sorted by last used (most recent first, never-used last), then created (newest first);
   - revoked tokens, when shown, come after the active ones.
4. **Project sort and filters stick.** Keep the Projects page's sort and filter state in the URL query, so they survive reload and returning from a project. Defaults are unchanged (sort Active, lifecycle "Archived hidden"); default values aren't written into the URL.
5. Keep the demo build (mock source, D-028) working with the same behaviour.

## Must hold (tests as properties)
- Archive then Unarchive round-trips the lifecycle with revisions, and a stale revision shows the conflict path, not a silent overwrite.
- With one archived and one active project:
  - All agents shows only the active project's runs by default;
  - `?archived=1` shows both;
  - the hidden-count line is correct;
  - a `?run=` link to an archived project's run still opens it.
- Tokens: two revoked and two active tokens with different last-used times give the order active-by-last-used; revoked are hidden until toggled; the toggle shows the right count.
- Projects: changing sort, reloading (re-rendering from the URL) keeps the sort; default state produces no query string.
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why. Some existing All-agents tests probably assert that archived history is visible; change them to the new default plus the toggle, and declare each one.

## Scope (P2-B is running in parallel — stay inside these files)
- Free: src/pages/project-detail/ProjectDetailPage.tsx, src/features/projects/ProjectCard.tsx, src/pages/agents/AgentsPage.tsx, src/domain/agents/allAgents.ts, src/features/agents/AgentViewBar.tsx, src/features/runs/RunGrid.tsx (only if the toggle or notice must live there), src/features/tokens/LiveTokensPanel.tsx, src/domain/tokens/display.ts, src/pages/projects/ProjectsPage.tsx, src/features/projects/ProjectFilters.tsx, src/domain/projects/dashboard.ts, src/data/mock/** (only if the demo needs it), and tests for all of these.
- Don't touch, because P2-B owns them: src/features/projects/ProjectForm.tsx, src/pages/settings/**, src/app/routes.tsx, src/domain/types.ts, src/data/contracts.ts, src/data/http/**, server/**, migrations.
- Also don't touch docs/plan/**, render.yaml, or anything on Render.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- Deleting projects or tokens: there's deliberately no delete (history and audit; see the comment in server/repo/projects.ts).
- The public page and the "Public" badge: P2-B.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 83a8da2: 59 files / 422 tests (planner measurement). Report your counts.
Manual: in the http build with local Postgres, archive and unarchive a project from its page; check All agents with and without `?archived=1`; check the tokens toggle; reload the Projects page with a non-default sort.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-a-cleanup.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-a-cleanup -t "P2-A: Archive button, hide archived runs and revoked tokens, sticky project sort" -F <body file> (body = summary + verification evidence). Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-A — Archive button, hide archived runs and revoked tokens, sticky project sort
    LINE OF WORK: p2-a-cleanup
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; builds; manual checks; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-a; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified; surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, touching P2-B's files, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
