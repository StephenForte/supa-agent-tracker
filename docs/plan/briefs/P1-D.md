DISPATCH · Model: Sonnet 5.5 (rules are specified and the repositories already enforce access; the risk is in the ownership rules, which the tests below pin) · Order: Phase 1 wave 3, parallel with P1-B2 and P1-C1. P1-B1 is merged.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: current tip of main (d0969fe at time of writing). Rebase onto the current tip of main before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 1–2 h (P1-B1 took 64 min). Report wall-clock in RESIDUAL GAPS.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-d, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: one PR into main.
Teardown: after the PR is pushed and CI is green: stop every process you started and run the clone-scoped process check in AGENTS.md "Workspace and process hygiene"; drop every database you created; delete the clone; end your session. Report all of it on the CLONE line.
Deploy note: main auto-deploys the Phase 0 static demo on merge. `npm run build` (dist/) must stay byte-identical to main.

# P1-D — Next-step rules, user completion and private notes

This task builds both per-project surfaces from the PRD's "Next steps and private user notes":
- the **agent next-step rules**: workers edit only their own steps, a dispatcher can reorder (D-023), user completion is never undone by an agent, and retries don't duplicate;
- the **browser REST** that lets the owner read and check off steps and read and write their private note.

Private notes are owner-only and must be unreachable by any agent credential.

P1-C1 is building the MCP server in parallel, so **you do not register MCP tools**. Put the agent-side rules in a protocol-neutral service module whose functions a follow-up (P1-D2) will expose as list_next_steps / create_next_step / update_next_step, plus a reorder tool and a waiting-note tool, with no logic of its own.

## Line of work
Branch p1-d-steps-notes from the current tip of main. PR title: "P1-D: Next-step rules, completion and private notes". Pre-assigned, overriding any convention you'd pick (if one looks wrong, stop and ask):
- code: server/steps/** and server/notes/**
- agent-side service: server/steps/agent-steps.ts (the module P1-D2 will call)
- route registration: exactly one line in server/app/routes.ts: `await registerStepsAndNotesRoutes(app, deps);`, replacing the `P1-D` comment line
- migration: 0004 is reserved for you **only if needed** (server/db/migrations/0004_<name>.sql). Expect none.
- no new dependencies.

## Step 0 — get your own clone (do this first, before reading or running anything)
    pwd
If /Users/stephenforte does not exist on this machine, stop and report. Otherwise, if the path above contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-d, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-d && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-d
    cd /Users/stephenforte/src/supa-agent-tracker-p1-d
    pwd
The final pwd must print /Users/stephenforte/src/supa-agent-tracker-p1-d before anything else. If the clone path exists, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
Confirm Postgres: /Applications/Postgres.app/Contents/Versions/latest/bin/pg_isready -h localhost -p 5432 → "accepting connections", else stop and report. Never start, stop or reconfigure it.

## Read first (they govern; trust them and the repo over this brief)
- AGENTS.md, server/README.md (all of "P1-B1 data layer"; note the lines on next-step source preconditions, user completion audits and `withIdempotency`), docs/api.md.
- docs/prd/PRD-v0.6.md "Next steps and private user notes" (both subsections), "v0.4 confirmation and recovery acceptance", and acceptance scenarios 11, 13, 18 and 19.
- docs/plan/DECISIONS.md D-004 (notes separated from tracker data), D-023 (dispatcher reorder rule).
- server/repo/next-steps.ts, server/repo/private-notes.ts, server/repo/idempotency-keys.ts, server/repo/runs.ts (check_in event and actor columns), server/repo/access.ts.
- src/domain/types.ts `NextStep`, `WaitingNote`, `ProjectNextSteps`, `PrivateNote`, and src/data/contracts.ts `listNextSteps`, `setNextStepDone` and `PrivateNotesSource`. Your REST shapes should map onto these so P1-E can wire them directly.
If you think the approach is wrong, argue it in DECISIONS NEEDED with evidence instead of half-implementing it.

## Outcomes
1. **Browser REST** (all `requireUser`; bodies use `request_id`/`expected_revision` per docs/api.md; every mutation goes through `withIdempotency` with the supplied `tx`):
   - GET /api/projects/:projectId/next-steps → `{ steps, waitingNote }`, matching `ProjectNextSteps`; completed steps included, stable order.
   - POST /api/projects/:projectId/next-steps/:stepId/completion {done, expected_revision, request_id}: check off or reopen. It works after the source run has failed or ended (PRD v0.4) and records who changed it and when, plus an audit event (the repo already appends one). A stale revision gets 409 `conflict` with `error.details.current`.
   - GET /api/projects/:projectId/private-note → the note, or `{ text: "", revision: 0, updatedAt: null }` when none exists yet.
   - PUT /api/projects/:projectId/private-note {text, expected_revision, request_id}: 0 creates, then the stored revision. Cap the text length and state the cap in docs/api.md.
   - Another user's project returns 404 `not_found` and changes nothing.
2. **Agent-side service** server/steps/agent-steps.ts. Each function takes `(db, access: CredentialAccess, input: unknown)`, validates input with zod and returns a plain JSON-safe result. Each mutation takes `request_id` and wraps `withIdempotency`. Functions:
   - `listNextStepsForAgent`: steps and waiting note for one project; never private-note data.
   - `createNextStep {project_id, source_run_id, instruction, position?, request_id}`.
   - `updateNextStep {project_id, step_id, source_run_id, expected_revision, instruction?, position?, request_id}`: own steps only; never touches `done`, `completion_changed_by` or `completion_changed_at`.
   - `reorderNextSteps {project_id, order: [{step_id, expected_revision}], request_id}`: the dispatcher reconcile in D-023.
   - `setWaitingNote {project_id, source_run_id, expected_revision, text, request_id}`.
   Export the zod input schemas too, so P1-D2 can reuse them as MCP tool schemas.
3. **"Own step" is bound to the authenticated worker.** A credential may create or edit a step, or set the waiting note, only with a `source_run_id` whose check_in event was recorded by **this credential** (`run_events.actor_credential_id`, kind `check_in`) in the same project. Any other run gets `forbidden` and changes nothing: another credential's run, a user-created run, or a run in another project. The source run may have ended; workers add follow-ups at check-out.
4. **Reorder (D-023)**: any credential granted the project may reorder. The request must list every current step of the project exactly once with its current revision, or the whole request is a `conflict` and nothing changes. On success, positions become 0..n-1 in the given order and each moved step's revision increments. Text, source run and completion are untouched. Add the transactional reorder to server/repo/next-steps.ts.
5. **User completion survives agent writes.** After a user checks a step done, an agent `updateNextStep` on that step keeps `done = true`, along with completion_changed_by/at. A user reopening a step is likewise preserved.
6. **Retries don't duplicate.** A repeated `createNextStep` with the same request_id returns the original step and creates no second row. The same request_id with a different body gets `idempotency_mismatch`.
7. **Private notes are unreachable by agents**:
   - The notes routes accept only a browser session. A request with an `Authorization: Bearer ...` header and no session gets 401, including a header naming a real credential row.
   - Nothing in server/steps/** imports server/repo/private-notes.ts. Add a test that fails if any file under server/steps/** or server/mcp/** references `private-notes`.
   - No agent-steps result, error or conflict body contains note text. Prove it with a seeded unique note string.
8. **docs/api.md** gains a "Next steps and private notes" section: routes, bodies, errors, the text cap and the D-023 reorder rule. server/README.md gains a "Steps and notes (P1-D)" section, including the agent-steps function list for P1-D2.
9. **Tests** (server project, real Postgres scratch databases): routes via `app.inject` with the `x-test-user-id` seam; the agent service via direct calls with real `CredentialAccess` values. Create credentials with the repo's `createCredential` and any fake hash, and runs with `createRun` under that credential so the check_in event carries it. Cover outcomes 1–7, including:
   - worker A can't edit worker B's step;
   - a reorder missing one step, or carrying one stale revision, changes nothing;
   - a user completion survives an agent edit;
   - a completion after the source run failed succeeds;
   - user B gets 404 on user A's notes and steps;
   - a retried create makes one row.

## The traps
1. **Trusting `source_run_id` as proof of authorship.** The repo checks only that the run is in the same project (server/README.md says P1-D must bind it to the worker). If you stop there, any worker on the project can rewrite another worker's instructions by quoting its run id. That breaks acceptance scenarios 13 and 18. Bind through the check_in event's credential.
2. **A "replace the list" shortcut.** The PRD forbids an agent from replacing the complete list. Reorder changes positions only, with every revision checked. A reorder that rewrites rows can silently drop a step created a moment earlier, or undo a user's completion.
3. **Notes leaking through a shared helper.** One "project with everything" helper used by both the browser and agent paths will eventually include the note. Keep notes in server/notes/** and the private-notes repo, used only by session routes.
4. **Touching the operator's other databases.** Only your own `supa_test_*` scratch databases.

## Must hold
- No edits to src/**, render.yaml, spike/**, docs/plan/**, docs/prd/**, AGENTS.md, server/config.ts, server/app/auth-context.ts, server/mcp/**, server/tokens/**, server/auth/**, server/repo/credentials.ts, server/repo/runs.ts, server/db/migrations/0001_initial.sql.
- Web tests unchanged at 22 files / 221; `npm run build` dist/ byte-identical to main.
- Existing checks not weakened, skipped or deleted. Any change to an existing repository test needs a before → after declaration.

## Scope
- Freely changeable: server/steps/**, server/notes/**, server tests for these.
- server/repo/next-steps.ts: yours alone this wave. Add the reorder and any read you need. Don't change existing signatures; if one must change, stop and report.
- Additive only (other wave-3 tasks touch these at the same time):
  - server/app/routes.ts: your one line;
  - docs/api.md and server/README.md: your sections;
  - server/db/schema.ts: append only, and only with a 0004.
- Out of scope, with reasons:
  - registering MCP tools (P1-C1 owns /mcp; P1-D2 registers yours after both merge);
  - real browser sessions (P1-B2: use the `x-test-user-id` test seam);
  - web wiring (P1-E);
  - a priority, assignment or due-date engine (PRD: not in Phase 1).
If the work appears to need anything outside this, stop and report rather than widen scope.

## Verification (run against current main at hand-back; rebase first if main moved)
    T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Expected: web 22 files / 221 unchanged; server = 10 files / 43 (baseline) + yours. Report both. Unexplained movement in the baseline is a finding.
Static build: `env -i PATH="$PATH" HOME="$HOME" npm run build`, then compare dist/ shasums with main's tip built the same way in a separate checkout under $T. Expect identical.
Prove the authorship test can fail: temporarily drop the check_in-credential binding (keep only the repo's same-project check), see the "worker A can't edit worker B's step" test go red, restore. Report the failing line.
Live smoke: run the compiled server (NODE_ENV=test) against a scratch database seeded with one user, a project, a credential-created run and one step. With curl:
- GET steps;
- complete with the right revision (200), then again with the stale one (409);
- PUT note with 0 (200);
- GET note with a Bearer header and no user header (401).
Paste the status codes. Stop the server.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must print nothing at hand-back.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-d-steps-notes to StephenForte/supa-agent-tracker. Commit subjects start with "P1-D: ".
H2. Open the PR yourself (gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-d-steps-notes -t "P1-D: Next-step rules, completion and private notes" -F <body file in $T>). Body: routes, agent-steps functions and their inputs, the authorship and reorder rules, verification evidence, the return block. Do not merge it.
H3. Wait for CI on the PR head (all jobs); fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown per the header (processes, databases, clone), then end with the return block as your final message, inside one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-D — Next-step rules, completion and private notes
    LINE OF WORK: p1-d-steps-notes
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <web and server test counts; builds; dist diff; authorship-test failure proof; live smoke status codes; leftover-DB check; CI jobs> (run against main @ <sha> at hand-back)
    MIGRATION:   none | 0004_<name>.sql — applied forward on populated data: yes/no; re-run no-op: yes/no
    SHARED FILES TOUCHED: <every file outside server/steps and server/notes — what and why it is additive>
    IDENTIFIERS USED:     p1-d-steps-notes; server/steps/**; server/notes/**; server/steps/agent-steps.ts; registerStepsAndNotesRoutes; 0004 (only if used)
    EXISTING CHECKS MODIFIED: <path — before → after; why it strengthens> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-d; processes stopped: <PIDs or none>; clone-scoped process check output: <empty or listed>; scratch databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <rotated-token authorship edge; note cap; other>
    RESIDUAL GAPS:       what was verified by hand vs automatically; wall-clock time
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below authorises fixing CI and review-bot findings on this PR only. It does not authorise widening scope, editing files outside the Scope section, editing planner-owned files, touching other databases, weakening or skipping checks, or deciding anything listed under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
