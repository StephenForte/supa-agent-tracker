DISPATCH · Model: Opus (the first unauthenticated data endpoint: a tenant and privacy boundary, plus a migration) · Order: now, in parallel with P2-A (separate clone; file ownership below keeps them apart).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 83a8da2. If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 2–3 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-b, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-b-public-agents → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-B — Public "All agents" page per owner, for projects marked public

## Operator decisions (2026-10-19; the planner records them as D-035 at write time; this brief is the spec)
- **Per owner.** Each account can have a public page at `/public/<handle>/agents` that shows only that owner's projects marked public. One owner's public projects never appear under another owner's handle.
- **Status only.** Anonymous visitors see:
  - project name;
  - agent name;
  - run title, execution state, work status, stale or live, harness;
  - run timestamps (started, last contact, finished).
- **Never exposed:**
  - project description, repository name or URL, PRD URL, tags;
  - run status messages, completion summaries, task_id, model, PR references, tool usage, events;
  - next steps, waiting notes, private notes;
  - anything about tokens, credentials, actors, emails or display names;
  - anything from private or archived projects.

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-007 (routes), D-022/D-031 (invite-only accounts) and D-026 (run lists without events); server/repo/projects.ts and server/repo/access.ts (owner scoping); server/api/user-routes.ts (`GET /api/account`; there's no account update yet); server/auth/routes.ts (the app's own per-IP limiter pattern; `request.ip` is trustworthy because TRUST_PROXY_HOPS=2); src/app/routes.tsx (D-007 routes behind SessionGuard).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-b, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-b && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-b
    cd /Users/stephenforte/src/supa-agent-tracker-p2-b && git checkout -b p2-b-public-agents origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker. If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-B", title "P2-B: Public agents page per owner", workload_type "coding", task_id "P2-B" and a fresh request_id.
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

## Line of work and identifiers (pre-assigned; they override any "next number" convention)
- Branch p2-b-public-agents. PR title "P2-B: Public agents page per owner". Commit subjects start with "P2-B: ".
- Migration: server/db/migrations/0006_public_pages.sql. 0001–0005 exist on main. If 0006 is taken, stop and ask. Don't renumber.
- Don't edit docs/plan/**.

## Outcomes
1. **Data (migration 0006)**, additive, with defaults that publish nothing:
   - `users.public_handle text NULL`, unique case-insensitively, with format enforced in the database: 3–32 chars, `[a-z0-9-]`, starting and ending alphanumeric, stored lowercase;
   - `projects.is_public boolean NOT NULL DEFAULT false`.
   Update the Drizzle schema and server/db/schema.test.ts.
2. **Owner controls (authenticated).**
   - Add an account update route (e.g. `PATCH /api/account`) that sets or clears `public_handle`. It's idempotent with request_id like other writes. A taken handle → 409 conflict; a bad format → 400.
   - Project create and update accept `is_public` through the existing project schemas and mapping.
   - Web:
     - a "Public project" checkbox in src/features/projects/ProjectForm.tsx, with one line saying what visitors will see;
     - in Settings → Account, a "Public page handle" field;
     - once a handle is set, show the full public URL with a Copy button.
3. **Public read API (unauthenticated).**
   - `GET /api/public/:handle/agents` returns only owner `handle`, public non-archived projects, their agents and recent runs, built with an **explicit field allowlist**. Construct new objects field by field. Don't filter or spread the owner DTOs.
   - Bound the runs: e.g. the latest 200, or the last 30 days. Choose and justify.
   - Include a server-computed stale/live flag using each project's stale threshold, so the client needs no policy fields.
   - Unknown handle, a handle with no public projects, and a malformed handle return the **same** 404 body and status. No enumeration.
   - Per-IP rate limit (e.g. 60 per minute) using `request.ip` → 429.
   - `Cache-Control: no-store`. It works with no cookie, and the presence of a session cookie changes nothing.
   - Not exposed over MCP, not affected by tokens.
4. **Public page (web).**
   - SPA route `/public/:handle/agents` outside SessionGuard. Fetch with a small dedicated client, never the authenticated tracker source or any session read.
   - Show a read-only grid: project, agent, run title, state, work status, harness, timestamps, live/stale. Poll every 30 s while the tab is visible.
   - No links into private routes. The 404 renders "No public page here".
   - Add `<meta name="robots" content="noindex">` on this page. Search indexing is a separate operator decision, so default to not indexed.
   - The demo build (mock source) may show a short "Public pages need the live app" note instead.
5. **Docs:** docs/api.md (account update, the public endpoint and its exact field list, the 404 rule, the rate limit) and server/README.md (one paragraph).

## The trap
This is the first route that serves data without authentication. Every repository function in the codebase assumes an Access, scoped to an owner or a credential. Two failure modes:
- Reusing an owner DTO or a list function "and deleting the private fields" leaks whatever field someone adds next year.
- Looking projects up by `is_public` without binding to the handle's owner shows other owners' public projects under your handle.
Build the public query as its own read path: handle → owner id → projects where `owner_id = that id AND is_public AND lifecycle <> 'archived'` → agents and runs of exactly those projects. Then serialize from an allowlist. Write the tests so they fail if a new column is added to runs or projects and leaks through: assert the exact key set of every object in the response.

## Must hold (tests as properties; show each failing before the fix where possible)
- The exact response key sets for owner, project, agent and run objects. No other keys, at any depth.
- Projects:
  - private projects never appear;
  - archived public projects never appear;
  - another owner's public project never appears under my handle, even with the same project name;
  - a run in a private project never appears even if the agent's name matches.
- The handle is matched case-insensitively. Duplicates differing only in case → 409. Bad formats → 400, at the API and the DB constraint.
- 404s: unknown handle, handle without public projects, and a malformed handle return byte-identical 404s.
- 429 after the per-IP limit. A spoofed `X-Forwarded-For` doesn't bypass it (reuse the trusted-proxy behaviour).
- No cookie → 200 for a valid page. A valid session cookie for another user → the identical 200 body.
- Turning `is_public` off removes the project from the next response. Clearing the handle makes the page 404.
- Migration 0006 forward on populated data: a database at 0005 with users, projects, runs and keys; after 0006 every project is `is_public = false` and every user's handle is NULL, so nothing is published by the migration.
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope (P2-A is running in parallel — stay inside these files)
- Free:
  - server/db/migrations/0006_public_pages.sql (new), server/public/** (new);
  - src/pages/public/** (new), src/data/public/** (new);
  - src/features/projects/ProjectForm.tsx, src/pages/settings/AccountSettings.tsx, src/pages/settings/LiveAccountControls.tsx;
  - docs/api.md, server/README.md;
  - tests for all of these.
- Change only as needed, and say why:
  - server/db/schema.ts, server/db/schema.test.ts, server/invites/migration.test.ts (its applied list);
  - server/app/routes.ts (register the public route), server/api/user-routes.ts, server/api/schemas.ts, server/api/map.ts, server/repo/projects.ts (is_public on create and update only);
  - src/app/routes.tsx, src/domain/types.ts, src/data/contracts.ts, src/data/http/** (account and project fields), src/data/mock/** (new fields with defaults).
- Don't touch, because P2-A owns them: src/pages/project-detail/**, src/features/projects/ProjectCard.tsx, src/pages/agents/**, src/domain/agents/**, src/features/agents/**, src/features/runs/RunGrid.tsx, src/features/tokens/**, src/pages/projects/**, src/features/projects/ProjectFilters.tsx, src/domain/projects/**.
  - So a public page grid must be its own component, not a change to RunGrid. Importing RunGrid read-only is fine only if it pulls no private fields.
- Also don't touch: docs/plan/**, render.yaml, Render or production, MCP tools, the auth limiter config, the idempotency retention code.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- A "Public" badge on project cards: ProjectCard is P2-A's this wave. It's a follow-up after both merge.
- Global or per-project public pages: the operator chose per owner.
- Search indexing, custom domains, embedding: not decided.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 83a8da2: 59 files / 422 tests (planner measurement). Report your counts.
Manual, in the http build with local Postgres and two accounts:
- set a handle;
- mark one of two projects public;
- open `/public/<handle>/agents` in a private window with no cookie and confirm only the public project's status fields show;
- confirm the second account's public project doesn't appear under the first handle;
- check that an unknown handle shows the same page as a handle with no public projects.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-b-public-agents.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-b-public-agents -t "P2-B: Public agents page per owner" -F <body file>. The body's first line: "Deploy runs migration 0006 on boot (additive; is_public defaults false, handles NULL), so nothing becomes public until an owner opts in." Then add a summary, the exact public field list and the verification evidence. Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-B — Public agents page per owner
    LINE OF WORK: p2-b-public-agents
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property red-before/green-after; exact key-set assertions; builds; manual two-account check; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   0006_public_pages — <forward-on-populated-data evidence>
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     migration 0006; branch p2-b-public-agents; route /public/:handle/agents; endpoint GET /api/public/:handle/agents
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-b; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <e.g. the run bound you chose>
    RESIDUAL GAPS:       <what's unverified; surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, exposing any field beyond the allowlist, touching P2-A's files or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
