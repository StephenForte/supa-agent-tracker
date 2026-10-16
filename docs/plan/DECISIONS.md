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

### D-016 — Phase 0 UX review outcomes
Status: Confirmed by operator (2026-10-15, live review of https://supa-agent-tracker.onrender.com)
Usage: All agents (`/agents`) is the operator's all-day screen; Projects is for start and end of day. `/` stays
on `/projects`. Grid wording and elapsed formatting therefore get the most exposure.
Decisions on docs/ux-review.md findings:
1. Project filter "Stale running" vs run filter "Stale": **keep**. They filter different subjects.
2. Count label "Review needed" becomes **"Waiting for review"**, the same phrase as the work status and the All agents view.
3. "3 of 4 projects shown" becomes **"3 projects shown · 1 archived hidden"** (archived count only when hidden).
4. Card "Remaining: N" becomes **"N open"**.
5. Timeline event kinds are shown as words: Check-in, Status update, Heartbeat, Check-out, Manual close.
6. Tool source is shown as MCP / Native / Shell / Other; event actors are shown as the agent's name or the account's display name.
7. Elapsed omits leading zero units: `21m 59s`, `45s`, `1h 1m 1s`.
8. Narrow-screen demo banner: **keep**.
9. Run-metadata editor: **defer** to Phase 1.
Defect found in review: "+N more" on a run's PR cell gives no visible result. It must bring the run's Pull requests list into view and move focus there.
Implemented by T0-07a.

### D-017 — Phase 1 starts with a client-compatibility spike (P1-A)
Status: Proposed (2026-10-15)
Before any Phase 1 schema, auth or MCP API design, establish what Cursor, Claude Desktop (macOS) and Grok Bot actually
support for a remote MCP server: transport, auth (static bearer header vs OAuth 2.1), and what they expose (subagent tool
inheritance, model identity, hooks for heartbeats). The PRD says bearer tokens are a product requirement, not evidence that
clients accept them (PRD "Accounts and authorization", "Integration deliverables").
- P1-A1 (worker): documented research with citations, plus a throwaway probe server in `spike/mcp-probe/` (own
  package.json; excluded from the app's lint/test/build; never imported by `src/`).
- P1-A2 (operator + planner): the planner deploys the probe as a separate **free-plan** Render web service, with operator
  approval, **not** via the root render.yaml Blueprint. The operator connects each client and records results. The planner
  writes the outcome as the auth decision that gates P1-B/P1-C.
- Probe tokens are generated at deploy time and live only in Render env vars and the operator's client config, never in git.

### D-018 — Phase 1 MCP auth: personal bearer tokens first, OAuth later
Status: **Confirmed by operator (2026-10-15)**
Evidence: docs/plan/p1-a2-results.md. All three initial clients (Cursor 3.24.18, Claude Desktop 2.42304.0 Max, Grok Bot)
connected to the probe with a pasted `Authorization: Bearer` header.
Proposal: Phase 1 implements only the PRD's scoped, revocable, copy-once personal bearer tokens (hash-stored, project-scoped,
server-enforced). OAuth 2.1 (DCR/CIMD, per the Claude auth reference) is deferred until a user's client can't send headers;
the MCP endpoint keeps returning a spec-shaped 401 + `resource_metadata` so OAuth can be added without breaking clients.
Run attribution comes only from the check-in payload (agent_name, harness, model, parent_run_id, all optional except the PRD's
required fields). Observed clientInfo and user-agent are stored as metadata, never as identity.

### D-019 — Phase 1 server stack
Status: Proposed by planner (2026-10-15). P1-B0 verifies current versions and may argue alternatives in its handoff.
One Node 24 + TypeScript server in `server/` (same repo and package as the web app) serves the built SPA, `/api/*` (JSON,
browser session) and `/mcp` (Streamable HTTP, bearer per D-018) from one Render web service (PRD "Deployment and
operations"). Framework Fastify. Postgres via Drizzle ORM with versioned SQL migrations committed under
`server/db/migrations/`. Browser auth via an established library (better-auth proposed: email/password, verification,
reset, sessions, rate limiting); passwords never hashed by hand-rolled code. Local dev/test Postgres via Docker; CI runs a
Postgres service. **Amended 2026-10-15:** the operator's Mac has no Docker but runs Postgres.app (PostgreSQL 18) on
localhost:5432; local tests use it, creating and dropping uniquely named scratch databases only. CI uses a postgres:18
service. Web UI swaps `src/data/mock` for HTTP implementations of the same `TrackerDataSource` /
`PrivateNotesSource` contracts (D-004), so screens don't change.

### D-020 — Phase 1 hosting
Status: **Confirmed by operator (2026-10-15)**
Render web service on the **Starter** plan (no sleep, so heartbeats and stale detection behave) plus **Render Postgres Basic**
(backups). Operator-estimated about $13/month; the planner confirms current prices on Render and gets explicit approval
before provisioning in P1-G. The Phase 0 static site stays until the Phase 1 service replaces it.

### D-021 — Transactional email provider
Status: **Confirmed by operator (2026-10-15)**
Resend for verification and reset emails. It requires an operator-controlled sender domain and an API key held only in Render
env vars. The server talks to email through an interface with a console/log implementation for local dev and tests, so no
task needs the real key until P1-G.

### D-022 — Phase 1 registration is invite-only
Status: **Confirmed by operator (2026-10-15)**. Supersedes the PRD's "open registration" for Phase 1 only.
Registration is accepted only for emails on an operator-managed allowlist (env or DB table). Email verification, reset,
sessions, rate limits and per-account isolation stay exactly as the PRD specifies. Open registration can be enabled later
without schema changes.

### D-023 — Next-step authorship and dispatcher reorder
Status: **Confirmed by operator (2026-10-16)**. Resolves PRD "Remaining decisions" 1.
A worker's "own" step is one whose source run was checked in by the same MCP credential (`run_events.actor_credential_id`
on the run's check_in event). Only that credential may edit the step's text or position, or set the waiting note with that
source run. "Dispatcher reconcile" means: any credential granted the project may **reorder** the whole list. The request
must name every current step with its current revision, or nothing changes. Reorder never alters text, source run or
completion. No credential flag or schema change. Known edge: after a token rotation, the new token can't edit steps
from runs the old token checked in (accepted for Phase 1).

### D-024 — Token format and liveness writes don't bump revisions
Status: Proposed by planner (2026-10-16). Technical; P1-C1 may argue alternatives with evidence.
MCP tokens are `sat_` + 32 random bytes (base64url), stored as SHA-256 hex; display suffix = last 4 characters. Slow hashes
are unnecessary for 256-bit random tokens. Issuance or rotation replays through `request_id` never return the plaintext
again, and the plaintext is never stored, including in `idempotency_keys.response`. Heartbeats advance `last_contact_at`
and append an event **without** bumping the run revision. Credential `last_used_at` updates (throttled to ≤1/min) don't
bump the credential revision. Otherwise liveness traffic turns the agent's next status update and the owner's settings
edits into 409 conflicts.

### D-025 — Registration allowlist lives in an env var
Status: Proposed by planner (2026-10-16). Implements D-022.
`REGISTRATION_ALLOWLIST` (comma-separated, case-insensitive). The operator edits it in Render env. There is no admin UI or
table in Phase 1. Empty means nobody can register.

### D-026 — Run list endpoints omit events
Status: Proposed by planner (2026-10-16). Narrows the Phase 0 contract comment "full run detail is returned in list/get".
`GET /api/runs` (and any cross-project run list) returns runs with PR references, tools, parent/child ids, and **no
events**. `GET /api/runs/:runId` returns the full event timeline. Reason: heartbeats append events indefinitely (history is
never purged), and P1-E polls every 5–10 s, so embedding events in lists grows payloads without bound. P1-E fetches detail
when a run row is expanded.

### D-027 — Browser session tokens stored as better-auth issues them
Status: Accepted by planner (2026-10-16) on P1-B2 review (PR #36).
`sessions.token` holds better-auth's random session id. The browser cookie carries `token.signature`, HMAC'd with
BETTER_AUTH_SECRET. `requireUser` reads only the cookie, and no bearer plugin is enabled, so a database-only leak can't
produce a valid cookie (probed: real token + wrong signature → 401). No custom hashed-session adapter in Phase 1. Revisit
if a bearer/session-token header is ever enabled.

### D-028 — The demo build stays the default; the live web app is opt-in
Status: Proposed by planner (2026-10-16), for P1-E.
`VITE_DATA_SOURCE` selects the web data sources at build time: `demo` (the default, also when unset) uses the in-browser mock;
`http` uses the real server. render.yaml's static site builds with no env vars, so the public Phase 0 demo stays a
self-contained demo that makes no network calls. P1-G sets `VITE_DATA_SOURCE=http` for the Phase 1 web service build.
The selection is a compile-time constant, so the demo bundle contains no HTTP-source code (proven by a dist grep for `/api/`).

### D-029 — Tool usage is batched at check-out; adapters only heartbeat
Status: Proposed by planner (2026-10-16), for P1-F.
`record_tool_usage` and `check_out.tools` bump the run revision (only heartbeat is exempt, D-024). The reporting protocol
therefore has agents report observed tool aggregates once, in `check_out`. Client hook adapters send **heartbeats only**,
so a separate process never makes the agent's next status update conflict. The agent hands the run id to the adapter
through a workspace file, `.supa/run-id` (one id, deleted at check-out). Adapter-captured tool telemetry (PRD R8) is
deferred to Phase 2, where it gets a non-revision ingestion path if needed.

### D-030 — Phase 1 deployment shape and the cost gate
Status: Proposed by planner (2026-10-16), for P1-G. Implements D-020.
- A new Render web service `supa-agent-tracker-app` (Node, Starter) and a Postgres instance `supa-agent-tracker-db`
  (Basic-256mb) are added to the existing Blueprint (render.yaml). The Phase 0 static demo `supa-agent-tracker` stays
  until the operator decides to retire it.
- Build: `npm ci && VITE_DATA_SOURCE=http npm run build && npm run build:server`. Start: `npm start`, with
  NODE_ENV=production, so migrations run before listen. DATABASE_URL comes from the database by internal connection
  string, and the database has no public IP allowlist.
- Fastify trusts exactly one proxy hop (`TRUST_PROXY_HOPS=1` on Render, default 0 locally). Trusting all hops would let
  clients spoof `X-Forwarded-For` and evade the per-IP sign-in limit.
- **Cost gate:** with auto-sync, Blueprint can provision new resources as soon as render.yaml lands on main (the
  exact sync behaviour for new paid resources is unverified, so the gate assumes it). The P1-G1 PR is **not
  merged** until the operator explicitly approves the monthly cost, re-confirmed by the planner against Render's live
  prices at that moment. Merging that PR is the provisioning step.
- Secrets (RESEND_API_KEY, EMAIL_FROM, REGISTRATION_ALLOWLIST) are `sync: false`, entered by the operator in the Render
  dashboard and never in chat. BETTER_AUTH_SECRET uses `generateValue: true`.

