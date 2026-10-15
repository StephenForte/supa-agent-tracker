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
| 1 | T0-01 Foundation + mock contract | — | none | Opus 5.5 (ran in Codex) | PR #1 approved @ 360d907 (2026-10-14); awaiting operator merge |
| 2 | T0-02 Projects dashboard + form | T0-01 merged | 03, 04, 06 | Sonnet 5.5 | Not started |
| 2 | T0-03 Project detail + RunGrid | T0-01 merged | 02, 04, 06 | Opus 5.5 | Not started |
| 2 | T0-04 Next steps + private notes | T0-01 merged | 02, 03, 06 | Sonnet 5.5 | Not started |
| 2 | T0-06 Account, tokens, setup UX | T0-01 merged | 02, 03, 04 | Sonnet 5.5 | Not started |
| 3 | T0-05 All agents view | T0-03 merged | — | Sonnet 5.5 | Not started |
| 4 | T0-07 Integration, Render, UX review | all above | — | Opus 5.5 | Not started |

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
- Decisions: D-001…D-012 used. Planner assigns next from the file at write time.
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
share one working tree. Operator chooses per worker: harness-managed worktree/sandbox
(Claude Code worktree, Cursor background agent, Codex cloud) — preferred, no extra folders
in Dropbox — or a separate clone outside Dropbox. Decide before wave 2.

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
