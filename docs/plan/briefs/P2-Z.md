DISPATCH · Model: Sonnet 5.5 (lockfile-only transitive bump, same shape as P2-Y; Haiku would also do) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 5f66228 (wave 17 closed). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version) and its bundled npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; P2-Y (same shape) took about 30 min, mostly the gate and CI.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-z, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-z-fast-uri → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-Z — Bump every fast-uri copy: 3.1.8 → 3.1.9 and 4.2.2 → 4.2.3, lockfile-only

## Why (operator, 2026-10-28)
PatchHog reported CVE-2026-110180 against package-lock.json:1281: "fast-uri@3.1.8 … Security policy bypass via improper host canonicalization … Upgrade fast-uri to 3.1.9 or later." P2-Y's worker also saw moderate fast-uri findings in both lockfiles' npm audit.

## Evidence (planner, 2026-10-28; trust the repository over this)
- GitHub advisories: GHSA-w74x-v6f9-j3xg (CVE-2026-110306, moderate) and GHSA-xhq7-xmqj-769h (CVE-2026-110095, low). Both are fixed in 3.1.9 for the 3.x line and 4.2.3 for the 4.x line. GHSA has no CVE-2026-110180, PatchHog's id. Treat the two GHSAs as the target and `npm audit` as the judge.
- main 5f66228 has **six** vulnerable copies. PatchHog named only the first kind:
  - package-lock.json, 3.1.8 (each under an ajv@8 that requires fast-uri ^3.0.1): node_modules/@fastify/ajv-compiler/node_modules/ajv/node_modules/fast-uri, node_modules/@modelcontextprotocol/sdk/node_modules/fast-uri, node_modules/ajv-formats/node_modules/fast-uri, node_modules/fast-json-stringify/node_modules/ajv/node_modules/fast-uri.
  - package-lock.json, **4.2.2**: node_modules/fast-uri (required ^4.0.0 by @fastify/ajv-compiler and fast-json-stringify). This one also needs a bump, to 4.2.3.
  - spike/mcp-probe/package-lock.json, 3.1.8: node_modules/fast-uri.
- Exposure: the 4.x copy is on Fastify's request validation and serialisation path. `git grep -nE "format: ?['\"](uri|url|hostname|uri-reference)" -- server` finds nothing, so no schema of ours parses hosts through it. Probably low impact; we bump because we're in range and the fix is lockfile-only. Trivy (HIGH/CRITICAL only) doesn't flag it, so a green Trivy proves nothing here. `npm audit` does.
- Planner dry runs (scratch copies, npm 11.20 on Node 26): in the root, `npm update fast-uri --package-lock-only` moves all four 3.1.8 copies to 3.1.9 and the 4.2.2 copy to 4.2.3, and leaves package.json unchanged, **but it also added the same six unrelated `@tailwindcss/oxide-wasm32-wasi/node_modules/*` entries as in P2-Y**. P2-Y's worker kept them out by using Node 24's npm. In spike/mcp-probe, `npm update fast-uri` gave a clean 6-line diff.

## Read first
AGENTS.md; D-010 in docs/plan/DECISIONS.md; the fast-uri 3.1.9 and 4.2.3 release notes (GitHub: fastify/fast-uri releases). List anything behaviour-changing in your PR body, especially host normalisation, since ajv and Fastify depend on it.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-z, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-z && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-z
    cd /Users/stephenforte/src/supa-agent-tracker-p2-z && git checkout -b p2-z-fast-uri origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-Z", title "P2-Z: fast-uri security bump", workload_type "coding", task_id "P2-Z" and a fresh request_id.
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
Branch p2-z-fast-uri. PR title "P2-Z: Bump fast-uri to 3.1.9 / 4.2.3 (GHSA-w74x-v6f9-j3xg)". Commit subjects start with "P2-Z: ". No migrations. Don't edit docs/plan/**.

## Outcome
1. Every fast-uri entry in package-lock.json resolves to 3.1.9 (the four nested 3.x copies) or 4.2.3 (node_modules/fast-uri), and spike/mcp-probe/package-lock.json resolves fast-uri to 3.1.9, with resolved URLs and integrity updated. Use `npm update fast-uri` in each directory. Both package.json files are **byte-identical** to main.
2. Each lockfile diff is limited to fast-uri entries. fast-uri has no dependencies, so expect nothing else. List every changed entry in the PR body. No unrelated entries (in particular no @tailwindcss/oxide-wasm32-wasi churn), no `npm audit fix`, no other upgrades. If npm insists on unrelated churn, revert those hunks by hand and confirm `npm ci` still succeeds on the result.
3. No fast-uri copy below 3.1.9 or 4.2.3 remains anywhere in either lockfile.
4. No overrides block, no new direct dependency.

## Scope
- Free: package-lock.json, spike/mcp-probe/package-lock.json.
- Don't touch: either package.json, server/**, src/**, CI, anything else.
- If a fixed version can't be reached without changing a package.json (an override, a bump of ajv, Fastify or the MCP SDK), stop and report rather than widen scope.
- If npm audit or Trivy shows another finding on your PR head, report it with the output; don't fix it in this PR.

## The trap
Fixing only the copy the scanner pointed at (line 1281). There are five more, and one of them is the 4.x line, which "upgrade to 3.1.9 or later" doesn't describe. A second trap: Trivy staying green doesn't mean the advisories are gone, because it only fails on HIGH. Check with `npm audit`.

## Coverage
- No new tests: we have no uri/hostname-format schemas, so there's nothing of ours to pin. Say so in the PR. The server suites, which exercise Fastify validation and serialisation, are the regression net.
- Mutation check: not applicable to a version bump. Report test counts on main and on your branch; they must match.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
    npm ls fast-uri
    git diff --exit-code origin/main -- package.json spike/mcp-probe/package.json
    git diff --stat origin/main -- package-lock.json spike/mcp-probe/package-lock.json
    grep -n '"node_modules/[^"]*fast-uri"' -A1 package-lock.json spike/mcp-probe/package-lock.json
    (cd spike/mcp-probe && npm ci && npm test)
Baseline on main: 90 files / 665 tests (P2-Y worker report, 2026-10-28; CI verify showed 90 files). Report your counts. Unexplained movement is a finding.
`npm audit` before and after, at the root and in spike/mcp-probe: paste all four. GHSA-w74x-v6f9-j3xg and GHSA-xhq7-xmqj-769h must be gone after.
CI (verify, Trivy, Semgrep SAST, mcp-probe) must be green on the PR head. Note what PatchHog says on the PR.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back
AGENTS.md H1–H5. Return block labels in order: TASK, LINE OF WORK, REVIEW ARTIFACT, STATUS, VERIFICATION, MIGRATION, SHARED FILES TOUCHED, IDENTIFIERS USED, EXISTING CHECKS MODIFIED, CLONE, TEMP, TRACKING, DECISIONS NEEDED, RESIDUAL GAPS.
