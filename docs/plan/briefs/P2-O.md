DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): copy, a pure snippet function and a UI list entry, following the P2-J Codex pattern; the one risk (the token in chat) is pinned by a test · Order: wave 13, now, parallel with P2-M and P2-N (disjoint files).
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 5987a58 (P2-L merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app for the existing server suites in the gate.
Runtime: unmeasured; expect 30–60 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-o, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-o-muse → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-O — Muse as a setup option

## Why (operator, 2026-10-21)
The operator connected Meta Muse to the production tracker by hand, as they did with Codex before P2-J, and Muse has since reported two runs successfully. The app doesn't offer Muse anywhere: not on the one-time token reveal, not in Settings → Integrations, not in docs/integrations. This task adds it. Planner decision D-041 is on the planner docs branch (PR #74), not main, so **this brief is the full spec**.

## Muse facts (operator-reported 2026-10-21; trust these over guesses, and invent nothing beyond them)
- Muse app on macOS. Product page: https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/ (already cited in docs/prd/PRD-v0.6.md).
- There's no MCP connector screen. The user asks the main Muse bot, in chat, to add the MCP server. The bot asks for the server URL and the auth method, then collects the token through a **masked field labelled "API Key"** (similar to Grok Bot's masked secret).
- Two Muse runs checked in and reported fine against production. The tracker accepts only Authorization: Bearer, so Muse sent the API Key as a bearer token. That's inferred; the exact wording of Muse's auth-method choices wasn't recorded, so the guide says "choose the API key / bearer token option" and doesn't quote a label.
- Unknown and not to be invented: Muse version, hooks, subagent inheritance, model identity, the harness string Muse reports. Say "not verified" where a guide section would need them.

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-018 (bearer-only), D-032 (set-and-forget tokens). P2-J is the pattern to follow: `git show 0c2d140` (Codex and Claude Code added across clientConfig, examples, TokenReveal, IntegrationsPanel, docs). Files: src/domain/integrations/{clientConfig,examples}.ts (+tests), src/features/tokens/TokenReveal.tsx, src/features/tokens/{tokenReveal.setup.test.tsx,tokens.test.tsx}, src/features/integrations/{IntegrationsPanel.tsx,integrations.test.tsx}, src/domain/integrations/examples.test.ts, docs/integrations/{grok-bot,codex,compat-matrix,base-prompt}.md.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-o, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-o && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-o
    cd /Users/stephenforte/src/supa-agent-tracker-p2-o && git checkout -b p2-o-muse origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-O", title "P2-O: Muse setup option", workload_type "coding", task_id "P2-O", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-o-muse, cut from origin/main. PR title "P2-O: Muse setup option". Commit subjects start with "P2-O: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).

## Pre-assigned identifiers
- Decision: D-041 (planner-written; cite it). Integration id: 'muse', display name "Muse". New guide: docs/integrations/muse.md. No migration.

## Outcomes
1. **Setup message, no token.** Add museSetupMessage(mcpUrl) in src/domain/integrations/clientConfig.ts: a short message the user pastes into the Muse chat asking the bot to add a remote MCP server named supa-agent-tracker at that URL with API key / bearer token auth, and saying the key will be entered in the secure field, not in chat. It takes no token argument.
2. **Token reveal.** A "Muse setup message" block with a "Copy Muse setup message" button, plus a line under it: paste the token only into Muse's masked "API Key" field, using the Copy button at the top of this reveal. Place it after Grok Bot. Every other snippet stays byte-identical.
3. **Integrations.** examples.ts gains a 'muse' entry after 'grok-bot': name "Muse", verifiedLabel "Production-verified 2026-10-21 (operator, Muse macOS app)", instructions covering the chat-driven setup, the masked API Key field, the base or per-project prompt placement ("guidance"), heartbeats at natural pauses since no hook path is known, and "set harness from runtime knowledge; omit model when unknown"; the example shows museSetupMessage with the placeholder URL replaced like the others; docs links: the Muse product page above. Extend the IntegrationExample id union.
4. **Docs.** docs/integrations/muse.md in the grok-bot.md shape (Verified line, prerequisites, steps, what's unknown, sources). A compat-matrix "Production verification" row for Muse (2026-10-21, Muse macOS app, chat-driven setup + masked "API Key", two runs reported by the operator; harness/model/hooks/subagents not verified). Add Muse to the README or integration index only if one already lists every client.

## The trap
- **The token in chat.** Grok's snippet carries the token because it goes into a masked field. Muse's setup happens through a chat with the bot, so a snippet that includes the token gets pasted into the conversation transcript, where it's stored and can be replayed or quoted. Required test: museSetupMessage output never contains the token (call the reveal with a known plaintext and assert the Muse textbox value doesn't include it), and the function signature takes no token.
- **Byte-identical neighbours.** Tests pin the Cursor, Claude Desktop, Grok Bot, Codex and Claude Code blocks exactly. Changing their text or order breaks setups people have already copied; only append.

## Must survive
The one-time reveal rule (plaintext only while the reveal is mounted), BAD_TOKEN_HELP, every existing snippet byte-for-byte, the per-project prompt copy, demo-mode "Not connected · Not tested" status.

## Coverage (as properties)
The name list in examples.test.ts and integrations.test.tsx includes Muse in position 4 (after Grok Bot); the Muse block and copy button render on the reveal; copying it writes exactly museSetupMessage(url); the Muse text contains the deployment MCP URL; the no-token assertion above.

## Out of scope (with reasons)
- server/** — nothing server-side changes; Muse already works against production.
- One-click connect or installers — deferred by D-039.
- Muse hooks/adapters — no known hook path.
- src/pages/public/**, src/pages/settings/**, src/data/** — P2-N is editing them now.

## Scope
- Owns: docs/integrations/muse.md (new), src/domain/integrations/** (clientConfig, examples and their tests).
- Add only: src/features/tokens/TokenReveal.tsx and its tests, src/features/integrations/** (tests; the panel only if the list rendering needs it), docs/integrations/compat-matrix.md (one row + one source line).
- Must not touch: server/** (P2-M), src/pages/public/**, src/pages/settings/**, src/data/**, src/app/routes.tsx (P2-N), docs/plan/**, docs/prd/**, package*.json.
## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the Contract, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-o-muse to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-o-muse -t "P2-O: Muse setup option" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-O — <one line>
    LINE OF WORK: p2-o-muse
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-o (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
