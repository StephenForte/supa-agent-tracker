DISPATCH · Model: Sonnet (three small, separate polish items; the 401 change touches an auth response but must not change any auth decision) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at f3a5e33 (P2-A and P2-B merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 45–90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-c, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-c-polish → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-C — Public badge, live-contact liveness, clearer bearer-only 401

## Why (operator feedback, 2026-10-19)
1. **Public badge.** P2-B added `projects.is_public` (a checkbox in the project form), but project cards and the project page don't show which projects are public.
2. **Liveness.** The operator couldn't tell whether workers' heartbeats arrived. The Liveness column in src/features/runs/RunGrid.tsx (around line 119) renders only a "Stale" badge or "—". So a healthy running run and a run that never sent a heartbeat both show "—" until it goes stale.
3. **401 in Cursor.** A revoked token in ~/.cursor/mcp.json produced POST /mcp → 401 three times, and Cursor offered an "authenticate" (OAuth) prompt. That's a dead end: we're bearer-only.
   - Cause: server/app/auth-context.ts `requireMcpCredential` replies `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"` (plus `error="invalid_token"` when a header was sent), with body "Bearer credential required".
   - D-018 deliberately keeps that spec-shaped 401 and the RFC 9728 metadata, so OAuth can be added later without breaking clients. **Keep both.**

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-018 (bearer tokens now, OAuth later, spec-shaped 401), D-024 (heartbeat doesn't change revision), D-035 (public pages); docs/api.md (the 401 section); docs/integrations/cursor.md and the P1-F test in server/e2e/heartbeat-adapter.test.ts. That test requires each guide to contain its in-app label and example text, so keep those strings intact.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-c, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-c && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-c
    cd /Users/stephenforte/src/supa-agent-tracker-p2-c && git checkout -b p2-c-polish origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker ("Agent Dashboard"). If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-C", title "P2-C: Public badge, live-contact liveness, clearer 401", workload_type "coding", task_id "P2-C" and a fresh request_id.
  - Include harness and model only if you know them.
  - Keep run_id and revision, and write only the run_id to .supa/run-id.
- R2. update_status when the gate is green, when the PR is opened (pr_references with the PR URL) and if you're blocked. Always send the latest expected_revision.
- R3. Heartbeat at natural pauses, at least every 10 minutes while working. The new liveness column will show it.
- R4. After H4 and before teardown, check_out with:
  - execution_state finished (or failed);
  - work_status waiting_for_review (or blocked);
  - a one-paragraph completion_summary and the PR reference.
  Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure, retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-c-polish. PR title "P2-C: Public badge, live-contact liveness, clearer bearer-only 401". Commit subjects start with "P2-C: ". No migrations, no new identifiers. Don't edit docs/plan/**.

## Outcomes
1. **Public badge.**
   - Project cards (src/features/projects/ProjectCard.tsx) and the project page header (src/pages/project-detail/ProjectDetailPage.tsx) show a "Public" badge when `isPublic` is true, and nothing when false.
   - On the project page, when the project is public **and** the signed-in owner has a public handle, show a "View public page" link to `/public/<handle>/agents`.
   - When it's public but no handle is set, say "Set a public handle in Account settings to publish it". Link to /settings.
   - The demo build keeps working.
2. **Liveness shows contact, not just staleness.** In the run grid:
   - running and not stale → a green "Live" badge plus "last contact 2 min ago" (relative, using the existing clock hook so it updates);
   - running and stale → the existing "Stale" badge plus "last contact 25 min ago";
   - finished, failed or cancelled → "—", unchanged.
   - The exact time stays available on hover or to screen readers.
   - Keep the stale rule exactly as it is (`stale()` in src/domain/runs/grid.ts). Don't change sorting or filtering semantics.
   - Run details, if they show liveness, use the same wording.
3. **Clearer bearer-only 401** (server/app/auth-context.ts `requireMcpCredential` only):
   - Keep status 401, `resource_metadata` and `error="invalid_token"` when a header was sent, as D-018 requires.
   - Add an RFC 6750 `error_description`: when no header was sent, e.g. "Supa Agent Tracker uses bearer tokens; add Authorization: Bearer <token> (Settings → MCP tokens). OAuth sign-in is not available."; when the header was rejected, e.g. "Token missing, revoked or mistyped; create a new one in Settings → MCP tokens."
   - Use the same wording in the JSON error message.
   - The description must never echo any part of the presented token.
   - Keep the protected-resource metadata endpoint unchanged.
   - Update docs/api.md.
   - Add a short "Troubleshooting" section to docs/integrations/cursor.md: if Cursor shows "Needs authentication" or offers to sign in, the token is missing or revoked. Replace it with a new token's "Copy Cursor config" and toggle the server off and on. Keep the guide's existing label and example strings.

## Must hold (tests as properties)
- Badge: a public project's card and page show "Public"; a private one doesn't. The public-page link appears only when both public and a handle exist.
- Liveness, with a fixed clock:
  - a running run contacted 2 min ago (threshold 15) shows Live and "2 min ago";
  - at 20 min it shows Stale and "20 min ago";
  - a finished run shows "—".
  The existing stale tests are unchanged.
- 401: no header → 401, `WWW-Authenticate` contains `resource_metadata=` and an `error_description` and no `error="invalid_token"`. Malformed header and revoked token → 401 with `error="invalid_token"` and the rejected description.
- The token's characters never appear in the header or body. Assert it with a token whose last 8 characters are unique.
- A valid token still gets 200, and `/.well-known/oauth-protected-resource` is byte-identical to main.
- The P1-F guide test still passes.
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free: src/features/projects/ProjectCard.tsx, src/pages/project-detail/ProjectDetailPage.tsx, src/features/runs/RunGrid.tsx, src/features/runs/RunDetails.tsx, src/domain/runs/grid.ts (new helpers only; `stale()` unchanged), src/domain/format.ts, server/app/auth-context.ts, docs/api.md, docs/integrations/cursor.md, and tests for these.
- Don't touch:
  - docs/plan/**;
  - render.yaml, Render or production;
  - server/mcp/routes.ts (the metadata endpoint) and token authentication logic;
  - server/public/** (P2-B's boundary);
  - migrations.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- Removing `resource_metadata` or the metadata endpoint: D-018 keeps them for future OAuth. That would be an operator decision.
- OAuth support: deferred by D-018.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main f3a5e33: 62 files / 445 tests (planner measurement). Report your counts.
Manual: in the http build with local Postgres, mark a project public and see the badge; see a live run's "last contact"; curl /mcp with no header and with a bogus token, and show both 401 header lines with the token absent.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-c-polish.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-c-polish -t "P2-C: Public badge, live-contact liveness, clearer bearer-only 401" -F <body file> (body = summary + verification evidence, including the two 401 header lines). Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-C — Public badge, live-contact liveness, clearer bearer-only 401
    LINE OF WORK: p2-c-polish
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; the two 401 header lines; builds; manual checks; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-c; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. how Cursor itself displays the new description); surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, changing any auth decision, touching the metadata endpoint or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
