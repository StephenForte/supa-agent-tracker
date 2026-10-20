DISPATCH · Model: Sonnet (one pinned dependency bump; the risk is SDK behaviour drift on the MCP endpoint, covered by the existing suites and the probe) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 35dd440 (security scans merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; expect 30-60 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-k, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-k-mcp-sdk-1-32 → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-K — Upgrade @modelcontextprotocol/sdk 1.31.0 → 1.32.1 (GHSA-22jm-h49p-29qw)

## Why (operator, 2026-10-20)
A scanner (PatchHog) reported CVE-2026-111767 against package-lock.json:12: "@modelcontextprotocol/sdk@1.31.0 — Experimental tasks were not tied to the session that created them … Upgrade to 1.32.0 or later."

## Evidence (planner, 2026-10-20; trust the repository over this)
- GitHub advisory GHSA-22jm-h49p-29qw: severity **high** (the scanner said low), affects @modelcontextprotocol/sdk >= 1.24.0 < 1.32.0, first patched 1.32.0.
- main 35dd440: package.json pins "@modelcontextprotocol/sdk": "1.31.0" (exact), and package-lock.json resolves node_modules/@modelcontextprotocol/sdk to 1.31.0.
- npm: 1.32.0 exists, and dist-tag latest is 1.32.1. spike/mcp-probe/package.json already pins 1.32.1.
- Exposure: `git grep -iE 'taskStore|experimental.*task' -- server` finds no use of the experimental tasks feature. So we are probably not exploitable, but we're in the vulnerable range, and the fix is a patch-level bump.

## Read first
AGENTS.md; server/mcp/routes.ts (McpServer + StreamableHTTPServerTransport, session map); the SDK's release notes or changelog for 1.32.0 and 1.32.1 (GitHub: modelcontextprotocol/typescript-sdk releases). List anything that touches the server, transport, session or auth behaviour in your PR body.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-k, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-k && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-k
    cd /Users/stephenforte/src/supa-agent-tracker-p2-k && git checkout -b p2-k-mcp-sdk-1-32 origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-K", title "P2-K: MCP SDK 1.32.1 security upgrade", workload_type "coding", task_id "P2-K" and a fresh request_id.
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
Branch p2-k-mcp-sdk-1-32. PR title "P2-K: Upgrade MCP SDK to 1.32.1 (GHSA-22jm-h49p-29qw)". Commit subjects start with "P2-K: ". No migrations. Don't edit docs/plan/**.

## Outcome
1. package.json pins "@modelcontextprotocol/sdk": "1.32.1" (exact, same style as today), and package-lock.json resolves it to 1.32.1. Use `npm install @modelcontextprotocol/sdk@1.32.1 --save-exact`.
2. The lockfile diff is limited to the SDK and whatever transitive changes it brings. List them in the PR body. No unrelated upgrades: don't run `npm update` or `npm audit fix`.
3. `npm ls @modelcontextprotocol/sdk` shows a single 1.32.1 (no 1.31.x left in the tree).
4. MCP behaviour is unchanged for clients: initialize, tools/list (same tool names), a tool call, the bad-token 401 with the same WWW-Authenticate header, and session handling all behave as on main.

## Scope
- Free: package.json (this one dependency line), package-lock.json.
- Changeable only if the upgrade forces it: server/mcp/** for a compile or API break in the SDK. Explain each such change in the PR, citing the release note.
- Don't touch: anything else, including spike/mcp-probe (already on 1.32.1), server/app/auth-context.ts, or other dependencies.
- If the upgrade needs changes beyond a small, release-note-backed SDK API adjustment, stop and report rather than widen scope.

## The trap
"Tests pass" isn't the whole proof here. An SDK bump can change wire behaviour (session id headers, error shapes, the protocol version negotiated) that unit tests with mocked clients don't see, and the real clients (Cursor, Claude Code, Codex, Claude Desktop, Grok Bot) are what break. The CI mcp-probe job and the server MCP integration tests exercise the real transport. Both must be green, and you must also run one real round trip yourself (see Verification). Don't change or skip any test to make the bump pass. If one fails, that's a finding: stop and report it with the failing output.

## Coverage
- No new tests are required. Existing MCP integration tests and the probe are the regression net. If a release note names a behaviour change we rely on, add a test that pins it.
- Mutation check: not applicable to a version bump. Instead, run the server MCP tests once on main (1.31.0) and once on your branch (1.32.1), and report both counts. They must match.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
    npm ls @modelcontextprotocol/sdk
Baseline on main 35dd440: 75 files / 532 tests (planner measurement at P2-J; PR #71 added no tests). Report your counts. Unexplained movement is a finding.
Real round trip: start the built server locally against a scratch database, create a user and a token the way the existing MCP integration tests or the probe do, then run spike/mcp-probe (or an equivalent SDK client) against http://localhost:<port>/mcp: initialize, list tools, call list_projects, and send one bad-token request. Paste the outputs, with the token redacted, into the PR.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Out of scope
- Any other dependency, even if npm audit lists it. Report what `npm audit --omit=dev` says after the bump, but don't fix it.
- Using or enabling the experimental tasks feature.

## Decisions
None open for you. If 1.32.1 breaks something that 1.32.0 doesn't, say so in DECISIONS NEEDED and stop. Don't silently fall back to 1.32.0.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-k-mcp-sdk-1-32.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-k-mcp-sdk-1-32 -t "P2-K: Upgrade MCP SDK to 1.32.1 (GHSA-22jm-h49p-29qw)" -F <body file>. The body includes the advisory link, the release-note summary, the lockfile change list, the verification evidence and the round-trip output. Never leave the work only as a pushed branch.
H3. Wait for CI (verify, mcp-probe, Semgrep SAST, Trivy: all are required now) and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-K — Upgrade MCP SDK to 1.32.1 (GHSA-22jm-h49p-29qw)
    LINE OF WORK: p2-k-mcp-sdk-1-32
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts (main vs branch MCP tests); npm ls output; real round-trip results; builds; leftover-DB check; CI jobs incl. Semgrep and Trivy; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <server/mcp changes and why> (or: none)
    IDENTIFIERS USED:     P2-K; branch p2-k-mcp-sdk-1-32; GHSA-22jm-h49p-29qw
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-k; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. real external clients); npm audit --omit=dev summary; surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise upgrading other dependencies, changing or skipping tests, widening scope, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
