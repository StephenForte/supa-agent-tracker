DISPATCH · Model: Sonnet 5.5 (mostly documentation against a finished, reviewed API, plus one small dependency-free script; the risk is inaccuracy, which the tests and the planner's review check against the real server) · Order: Phase 1 wave 5, parallel with P1-G1 (no shared files). P1-C1, P1-D2 and P1-E are merged.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: current tip of main (89c826a at time of writing). Rebase onto the current tip of main before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 1–2 h. Report wall-clock in RESIDUAL GAPS.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-f, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: one PR into main.
Teardown: after the PR is pushed and CI is green: stop every process you started and run the clone-scoped process check in AGENTS.md "Workspace and process hygiene"; drop every database you created; delete the clone; end your session. Report all of it on the CLONE line.
Deploy note: main auto-deploys the static demo with no env vars (D-028). Your in-app changes must keep the demo build free of `/api` references, and the bundle grep below proves it.

# P1-F — Reporting protocol, client setup guides and the heartbeat adapter

The server speaks MCP with 12 tools, and the web app is live-capable. What's missing is everything an agent operator needs to actually connect:
- a canonical **reporting protocol** (which tool to call when, with what, and how to retry);
- a paste-ready **base prompt** for agents;
- **setup guides** for the three pilot clients, built on the paths P1-A2 proved live;
- the in-app **Integration setup** page showing real instructions instead of Phase 0 placeholders;
- a small **heartbeat adapter** that client hooks can run, so liveness doesn't depend on the model remembering (PRD R7).

Real-client verification against the deployed service happens in P1-G2 (operator-driven, like P1-A2). This task makes the guides correct against the local server; it doesn't claim any client works in production.

## Line of work
Branch p1-f-integrations from the current tip of main. PR title: "P1-F: Reporting protocol, setup guides and heartbeat adapter". Pre-assigned, overriding any convention you'd pick (if one looks wrong, stop and ask):
- docs: docs/integrations/reporting-protocol.md, docs/integrations/base-prompt.md, docs/integrations/cursor.md, docs/integrations/claude-desktop.md, docs/integrations/grok-bot.md (all new). Leave docs/integrations/compat-matrix.md unchanged; the planner updates it after P1-G2.
- adapter: adapters/heartbeat/heartbeat.mjs plus adapters/heartbeat/README.md (new)
- run-id handoff file (D-029): `.supa/run-id` in the agent's workspace root, holding one run id and nothing else
- adapter env vars (fixed names): `SUPA_MCP_URL` (full `https://…/mcp`), `SUPA_MCP_TOKEN`, and optionally `SUPA_RUN_ID_FILE` (default `.supa/run-id`)
- no server changes, no migration, no new dependencies (the adapter uses Node 24 built-in `fetch` only)

## Step 0 — get your own clone (do this first, before reading or running anything)
    pwd
If /Users/stephenforte does not exist on this machine, stop and report. Otherwise, if the path above contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-f, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-f && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-f
    cd /Users/stephenforte/src/supa-agent-tracker-p1-f
    pwd
The final pwd must print /Users/stephenforte/src/supa-agent-tracker-p1-f before anything else. If the clone path exists, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
Confirm Postgres: /Applications/Postgres.app/Contents/Versions/latest/bin/pg_isready -h localhost -p 5432 → "accepting connections", else stop and report. Never start, stop or reconfigure it.

## Read first (they govern; trust them and the repo over this brief)
- AGENTS.md; docs/api.md "MCP (P1-C1)" and the step-tool additions (P1-D2): exact tool names, fields, errors, caps, the rate limit, idempotency and the heartbeat revision rule.
- docs/prd/PRD-v0.6.md "Integration deliverables" (including "Base instruction draft"), "Validation by workload", "Tools-used subtable", "Agent next steps", "Private user notes".
- docs/plan/DECISIONS.md D-018 (bearer tokens; clientInfo is metadata only), D-023, D-024, D-026, D-028, D-029 (tool usage at check-out; adapters heartbeat only; run-id file).
- docs/plan/p1-a2-results.md: the **only** evidence for client setup paths. Cursor uses `url` + `headers.Authorization` in `~/.cursor/mcp.json`. Claude Desktop uses Customize → Connectors → Add custom connector → "No sign in" + request header (a limited beta that may be missing on some accounts). Grok Bot uses the connector **settings** screen header field, never chat, and goes through an `mcp-remote` bridge.
- docs/integrations/compat-matrix.md (vendor doc links read 2026-10-15).
- src/domain/integrations/examples.ts, src/domain/integrations/agentContext.ts, src/features/integrations/IntegrationsPanel.tsx, src/app/useDemoAccount.ts, src/data/runtime.ts.
If you think the approach is wrong, argue it in DECISIONS NEEDED with evidence instead of half-implementing it.

## Outcomes
1. **docs/integrations/reporting-protocol.md**: the canonical protocol, written against the real tools (all 12, by exact name):
   - session start: `get_project` (read the reporting policy and open To Dos), then `check_in` with every PRD-required field. Record the returned run id and revision, and write the run id to `.supa/run-id` (D-029). Coding runs need `task_id`.
   - during work: `update_status` on meaningful change (blocker, review-ready, PR link), always with the latest revision. On `conflict`, re-read via the returned `current` and retry once with a new request_id.
   - liveness: `heartbeat` (doesn't change the revision, D-024), sent by the adapter if one is installed, otherwise by the agent at natural pauses. State the project's stale threshold rule.
   - tool usage: reported once, batched in `check_out` (`tools`), only for calls actually observed; never inferred counts (D-029, PRD).
   - next steps: `list_next_steps` before `create_next_step` (no duplicates); edit only your own steps; `reorder_next_steps` only as a dispatcher (D-023); `set_waiting_note` for in-flight work elsewhere.
   - end: `check_out` with outcome, completion summary, PRs or `no_pr_reason`; then delete `.supa/run-id`.
   - subagents: report their own run with `parent_run_id` if they have the tools; otherwise the parent reports for them.
   - failure rules: retry with the **same** request_id, keep pending reports, never block the user's work on reporting, never claim success that didn't happen, never put secrets in messages.
   - a short table of every error code and what the agent should do.
2. **docs/integrations/base-prompt.md**: one paste-ready block, under 300 words, for agent instructions, rules files or bot settings. It implements the protocol above and names no client-specific UI.
3. **Setup guides** (cursor.md, claude-desktop.md, grok-bot.md). Each covers:
   - prerequisites: an issued token scoped to the project (link to the in-app token page), and the server URL `https://<your tracker host>/mcp`;
   - exact configuration taken from p1-a2-results.md, with the token as an obvious placeholder (never a real-looking value);
   - where the base prompt goes for that client;
   - heartbeat adapter wiring where the client supports hooks (Cursor: hooks file and events, per its current docs; Claude Desktop and Grok Bot: say plainly that no hook path is known, so heartbeats rely on the agent);
   - the known limitations from P1-A2: Claude's request header is a limited beta; Grok must use the settings screen, not chat; Grok presents as Cursor; model is often unknown, so leave it out rather than guess;
   - a "Verified" line: "Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)".
   Cite vendor docs by the links in compat-matrix.md. Don't invent UI paths that P1-A2 didn't observe; if a step is unverified, say so.
4. **In-app Integration setup page** (src/domain/integrations/**, src/features/integrations/**): replace the Phase 0 placeholders with the real per-client setup, rendered from the same facts as the guides.
   - http mode: show the MCP URL as `${window.location.origin}/mcp` with a copy button, link to the tokens page, and show the base prompt with copy. Never embed or prefill a token.
   - demo mode: the same content with the URL shown as `https://<your tracker host>/mcp`, and the demo's existing "Not connected · Not tested" status, unchanged.
   - The status line per client reads as in outcome 3. No "Connected" state: the server doesn't track per-client connection.
   - The demo bundle must stay free of `/api` (Verification).
5. **adapters/heartbeat/heartbeat.mjs**: a zero-dependency Node 24 script that client hooks call.
   - Read `SUPA_MCP_URL` and `SUPA_MCP_TOKEN` from the environment only (never argv), and the run id from `SUPA_RUN_ID_FILE` / `.supa/run-id`. If the file is missing or empty, exit 0 without any network call.
   - Throttle to at most one heartbeat per 60 s per run id, using a timestamp file next to the run-id file.
   - Speak plain JSON-RPC over `fetch`: `initialize` (capture `mcp-session-id`), `notifications/initialized`, `tools/call heartbeat` with a fresh `request_id`, then `DELETE` the session. Send `Authorization: Bearer` and the `Accept` header the server requires, and no `Origin` header (the server rejects it).
   - Always exit 0, with a 10 s overall timeout, so a hook never blocks or fails the agent. Write one short status line to stderr, and **never** print the token, the URL query or response bodies.
   - Never create runs, report tool usage or change status.
   adapters/heartbeat/README.md: install, env setup (`chmod 600` env file pattern; never commit tokens), the throttle, and what it doesn't do.
6. **Lint/typecheck**: adapters/**/*.mjs pass `npm run lint`. Additive eslint config for Node globals is allowed. Keep both typecheck configs green.
7. **Tests**:
   - server/e2e/heartbeat-adapter.test.ts: real server with `buildApp` on port 0 and a scratch DB; issue a token, check in over /mcp, write the run id to a temp `.supa/run-id`, then spawn `node adapters/heartbeat/heartbeat.mjs` with env. Assert:
     - exit code 0;
     - a heartbeat event recorded and the run revision unchanged;
     - a second spawn within 60 s makes no request (no new event);
     - no run-id file → exit 0 and no request;
     - wrong token → exit 0, no event, and the token absent from stdout/stderr;
     - an ended run → exit 0 and the run still ended.
   - web tests for the integration page: http mode shows the origin-based URL, links to tokens and contains no `sat_` value; demo mode shows the placeholder host and the unchanged status.
   - a doc-accuracy test, or a scripted check in the test file: every tool name mentioned in reporting-protocol.md and base-prompt.md exists in the server's tools/list, and all 12 tools appear in reporting-protocol.md.

## The traps
1. **Docs that drift from the server.** A protocol doc naming a field the server rejects (strict schemas return `validation_error`) means every agent following it fails on day one. Write from docs/api.md and the code, and let the tool-name test catch drift.
2. **A token leaking through the adapter.** Hooks run in shells that log, so argv, error messages and response dumps all end up in transcripts. Env only, fixed redacted status lines, and the wrong-token test checks the output.
3. **A hook that breaks the agent.** A non-zero exit or a hang in a hook can block the agent's turn. Always exit 0 within 10 s.
4. **Claiming verification that didn't happen.** The guides are probe-verified only. Say "production verification pending" until P1-G2 records it.

## Must hold
- No edits to server/** (except server/e2e/heartbeat-adapter.test.ts), render.yaml, package.json dependencies, docs/plan/**, docs/prd/**, AGENTS.md, docs/integrations/compat-matrix.md.
- Web tests: the baseline stays green; changes to existing integration-page assertions are declared (the page content is expected to change).
- The demo bundle still contains no `/api` (Verification).
- Existing checks not weakened, skipped or deleted.

## Scope
- Freely changeable: docs/integrations/{reporting-protocol,base-prompt,cursor,claude-desktop,grok-bot}.md (new), adapters/** (new), src/domain/integrations/**, src/features/integrations/**, server/e2e/heartbeat-adapter.test.ts (new), their tests.
- Additive only: eslint config (Node globals for adapters), src/pages/settings/SettingsPage.tsx (only if the integrations tab needs wiring).
- Out of scope, with reasons:
  - server or MCP changes (merged and reviewed; report gaps instead);
  - adapter-captured tool telemetry (D-029: deferred);
  - OAuth (D-018);
  - real-client production testing and compat-matrix updates (P1-G2, operator-driven);
  - Claude Code / Codex / other clients (PRD: later targets).
If the work appears to need anything outside this, stop and report rather than widen scope.

## Verification (run against current main at hand-back; rebase first if main moved)
    T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Expected: web 27 files / 247 (baseline) + yours; server 19 files / 115 (baseline) + yours. Report both. Unexplained movement is a finding.
Demo bundle: `env -i PATH="$PATH" HOME="$HOME" npm run build && grep -rl "/api/" dist || echo "no /api in demo bundle"` must print the echo line.
Adapter by hand: against the compiled server on a scratch DB with a real issued token and a checked-in run, run the adapter twice. Paste the stderr lines (no token) and the run's event count before and after.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must print nothing at hand-back.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-f-integrations to StephenForte/supa-agent-tracker. Commit subjects start with "P1-F: ".
H2. Open the PR yourself (gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-f-integrations -t "P1-F: Reporting protocol, setup guides and heartbeat adapter" -F <body file in $T>). Body: doc list, what each guide claims and its evidence, adapter behaviour, verification evidence, the return block. Do not merge it.
H3. Wait for CI on the PR head (all jobs); fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown per the header (processes, databases, clone), then end with the return block as your final message, inside one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-F — Reporting protocol, setup guides and heartbeat adapter
    LINE OF WORK: p1-f-integrations
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <web and server test counts; builds; demo-bundle grep; adapter by-hand output; tool-name doc check; leftover-DB check; CI jobs> (run against main @ <sha> at hand-back)
    MIGRATION:   none
    SHARED FILES TOUCHED: <every file outside docs/integrations, adapters, src/*/integrations, server/e2e — what and why>
    IDENTIFIERS USED:     p1-f-integrations; adapters/heartbeat/heartbeat.mjs; SUPA_MCP_URL; SUPA_MCP_TOKEN; SUPA_RUN_ID_FILE; .supa/run-id
    EXISTING CHECKS MODIFIED: <path — before → after; why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-f; processes stopped: <PIDs or none>; clone-scoped process check output: <empty or listed>; scratch databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <unverified UI paths; Cursor hook events chosen and why; other>
    RESIDUAL GAPS:       what was verified against the local server vs. only documented; the surface and model you actually ran in; wall-clock time
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below authorises fixing CI and review-bot findings on this PR only. It does not authorise widening scope, editing files outside the Scope section, editing server code, editing planner-owned files, touching other databases, weakening or skipping checks, or deciding anything listed under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
