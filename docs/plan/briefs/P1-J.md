DISPATCH · Model: Opus (an authorization-scope change across four enforcement sites, plus a migration and plaintext-handling UI) · Order: now, alone; no other worker is running.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 529f112 (includes PR #47, which put D-032 on main). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured. Expect roughly 2–4 h (migration + server + UI + docs). Note your wall-clock on RESIDUAL GAPS.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-j, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p1-j-token-scope → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P1-J — "All my projects" tokens, editable scope, project discovery in the prompt, Copy config

## Read first (trust the repository over this brief)
- docs/plan/DECISIONS.md: D-032 (this task), plus D-018 and D-024 (token scope and format) and D-029 (the base prompt's .supa/run-id rules, which must survive).
- docs/plan/PLAN.md: the P1-J row.
- AGENTS.md: the commit contract and the clone-scoped process check.
- docs/integrations/compat-matrix.md: the "Production verification (P1-G2)" table. That's the evidence for the guide and label updates.
Everything below about the code is a snapshot from main at 529f112. Where the repository disagrees, follow the repository and say so in your report.

## Why
The operator ran all three clients against production on 2026-10-16 (PRD scenario 20 met). Two findings:
1. A token is scoped to a fixed list of projects, so each new project needs a token edit or a new token. The operator's words: the token "should just work for new projects too", and project discovery "can be baked into the agent prompts". That's D-032.
2. Hand-editing ~/.cursor/mcp.json was too hard ("normal people will not be able to do this"). The one-time token reveal should hand out a ready-to-paste config per client.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-j, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-j && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-j
    cd /Users/stephenforte/src/supa-agent-tracker-p1-j && git checkout -b p1-j-token-scope origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Line of work and identifiers (pre-assigned; they override any "next number" convention)
- Branch p1-j-token-scope. PR title "P1-J: All-projects tokens, editable scope, prompt discovery, Copy config". Commit subjects start with "P1-J: ".
- Migration: server/db/migrations/0004_token_all_projects.sql. 0001–0003 exist on main and 0004 is free. If 0004 is taken when you start, stop and ask. Don't renumber.
- No new decision ids. Don't edit docs/plan/**; the planner owns it.

## How scope works today (snapshot; verify)
- Tables: mcp_credentials (id, user_id, label, token_hash, display_suffix, created_at, last_used_at, revoked_at, revision) and mcp_credential_projects (credential_id, project_id, user_id), with composite FKs binding both to the same owner.
- Bearer auth runs on **every** MCP request. server/tokens/auth.ts authenticateBearer → server/repo/credentials.ts authenticateCredentialHash returns the grant list, and server/mcp/routes.ts puts it into Access.projectIds for that request. So no scope is cached per session.
- Grants are enforced at four sites that each read mcp_credential_projects directly:
  1. server/repo/access.ts withProject: the in-memory access.projectIds check, then the owner check, then the grant row (FOR SHARE);
  2. server/repo/projects.ts listProjects: an EXISTS on grants;
  3. server/repo/idempotency-keys.ts effectiveProjects / checkSavedScope: the scope snapshot, so a replay after narrowing is forbidden;
  4. server/repo/credentials.ts summary(): the grant list returned by auth and the token API.
- Token API (server/tokens/routes.ts): issue `{label, project_ids, request_id}`, plus rotate and revoke. Rotate copies label and projectIds into the replacement. There's no way to edit scope.
- UI: src/features/tokens/LiveTokensPanel.tsx (create dialog with project checkboxes; the plaintext lives only in the mounted dialog) and TokenReveal.tsx (a single Copy button). Data contract: src/data/contracts.ts, http tracker, and the mock store (used by the demo build, D-028).
- Base prompt: the same text exists as BASE_INSTRUCTION_DRAFT in src/domain/integrations/agentContext.ts and in docs/integrations/base-prompt.md. Tests tie them together (server/e2e/heartbeat-adapter.test.ts, src/features/integrations/integrations.test.tsx).
- Verified labels: src/domain/integrations/examples.ts has one VERIFIED_CONFIGURATION_LABEL ("Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)") for all clients. server/e2e/heartbeat-adapter.test.ts requires each guide to contain its client's verifiedLabel and example. The planner broke CI editing a guide alone, so change labels and guides together.

## Outcomes
1. **All-projects scope (data + enforcement).** A token can have scope "all my projects": it authorizes every project the token's owner owns now **or creates later**, and never anything else. Migration 0004 records it on mcp_credentials, e.g. `all_projects boolean NOT NULL DEFAULT false`. Existing tokens keep exactly their current grants; nothing is silently widened. Update the Drizzle schema and server/db/schema.test.ts to match. All four enforcement sites honour it. Suggested approach (argue with evidence if you'd do it differently):
   - auth resolves an all-projects token's projectIds to the owner's current project ids on each request;
   - every database recheck accepts "credential row is all_projects and project.owner_id = token user" in place of a grant row, read under the same locks;
   - the grant rows of an all-projects token are deleted, so the two modes can't disagree.
   Revocation, owner binding, revision checks, lock order (access.ts comment) and the idempotency scope rule stay exactly as strict.
2. **Issue, rotate, edit.** Issue accepts `all_projects` (boolean). Choose the API default and justify it, but the UI default is "All my projects". With all_projects true, project_ids must be empty (validation_error otherwise). Rotate carries all_projects to the replacement. Add an owner-only, revision-checked, idempotent scope edit, e.g. `POST /api/tokens/:id/scope {request_id, expected_revision, all_projects, project_ids}`, which switches between all and a specific list without re-issuing the plaintext. A revoked token → validation_error. A conflict returns the current token like the other actions. tokenView exposes the mode. Update docs/api.md.
3. **UI.**
   - Create dialog: "All my projects (including future ones)" selected by default; "Specific projects" reveals the checkboxes.
   - Token cards show the mode ("All my projects" or the project names) and an "Edit scope" action with the same two choices.
   - Keep the http and mock data sources and the demo build working.
4. **Copy config in the one-time reveal.** Alongside the existing Copy, offer a per-client ready-to-paste config with the real token and this deployment's MCP URL (the same URL IntegrationsPanel passes to integrationExamples):
   - Cursor: the complete mcp.json `mcpServers` object;
   - Claude Desktop: URL plus header name/value as the connector form asks;
   - Grok Bot: URL plus the secret value for its masked field.
   The token stays shown-once: the snippets live only in the mounted dialog, like the plaintext today. In demo mode they use the fake token and keep the fake-token warning.
5. **Discovery in the prompt (D-032).** Change BASE_INSTRUCTION_DRAFT and docs/integrations/base-prompt.md identically, and add the rule to docs/integrations/reporting-protocol.md:
   - call list_projects and match this workspace's repository (git remote URL or owner/name) against each project's repository_url / repository_name;
   - exactly one match → use it;
   - none or several → ask the user once, then keep the answer for the session;
   - nobody to ask → do the work without reporting (the existing never-block rule).
   Keep every other instruction, including all of D-029's .supa/run-id rules. Confirm list_projects returns repository_name/repository_url over MCP; if it doesn't, stop and report rather than widening scope.
6. **Production labels and guides, together.**
   - Give each client its own verified label, e.g. "Production-verified 2026-10-16 (P1-G2)", with a client detail where compat-matrix records one (Cursor 3.25.6).
   - Update docs/integrations/cursor.md, claude-desktop.md and grok-bot.md so each contains its label.
   - Correct any guide or examples.ts instruction that the production table contradicts. Example: Grok's own setup offered a masked secret field, which kept the token out of chat; the current text says never to use chat-driven setup.
   - Mention the new scope choice and Copy config in the guides.
   - Don't edit compat-matrix.md.

## The trap
Scope is enforced at four independent sites, and each one fails differently if missed:
- Miss withProject or the in-memory projectIds check: an all-projects token lists a new project, then gets not_found on check_in. That's a silent "reporting doesn't work" in production.
- Miss the idempotency snapshot: a narrowed token can replay a response for a project it lost.
- Resolve "all" by anything other than owner: another user's projects leak. That's a tenant breach.
Write each property as a test that fails on the unfixed site.

## Must hold (tests as properties, each shown failing before the fix where that's possible)
- An all-projects token: sees and can check in to a project created **after** the token was issued, on the next request of an already-open MCP session (no re-initialize).
- An all-projects token can never see or touch another owner's project, whether through list_projects, get_project, check_in, run ids or parent_run_id.
- Editing all → specific takes effect on the next request of an open session. An idempotent replay of a response for a project that's no longer in scope is forbidden.
- Rotate preserves all_projects. Revoke still ends access immediately.
- Migration 0004 forward on populated data: build a database at 0003 with users, projects, specific-scope tokens with grants, runs and idempotency keys; apply 0004; existing tokens are all_projects=false with grants and behaviour unchanged.
- The plaintext and the config snippets never reach idempotency_keys, logs, the query cache or web storage. Extend the existing copy-once tests to cover the snippets.
- Existing checks are not weakened, skipped or deleted. Expected changes: the examples.test.ts single-label assertion becomes a per-client exact assertion (a strengthening), and the prompt-literal tests follow the new text. Declare each one on EXISTING CHECKS MODIFIED with before → after.

## Scope
- Free: server/db/migrations/0004_token_all_projects.sql (new), server/repo/credentials.ts, server/tokens/**, src/features/tokens/**, src/domain/integrations/**, src/domain/tokens/**, docs/integrations/{base-prompt,reporting-protocol,cursor,claude-desktop,grok-bot}.md, docs/api.md, and tests for all of these.
- Change only where scope enforcement or the token shape requires it: server/db/schema.ts, server/db/schema.test.ts, server/repo/access.ts, server/repo/projects.ts, server/repo/idempotency-keys.ts, server/app/auth-context.ts, server/mcp/** (only if the access wiring needs it), src/domain/types.ts, src/data/** (token parts only), src/features/integrations/** (only to share the MCP URL or snippets).
- Don't touch:
  - docs/plan/** (the planner's);
  - docs/integrations/compat-matrix.md (the planner's production record);
  - render.yaml and anything on Render or production (deploys happen on merge);
  - server/invites/** and server/auth/** (P1-I, merged);
  - adapters/** (unrelated);
  - the GET /mcp 400 behaviour (observed in production, out of scope).
- If the task seems to need anything outside this, stop and report rather than widening scope.

## Out of scope (with reasons)
- Multiple admins, roles and teams: Phase 2.
- An MCP tool that creates projects: discovery only asks the user, per D-032.
- Persisting the chosen project across sessions: not decided; the prompt keeps it for the session only.
- Idempotency-key retention: that's P1-H, after load measurements.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main (planner measurement after P1-I): 51 test files / 392 tests. Report your before/after counts, and explain any unexpected movement.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.
Manual check (say what you exercised):
- run the app locally (http mode, local Postgres) and create an all-projects token; confirm the reveal's Cursor snippet is valid JSON;
- create a project afterwards and confirm list_projects over MCP includes it within the same session;
- edit the scope to specific and confirm the new project disappears on the next call.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-j-token-scope.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-j-token-scope -t "P1-J: All-projects tokens, editable scope, prompt discovery, Copy config" -F <body file>. The body's first line states: "Deploys run migration 0004 on boot (additive column, default false); existing tokens keep their grants." Then add a summary and the verification evidence. Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown, then end with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-J — All-projects tokens, editable scope, prompt discovery, Copy config
    LINE OF WORK: p1-j-token-scope
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts before/after; each Must-hold property red-before/green-after; builds; leftover-DB check; manual check; CI jobs> (run against <sha>)
    MIGRATION:   0004_token_all_projects — <forward-on-populated-data evidence>
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     migration 0004; branch p1-j-token-scope
    EXISTING CHECKS MODIFIED: <path — before → after, and why it's a strengthening> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-j; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <e.g. the API default for all_projects if you think it should differ>
    RESIDUAL GAPS:       <what's unverified; surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence in DECISIONS NEEDED rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, touching other databases, Render or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
