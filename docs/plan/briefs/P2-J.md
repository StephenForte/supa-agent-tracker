DISPATCH · Model: Sonnet (UI copy and setup snippets, one small server routing fix; no schema) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 2174b11 (wave 12 docs merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; expect 1-2 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-j, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-j-onboarding → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-J — Onboarding for new users: Codex + Claude Code setup, getting started, bad-token help

## Why (operator, 2026-10-20)
Users 2 and 3 are coming. Three gaps:
1. The operator connected **Codex desktop** (OpenAI) by hand, and it works, but the token page and the integration guide only offer Cursor, Claude Desktop and Grok Bot. Claude Code isn't offered either.
2. A new user lands on Needs me ("Nothing needs you right now") with no next step. The operator wants setup to be "super easy, complete with prompt instructions" (the prompt the worker agents get).
3. With a wrong or revoked token, Cursor offers an OAuth "authenticate" button that's a dead end: we're bearer-only (D-018). Seen in production on 2026-10-19 (PLAN.md log).

## Evidence (planner, 2026-10-20; trust the repository over this)
Codex desktop, verified working by the operator. These are the MCP server form fields, from their screenshot:
    URL: https://supa-agent-tracker-app.onrender.com/mcp
    Bearer token env var: SUPA_AGENT_TRACKER_TOKEN
    Headers: (none)    Headers from environment variables: (none)
Setup today: src/features/tokens/TokenReveal.tsx `snippetsFor()` builds three copy blocks from src/domain/integrations/clientConfig.ts. src/domain/integrations/examples.ts (`IntegrationExample.id: 'cursor' | 'claude-desktop' | 'grok-bot'`) feeds the guide cards in src/features/integrations/IntegrationsPanel.tsx. docs/integrations/ has one page per client.
Base prompt: BASE_INSTRUCTION_DRAFT (src/domain/integrations/agentContext.ts) is generic. It tells the agent to find its project via list_projects by repository match, and to ask the user when there's none or several. IntegrationsPanel shows it with "Copy base prompt".
Bad token, measured against production:
    POST /mcp with a bogus bearer → 401, WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token missing, revoked or mistyped; create a new one in Settings -> MCP tokens."
    GET /.well-known/oauth-protected-resource      → 200 application/json {"resource":"…/mcp","bearer_methods_supported":["header"],"resource_name":"Supa Agent Tracker"}
    GET /.well-known/oauth-protected-resource/mcp  → 200 text/html (the SPA's index.html)
    GET /.well-known/oauth-authorization-server    → 200 text/html (SPA)
    GET /.well-known/openid-configuration          → 200 text/html (SPA)
Cause: server/app/spa.ts serves index.html for any unknown path except those matched by isReservedPath() (/api, /mcp). RFC 9728 clients look up protected-resource metadata for https://host/mcp at /.well-known/oauth-protected-resource/mcp first. Today they get HTML with a 200, and the authorization-server lookups get HTML 200 too, instead of a 404.

## Read first
AGENTS.md; docs/plan/DECISIONS.md D-018 (bearer-only; **keep** the spec-shaped 401 with resource_metadata), D-032 (set-and-forget tokens, project discovery in the prompt). This brief's rules are recorded as D-039 on the planner's docs branch, which isn't on main yet. **This brief is the full spec**, so don't look for D-039 in the repo. Also read: the files named under Evidence, src/pages/needs-me/NeedsMePage.tsx, src/features/tokens/LiveTokensPanel.tsx, server/mcp/routes.ts, docs/integrations/{cursor,claude-desktop,compat-matrix}.md.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-j, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-j && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-j
    cd /Users/stephenforte/src/supa-agent-tracker-p2-j && git checkout -b p2-j-onboarding origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-J", title "P2-J: Onboarding for new users", workload_type "coding", task_id "P2-J" and a fresh request_id.
  - Include harness and model only if you know them.
  - Keep run_id and revision, and write only the run_id to .supa/run-id.
- R2. update_status at each milestone. Always send the latest expected_revision.
  - Gate green.
  - PR opened (pr_references with the PR URL).
  - **Bot review settled:** every automated review comment (Bugbot and similar) on the PR head is fixed or answered, and CI is green. Send a message like "PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>". Send it again if a later push draws new bot comments.
  - Blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown, check_out with:
  - execution_state finished (or failed);
  - work_status waiting_for_review (or blocked);
  - a one-paragraph completion_summary and the PR reference.
  Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure, retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-j-onboarding. PR title "P2-J: Onboarding: Codex and Claude Code setup, getting started, bad-token help". Commit subjects start with "P2-J: ". No migrations. Don't edit docs/plan/**.

## Outcomes
### A. Codex and Claude Code as setup options (token reveal + guide + docs)
1. **Codex (OpenAI).**
   - The one-time token reveal gets a "Codex config" block: the URL, the bearer token env var name SUPA_AGENT_TRACKER_TOKEN, and the line `SUPA_AGENT_TRACKER_TOKEN=<the new token>`.
   - Add a sentence saying where Codex reads that variable from, for the desktop app and for the CLI (~/.codex/config.toml with `[mcp_servers.supa-agent-tracker]`, `url` and `bearer_token_env_var`). Take this from OpenAI's official Codex docs and cite the URLs.
   - The guide card's verifiedLabel is "Production-verified 2026-10-20 (operator, Codex desktop)". If the CLI form comes only from docs, say so on the card.
2. **Claude Code.**
   - The reveal gets a "Claude Code command" block: `claude mcp add --transport http --scope user supa-agent-tracker <mcpUrl> --header "Authorization: Bearer <token>"`. Check the exact flags against Anthropic's Claude Code MCP docs and cite them.
   - The guide card's verifiedLabel is "Not yet verified". Don't claim more.
3. Both get guide cards in integrationExamples() and a docs/integrations/<client>.md page in the style of the existing ones, plus a compat-matrix row.
4. Keep every existing block (Cursor, Claude Desktop, Grok Bot) byte-identical. Grow the id union, and make sure the card grid still fits at 375 px.

### B. Getting started (Needs me, live mode)
1. While the signed-in user has **no runs at all**, /needs-me shows a "Get started" section above the empty state, with three steps. Each shows done or not from real data:
   1. "Create a project". Done when the user has at least one project; links to /projects/new.
   2. "Create an MCP token". Done when the user has at least one active (unrevoked) token; links to /settings/tokens.
   3. "Connect your agent and give it the prompt". Links to /settings/integrations, and has a **"Copy prompt for <project name>"** button for the user's first non-archived project (most recently created). It copies BASE_INSTRUCTION_DRAFT plus one leading line naming that project, for example "Report to Supa Agent Tracker project \"<name>\" (project_id <id>); use that id instead of matching by repository." Disable the button, with a hint, until step 1 is done.
2. Once any run exists, the section disappears and Needs me behaves exactly as today.
3. Demo mode: leave Needs me unchanged.
4. On /settings/integrations, add the same per-project copy beside the existing "Copy base prompt": a project picker (default: the most recently created non-archived project) and "Copy prompt for this project". Keep the existing generic button.

### C. Bad-token help
1. Server:
   - GET /.well-known/oauth-protected-resource/mcp returns the same JSON as /.well-known/oauth-protected-resource (same handler, Cache-Control no-store).
   - Every other /.well-known/* path returns a 404 JSON not_found instead of the SPA HTML (extend the reserved-path check).
   - Don't touch /mcp, the 401 body or the WWW-Authenticate header: D-018 keeps them.
2. UI: the token reveal and the Cursor guide card say: "If Cursor (or another client) shows an Authenticate or Sign in button for this server, the token is wrong or revoked. Don't sign in. Create a new token here and replace it in the client config."
3. Don't claim Cursor stops showing its button. That's client behaviour we can't test in CI. Report what you observed, if you tried it.

## Scope
- Free: src/domain/integrations/**, src/features/integrations/**, src/features/tokens/TokenReveal.tsx, src/pages/needs-me/**, docs/integrations/** (new pages plus additive edits), and tests beside each.
- Changeable, minimal: server/app/spa.ts (reserved paths), server/mcp/routes.ts (the second metadata path only), with server tests for both.
- Read-only use: src/data/** (call existing hooks and clients for projects, tokens and runs; if a needed read doesn't exist, stop and report).
- Don't touch: the /mcp auth path, server/app/auth-context.ts (the 401 and WWW-Authenticate contract, D-018), token storage or hashing, server/db/**, docs/plan/**.
- If an outcome needs anything outside this, stop and report rather than widen scope.

## The traps
- **Tokens leaking.** The plaintext may appear only inside the mounted one-time reveal: never in the guide, the getting-started section, the copied prompt, the URL or storage. The existing reveal tests enforce this, and must stay unmodified. The copied project prompt holds the project id and name only.
- **Claude Code scope.** Without `--scope user`, `claude mcp add` can write to a project-scoped .mcp.json that gets committed with the token in it. The snippet must use user scope, and the docs page must say why.
- **D-018.** "Fixing" the Cursor prompt by deleting resource_metadata from the 401 breaks the OAuth-later path the decision protects. Don't.
- **The catch-all.** The /.well-known/* 404 must not swallow app routes or static assets. Prove /, /needs-me, /register, the manifest and the icons still serve.

## Coverage (properties)
- Reveal: Codex and Claude Code blocks contain the URL and the plaintext. The Claude Code block contains "--scope user". The Cursor, Claude Desktop and Grok Bot blocks are byte-identical to before (snapshot the old strings in the test).
- Guide: five cards; Codex shows the production-verified label and Claude Code shows "Not yet verified".
- Getting started:
  - With no runs: shown, with done flags matching the data (cover 0, 1, 2 and 3 steps done).
  - With one or more runs: absent.
  - The copied prompt starts with the project line and then contains BASE_INSTRUCTION_DRAFT verbatim.
  - The copy button is disabled with no project.
  - Demo mode: unchanged.
- Integrations page: the per-project copy uses the picked project.
- Server:
  - Both protected-resource paths return identical JSON.
  - /.well-known/oauth-authorization-server and /.well-known/openid-configuration → 404 JSON.
  - /mcp with a bad token → the same 401 and header as before.
  - SPA routes and assets still 200.
- Mutation check you run and report: (1) make the getting-started section ignore runs, so it shows after the first run, and confirm red; (2) drop "--scope user" and confirm red; (3) remove the /.well-known reservation and confirm red. Restore after each.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 2174b11: 72 files / 518 tests (planner measurement at P2-I). Report your counts. Unexplained movement is a finding.
Manual, in a real browser against a local live (http) server with a fresh user (desktop and 375×812):
- With nothing created: Get started shows 0/3.
- Create a project: 1/3.
- Create a token: 2/3, and the reveal shows the five blocks.
- Copy the project prompt and paste it into a scratch file in your temp dir to check it.
- Create a run (any MCP client, or the existing MCP probe): Get started disappears.
- curl the four /.well-known paths and /mcp with a bad token; paste the status lines into the PR.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Out of scope
- OAuth of any kind (D-018 defers it).
- One-click "connect" deep links or per-client installers: a later task, once the operator has feedback from users 2 and 3.
- Changing BASE_INSTRUCTION_DRAFT itself, or the reporting protocol.
- Onboarding emails, invite changes.

## Decisions
None open for you. If OpenAI's Codex docs contradict the field mapping above, or you think the getting-started condition (no runs) is wrong, put it in DECISIONS NEEDED with evidence and implement the brief meanwhile.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-j-onboarding.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-j-onboarding -t "P2-J: Onboarding: Codex and Claude Code setup, getting started, bad-token help" -F <body file>. The body includes a summary, the verification evidence (with the curl status lines), and the doc URLs you cited for Codex and Claude Code. Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-J — Onboarding: Codex and Claude Code setup, getting started, bad-token help
    LINE OF WORK: p2-j-onboarding
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; the three mutation results; manual browser walk (0/3 → 3/3 → hidden); curl status lines; builds; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <server files and why> (or: none)
    IDENTIFIERS USED:     P2-J; branch p2-j-onboarding; D-039 (rules from this brief); env var SUPA_AGENT_TRACKER_TOKEN; server name supa-agent-tracker
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-j; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. Claude Code not run, Cursor's button behaviour); surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, touching the /mcp auth path or the 401, exposing the token outside the reveal, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
