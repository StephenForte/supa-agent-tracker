DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): client work against a fixed contract, on established panel and preview patterns · Order: wave 19, now, parallel with P2-AA; no shared files; merge after P2-AA, or live cards call a route that does not exist.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (GitHub)
Baseline: origin/main at c8fb005. Merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432) for the gate's server suites.
Runtime: unmeasured; expect about 1–1.5 h, based on P2-N-sized client tasks.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-ab, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-ab-message-board-ui → a new PR into main, title "P2-AB: Project message board on cards and project page".
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-AB — Show the message board to humans

## Why (operator, 2026-11-04)
Agents get a shared per-project message board (P2-AA, in parallel). "The message board should be visible to humans via the project card in the tracker", and finished messages must be ignorable.

## Contract (D-048, on docs branch plan/wave-19, not on main; this brief is the full spec)
P2-AA builds these routes in parallel. They will not exist on your baseline: build against the demo source and stubbed fetch.

Entry: { id, projectId, kind, key, title, body, taskRef, addressedTo, status, resolution, resolvedAt, resolvedByRunId, resolvedByUserId, sourceRunId, author: { agentName, taskId }, createdAt, updatedAt, revision }
kind: note | decision | question | hazard | handoff | state. status: open | resolved. key is set only on state. author fields may be null.
- GET /api/projects/:projectId/board?status=open|resolved|all&kind=&cursor=&limit= → { items, nextCursor }; default status open, default limit 50, max 100.
- GET /api/board/summary → { items: [{ projectId, openCount, questionCount, hazardCount, latest: { id, kind, title, updatedAt } }] }; projects with no open entries are omitted.
- POST /api/projects/:projectId/board/:entryId/resolve { resolution?, expected_revision, request_id } → entry; resolution max 2000.
- POST /api/projects/:projectId/board/:entryId/reopen { expected_revision, request_id } → entry.
Stale revision or wrong state → 409 with details.current, same as next-step completion.

## What must hold (outcome)
1. Data layer: add listBoard, listBoardSummaries, resolveBoardEntry, reopenBoardEntry to src/data/contracts.ts, src/data/http/tracker.ts and src/data/mock/trackerStore.ts; types in src/domain/types.ts. Mock enforces the same rules and seeds a few entries across kinds, including one resolved, one state and one question on prj_offers.
2. Project card (src/features/projects/ProjectCard.tsx): a new BoardPreview from src/features/board/ beside NextStepsPreview, labelled "Message board". With open entries: "3 open · 1 question · 1 hazard" (omit zero counts), the latest title truncated to one line, and a link to /projects/<id>#project-board. With none: "No open messages". Must fit the mobile card without horizontal scroll.
3. Project page (src/pages/project-detail/ProjectDetailPage.tsx): a "Board" link in the project-jumps nav and a section with id project-board holding a new BoardPanel. Opening /projects/<id>#project-board scrolls to it once the page has loaded data.
4. BoardPanel: open entries newest first, each with kind badge, title, author, task ref, addressed-to, relative time and body. State entries show their key and value. A kind filter and a "Show resolved" toggle; resolved rows show resolution, who and when. Resolve (optional note) and Reopen buttons with pending and error text, following MarkDoneButton; a 409 refreshes and says so. Demo build labels follow the existing "Demo: …" pattern. One line of copy: "Agents on this project can read this board. It is not public."

## The traps
1. Per-card fetching. The client polls every 7 s (src/data/http/observable.ts) and each card already issues its own reads. BoardPreview must use listBoardSummaries with one shared cache key, so 12 cards cost one request per poll. A per-card listBoard works in the demo and multiplies production traffic. Assert the fetch count.
2. Rendering agent text as markup. Body is untrusted free-form agent output. Render with InstructionText (src/features/next-steps/InstructionText.tsx), which keeps markup as text and only linkifies http(s) and backticks. Never dangerouslySetInnerHTML, and no Markdown library (D-010).
3. Hash scroll. The section renders after data loads, so the browser's native anchor jump finds nothing on a deep link and the operator lands at the top with no error. Test the deep link, not just the in-page nav.
4. New route. src/app/routes.tsx is frozen by D-007. The board is a section on the project page, not a page.
5. Confusing it with Private notes. Agents can read the board and can never read private notes. Keep them visually separate and do not reuse the private-notes components.

## Scope
Free: new src/features/board/**, new src/domain/board/**, src/pages/project-detail/ProjectDetailPage.tsx (+test), src/features/projects/ProjectCard.tsx (+test).
Add-only: src/data/contracts.ts, src/data/http/tracker.ts, src/data/mock/trackerStore.ts, src/data/mock/seed.ts, src/domain/types.ts, src/styles/app.css.
Do not touch: server/** and docs/api.md (P2-AA owns them, in parallel); src/domain/integrations/** (P2-AA edits the base prompt); src/pages/public/** (the board is never public); src/app/routes.tsx (D-007); src/features/next-steps/** apart from importing InstructionText; src/features/private-notes/**; docs/plan/**, docs/prd/**; package files (D-010).
If the task appears to need anything outside this list, stop and report instead of widening scope. Report demo-seed changes that affect docs/fixtures.md rather than editing it.

## Must survive
Next steps, private notes and run grid behave as before. Views use src/data/hooks.tsx and the async contracts, never src/data/mock/ directly. Business derivations go in src/domain/. Existing checks may not be weakened, skipped or deleted; any test you change is declared in the return block with before/after/why.

## Coverage (as properties)
- Card: counts omit zeros; empty state; link target includes #project-board.
- N cards produce one summary request per poll (fetch count asserted).
- Panel hides resolved by default, the toggle shows them, the kind filter narrows; Resolve removes the entry from the open list and the card's count drops without a reload; Reopen restores it.
- A 409 on resolve shows the message and the refreshed state.
- A body containing <img src=x onerror=alert(1)> renders as text, with no img element.
- Deep link to #project-board scrolls after load.
- No horizontal scroll at 375×812 with a 200-character title and a long unbroken body.

## Read first (trust the repository over this brief)
AGENTS.md, docs/plan/PLAN.md (Known traps), docs/plan/DECISIONS.md (D-007, D-010, D-036), src/features/next-steps/NextStepsPreview.tsx, NextStepsPanel.tsx, src/features/runs/MarkDoneButton.tsx, src/data/http/observable.ts. Check current repository state before trusting any status claim here.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-ab, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-ab && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-ab
    cd /Users/stephenforte/src/supa-agent-tracker-p2-ab && git switch -c p2-ab-message-board-ui origin/main
Never stash/switch/reset in a folder whose branch you did not create.

## Reporting — Supa Agent Tracker MCP tools, if available
R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7, agent_name "<your surface>-P2-AB", title "P2-AB: Message board UI", workload_type "coding", task_id "P2-AB", a fresh request_id; harness and model only if known. Keep run_id and revision; write only run_id to .supa/run-id.
R2. update_status at milestones: gate green; PR opened (pr_references with the PR URL); bot review settled — every automated review comment on the PR head fixed or answered and CI green, message "PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", re-sent if a later push draws new comments; blocked (with reason). Always send the latest expected_revision.
R3. heartbeat at natural pauses during long phases.
R4. After H4, before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary, and the PR reference. Delete .supa/run-id only after check_out succeeds.
R5. Reporting never blocks the task: retry a transient failure with the same request_id; if the tools are missing or keep failing, carry on and say so on TRACKING. Never print, log or commit the token.

## Verification (re-run after merging current main at hand-back)
    SCRATCH=$(mktemp -d -t p2ab); trap 'rm -rf "$SCRATCH"' EXIT
    set -o pipefail; ( npm ci && npm run typecheck && npm run lint && npm test && npm run build ) 2>&1 | tee "$SCRATCH/gate.log"
Run the gate once on the untouched clone first and record its file/test counts as the baseline; report before/after counts. Unexplained movement is a finding. Server suites need the local Postgres; drop any database you create.
Manual: run the demo build; check a card, the deep link, resolve and reopen at 1280×800 and 375×812, and state what you saw.

## Out of scope
Server and MCP work (P2-AA). Humans posting messages (operator assumption, D-048). Showing questions in Needs me. Public display. Search.

## Decisions needed
If the card line is too crowded on mobile, or the panel belongs elsewhere on the page, argue it with evidence in DECISIONS NEEDED.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-ab-message-board-ui to StephenForte/supa-agent-tracker; subjects start "P2-AB: ". Fetch main; if it moved, merge it and rerun the gate.
H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-ab-message-board-ui -t "P2-AB: Project message board on cards and project page" -F <body file in $SCRATCH> (summary + verification evidence). Never leave only a pushed branch. Do not merge.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment: gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>.
H4b. R4 check_out, then teardown: stop everything you started; run the clone-scoped process check from AGENTS.md with CLONE=/Users/stephenforte/src/supa-agent-tracker-p2-ab and stop what it lists except your own session; never stop a process running from the Dropbox folder or another task's clone; drop your databases; delete scratch and the clone last.
H5. End with the return block as your final message, in one fenced code block, unprompted, then end your session.

## Return format (labels in this order, one fenced code block; disclosure in the last fields counts as diligence)
TASK: P2-AB — Project message board on cards and project page
LINE OF WORK: p2-ab-message-board-ui
REVIEW ARTIFACT:
STATUS: complete | complete-with-caveats | blocked
VERIFICATION: (each check, pass/fail, counts; against main as of hand-back)
MIGRATION: none
SHARED FILES TOUCHED:
IDENTIFIERS USED: P2-AB, D-048, section id project-board, data methods listBoard / listBoardSummaries / resolveBoardEntry / reopenBoardEntry
EXISTING CHECKS MODIFIED:
CLONE: (deleted path; PIDs stopped; anything still running)
TRACKING:
TEMP:
DECISIONS NEEDED:
RESIDUAL GAPS:

The /goal below authorises fixing CI and bot findings on this PR only — not widening scope, weakening checks, or deciding anything listed as an operator decision.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
