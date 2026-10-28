DISPATCH · Model: Sonnet 5.5 (lockfile-only transitive bump; Haiku would also do) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at bafd3c7 (wave 16 closed). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version) and its bundled npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; expect 20-40 min, mostly the gate and CI.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-y, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-y-body-parser-2-4 → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-Y — Clear Trivy HIGHs: body-parser 2.4.0 (both lockfiles) and undici ≥ 8.12.2, lockfile-only

## Why (operator, 2026-10-28)
PatchHog reported CVE-2026-111181 against package-lock.json:3165: "body-parser@2.3.0 … Denial of Service via trailing bytes after a compressed request body … Upgrade body-parser to 2.4.0 or later." It suggested `npm install body-parser@2.4.0`. **Don't run that**: it adds body-parser as a direct dependency in package.json, which D-010 forbids and which we don't need.

## Evidence (planner, 2026-10-28; trust the repository over this)
- GitHub advisory GHSA-27r3-jxmh-p828: severity **high** (PatchHog said low), affects body-parser >= 2.0.0 < 2.4.0, first patched 2.4.0.
- main bafd3c7: body-parser is **transitive only**: @modelcontextprotocol/sdk → express ^5.2.1 (resolves 5.3.0) → body-parser ^2.3.0 (resolves 2.3.0). One copy in the tree. 2.4.0 is inside express's range, so no override is needed.
- Exposure: the server is Fastify; `git grep -nE "createMcpExpressApp|sdk/server/express" -- server adapters scripts` finds nothing, and no file imports express or body-parser. So it's probably not reachable in production. We bump anyway: we're in range and the fix is lockfile-only.
- Planner dry run (scratch copy, npm 11.20 on Node 26): `npm update body-parser --package-lock-only` changes body-parser to 2.4.0 and leaves package.json unchanged, **but it also added six unrelated `@tailwindcss/oxide-wasm32-wasi/node_modules/*` entries** (npm-version churn). Your diff must not carry those. Use Node 24's npm, and if the churn still appears, hand-limit the diff (see Outcome 2).

## Widened 2026-10-28 (planner): Trivy is red on main
The required Trivy check now fails on every PR (first seen on docs PR #90, run 40719497337, a docs-only diff), because its database picked up new advisories against the lockfiles already on main:
- package-lock.json: body-parser 2.3.0 CVE-2026-111181 (HIGH, fixed 2.4.0); undici 8.12.1 CVE-2026-109383, CVE-2026-109829, CVE-2026-109869, CVE-2026-87018 (all HIGH, fixed 8.12.2). undici comes in only via jsdom (range ^8.11.2), the test DOM; the server doesn't import it.
- spike/mcp-probe/package-lock.json: body-parser 2.3.0 CVE-2026-111181 (same path: MCP SDK → express → body-parser).
So P2-Y covers all three. A body-parser-only PR would still fail Trivy. Planner dry runs: `npm update undici --package-lock-only` moves undici 8.12.1 → 8.12.3 (in range); in spike/mcp-probe, `npm update body-parser --package-lock-only` gives a clean 12-line lockfile diff.

## Read first
AGENTS.md; D-010 in docs/plan/DECISIONS.md; body-parser 2.4.0 release notes (GitHub: expressjs/body-parser releases or HISTORY.md). List anything behaviour-changing in your PR body.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-y, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-y && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-y
    cd /Users/stephenforte/src/supa-agent-tracker-p2-y && git checkout -b p2-y-body-parser-2-4 origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-Y", title "P2-Y: body-parser + undici security bump", workload_type "coding", task_id "P2-Y" and a fresh request_id.
  - Include harness and model only if you know them.
  - Keep run_id and revision, and write only the run_id to .supa/run-id.
- R2. update_status at each milestone. Always send the latest expected_revision.
  - Gate green.
  - PR opened (pr_references with the PR URL).
  - **Bot review settled:** every automated review comment (Bugbot, PatchHog and similar) on the PR head is fixed or answered, and CI is green. Send a message like "PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>". Send it again if a later push draws new bot comments.
  - Blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown, check_out with:
  - execution_state finished (or failed);
  - work_status waiting_for_review (or blocked);
  - a one-paragraph completion_summary and the PR reference.
  Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure, retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token. Don't change your tracker/MCP configuration.

## Line of work
Branch p2-y-body-parser-2-4. PR title "P2-Y: Bump body-parser 2.4.0 and undici 8.12.x (Trivy HIGHs)". Commit subjects start with "P2-Y: ". No migrations. Don't edit docs/plan/**.

## Outcome
1. package-lock.json resolves node_modules/body-parser to 2.4.0 and node_modules/undici to >= 8.12.2 (resolved URL and integrity updated). Use `npm update body-parser undici`. In spike/mcp-probe, run `npm update body-parser` there so its lockfile resolves body-parser 2.4.0. Both package.json files are **byte-identical** to main (`git diff --exit-code origin/main -- package.json spike/mcp-probe/package.json`).
2. Each lockfile diff is limited to body-parser and undici plus whatever transitive changes those versions themselves require (its dependency ranges: qs ^6.16.1, type-is ^2.1.0, raw-body ^3.0.2, iconv-lite ^0.7.3, content-type ^2.1.0, among others). List every changed package and version in the PR body. No unrelated entries (in particular no @tailwindcss/oxide-wasm32-wasi churn), no `npm audit fix`, no other upgrades. If npm insists on unrelated churn, revert those hunks by hand and confirm `npm ci` still succeeds on the result.
3. `npm ls body-parser undici` shows a single body-parser 2.4.0 under express and a single undici >= 8.12.2 under jsdom (and body-parser 2.4.0 in spike/mcp-probe).
4. No overrides block, no new direct dependency.

## Scope
- Free: package-lock.json, spike/mcp-probe/package-lock.json.
- Don't touch: either package.json, server/**, src/**, CI (no Trivy ignores or .trivyignore), anything else.
- If a fixed version can't be reached without changing a package.json (an override, a bump of express, jsdom or the MCP SDK), stop and report rather than widen scope.
- If Trivy flags something new on your PR head that isn't in the list above, report it with the Trivy output; don't fix it in this PR.

## The trap
The scanner's suggested command is the wrong fix here: it would make body-parser a direct dependency (D-010) and leave the real path (express → body-parser) to drift later. The second trap is npm-version lockfile churn riding along in a "one-line" security PR. Review the full lockfile diff yourself before pushing.

## Coverage
- No new tests: body-parser isn't loaded by our server (Fastify) and undici is test-only (jsdom), so there's nothing of ours to pin. Say so in the PR. The jsdom-based UI tests are the regression net for undici.
- Mutation check: not applicable to a version bump. Report test counts on main and on your branch; they must match.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
    npm ls body-parser
    git diff --exit-code origin/main -- package.json
    git diff --stat origin/main -- package-lock.json
Baseline on main: planner measured 90 files / 665 tests at P2-Xa (651fd6f); P2-X merged without adding tests since. Report your counts. Unexplained movement is a finding.
`npm audit` before and after, at the root and in spike/mcp-probe: paste all four. GHSA-27r3-jxmh-p828 and the undici advisories must be gone after.
In spike/mcp-probe: `npm ci && npm test`.
CI (verify, Trivy, Semgrep SAST, mcp-probe) must be green on the PR head; **Trivy green is the point of this PR**, so paste its summary table. Note whether PatchHog re-scans the PR and what it says.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back
AGENTS.md H1–H5. Return block labels in order: TASK, LINE OF WORK, REVIEW ARTIFACT, STATUS, VERIFICATION, MIGRATION, SHARED FILES TOUCHED, IDENTIFIERS USED, EXISTING CHECKS MODIFIED, CLONE, TEMP, TRACKING, DECISIONS NEEDED, RESIDUAL GAPS.
