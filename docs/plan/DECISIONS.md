# Decisions log — Supa Agent Tracker

Append-only. Never renumber. To change a decision, add a new entry and mark the old one
`SUPERSEDED by D-NNN (date, reason)` in place. Tasks cite decisions by id instead of
re-deciding. Only the planner edits this file.

Status values: **Proposed** (planner default, operator may override before T0-01 merges),
**Confirmed** (operator agreed), **Superseded**.

---

### D-001 — Source of truth for requirements
Status: Confirmed (2026-10-14)
`docs/prd/PRD-v0.6.md` is the requirements baseline. Where the PRD says "proposed", the
plan or this log records the concrete choice.

### D-002 — Phase 0 stack
Status: Proposed (2026-10-14)
Vite + React 18/19 + TypeScript (strict) single-page app, React Router (data router),
npm with committed `package-lock.json`. Node 24 LTS pinned via `.node-version` and
`engines`. No server in Phase 0.
Why: PRD Phase 0 is a static mock shell; a SPA deploys to Render as a static site.
Phase 1 adds a Node server (API + MCP) that serves the same built SPA, so view code carries
over. npm chosen because it is already installed; pnpm adds an install step for every
worker for no Phase 0 benefit.
Unverified: Render's static-site Node version handling — T0-07 confirms.

### D-003 — Styling
Status: Proposed (2026-10-14)
Tailwind CSS v4 with a small token layer (`src/styles/tokens.css`) for status colors.
No component library. Accessible primitives (disclosure, dialog, menu) are hand-rolled in
`src/components/ui/` by T0-01 so every later task uses the same ones.

### D-004 — Data-access contract
Status: Proposed (2026-10-14)
All screens read and write through interfaces in `src/data/contracts.ts`:
`TrackerDataSource` (projects, agents, runs, events, tool aggregates, next steps, tokens,
account) and a **separate** `PrivateNotesSource`. Methods are async (Promise-returning)
even in mock mode so Phase 1 swaps in HTTP clients without touching views. Phase 0
implementation: `src/data/mock/` — one in-memory store, subscribe via
`useSyncExternalStore`, deterministic seed, `resetDemo()`.
`TrackerDataSource` must have no method, field or type that can return private-note
content. Agent-facing representations (setup prompt previews, "what an agent sees")
are built only from `TrackerDataSource`.

### D-005 — Domain model and derivation
Status: Proposed (2026-10-14)
Project → LogicalAgent → Run → RunEvent / ToolAggregate / PrReference; NextStep per project;
PrivateNote per project (separate store). Execution state
(`running|finished|failed|cancelled`) and work status
(`in_progress|blocked|waiting_for_review|completed|failed|cancelled`) are separate fields.
Derived values — elapsed, stale, live-running count, stale-running count, review-needed
count, first unfinished step, active-first sort key — live as pure functions in
`src/domain/` with unit tests, and every screen uses them. Stale = execution `running`
and `now - lastContactAt > project.staleThresholdMinutes` (default 15). The demo clock is
injectable (`src/domain/clock.ts`) so tests and fixtures are deterministic; fixtures are
expressed relative to "now" at load/reset.

### D-006 — Null and unknown rendering
Status: Proposed (2026-10-14)
Null/inapplicable field → em dash "—". Requested-but-unreported (model, harness) →
"Unknown". Tool telemetry absent → "No telemetry reported", never 0. Shared formatters in
`src/domain/format.ts`.

### D-007 — Route map (frozen by T0-01)
Status: Proposed (2026-10-14)
`/` → redirect `/projects` · `/projects` · `/projects/new` · `/projects/:projectId` ·
`/projects/:projectId/edit` · `/agents` · `/settings` (account) · `/settings/tokens` ·
`/settings/integrations` · `/login` · `/register` · `/verify-email` · `/forgot-password` ·
`/reset-password` · `/logout` · `*` (not found). Run detail is an expanded row, with an
optional `?run=<runId>` query param for deep links. Adding a route after T0-01 requires a
planner decision entry.

### D-008 — Slot files for cross-task UI
Status: Proposed (2026-10-14)
T0-01 creates placeholder components that other tasks import and later fill, so parallel
tasks never edit each other's files: `src/features/next-steps/{NextStepsPreview,NextStepsPanel}.tsx`,
`src/features/private-notes/{PrivateNotePreview,PrivateNotePanel}.tsx` (owned by T0-04),
`src/features/runs/RunGrid.tsx` (owned by T0-03). Placeholder props are the final props.

### D-009 — Branch, PR and merge contract
Status: Proposed (2026-10-14)
See PLAN.md §Commit-and-merge contract.

### D-010 — No new runtime dependencies after T0-01 without planner approval
Status: Proposed (2026-10-14)
`package.json`/`package-lock.json` are owned by T0-01. A later task that needs a
dependency stops and reports it in the handoff. Reason: lockfile conflicts across four
parallel PRs.

### D-011 — Demo safety
Status: Confirmed (PRD) (2026-10-14)
Persistent "Demo — simulated data" banner. Auth screens never transmit or store what is
typed into password fields (no form submission, value cleared on navigation). Fake tokens
use the prefix `sat_demo_` followed by an obviously fake body (e.g. `sat_demo_NOT_A_REAL_TOKEN_7f3a`). No
`fetch`/XHR to any host in Phase 0 except the app's own static assets. GitHub links are
rendered as plain anchors (`target="_blank" rel="noopener noreferrer"`), never fetched.

### D-012 — Persistence across reload
Status: Proposed (2026-10-14)
Mock state persists to `localStorage` under one versioned key, wrapped in try/catch, and
falls back to the seed. Reset-demo clears it. PRD marks this optional; chosen because the
UX review (T0-07) involves reloads and direct-link checks.

### D-013 — Status label vocabulary
Status: Confirmed by planner for wave 2 (2026-10-14)
Execution: Running, Finished, Failed, Cancelled. Work: In progress, Blocked, Waiting for review,
Completed, Failed, Cancelled. Liveness: Stale. Null: "—". Unreported model/harness: "Unknown".
Absent telemetry: "No telemetry reported". Fixed so T0-02, T0-03 and T0-05, built in parallel,
render identical text. T0-07 may consolidate the label mapping into src/domain/.

### D-014 — Styling and UI primitives after T0-01
Status: Confirmed by planner for wave 2 (2026-10-14)
src/styles/** and src/components/ui/** are frozen during wave 2. Tasks style with Tailwind
utilities and existing tokens. New primitives live in the task's own folder and are proposed for
promotion in the handoff; T0-07 promotes them. Reason: four parallel PRs editing shared CSS or
primitives would conflict.

### D-015 — Page headings, route smoke test, demo-state param
Status: Confirmed by planner for wave 2 (2026-10-14)
Each page keeps the h1 text asserted by src/app/routes.test.tsx (T0-01-owned; not edited in wave 2).
/projects accepts ?demo=loading|error|empty to show those states without changing store data;
it's handled inside the projects page, not as a route.
