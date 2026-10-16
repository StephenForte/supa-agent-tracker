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
| 1 | **P1-B0 Server foundation**: `server/` skeleton, Fastify, config/env, local Postgres.app (no Docker) for dev/test, Drizzle + migration runner (no tables), `/health` `/ready`, SPA serving, API conventions (errors, pagination, request_id), a `requireUser` middleware **interface** with a test stub, CI Postgres job, `docs/api.md` skeleton | server/app/**, server/db/ (runner only), docker-compose, CI | Phase 0 | Opus | PR #27 — changes requested 2026-10-15 (header log leak) |
| 2 | **P1-B1 Schema + data access**: migration **0001_initial**, the full PRD data model (users, sessions, invites, projects, agents, runs, run_events, PR refs, tool aggregates, next_steps, waiting notes, **private_notes in their own table**, audit_events, mcp_credentials + project scopes), FK/ownership constraints, repository layer where every query takes the acting user or credential scope, isolation tests | server/db/**, server/repo/** | B0 | Opus |
| 3 | **P1-B2 Browser auth + invites**: better-auth wiring, register (allowlist), verify email, login/logout, reset, session expiry/revocation, CSRF, login rate limit, email interface (console + Resend), real `requireUser`. Migration **0002** if the library needs tables | server/auth/**, server/email/** | B1 | Sonnet |
| 3 | **P1-C1 MCP endpoint + tokens**: token issue/rotate/revoke REST (behind `requireUser`), hash-only storage, scope enforcement; `/mcp` with bearer auth and a spec-shaped 401; tools list_projects, get_project, check_in, update_status, heartbeat, check_out, record_tool_usage; request_id idempotency, expected_revision conflicts; clientInfo/UA stored as metadata only (D-018) | server/mcp/**, server/tokens/** | B1 (uses the requireUser stub) | Opus |
| 3 | **P1-D Next steps + private notes**: MCP list/create/update_next_step (own-step edits, dispatcher reconcile, completion preserved), REST user complete/reopen, private notes REST (session only, never MCP), audit events | server/steps/**, server/notes/** | B1 | Sonnet |
| 4 | **P1-E Wire the web app**: HTTP `TrackerDataSource`/`PrivateNotesSource`, real auth and token screens, 5–10 s polling, server-side counts/stale derivation parity with `src/domain` | src/data/http/**, src/pages/auth|settings (wiring) | B2, C1, D | Opus |
| 5 | **P1-F Integrations**: reporting protocol + base prompt; setup guides for Cursor (`mcp.json` header), Claude Desktop (connector + request header), Grok Bot (settings screen, not chat); optional Cursor hook heartbeat adapter (R7) | docs/integrations/**, adapters/** | C1, D | Sonnet |
| 6 | **P1-G Deploy + QA**: Render web Starter + Postgres Basic via Blueprint (planner provisions with operator approval, D-020), migrations on deploy, backup/restore doc, account-isolation tests, 25-concurrent-run load check, Resend domain | render.yaml, docs/ops/** | E, F | Opus |

Pre-assigned migration numbers: 0001 = P1-B1, 0002 = P1-B2 (only if needed), 0003 = P1-C1, 0004 = P1-D. Wave-3 tasks
must not add migrations outside their number; a later need gets a new number from the planner.
Known conflict points in wave 3: `server/app/routes.ts` (each task registers its routes: append-only, one line each) and
`docs/api.md` (append-only sections). The planner resolves these at merge.

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
