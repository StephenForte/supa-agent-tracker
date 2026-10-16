DISPATCH · Model: Opus 5.5 (strongest tier: every screen switches from the in-browser mock to the real server, and auth, CSRF and conflict handling all surface here) · Order: Phase 1 wave 4, alone. P1-B2, P1-C1, P1-C2, P1-D and P1-D2 are merged.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: current tip of main (eaed318 at time of writing). Rebase onto the current tip of main before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 2–4 h, the largest Phase 1 task so far. Report wall-clock in RESIDUAL GAPS. This is a morning dispatch.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-e, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: one PR into main.
Teardown: after the PR is pushed and CI is green: stop every process you started (dev servers, vite, compiled server, watchers) and run the clone-scoped process check in AGENTS.md "Workspace and process hygiene"; drop every database you created; delete the clone; end your session. Report all of it on the CLONE line.
Deploy note: main auto-deploys the Phase 0 **static demo** (render.yaml, `npm ci && npm run build`, no env vars). After this task, that build must still be the self-contained demo, making no network calls (D-028). The live build is opt-in via `VITE_DATA_SOURCE=http`, and P1-G turns it on for the real web service.

# P1-E — Wire the web app to the real server

Every screen built in Phase 0 reads and writes through two contracts in src/data/contracts.ts, `TrackerDataSource` and `PrivateNotesSource`. Today both are served by an in-browser mock (src/data/mock, selected in src/data/runtime.ts).

The server now provides everything they need:
- browser auth under `/api/auth/*` (P1-B2);
- tokens under `/api/tokens*` (P1-C1);
- account, projects, agents and runs (P1-C2);
- next steps and private notes (P1-D).

This task adds HTTP implementations of both contracts and wires the auth and token screens to the real endpoints. It also adds 5–10 s polling so the dashboard stays live, and keeps the mock as the default build so the public static demo keeps working.

## Line of work
Branch p1-e-web-wiring from the current tip of main. PR title: "P1-E: Wire the web app to the real server". Pre-assigned, overriding any convention you'd pick (if one looks wrong, stop and ask):
- HTTP sources: src/data/http/** (one module per contract plus a small fetch client)
- build switch (D-028): `VITE_DATA_SOURCE`, values `demo` (default, also when unset) and `http`; selection lives in src/data/runtime.ts
- polling interval: 7 s while the tab is visible; paused while hidden; one immediate refresh on becoming visible and after each own mutation
- no server changes, no migration, no new dependencies

## Step 0 — get your own clone (do this first, before reading or running anything)
    pwd
If /Users/stephenforte does not exist on this machine, stop and report. Otherwise, if the path above contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-e, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-e && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-e
    cd /Users/stephenforte/src/supa-agent-tracker-p1-e
    pwd
The final pwd must print /Users/stephenforte/src/supa-agent-tracker-p1-e before anything else. If the clone path exists, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
Confirm Postgres: /Applications/Postgres.app/Contents/Versions/latest/bin/pg_isready -h localhost -p 5432 → "accepting connections", else stop and report. Never start, stop or reconfigure it.

## Read first (they govern; trust them and the repo over this brief)
- AGENTS.md; docs/api.md (all of it: errors, request_id/expected_revision, pagination, Authentication, Tokens, Projects/agents/runs, Next steps and private notes); server/README.md.
- docs/plan/DECISIONS.md D-004/D-005 (contracts, private notes outside tracker data), D-016 (UX copy), D-026 (run lists omit events), D-027, D-028 (demo build stays default).
- docs/prd/PRD-v0.6.md "Accounts and authorization", "Project dashboard", "Project detail", "Next steps and private user notes", acceptance scenarios 11, 12, 17, 19.
- src/data/contracts.ts, hooks.tsx, runtime.ts, mock/** (the behaviour your HTTP sources must match), src/domain/types.ts, src/domain/clock.ts, src/app/routes.tsx, src/app/Shell.tsx, src/pages/auth/**, src/pages/settings/**, src/features/runs/RunDetails.tsx, src/features/tokens/**.
- docs/plan/PLAN.md "Known traps": `useNow()` reads `systemClock`, so fake timers inside a test don't tick it.
If you think the approach is wrong, argue it in DECISIONS NEEDED with evidence instead of half-implementing it.

## Outcomes
1. **HTTP `TrackerDataSource` and `PrivateNotesSource`** in src/data/http/**, implementing the existing contracts. Change the contracts only as allowed in outcome 6. Mapping rules:
   - `listProjects()` returns all projects including archived: page through `GET /api/projects?include_archived=true` until `nextCursor` is null. `listRuns` / `listAgents` page the same way.
   - `listRuns` items come back with `events: []` (D-026). The run timeline gets its events from `getRun(runId)` when a run is expanded. Update src/features/runs/RunDetails.tsx (or the code that renders it) to read the timeline from `getRun`. Lists must never fetch every run's detail.
   - Writes send `request_id` (fresh per user action; reused only when retrying the same action) and `expected_revision` where the API requires it. When a contract method has no revision parameter (`closeRun`, `revokeToken`, `rotateToken`), read the current resource first and send its revision. A 409 maps to `{ status: 'conflict', current }`.
   - `setNextStepDone(stepId, …)` has no projectId, but the route needs one. Keep a stepId → projectId index filled from `listNextSteps` responses; an unknown step → `{ status: 'not_found' }`.
   - HTTP 404 → `not_found`; 400 → `invalid` with a safe message; 401 → the session-expired flow (outcome 3); 429 and 5xx → a thrown error the existing error states display.
   - `simulateAgentStepUpdate` and `resetDemo` are demo-only: in http mode, return `invalid` and reject respectively, and hide their UI (outcome 6).
   - Private notes use only `/api/projects/:projectId/private-note`, and live in a separate module from the tracker source (D-004).
2. **Polling** through `ObservableSource`: bump the snapshot when a poll finds changed data, or right after the source's own successful mutation, so `useSourceQuery` re-reads. Poll at 7 s only while `document.visibilityState === 'visible'`, with no overlapping polls and no timer left behind after unsubscribe. Each poll costs one paged request per list in use, not one request per run.
3. **Real auth screens** (src/pages/auth/**) in http mode:
   - register (`POST /api/auth/sign-up/email`; show the "by invitation only" message on 403);
   - verify email (`/verify-email?token=…` calls `GET /api/auth/verify-email?token=…`);
   - log in;
   - log out;
   - forgot password (always the same confirmation);
   - reset password (`/reset-password?token=…`).
   The browser sends the session cookie automatically. Same-origin fetch sends `Origin`, which the server's CSRF check requires (docs/api.md "Authentication"). Keep every request same-origin and never set `credentials: 'omit'`.
   - A route guard sends unauthenticated users on app routes to `/login` and returns them afterwards. A 401 during use does the same.
   - In demo mode, the auth screens keep their current simulated behaviour.
4. **Real tokens and account screens** (src/pages/settings/**, src/features/tokens/**) in http mode:
   - list, issue, rotate and revoke via `/api/tokens*`;
   - the plaintext is shown once from the issue/rotate response and never stored in state that outlives the dialog, localStorage or the URL;
   - the account page shows `/api/account` data and changes the password via `POST /api/auth/change-password`.
   If a screen has a control with no server endpoint, disable it in http mode with a short reason and list it in RESIDUAL GAPS. Don't invent endpoints.
5. **Build switch (D-028).**
   - `npm run build` with no env: the demo. Mock sources, the demo banner and Reset demo all as today.
   - `VITE_DATA_SOURCE=http npm run build`: the live app served by `npm start`.
   - Make the selection a compile-time constant so the demo bundle contains no HTTP-source code. The `grep` in Verification proves it.
   - Add a vite dev proxy for `/api` → `http://localhost:3000` (used only when VITE_DATA_SOURCE=http) so `npm run dev` works against `npm run dev:server`.
6. **Allowed contract and domain changes**, and nothing else:
   - `Account.demo` may become `boolean`, so the live account reports `false` and the demo banner and Reset demo hide.
   - Additive optional fields only if a screen truly needs them; declare each one.
   Views keep using hooks and contracts and never import src/data/http directly.
7. **docs**: a "Web app" section in server/README.md: how to run live locally (db:migrate, dev:server, `VITE_DATA_SOURCE=http npm run dev`), and the build switch. Add one line in docs/api.md "Route registration" noting that the SPA consumes these routes.
8. **Tests**:
   - Web (jsdom, fetch stubbed): mapping of 200/400/401/404/409/429; pagination loops until `nextCursor` is null; `request_id` reuse on retry and freshness per action; the stepId → projectId index; polling bumps the snapshot only on change, pauses when hidden and leaves no timer after unsubscribe; token plaintext is absent from localStorage after the dialog closes.
   - End to end (node, real server): build the app with `buildApp` against a scratch database, `listen` on port 0, and drive **your HTTP sources** through an injected `fetch` that keeps a cookie jar and sends `Origin: PUBLIC_URL`. The flow:
     1. sign up an allowlisted email; verify via the captured email token; log in;
     2. create a project; issue a token (plaintext once);
     3. MCP `check_in` with that token over `/mcp`;
     4. `listRuns` sees the run with `events: []` and `getRun` returns events;
     5. `closeRun` → cancelled; `setNextStepDone` on a step an agent created via MCP; save and read a private note;
     6. log out → the next read gets the session-expired flow.
     Put it where the existing test projects will run it (for example server/e2e/**), and keep `npm run typecheck` green for both tsconfigs.
   - The existing web suite (22 files / 221) stays green. Change existing assertions only where outcome 6 forces it, and declare each one.

## The traps
1. **Breaking the public demo.** render.yaml rebuilds the static site on every merge with no env vars. If the default build picks HTTP sources, or a leftover import makes the demo call `/api`, the public demo turns into a login page that can't log in. Consequence: the only thing users can see today goes dark on merge. Default to demo, prove it with the bundle grep, and smoke the built demo.
2. **N+1 polling.** The mock returns runs with events, so the obvious port calls `getRun` for every row every 7 s. With history that never expires (heartbeats append events) that's unbounded load. Only an expanded run fetches detail.
3. **Plaintext token leaking into state.** React state that outlives the dialog, a query cache, localStorage or the URL would keep the copy-once token around. The server never returns it twice; don't keep it on the client either.
4. **Cross-origin assumptions.** The server rejects cookie writes whose `Origin` isn't PUBLIC_URL (docs/api.md). Everything must be same-origin relative URLs. An absolute API base URL, or a different dev origin without the proxy, makes every write 403.
5. **Touching the operator's other databases.** Only your own `supa_test_*` scratch databases, plus one dev database you create and drop (name it `supa_test_p1e_dev`).

## Must hold
- No edits to server/** (except the new e2e test directory and server/README.md), render.yaml, spike/**, docs/plan/**, docs/prd/**, AGENTS.md, package.json dependencies. If the server lacks something a screen needs, stop and report. Don't work around it in the client.
- `npm run build` (no env) is the demo: the same screens and behaviour as today and zero `/api` references in dist (Verification). dist won't be byte-identical, because source changed, and that is expected for this task only.
- Private notes never flow through the tracker source; no MCP token is ever used by the browser.
- Existing checks not weakened, skipped or deleted; every changed assertion declared.

## Scope
- Freely changeable: src/data/http/** (new), src/data/runtime.ts, src/pages/auth/**, src/pages/settings/**, src/features/tokens/**, src/features/runs/RunDetails.tsx (events via getRun only), src/app/** (route guard, demo banner visibility), vite.config.ts (dev proxy and env typing), src/vite-env.d.ts or equivalent, server/e2e/** (new), web tests.
- Additive only: src/domain/types.ts (outcome 6 only), src/data/contracts.ts (outcome 6 only), server/README.md and docs/api.md (outcome 7).
- Out of scope, with reasons:
  - server routes and behaviour (merged and reviewed; report gaps instead);
  - Render config and Resend setup (P1-G);
  - client setup docs (P1-F);
  - visual redesign (D-016 copy stands).
If the work appears to need anything outside this, stop and report rather than widen scope.

## Verification (run against current main at hand-back; rebase first if main moved)
    T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Expected: web 22 files / 221 (baseline) + yours; server 18 files / 114 (baseline) + your e2e. Report both. Unexplained movement in the baselines is a finding.
Demo bundle proof: `env -i PATH="$PATH" HOME="$HOME" npm run build && grep -rl "/api/" dist || echo "no /api in demo bundle"` must print the echo line. Then `npx vite preview` and load /projects: the demo banner is present, the seeded projects render, and the browser devtools network tab shows no /api requests. If you have no browser, `curl` the preview and say so.
Live smoke: create `supa_test_p1e_dev`, run `npm run db:migrate` against it, then `VITE_DATA_SOURCE=http npm run build && npm run build:server`. Start `npm start` with PUBLIC_URL=http://localhost:3999 PORT=3999 REGISTRATION_ALLOWLIST set to an address you choose EMAIL_PROVIDER=console and a 32+ character BETTER_AUTH_SECRET generated in the shell (never printed). In a browser if you have one, otherwise via the e2e test:
- register;
- open the verification link from the console;
- log in;
- create a project;
- issue a token;
- refresh, and confirm the token list shows the masked suffix only.
Paste what you saw. Stop the server and drop the database.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must print nothing at hand-back.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-e-web-wiring to StephenForte/supa-agent-tracker. Commit subjects start with "P1-E: ".
H2. Open the PR yourself (gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-e-web-wiring -t "P1-E: Wire the web app to the real server" -F <body file in $T>). Body: contract-to-endpoint mapping table, polling design, build switch, every contract/domain change, disabled controls, verification evidence, the return block. Do not merge it.
H3. Wait for CI on the PR head (all jobs); fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown per the header (processes, databases, clone), then end with the return block as your final message, inside one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-E — Wire the web app to the real server
    LINE OF WORK: p1-e-web-wiring
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <web and server test counts; builds; demo-bundle grep; demo preview check; live smoke; leftover-DB check; CI jobs> (run against main @ <sha> at hand-back)
    MIGRATION:   none
    SHARED FILES TOUCHED: <every file outside src/data/http, src/pages/auth, src/pages/settings, src/features/tokens, server/e2e — what and why>
    IDENTIFIERS USED:     p1-e-web-wiring; src/data/http/**; VITE_DATA_SOURCE (demo|http); 7 s polling; server/e2e/**
    EXISTING CHECKS MODIFIED: <path — before → after; why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-e; processes stopped: <PIDs or none>; clone-scoped process check output: <empty or listed>; scratch databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <contract changes beyond outcome 6; server gaps found; disabled controls>
    RESIDUAL GAPS:       what was verified in a real browser vs by tests; the surface and model you actually ran in; wall-clock time
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below authorises fixing CI and review-bot findings on this PR only. It does not authorise widening scope, editing files outside the Scope section, editing server code, editing planner-owned files, touching other databases, weakening or skipping checks, or deciding anything listed under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
