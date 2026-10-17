# Phase 0 plan — Supa Agent Tracker UX shell

Owner: planner. Workers do not edit `docs/plan/**`.
Requirements: `docs/prd/PRD-v0.6.md` (Phase 0 section + T0 tasks). Decisions: `DECISIONS.md`.
Last updated: 2026-10-14 (initial plan; nothing implemented, no repo yet).

## Current state (verified 2026-10-14)
- Repo: https://github.com/StephenForte/supa-agent-tracker (private), default branch `main`.
  Local checkout: the Dropbox folder `~/Library/CloudStorage/Dropbox-Personal/Dev/SupaAgentDashboard`
  (operator decision 2026-10-14: stay in Dropbox for now). `main` = planning docs only.
- Node v26.9.0 and npm present locally; gh authenticated as StephenForte.
- Nothing built. Nothing deployed.
- Dropbox hazard mitigation: `node_modules/` and `dist/` must be marked Dropbox-ignored
  (`xattr -w com.dropbox.ignored 1 <dir>`) — T0-01 does this on creation.

## Waves and run order

| Wave | Task | Depends on | Parallel with | Model (recommended) | Status |
|---|---|---|---|---|---|
| 1 | T0-01 Foundation + mock contract | — | none | Opus 5.5 (ran in Codex) | **Merged** PR #1 → main 0fa4a10 (2026-10-14) |
| 2 | T0-02 Projects dashboard + form | T0-01 merged | 03, 04, 06 | Sonnet 5.5 | **Merged** PR #5 (2026-10-15) |
| 2 | T0-03 Project detail + RunGrid | T0-01 merged | 02, 04, 06 | Opus 5.5 | **Merged** PR #6 (2026-10-15) |
| 2 | T0-04 Next steps + private notes | T0-01 merged | 02, 03, 06 | Sonnet 5.5 | **Merged** PR #8 (2026-10-15) |
| 2 | T0-06 Account, tokens, setup UX | T0-01 merged | 02, 03, 04 | Sonnet 5.5 | **Merged** PR #7 (2026-10-15) |
| 3 | T0-05 All agents view | T0-03 merged | — | Sonnet 5.5 | **Merged** PR #13 (2026-10-15) |
| 4 | T0-07 Integration, Render, UX review | all above | — | Opus 5.5 | **Merged** PR #17; **deployed** https://supa-agent-tracker.onrender.com (2026-10-15). Remaining: operator UX review + 9 minor findings |
| 5 | T0-07a UX review fixes (D-016) | T0-07 merged | — | Sonnet 5.5 | **Merged** PR #20; live-verified 2026-10-15 |

Change from PRD: T0-04 moves into wave 2 (PRD has it integrating after 02/03). Made
possible by slot files (D-008): T0-02/T0-03 import T0-04's components; T0-04 fills them.
T0-03 also builds the optional Project column so T0-05 never edits the grid.

Merge order inside wave 2: any order; T0-03 first if possible (unblocks T0-05).

## File ownership

T0-01 creates every file listed below as a stub so later ownership is unambiguous.
"Owns" = creates/edits freely. "Append" = may add new files only. Anything else = do not touch;
report the need in the handoff.

| Task | Owns | May add files in | Must not touch |
|---|---|---|---|
| T0-01 | everything at creation incl. `.github/`, `AGENTS.md`, `CLAUDE.md` (planner owns AGENTS.md/CLAUDE.md after merge); afterwards `src/app/**`, `src/data/**`, `src/domain/**`, `src/components/ui/**`, `src/styles/**`, `package*.json`, configs, `README.md`, `docs/fixtures.md` | — | `docs/plan/**`, `docs/prd/**` |
| T0-02 | `src/pages/projects/**` (list, new, edit), `src/features/projects/**` | `src/domain/projects/` (pure helpers + tests) | `src/data/**`, slot files of others |
| T0-03 | `src/pages/project-detail/**`, `src/features/runs/**` (incl. `RunGrid.tsx`) | `src/domain/runs/` | `src/data/**`, `src/features/next-steps/**`, `src/features/private-notes/**` |
| T0-04 | `src/features/next-steps/**`, `src/features/private-notes/**` | `src/domain/next-steps/` | page files of 02/03 |
| T0-05 | `src/pages/agents/**` | `src/features/agents/` | `src/features/runs/**` (reuse only) |
| T0-06 | `src/pages/auth/**`, `src/pages/settings/**`, `src/features/tokens/**`, `src/features/integrations/**` | — | `src/data/**` |
| T0-07 | integration fixes anywhere, `render.yaml`, deploy docs | — | `docs/plan/**` |

**Data layer is frozen after T0-01.** If a wave-2 task finds a missing method/selector it may
add a read-only derivation in its own `src/domain/<area>/`; a missing *mutation* or seed
case is reported in the handoff and the planner dispatches a small T0-01x follow-up.

## Pre-assigned identifiers
- Decisions: D-001…D-015 used. Planner assigns next from the file at write time.
- Follow-up tasks: `T0-01a`, `T0-01b`, … for data-layer patches; `T0-0Nx` for others.
- Branches: `t0-01-foundation`, `t0-02-dashboard`, `t0-03-run-grid`, `t0-04-steps-notes`,
  `t0-05-all-agents`, `t0-06-account-tokens`, `t0-07-integrate-deploy`.
- Seed IDs (T0-01 must use exactly these so briefs can reference them):
  projects `prj_offers` (coding, active, running + review-needed + concurrent runs),
  `prj_dashboard` (coding, active, stale running + failed run), `prj_weather` (automation,
  active, daily bot, null PR/repo), `prj_archive` (coding, archived, hidden by default).
  Users `usr_demo`. Logical agent ids `agt_<project-short>_<n>`, run ids `run_<n>` sequential.
  T0-01 records the full inventory in `docs/fixtures.md`.

## Commit-and-merge contract (D-009)
1. Branch from current `main` using the pre-assigned branch name. One task = one PR.
2. Conventional-ish commit subjects: `T0-0N: <summary>`.
3. Before opening the PR: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`
   all pass. Paste the command output summary in the handoff.
4. PR body = the handoff (format in dispatch brief). Do not merge your own PR.
5. Planner reviews (review-handoff), operator merges with **squash**.
6. If `main` moved: rebase onto `main`, re-run step 3. Lockfile conflict → take `main`'s and
   re-run `npm install` only if the task was approved to add a dependency (D-010).
7. Workers never edit `docs/plan/**` or `docs/prd/**`.

## Parallel checkouts
Wave 1 (T0-01) runs in the Dropbox checkout. Wave 2 runs four workers at once; they cannot
share one working tree. **Decided 2026-10-14:** each wave-2 worker runs in its harness's own
worktree or cloud sandbox. **Updated 2026-10-15:** the operator's launcher opens workers in the Dropbox folder, so
briefs now have the worker clone itself to `~/src/supa-agent-tracker-<task>` in Step 0 and delete it at teardown. Briefs make the worker stop if `pwd` is inside Dropbox.

## Render deployment (after T0-07 merges)
- Workspace: "Supa Workspace" `tea-d98533l7vvec738vva90` (checked via Render MCP 2026-10-15; no supa-agent-tracker
  service exists yet; the workspace already builds static sites from StephenForte repos).
- T0-07 ships `render.yaml` + `docs/deploy.md` only. The planner creates the static site from that config after merge,
  **with explicit operator approval**, then smoke-tests the URL: every D-007 route loaded directly and reloaded.
- **Done 2026-10-15.** Blueprint `supa-agent-tracker` (exs-db8hqfjrjlhs7387bpug) created from the Render dashboard,
  which created static site `srv-db8hqjbncjis73b3jlpg` → https://supa-agent-tracker.onrender.com. It auto-deploys on
  commits to main. The Render MCP connector can't set static-site routes, so the dashboard Blueprint flow was required.
- Render's GitHub app originally had access to 11 selected repos, not this one; the operator added it.
- First deploy dep-db8hqjjncjis73b3jm30 (f145df4) went live in 24 s. The build log shows "Using Node.js version 24.22.0
  via .node-version".

## Phase 1 plan (started 2026-10-15)
PRD build sequence: schema/auth → projects/MCP lifecycle → dashboard/grids/checklists → integrations → deployment/QA.
Per the PRD backlog, nothing past P1-A is decomposed until the spike answers the auth question (D-017).

| Order | Task | Depends on | Model | Status |
|---|---|---|---|---|
| 1 | P1-A1 Client-compat research + MCP probe server | Phase 0 done | Opus 5.5 | **Merged** PR #23 (2026-10-15) |
| 2 | P1-A2 Deploy probe (planner) + live client tests (operator) | P1-A1 merged | planner + operator | Done 2026-10-15: all 3 clients connected with bearer header; see p1-a2-results.md |
| 3 | Auth decision → decompose P1-B…P1-G | P1-A2 | planner | D-018 **confirmed** 2026-10-15 |

Identifiers reserved for P1-A: branch `p1-a1-compat-spike`; probe dir `spike/mcp-probe/`; Render service name
`supa-mcp-probe` (separate free web service, not in root render.yaml).

## Phase 1 task tree (drafted 2026-10-15)
Decisions in force: D-018 (bearer tokens), D-019 (stack, proposed), D-020 (hosting), D-021 (Resend), D-022 (invite-only).
Probe torn down 2026-10-15 (Render service deleted, Cursor/Claude/Grok connectors removed, local token deleted).

| Wave | Task | Owns | Depends on | Model |
|---|---|---|---|---|
| 1 | **P1-B0 Server foundation**: `server/` skeleton, Fastify, config/env, local Postgres.app (no Docker) for dev/test, Drizzle + migration runner (no tables), `/health` `/ready`, SPA serving, API conventions (errors, pagination, request_id), a `requireUser` middleware **interface** with a test stub, CI Postgres job, `docs/api.md` skeleton | server/app/**, server/db/ (runner only), docker-compose, CI | Phase 0 | Opus | **Merged** PR #27 (2026-10-16) |
| 2 | **P1-B1 Schema + data access**: migration **0001_initial**, the full PRD data model (users — auth tables moved to P1-B2 / 0002 — projects, agents, runs, run_events, PR refs, tool aggregates, next_steps, waiting notes, **private_notes in their own table**, audit_events, mcp_credentials + project scopes), FK/ownership constraints, repository layer where every query takes the acting user or credential scope, isolation tests | server/db/**, server/repo/** | B0 | Opus | **Merged** PR #31 (2026-10-16) |
| 3 | **P1-B2 Browser auth + invites**: better-auth wiring, register (allowlist), verify email, login/logout, reset, session expiry/revocation, CSRF, login rate limit, email interface (console + Resend), real `requireUser`. Migration **0002** if the library needs tables | server/auth/**, server/email/** | B1 | Opus (raised: browser security boundary) | **Merged** PR #36 (2026-10-16) · surface not reported · 42 min |
| 3 | **P1-C1 MCP endpoint + tokens**: token issue/rotate/revoke REST (behind `requireUser`), hash-only storage, scope enforcement; `/mcp` with bearer auth and a spec-shaped 401; tools list_projects, get_project, check_in, update_status, heartbeat, check_out, record_tool_usage; request_id idempotency, expected_revision conflicts; clientInfo/UA stored as metadata only (D-018) | server/mcp/**, server/tokens/** | B1 (uses the requireUser stub) | Opus | **Merged** PR #35 (2026-10-16), planner merge 4375a98 + integration fixes 708a83b · ran in Codex · 51 min |
| 3 | **P1-D Next steps + private notes**: next-step rules as a protocol-neutral service (own-step authorship bound to the check-in credential, dispatcher reorder per D-023, completion preserved, request_id dedupe), REST user steps list/complete/reopen, private notes REST (session only, never MCP) | server/steps/**, server/notes/**, server/repo/next-steps.ts | B1 | Sonnet | **Merged** PR #37 (2026-10-16), planner merge commit 439e745 · 24 min |
| 3b | **P1-D2 Next-step MCP tools**: register list/create/update_next_step, a reorder tool and a waiting-note tool on /mcp by calling server/steps/agent-steps.ts; no new logic | server/mcp/** (additive) | C1, D | Sonnet | **Merged** PR #41 (2026-10-16) · ran in Codex (GPT-6), not Sonnet · 9 min |
| 3 | **P1-C2 User REST for projects and runs** (gap found 2026-10-16: no task owned it): projects create/list/get/update, agents and runs list/detail (per project and cross-project), run metadata correction, manual close (failed/cancelled + audit), account read; shapes map onto src/data/contracts.ts | server/api/** | B1 | Opus | **Merged** PR #38 (2026-10-16), planner merge commit 46b686a · 42 min |
| 4 | **P1-E Wire the web app**: HTTP `TrackerDataSource`/`PrivateNotesSource`, real auth and token screens, 5–10 s polling, server-side counts/stale derivation parity with `src/domain` | src/data/http/**, src/pages/auth|settings (wiring) | B2, C1, C2, D, D2 | Opus | **Merged** PR #42 (2026-10-16) · ran in Codex (GPT-6), not Opus · 54 min · D-028 |
| 5 | **P1-F Integrations**: reporting protocol + base prompt (all 12 tools), setup guides for Cursor / Claude Desktop / Grok Bot from P1-A2 evidence, real in-app Integration setup page, zero-dependency heartbeat adapter for client hooks (D-029) | docs/integrations/**, adapters/**, src/*/integrations/** | C1, D2, E | Sonnet | **Approved** PR #43 after fix 1 (2026-10-16) · ran in Codex (GPT-6) |
| 6 | **P1-G1 Deploy readiness (code only)**: render.yaml adds `supa-agent-tracker-app` + `supa-agent-tracker-db` (D-030), `TRUST_PROXY_HOPS`, docs/ops/backup-restore.md, a 25-run / 2-account load script measured locally (latency, errors, idempotency_keys growth), production config checks. **PR stays unmerged until the cost gate** | render.yaml, server/app/build-app.ts + config (trust proxy only), docs/ops/**, scripts/load/** | E | Opus | **Approved** draft PR #44 (2026-10-16) + planner fix d83f9d7 · ran in Cursor (Grok 4.7), not Opus · 32 min · **merge only at the cost gate** |
| 6 | **P1-G2 Provision + acceptance (planner + operator, no worker)**: cost gate → merge G1 → Blueprint provisions; operator enters secrets and the Resend domain; planner watches the deploy via the Render MCP; browser smoke on production; 25-run load check; backup/restore drill; real-client acceptance (PRD 20) with Cursor, Claude Desktop and Grok Bot following the P1-F guides; compat-matrix update; operator decides the static demo's fate | — | G1, F | — | Planned |
| 7 | **P1-H idempotency_keys retention** (follow-up from the P1-G1 measurement: 156 keys per run-hour, about 3.7k per run-day at a 30 s heartbeat, no TTL): expire heartbeat/read-only keys after a bounded window without breaking replay guarantees for real mutations | server/repo/idempotency-keys.ts + a migration | G2 (measure on prod first) | Opus | Not yet briefed |
| 7 | **P1-I Invite links** (D-031): admin-created single-use invite links replace REGISTRATION_ALLOWLIST; ADMIN_EMAIL bootstrap; migration 0003 | server/invites/**, server/auth (gate), src/features/invites/**, settings tab, 0003 | G2 live; after ops PR #46 | Opus | **Merged** PR #48 (2026-10-16), live dep-db9ahhu1egvs73ck96r0 · ran in Codex (GPT-6) |
| 7 | **P1-J All-projects tokens + prompt discovery** (D-032): an "All my projects" token scope (default) that covers future projects, editable scope, repository-matching discovery in base-prompt/protocol, and a per-client "Copy config" (Cursor JSON etc., token prefilled, shown once) in the token reveal; and, once all three clients are production-verified, update the per-client verified label in src/domain/integrations/examples.ts and the three guides together (a P1-F test ties them) | server/repo/credentials.ts + 0004 migration, server/tokens/**, src/features/tokens/**, docs/integrations/** | P1-G2 Cursor test | Opus | Briefed 2026-10-16 ([brief](briefs/P1-J.md)); branch p1-j-token-scope, migration 0004 |
| 7 | **P1-K CI teardown flake + idle pool errors**: intermittent unhandled 57P01 after all tests pass (runs 38983589001 attempt 1, 38984291404 on main 529f112); make server/test/database.ts drop() race-free and add a pool error listener in server/db/pool.ts | server/test/database.ts, server/db/pool.ts | none (parallel with P1-J) | Sonnet | **Merged** PR #50 (2026-10-17), live dep-db9c42qvcj2c7396qfsg · ran in Codex (GPT-6), ~19 min · [brief](briefs/P1-K.md) |

Pre-assigned migration numbers: 0001 = P1-B1 (merged), 0002 = P1-B2, 0003 = P1-C1 (only if needed), 0004 = P1-D (only if needed); P1-C2 and P1-D2 add none. Wave-3 tasks
must not add migrations outside their number; a later need gets a new number from the planner.
Known conflict points in wave 3, all predicted:
- `server/app/routes.ts`: one line each.
- `docs/api.md` and `server/README.md`: append-only sections.
- `server/app/auth-context.ts`: B2 edits `requireUser`; C1 edits `McpCredential` / `requireMcpCredential`. Imports may collide at the top.
- `server/db/schema.ts`: append-only.
- `server/app/errors.ts`: B2 and C1 both add `rate_limited`; the second to rebase reuses it.
- `package-lock.json`: B2 adds better-auth and C1 the MCP SDK. The second to merge regenerates the lockfile with `npm install <dep>@<version>`, never by hand-merging.
Suggested merge order: B2, then D, then C1 (C1 is largest and most likely to finish last). A conflict that a worker can't
resolve gets a short rebase brief.
`requireUser` keeps the `x-test-user-id` seam under NODE_ENV=test only, so C1/D route tests survive B2's merge.
P1-C2 also runs in wave 3. It owns server/api/**, server/repo/views.ts, and additive changes to server/repo/projects.ts
and agents.ts. It uses `:projectId` path params to match P1-D. It adds one routes.ts line (`registerUserApiRoutes`).
### P1-G2 runbook and cost gate (planned 2026-10-16)
1. **Cost gate.** Prices as seen 2026-10-16, from secondary sources only (render.com/pricing doesn't render to the
   planner's fetcher): web Starter $7/mo (512 MB, 0.5 CPU); Postgres Basic-256mb $6/mo compute; Postgres storage $0.30/GB-mo;
   Hobby workspace free with 5 GB bandwidth included since 1 Aug 2026, then $0.15/GB. Estimate: about $13/mo plus about
   $0.30–1.50 storage. Polling is about 1 GB/month per tab left open 8 h/day, so a single user stays within 5 GB.
   Backup/PITR retention on Basic is **unverified**. Before the operator says yes, the planner re-reads the live prices
   (dashboard or the Blueprint preview) and states the final number. The operator's explicit "approve" in chat is the
   only trigger for merging P1-G1.
2. Merge P1-G1 → watch the Blueprint sync and first deploy with the Render MCP (list_deploys, list_logs); expect "Applied
   0001…0002", then /ready 200.
3. Operator, in the Render dashboard (never in chat): REGISTRATION_ALLOWLIST, RESEND_API_KEY, EMAIL_FROM; Resend domain
   DNS verified. Redeploy.
4. Before the smoke, confirm PUBLIC_URL equals the URL Render actually assigned (the CSRF check and cookies depend on it). Check Render's proxy hop count: 5 failed sign-ins from the operator's network → 429, then one from a phone hotspot → not 429. If both are 429, Render adds more than one hop, so raise TRUST_PROXY_HOPS.
   Planner browser smoke on production: the operator registers with their real email and clicks the real email; then
   login, project, token, private note, logout. Probe the per-IP 429 with spoofed X-Forwarded-For (it must still key on
   the real client).
5. 25-run / 2-account load check on production with two allowlisted load-test accounts (projects archived afterwards):
   p95 latency, error count, lock waits, idempotency_keys row growth. If growth is material, retention becomes a
   follow-up task.
6. Backup/restore drill per docs/ops/backup-restore.md into a scratch database; record the result.
7. Real-client acceptance (PRD scenario 20): the operator connects Cursor, Claude Desktop and Grok Bot to production with
   the P1-F guides and runs check_in → update_status → next step → check_out. The planner reads the server side and
   updates compat-matrix.md.
8. Operator decides whether to retire the Phase 0 static demo (D-020).

Review probes to carry into wave-3 reviews:
- P1-C1 must reject non-http(s) PR reference URLs from agents (C2 rejects them from users). The web renders them as anchors.
- P1-E renders run lists without events (D-026).
- P1-F: `record_tool_usage` bumps the run revision (only heartbeat is exempt, D-024). An adapter that reports tool usage
  from a separate process will make the agent's next update_status conflict. Decide in P1-F: either the adapter batches
  at check_out, or tool usage gets a non-revision path like heartbeat.
- P1-G: every MCP mutation, heartbeats included, writes an idempotency_keys row, and there is no TTL (P1-B1). That's
  about 1,440 rows per day per run at a 1-minute heartbeat. Measure it in the 25-run check and add retention if needed.
- P1-G: Fastify has no `trustProxy`, so `request.ip` is the socket peer. Behind Render's proxy, P1-B2's per-IP sign-in
  limit (5/min, successes included) would key on the proxy and become site-wide. P1-G must configure trusted client IPs
  and re-run a per-IP 429 probe. PUBLIC_URL must equal the browser origin exactly, or cookie writes get 403 (CSRF check).
- P1-C1 PR-URL probe: satisfied (agent `javascript:` PR url → validation_error).
Scope amendment, 2026-10-16: P1-B2 may edit server/db/schema.test.ts. The apply-once test now derives its file list from
the migrations directory. The sessions/accounts/verification tables are no longer forbidden; invites stays forbidden. The
forbidden-column check uses an explicit (table, column) allowlist for better-auth's password-hash and session-token
columns. The no-CASCADE and drift tests are unchanged. Until B2 merges, a 0003/0004 from C1 or D would also trip the
hard-coded migration list.
Wave-3 inputs from the P1-B1 review: `findCredentialByHash` takes `UserAccess`, so P1-C1 must add the trusted
bearer bootstrap (hash → `CredentialAccess`) in server/repo/credentials.ts; every repo call, reads included, takes
`FOR UPDATE` on the project row (serializes per project). P1-G's 25-concurrent-run load check must measure this.

## Known traps (found in review)
- UI time comes from `useNow()`, which always reads `systemClock`; there is no clock context. Injecting a clock into
  `createDemoSources` does not move the UI's `now`. To test elapsed/stale in rendered components, use
  `vi.useFakeTimers()` + `vi.setSystemTime()` with the default sources. An injected clock plus a rendered page
  produces mismatched store and UI times (seen while reviewing T0-02, 2026-10-15). Production is unaffected: both use
  `systemClock`.

- `systemClock` is a module singleton, and `src/data/runtime.ts` subscribes it at import with a **real**
  `setInterval`. `vi.useFakeTimers()` installed inside a test therefore never ticks `useNow()`: live elapsed looks
  frozen under fake time. Assert live elapsed with a short real-time wait, or install fake timers before
  importing app modules (seen while reviewing T0-03, 2026-10-15).
- `RunGrid` computes stale from `props.projects`. A consumer that omits a run's project gets `stale = false` for that
  run, silently. T0-05 must pass all projects.

## Where conflicts are still likely
- `src/app/routes.tsx`: frozen by D-007; any edit there is a review flag.
- Shared UI primitives (`src/components/ui/`): wave-2 tasks will want tweaks. Rule: add a new
  primitive in your own feature folder; propose promotion in the handoff.
- `docs/fixtures.md`: only T0-01 writes it; others report fixture gaps.
- Wave-2 cross-imports of slot files: props are fixed by T0-01; a needed prop change is a
  handoff item, not an edit.

## Task notes beyond the PRD
- **T0-01** — Must deliver: contracts (D-004), domain derivations with tests (D-005), formatters
  (D-006), all routes rendering a titled placeholder (D-007), slot stubs (D-008), app shell
  (branding, Projects / All agents nav, account menu, demo banner, reset-demo), localStorage
  persistence (D-012), `npm run typecheck|lint|test|build|preview` scripts, README, fixtures
  inventory. Seed must include: running in-progress run; finished + waiting-for-review run;
  stale running run; failed run; cancelled run; daily bot with ≥3 days of runs, null PR/repo;
  one logical agent with 2 concurrent running runs; parent/subagent pair; unknown model;
  run with no tool telemetry vs run with zero-call tool row; run linked to 2 PRs; next steps
  from ≥2 source runs incl. one completed and one from a failed run; waiting note; private
  notes on 2 projects; long project name; project with no links; ≥2 fake tokens.
- **T0-03** — `RunGrid` props must support: `runs`, `showProjectColumn`, sort/filter state
  controlled or uncontrolled, expansion. Manual close writes an audit event via the data layer.
- **T0-04** — Simulated agent updates: a demo-only "Simulate agent update" control in the
  detail panel that calls the mock agent-update path and demonstrates (a) user completion
  preserved, (b) revision conflict surfaced. Clearly labelled demo.
- **T0-06** — Integration status for every client is "Not connected · Not tested". Config
  snippets carry `<PLACEHOLDER>` markers and a "not verified" note.
- **T0-07** — Deployment requires a Render account action by the operator; if access isn't
  granted, deliver `render.yaml` + instructions and stop (PRD).

## Open questions for the operator
1. ~~Repo location~~ — resolved 2026-10-14: stays in Dropbox for now. Risk accepted; revisit
   if conflicted copies or index corruption appear. Parallel wave-2 workers must not share this
   one checkout — see "Parallel checkouts" below.
2. ~~GitHub repo~~ — created 2026-10-14.
3. Which harness/model runs each worker? Table above is a recommendation.
4. Decisions marked Proposed (D-002…D-010, D-012) — object before T0-01 merges or they stand.

## Verification log
(Planner appends: task, PR, what was checked, how, result.)
- 2026-10-14 · T0-01 · PR #1 @ ffeb514 · Fresh scratch clone, Node 26.9.0: base = main ede3f88; no docs/plan|prd changes; ci/typecheck/lint/build pass; vitest 4 files / 60 tests (matches handoff); CI `verify` pass. Read contracts/store/seed/notes/persistence line-by-line. Note separation is structural; token plaintext is not stored; close/step/conflict semantics are correct; seed covers all PLAN scenarios. **Blocker:** probe with an injected clock showed prj_offers liveRunning 3 → 0 at +16 min and 0 after reload +24h, because seeded live runs never refresh lastContactAt. Crude scratch patch proved 3/0 is reachable without a contract change. Changes requested: https://github.com/StephenForte/supa-agent-tracker/pull/1#issuecomment-6184054985 . Worker ran in Codex, not Claude/Opus as dispatched. Worker left the Dropbox checkout on branch t0-01-foundation.
- 2026-10-14 · T0-01 re-review · PR #1 @ 360d907 · Fresh clone: base = main 89a7ffa. The delta is limited to src/data/mock/**, README and fixtures; no contract, Run type, package or docs/plan changes. Gate pass, vitest 5 files / 64 tests, CI pass. Independent probe (live/stale): real clock via fake timers at +16 min and +3 h gives offers 3/0, dashboard 0/1. Manual close of run_1 then +20 min gives 2/0 with contact frozen. Reset then +20 min gives 3/0. Persisted reload +24 h gives 3/0. The same probe on pre-fix cb924d4 gives 0/3 everywhere, so the probe can fail. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/1#issuecomment-6184194638
- 2026-10-15 · T0-02 · PR #5 @ ee32ce6 · Fresh clone: base = main 32919ce; scope limited to projects pages/features/domain; gate pass, vitest 7 files / 82 tests (matches); CI + Bugbot pass; no file overlap with #6/#7/#8. Probe rendered /projects with fake system timers: Offers live 3 / stale 0 / review 1, Dashboard 0/1/0, Weather 0/0/0 at t0, +20 min and +3 h 20. Order Offers > Dashboard > Weather, archived hidden. A name-only create, a link-clearing edit and a restore all saved. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/5#issuecomment-6194187536
- 2026-10-15 · T0-06 · PR #7 @ 2477391 · Fresh clone with current main (e02ae19) merged in, no conflicts: gate pass, vitest 13 files / 98 tests (80 + T0-02's 18); CI pass; Bugbot rotation-copy finding fixed in 2477391. Probe through the real routes: the plaintext appears in 1 input after create, is absent after dismiss, and is absent after rotate → navigate away → back. Clean URL; no plaintext in demo storage, local/session storage or console. The integrations preview for all 4 projects contains no seeded private-note text. The probe was shown able to fail (no-op dismiss → present). Litter: an orphaned vite dev server (PID 70600, port 5176) was still running from the deleted clone and recreated ~/src/supa-agent-tracker-t0-06/.vite. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/7#issuecomment-6194262314
- 2026-10-15 · T0-03 · PR #6 @ 8602966 · Fresh clone: branch alone vitest 10 files / 152 (matches); merged with main 361f8de 16 / 168, no conflicts; typecheck/lint/build pass; CI pass; RunGridProps/Sort/Filters byte-identical to main; Bugbot "+N more clears filters" fixed in 8602966. Probe through the real routes: offers order run_1, run_10, run_2, run_3; concurrent badge only on run_1/run_2; Live filter excludes run_3; Review filter = run_3; Stale filter = run_4; closing run_4 as Cancelled took stale 1 → 0 with elapsed frozen across +10 min, a manual_close event and step_3 still open; ?run=run_3 expands. Real-time elapsed advances for run_1 and stays frozen for run_3. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/6#issuecomment-6194372725
- 2026-10-15 · T0-04 · PR #8 @ 0e7efe2 · Fresh clone: branch alone vitest 10 files / 106 (matches); merged with main 45d47d3 19 / 192, no conflicts; typecheck/lint/build pass; CI pass; slot props unchanged. Separation probe: steps components with throwing notes source made 0 calls; notes components with throwing tracker made 0 calls. Planting a notes read in NextStepsPreview made 1 call, so the probe can fail. A unique saved note string was absent from every tracker read. step_1 check recorded by usr_demo; a current-revision rewrite of completed step_2 left it done; a stale rewrite was a conflict with no change; step_3 (failed source run_5) completed; a dirty note draft was kept on external save; reset with a real clock adopted the seed. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/8#issuecomment-6194814803
- 2026-10-15 · T0-05 · PR #13 @ 10c8a77 · Fresh clone: base = main 48321c1; scope limited to agents page/features/domain; gate pass, vitest 21 files / 215 (matches); CI pass; Bugbot history-sync finding fixed. Probe through the real routes: default order run_1, run_10, run_2, run_4, run_3, …; views live/review/completed/bogus correct; Back restores ?view=live. Consistency of execution/work/liveness/PR/harness/model across /agents and each project page: 10 runs, 0 mismatches. Closing run_4 on /agents gives dashboard stale 0 with step_3 open. ?run=run_10 expands with parent. Removing a project from the projects prop gave 1 mismatch (run_4 lost Stale), so the probe can fail. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/13#issuecomment-6197972796
- 2026-10-15 · T0-07 · PR #17 @ f8727eb · Fresh clone: base = main c3727b3; no forbidden files; gate pass, vitest 21 files / 216 (matches); CI + Bugbot pass; the 3 modified assertions are strengthenings. render.yaml checked field-by-field against https://render.com/schema/render.yaml.json staticService (type web / runtime static consts, autoDeployTrigger commit, previews.generation off, rewrite route): valid. Probe: card vs detail header counts, links and type/lifecycle words are identical for all 3 visible projects; no raw status codes on 10 screens. Reverting one label shows the probe can fail. Still unverified until a live deploy: the Render rewrite and Node 24 selection. 9 minor UX findings in docs/ux-review.md await operator decision. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/17#issuecomment-6199285795
- 2026-10-15 · Render deploy · https://supa-agent-tracker.onrender.com @ f145df4 · curl: all 18 D-007 routes (incl. /projects/prj_offers?run=run_3, /agents?view=review, /unknown/path) return 200 with a body byte-identical to /, so the rewrite works on Render. JS/CSS assets are 200 with correct types; a missing /assets file returns 404 (not rewritten). Browser: reloading /projects/prj_offers?run=run_3 renders "Offers workspace" with run_3 expanded, counts 3/0/1 and the demo banner; /agents?view=review shows run_3 only; /settings/integrations shows 3× "Not connected · Not tested"; /unknown/path shows "Page not found"; no console errors. Phase 0 completion criterion 1 (Render-hosted demo reachable, routes work) is met.
- 2026-10-15 · Operator UX review, live site · Steps 1–7 of docs/ux-review.md walked with the operator; all passed except Step 4: "+1 more" gives no visible result. Reproduced in the browser: when run_3 is already expanded (the ?run=run_3 link), the click changes nothing; when collapsed, the details open below the viewport (top 610 px of a 610 px viewport, the Pull requests list at 942 px) and focus stays on body. Decisions on the 9 findings: D-016. Follow-up: T0-07a.
- 2026-10-15 · T0-07a · PR #20 @ 926a0cc · Fresh clone: base = main 570d1bd; scope within the brief; RunGridProps unchanged; gate pass, vitest 22 files / 221 (matches); CI + Bugbot pass; the 6 modified assertions are copy only. Probe through the real routes: "+1 more" focuses #pull-requests-run_3 and scrolls it into view from the expanded state, from the collapsed state and on a repeat click, keeping the Waiting-for-review filter. Timeline/tool/actor words correct (Check-in, Native, T0-11b, Manual close / Demo operator). formatElapsed and projectsShownLine match D-016. Removing the focus call leaves focus empty, so the probe can fail. Real-browser scroll: the worker reports it seen at 610 px; the planner rechecks on the live site after merge. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/20#issuecomment-6202598817
- 2026-10-15 · T0-07a live recheck · Render deploy dep-db8kcu7avr4c7383062g (419ccf8, includes #20) live. Real browser, 610 px viewport, /projects/prj_offers?run=run_3: before the click the Pull requests list sat at 962 px; "+1 more" from the expanded state moved it to 0 px with focus on #pull-requests-run_3 (contains #77); from the collapsed state it expanded the row, list at 0 px, same focus. No console errors. The D-016 defect is closed. **Phase 0 status:** all T0 tasks merged and deployed, operator UX review done, decisions in D-016. Phase 0 completion criterion 7 (review incorporated before Phase 1 backend wiring) is met. Next: Phase 1 planning (P1-A auth/MCP compatibility spike first, per PRD).
- 2026-10-15 · P1-A1 · PR #23 @ 9e8e1f9 · Fresh clone: base = main 2747c13; scope within the brief; root gate 22 files / 221 (unchanged); spike 8/8; CI verify + mcp-probe + Bugbot pass. Fetched citations G1, G2, A2, C2 and confirmed them. Key finding: Claude static headers are an org-wide Owner-set beta ("not a person's" credential), so per-user bearer tokens can't be assumed for Claude Desktop, and OAuth (DCR/CIMD) is the default path there. Probe security: token absent from whoami and log even when smuggled in other headers; /probe/log returns 401 without a token. **Blocker:** an Origin-bearing request returns 403 with 0 log entries, so P1-A2 could misrecord a client as "didn't connect". A one-line record-before-reject fix was proven in scratch (403 plus one http:origin_rejected entry, 8/8). Changes requested: https://github.com/StephenForte/supa-agent-tracker/pull/23#issuecomment-6203353082 . Worker ran in Codex, not Opus.
- 2026-10-15 · P1-A1 re-review · PR #23 @ eb4540d · Delta is exactly the requested record-before-reject line, +1 regression and +1 test-plan line. Root 22 files / 221 pass; spike 9/9; CI pass. Live local probe: an Origin initialize gives 403 with 1 http:origin_rejected entry, token absent from log and stdout. **Approved.**
- 2026-10-15 · P1-A2 · Probe deployed (srv-db8lfanavr4c73879p1g, free plan, operator-approved; token set by the operator in the Render dashboard, never in chat). 401 enforcement checked. Live, operator-driven: Cursor 3.24.18, Claude Desktop 2.42304.0 (Max) and Grok Bot all completed whoami → check-in → heartbeat with a valid bearer header. Cursor and Claude attempt OAuth discovery without a header; Cursor subagents inherit tools on the parent session; Grok presents as "Cursor (via mcp-remote 0.15.1)"; model was reliably reported only by Claude. Details: docs/plan/p1-a2-results.md. Proposal D-018.
- 2026-10-15 · P1-B0 · PR #27 @ 2b3f34a · Fresh clone: base = main 7c934bb; scope clean; static dist byte-identical to main (shasum); vitest 30/240 (web 22/221 unchanged + server 8/19); DATABASE_URL-unset fails loudly; 0 leftover supa_test_* DBs. Compiled server probed: /ready 200, then 503 with a pending migration; /mcp* and /api return JSON 404; traversal attempts get index.html; 2 MB body → 413; long x-request-id replaced. **Blocker:** request logging is a denylist (authorization/cookie/set-cookie), so the x-api-key value was logged in plain text. An allowlist fix was proven in scratch (secrets in log 1 → 0, 8/19 pass). Changes requested: https://github.com/StephenForte/supa-agent-tracker/pull/27
- 2026-10-16 · P1-B0 re-review · PR #27 @ dddb1b2 · Allowlist fix. Merged with main d53f020: vitest 30/241 (web 22/221 + server 8/20), builds pass, CI pass. Production log probe with 6 secret headers (incl. x-api-key, x-auth-token, proxy-authorization, a custom one): 0 in log; user-agent kept. 0 leftover DBs. Stopped a leftover cursor-agent (78699) from the deleted clone; this worker predated the AGENTS.md hygiene rule. **Approved.**
- 2026-10-16 · P1-B1 · PR #31 @ 22163e3 · Fresh scratch clone, base = main 3d612f7; scope clean (17 files); typecheck/lint pass; vitest 32/264 (web 22/221 unchanged + server 10/43); both builds pass; dist 3 files byte-identical to `env -i` main build. Probes on a scratch DB: forged token projectIds don't widen scope (list [X], Y/other-user → not_found); credential with wrong userId → forbidden; grant move and revoke take effect against a stale access context; no private-note text in any credential-path read, runtime-cast note read → forbidden; raw SQL cross-project agent/parent/source-run/grant → 23503, project delete → 23001, run_events delete and finished-without-finished_at → 23514. Mutations: owner filter removed → 1 existing test red; grant check removed → 2 existing red; schema.ts nullability flip → drift test red. db:migrate CLI not re-run (needs full env); programmatic apply-once/no-op covered by schema.test.ts. 0 leftover DBs, no clone-scoped processes, clone and temp deleted. Worker model not reported. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/31#issuecomment-6207195387
- 2026-10-16 · P1-B2 · PR #36 @ 06c6e95 · Fresh scratch clone, base = main 0c03279; scope clean plus the authorized schema.test.ts amendment (verified as no weaker: migration list read from dir; invites still forbidden; token/password/secret scan with explicit allowlist; no-CASCADE and drift unchanged). vitest 35/289 (web 22/221 + server 13/68); builds pass; dist byte-identical; better-auth 1.7.7, audit 0. Populated migration (mixed-case legacy user, project, agent, run) → 0002 applied, data hash unchanged, re-run no-op. Probes: test seam ignored in production; bearer no browser credential; cookie POST without/evil Origin 403; sign-out and bad-signature cookie 401; cross-user revoke ineffective; reset generic/single-use/revokes sessions; no token or password in logs; legacy-case signup no duplicate; per-IP 429 with spoofed headers ignored. CSRF-clause mutation → 2 red. Session-token storage accepted (D-027). Proxy IP requirement carried to P1-G. Seen during this review: a cursor-agent worker (PID 9811) still running for the deleted P1-D clone; handle at P1-D review. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/36#issuecomment-6218773620
- 2026-10-16 · P1-D · PR #37 @ baeac3e · Base 0c03279 is stale after #36. Scratch merge with main 9dff259: routes.ts clean; docs/api.md and server/README.md conflict at the appended sections, resolved by keeping both. On the merged tree: vitest 37/303 (main 35/289 + 2/14). Probes: D-023 authorship (other credential's run, user run → forbidden); dispatcher reorders but can't edit text; incomplete, stale or duplicate reorder → conflict with no change; user completion survives agent edit and reorder; concurrent same request_id → one row; scope, forged ids and revoked token; no note text agent-side; cross-user REST 404 with no change; Bearer on notes 401. Reorder-check mutation → 2 red. Stopped the leftover cursor-agent worker 9811 (deleted P1-D clone). **Approved pending the docs merge:** https://github.com/StephenForte/supa-agent-tracker/pull/37#issuecomment-6218858134
- 2026-10-16 · P1-C2 · PR #38 @ c0c2767 · Base 0c03279 is stale after #36/#37. Scratch merge with main 87e3bb1: routes.ts, docs/api.md and README conflicts resolved by keeping both sides. On the merged tree: vitest 38/313 (main 37/303 + 1/10). Probes: user B gets 404 on every A route with a 5-table snapshot unchanged; B's cross-project lists empty; metadata PATCH can't set executionState or move lastContactAt; javascript:/data:/vbscript:/protocol-relative URLs rejected (project and PR); lists have no events (D-026); manual close stale → 409, valid → cancelled + manual_close event (reason, actor) + 1 audit row, next_steps untouched, re-close → 409; include_archived works. findOwnedRun owner-filter mutation → worker's test red (my HTTP probe stayed green thanks to the withProject re-check). Accepted: closing an ended run → 409; caps as documented. **Approved pending the merge:** https://github.com/StephenForte/supa-agent-tracker/pull/38#issuecomment-6218990333
- 2026-10-16 · P1-C1 · PR #35 @ fdbab78 · Base 0c03279 is stale after #36/#37/#38. Scratch merge with main fe4e198: auth-context imports, routes, package.json, docs union; lockfile = main's plus `npm install --save-exact @modelcontextprotocol/sdk@1.31.0` (no main versions changed). Two integration failures found only on the combined tree: unused `stubAuthEnabled` (typecheck/lint) and P1-D's private-notes guard flagging C1's test file. Fixes (delete the function; guard skips *.test.ts, proven to still bite on product source) give vitest 39/327 (main 38/313 + 1/14), audit 0. Probes: copy-once replay (issue and rotate) returns plaintext null, plaintext absent from DB; scope X→Y/other user/foreign parent/foreign run → not_found; agent javascript: PR url rejected; heartbeat keeps revision and update_status after it succeeds; last-used doesn't bump credential revision; revoke mid-session → 401; Origin 403; 401 WWW-Authenticate exact; query token ignored. Plaintext-in-response mutation → probe red. **Approved pending the merge and fixes:** https://github.com/StephenForte/supa-agent-tracker/pull/35#issuecomment-6219129731
- 2026-10-16 · Wave 3 complete · main 14b882e: P1-B2 #36, P1-D #37, P1-C2 #38, P1-C1 #35 merged; vitest 39/327 (web 22/221 + server 17/106) on the combined tree. Planner merge commits were pushed to #37, #38 and #35 with operator approval. Two integration failures (unused stubAuthEnabled; the private-notes guard scanning test files) were fixed in 708a83b. P1-D2 brief written; key trap: registrar and agent-steps would both wrap withIdempotency.
- 2026-10-16 · P1-D2 · PR #41 @ 42defc6 · Fresh scratch clone, base = main 14b882e; scope clean (6 files; step-tools.ts pure delegation). vitest 40/335 (web 22/221 + server 18/114); builds pass; dist byte-identical. Probes over /mcp: concurrent same request_id → one step row and one key row; mismatch on a different body; mutate=true mutation → probe red (single idempotency layer); cross-token authorship forbidden; stale → conflict; empty update → validation_error; ungranted → not_found; strict extra field rejected; no note text. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/41
- 2026-10-16 · P1-E scope amendment · The worker stopped correctly: NextStepsPanel.tsx has the unconditional "Demo only — Simulate agent update" control outside its scope. Authorized: any src/features/** or src/pages/** file may be edited **only** to show existing demo-only controls or "simulated" copy in demo mode, gated on the account's demo flag (NextStepsPanel.tsx, CloseRunDialog.tsx copy, and any similar file found). No behaviour changes in those files, and each one listed in SHARED FILES TOUCHED. Worker surface: Codex (GPT-6).
- 2026-10-16 · P1-E scope amendment 2 · Authorized one additive, optional method on `ObservableSource` in src/data/contracts.ts, plus registration in src/data/hooks.tsx, so the HTTP source polls only the reads that mounted screens use. The mock doesn't implement it; when the method is absent, hook behaviour is unchanged; existing hook tests stay unchanged; mount/unmount registration is tested.
- 2026-10-16 · P1-E scope amendment 3 · Authorized an additive `{ status: 'conflict'; current: McpToken }` variant on `TokenIssueResult` (src/domain/types.ts). The only caller (TokensPanel.tsx, rotate) treats non-created results generically; in http mode it shows a refresh-and-retry message instead of the demo wording. The mock never returns it.
- 2026-10-16 · P1-E scope amendment 4 · Confirmed: PrivateNotePanel.tsx:57-60 clears `saving` only on success, so a rejected save leaves the control busy with no error. Mutation handlers in other views may share the defect (ProjectForm, CloseRunDialog, NextStepsPreview, ProjectDetailPage, AgentsPage, IntegrationsPanel, TokensPanel). Authorized, once for all of them: in any src/features/** or src/pages/** handler that awaits a source mutation, add catch (show a visible error) and finally (clear busy). Drafts and existing demo/conflict behaviour are preserved, each file is declared, and regression tests cover a rejected mutation. Granted as a class to stop per-file stops.
- 2026-10-16 · P1-E · PR #42 @ 4bd1bed · Fresh scratch clone, base = main eaed318; scope within the brief plus amendments 1–4. vitest 46/362 (web 27/247 + server 19/115); demo bundle contains no /api or HTTP-source code. Real browser, live build: guard → /login; invite-only message; verify link strips the token; login; project create; token copy-once (absent from storage/URL, gone from the DOM after dismiss, masked after refresh); a DB-inserted run appears via polling without reload; ~6 GETs per poll and no per-run detail requests until a row is expanded; manual close persisted with audit; logout redirects. Real browser, demo build: banner, seeded data, 0 /api requests. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/42
- 2026-10-16 · P1-F · PR #43 @ 01fd008 · Fresh scratch clone, base = main 89c826a; scope clean. vitest 47/370 (web 27/248 + server 20/122); demo bundle has no /api. Docs cross-checked against docs/api.md and the code (fields, caps, errors, D-023/D-024/D-029 rules). Adapter probes on a compiled server: sent; another user's run → unavailable; wrong token → unavailable, token absent from output; non-loopback http rejected. **Blocking:** the lock is never reclaimed, so SIGTERM mid-request (reproduced, exit 143) or SIGKILL leaves it, and every later heartbeat for that run is 'throttled' forever (a lock dated 2026-01-01 still blocked). The fix (reclaim locks older than 30 s, release on SIGTERM/SIGINT/SIGHUP) was proven in scratch: sent / interrupted+exit 0 / fresh lock still throttled. Planner error noted: D-028/D-029 were cited by briefs but sat on unmerged docs PR #40; merging #40 now. **Changes requested:** https://github.com/StephenForte/supa-agent-tracker/pull/43#issuecomment-6223288928
- 2026-10-16 · P1-F fix 1 · PR #43 @ 3d69911 · Base main 0719929. The diff is exactly the proven fix (30 s stale-lock reclaim, signal handlers) plus 3 e2e cases. vitest 47/373 (web 27/248 + server 20/125); all 10 adapter tests green; demo bundle clean. The planner's own mutation re-check was invalid (sed broke the syntax) and isn't counted; red-on-old rests on the planner's earlier probes and the worker's report. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/43
- 2026-10-16 · P1-G1 · draft PR #44 @ d4fdebd · Scratch merge with main f87b466: vitest 48/377; demo bundle clean; static render.yaml block unchanged. Production-mode boot (migrations on boot, hops=1) gives /ready 200 with no secret in the log; the trust-proxy spoof probe gives 401×5 then 429 with rotating left-hand X-Forwarded-For, and a different client gets its own bucket. **Planner error found:** the D-030/brief build command `npm ci && …` fails on Render because NODE_ENV=production at build time drops devDependencies (reproduced: exit 127, tsc missing). Fixed by planner commit d83f9d7 (`npm ci --include=dev`), verified; D-030 corrected. Stopped the leftover cursor-agent 16403 (deleted clone). Retention follow-up P1-H logged. **Approved, merge only at the cost gate:** https://github.com/StephenForte/supa-agent-tracker/pull/44
- 2026-10-16 · **Cost gate passed.** Render live prices read in-browser from render.com/pricing: web Starter $7/mo (0.5 CPU, 512 MB); Postgres Basic-256mb $6/mo (0.1 CPU, 256 MB, 1 GB storage included, extra $0.30/GB); Hobby PITR 3 days (Pro 7), logical backups kept 7 days (render.com/docs/postgresql-backups). The operator approved **about $13/month** in chat: "I approve about $13/month (Starter web + Postgres Basic-256mb)." The operator merges #44 to provision. Note: the workspace already has 22 services; the operator's workspace plan is unconfirmed (Hobby caps at 25).
- 2026-10-16 · **Production live** after the operator merged #44 and set secrets: /health and /ready 200 at https://supa-agent-tracker-app.onrender.com, /api 401 and /mcp 401 with the correct WWW-Authenticate URL; PUBLIC_URL matches the assigned subdomain; DB oregon, Postgres 18, ipAllowList [] (the Render MCP query was refused, as intended). **Cost-gate miss:** the DB was created with Render's default 15 GB disk, about +$4.20/mo (≈ $17.20 total vs ~$13 approved). The operator chose to recreate the empty DB at 1 GB: ops PR #46 (diskSizeGB: 1, draft) merges after the operator deletes the DB. The operator rejected the env allowlist → D-031, task P1-I.
- 2026-10-16 · **DB recreated at 1 GB.** The operator deleted the empty supa-agent-tracker-db (the planner confirmed via the Render MCP that only that instance went; chainbank/settlementos/crown-tracker untouched), then merged ops PR #46. The new instance dpg-db98fhgm7kps73bhvjv0-a is basic_256mb, 1 GB disk, oregon, Postgres 18, ipAllowList [], available. The app reconnected: /health and /ready 200, /api 401, /register 200. Cost back to the approved ~$13/mo ($7 web + $6 DB, 1 GB included).
- 2026-10-16 · P1-I scope amendment (each item checked against main): (1) src/app/routes.tsx: add the `/settings/invites` route, one line; (2) server/db/schema.test.ts:47-48: the 'forbids invites' assertion encoded superseded D-025, so replace it with checks of the approved invites schema (token_hash only, no plaintext column, RESTRICT FKs), keeping the forbidden-column scan and no-CASCADE checks; (3) server/email/index.ts:14 prints whole emails in development, so suppress **invite** email contents there (verification/reset dev output unchanged); (4) server/app/trust-proxy.test.ts:46: replace the REGISTRATION_ALLOWLIST fixture with an equivalent that keeps every limiter assertion.
- 2026-10-16 · P1-I scope amendment 2 · Blanket, to stop per-file stops: any file on main that references REGISTRATION_ALLOWLIST may be edited **only** to replace that reference with the D-031 equivalent (ADMIN_EMAIL bootstrap / invite links), with no other change. Files on main at grant time: scripts/load/README.md:7, server/e2e/web-sources.test.ts, docs/ops/deploy-phase1.md:44, server/README.md (62, 295), render.yaml:48, plus the auth/config tests already in scope. Test fixture swaps must keep every assertion.
- 2026-10-16 · **P1-G2 step 4 (production smoke).** The operator registered with their own email and clicked the real Resend verification email, which works and verifies the sender domain. Render app logs (60 lines): all info, no errors, only 200/304, and no token/password/cookie/API-key patterns (auth routes are silent by design). **Per-IP sign-in limit does not engage in production:** 13 failed sign-ins from one client (Render request log clientIP 73.231.58.148, stable), with and without spoofed X-Forwarded-For, gave 401 every time and never 429. Locally the same probe gives 429 on the 6th. Diagnosis: with TRUST_PROXY_HOPS=1, request.ip varies per request, likely because of an extra rotating proxy hop. The per-email limit still applies. Proposed cheapest test: TRUST_PROXY_HOPS=2 plus a re-probe (one IP → 429; spoofing doesn't bypass), then codify in render.yaml. Awaiting operator OK for the production env change.
- 2026-10-16 · **Trust-proxy fix verified in production.** With operator approval the planner set TRUST_PROXY_HOPS=2 via the Render API (deploy dep-db99cm7f3r2c73akkb80, live 21:27Z). Re-probe from one client: 401×5 then 429; rotating spoofed X-Forwarded-For, and two- and three-entry spoofs, all 429 (no bypass). Render has two proxy hops in front of the app. Codified in ops PR #49 (render.yaml value "2" plus README) so a Blueprint sync doesn't revert it. P1-G2 step 4 complete.
- 2026-10-16 · P1-I · PR #48 @ 4bcfe0a · Base main 17d7cd2. vitest 51/391; demo bundle clean; no REGISTRATION_ALLOWLIST references. Populated migration with the real runner (0001+0002 + seed → 0003): data hash unchanged, re-run no-op. Probes: wrong-email, unknown, garbage, reused and revoked invites all give an identical 403 body; concurrent sign-ups → one user; replay link null; token absent from DB and logs. **Blocking:** the ADMIN_EMAIL bootstrap applies forever, so a no-invite sign-up for the admin email returns 200 while others get 403 (admin address enumerable). Fix proven in scratch (bootstrap only while no account exists): identical 403, 34 invite/auth tests pass. **Changes requested:** https://github.com/StephenForte/supa-agent-tracker/pull/48#issuecomment-6225332040
- 2026-10-16 · P1-I fix 1 · PR #48 @ 448daba · The diff is the proven fix plus a regression test and doc lines. vitest 51/392; demo bundle clean. Probe: first ADMIN_EMAIL sign-up 200, then the case-variant admin email and a random email both get a byte-identical 403. **Approved:** https://github.com/StephenForte/supa-agent-tracker/pull/48
- 2026-10-16 · **P1-I live.** The operator set ADMIN_EMAIL on supa-agent-tracker-app, then merged #48. Deploy dep-db9ahhu1egvs73ck96r0 is live; /ready 200 (0003_invites applied); /api/invites 401 unauthenticated; a no-invite sign-up gets the generic 403; /register?invite=… 200. Pending: the operator confirms the Invites tab shows for their account and creates a test invite. REGISTRATION_ALLOWLIST may still be in the dashboard; it's unused and the operator may delete it.
- 2026-10-16 · Operator confirmed on production: the Invites tab is visible to the admin; creating an invite showed the link once and the email arrived. D-031 is done. Remaining P1-G2: step 5 (25-run load on production), step 6 (backup/restore drill), step 7 (real-client acceptance with Cursor, Claude Desktop and Grok Bot), step 8 (static demo's fate); plus P1-H retention.
- 2026-10-16 · P1-G2 step 7 started (Cursor). The operator created project `Acceptance — Cursor` (46849ebd-f017-49fa-85f7-faad59d3e074). Operator decision D-032: tokens should cover future projects ("All my projects", default), with discovery in the prompt → P1-J.
- 2026-10-16 · **P1-G2 step 7: Cursor ✅ (production).** Cursor 3.25.6: token in ~/.cursor/mcp.json → green, 12 tools. The full scripted cycle (8 tool calls) is all HTTP 200 per Render request logs; the operator confirmed the run Finished / Waiting for review, the next step and the timeline, with no tool errors. Recorded in compat-matrix.md and cursor.md. Usability finding: hand-editing mcp.json is too hard for normal users → P1-J adds a per-client "Copy config" in the token reveal. Next: Claude Desktop, then Grok Bot.
- 2026-10-16 · **P1-G2 step 7: Claude Desktop ✅ (production).** Connector with No sign in + request header; 12 tools; scripted cycle, no tool errors. The planner verified read-only through the synced connector: the step was created with source_run b3367860…, and running_runs is empty (checked out). Anthropic egress 160.79.106.x. Two mid-session 400s have an unconfirmed cause (operator had pasted a malformed token; 401 would be expected), with no impact; noted, not chased. Next: Grok Bot.
- 2026-10-16 · Planner error: editing the guides' "Verified" line broke CI on docs PR #47. The P1-F test requires each guide to contain the in-app label from src/domain/integrations/examples.ts. Reverted cursor.md and claude-desktop.md to main; production evidence stays in compat-matrix.md. The label update moves to P1-J (product + guides together). Lesson: run the test suite on docs edits under docs/integrations.
- 2026-10-16 · **P1-G2 step 7: Grok Bot ✅ (production) → all three clients pass; PRD scenario 20 met.** Grok set up via a masked secret field + bridge; 12 tools; scripted cycle with no errors or retries; the planner confirmed step f084f55b… (source run 734c9e37…) read-only. Observation: the bridge's initial `GET /mcp` without a session gets our 400; the MCP spec allows 405 for no GET stream. Harmless; could be folded into a later polish task. Remaining P1-G2: step 5 load, step 6 backup drill, step 8 demo fate. Then P1-J and P1-H.
- 2026-10-16 · P1-J briefed (Opus, alone). Pre-assigned: branch p1-j-token-scope, migration 0004_token_all_projects. Trap named: four scope-enforcement sites (withProject, listProjects, idempotency snapshot, credential summary/auth). Includes per-client production labels + guides together (the P1-F test ties them), and Copy config in the token reveal.
- 2026-10-17 · main CI red at 529f112: all 51 files pass, then 1 unhandled 57P01 from a scratch-DB client (`_ending: true`) during teardown; same as PR #47's first attempt at 275ef04 (auth.test.ts). Planner hypothesis: pg-pool end() resolves before client sockets close, and drop()'s pg_terminate_backend hits closing backends. NOT reproduced locally (200 iterations, 0 errors), so it's labelled unconfirmed in the brief. Also: server/db/pool.ts has no pool 'error' listener (node-postgres: idle-client errors crash the process). Both go to P1-K.
- 2026-10-17 · **P1-K reviewed → approved (PR #50).** Planner re-ran in a scratch clone: gate pass, 53 files / 396 tests; the new tests are 3/4 red on main (a real 57P01 recorded); CI 38985390433 attempts 1–4 green. Probe: a real pg_terminate_backend on an idle pooled client crashes main's process (exit 1) and the branch survives (logs SQLSTATE only). So P1-K also fixes a production crash on Postgres restarts. Original CI timing is still not deterministically reproduced (disclosed).
- 2026-10-17 · P1-K merged (ef31536). Main CI 38986818631 green; Render deploy dep-db9c42qvcj2c7396qfsg live at 00:33Z, /ready 200.
