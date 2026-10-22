DISPATCH · Model: Sonnet (CI pins, one response-typing fix, one global header, and justified suppressions; the risk is breaking auth responses, covered by existing tests plus new ones) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 12849b1 (P2-K merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; expect 45-90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-l, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-l-sast-findings → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-L — Resolve PatchHog SAST findings (7): pin CI actions, type auth passthrough, nosniff, justify false positives

## Why (operator, 2026-10-20)
PatchHog reported seven medium findings on main:
1-2. "Github Actions Mutable Action Tag", .github/workflows/ci.yml:28 and :29 (CWE-1357).
3-4. "Direct Response Write", server/api/user-routes.ts:95 and :128 (CWE-79).
5. "Express Res Sendfile", server/app/spa.ts:28 (CWE-73).
6. "Direct Response Write", server/auth/routes.ts:108 (CWE-79).
7. "Direct Response Write", server/public/routes.ts:24 (CWE-79).

## Planner triage (main 12849b1; trust the repository over this)
- **1-2: real.** ci.yml uses `actions/checkout@v4` and `actions/setup-node@v4` in both jobs (lines 28-29 and 45-46). Tags can be repointed. Verified pins, from the GitHub API today:
    actions/checkout   v4 = v4.4.0 = 11d5960a326750d5838078e36cf38b85af677262 (security-scans.yml already pins this)
    actions/setup-node v4 = v4.4.0 = 49933ea5288caeca8642d1e84afbd3f7d6820020
- **3, 4, 7: false positives.** user-routes.ts:95 is `reply.send(toProject(row))`, :128 is `reply.send({ items: …, nextCursor })`, and public/routes.ts:24 is `reply.send(page)`. All send plain objects, which Fastify serialises as JSON with `content-type: application/json; charset=utf-8`. Production check: GET /api/public/%3Cscript%3E…/agents → 404 with `application/json`.
- **5: false positive.** spa.ts:28 is `reply.sendFile('index.html')`, a constant filename; the request path never reaches it. Production probes found no traversal: `/..%2f..%2f..%2fetc%2fpasswd`, `/%2e%2e/%2e%2e/etc/passwd` and `/assets/..%2f..%2fpackage.json` → 400; `/..%5c..%5cpackage.json` → 200, the SPA index (no file contents).
- **6: real hardening.** auth/routes.ts:105-108 passes the auth library's response body through. JSON is typed explicitly, but any other body goes out via `reply.send(text || null)` with no explicit content-type. That's text/plain today by Fastify's default, but nothing pins it.
- **Gap found while triaging:** production sends no `X-Content-Type-Options: nosniff` on any response (checked on / and on the JSON API). Without it, a browser may "sniff" an untyped or mistyped body as HTML. Adding it globally is the defence in depth behind finding 6.

## Read first
AGENTS.md; server/app/build-app.ts (app construction and hooks); server/auth/routes.ts (the whole auth proxy, especially lines 60-115); server/auth/auth.test.ts; .github/workflows/ci.yml and security-scans.yml (the pin style to match: `uses: owner/action@<40-hex sha> # vX.Y.Z`).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-l, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-l && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-l
    cd /Users/stephenforte/src/supa-agent-tracker-p2-l && git checkout -b p2-l-sast-findings origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-L", title "P2-L: Resolve PatchHog SAST findings", workload_type "coding", task_id "P2-L" and a fresh request_id.
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
- R5. Reporting never blocks the task. On a transient failure, retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-l-sast-findings. PR title "P2-L: Resolve PatchHog SAST findings (pin CI actions, type auth passthrough, nosniff)". Commit subjects start with "P2-L: ". No migrations. Don't edit docs/plan/**.

## Outcomes
A. **Pin CI actions (findings 1-2).** Every `uses:` in .github/workflows/ci.yml references a full 40-hex commit SHA, with a trailing `# vX.Y.Z` comment, using the SHAs above. Before using them, re-verify each with `gh api repos/<owner>/<action>/git/ref/tags/<tag>`. No other workflow changes: same jobs, steps, Node 24 and triggers.
B. **Type the auth passthrough (finding 6).** In server/auth/routes.ts, the non-JSON passthrough sets an explicit `text/plain; charset=utf-8` content type before sending. An upstream content-type of text/html (or anything else not JSON) must never reach the client as HTML. The JSON branch, the generic/enumeration-safe responses, the status codes, cookies and location headers stay exactly as they are.
C. **Global nosniff.** Every HTTP response from the server, including the SPA HTML, static assets, /api/*, /api/auth/*, /mcp (401 included), /.well-known/* and /ready, carries `X-Content-Type-Options: nosniff`. Add it once (for example an onSend or onRequest hook in build-app.ts), not per route.
D. **False positives (3, 4, 5, 7).** Leave the code behaviour as is. Add an inline suppression on the flagged line in the form Semgrep and PatchHog honour: `// nosemgrep: <rule-id>`, followed on the same line by a short reason ("plain object → Fastify JSON serialiser" or "constant filename, request path not used"). Get the exact rule ids from the PatchHog finding detail (ask the operator if you can't see it) or from the Semgrep registry (likely javascript.express.security.audit.xss.direct-response-write and javascript.express.security.audit.express-res-sendfile, but confirm them). If you can't confirm a rule id, put the reason comment without `nosemgrep` and list it under DECISIONS NEEDED: the operator can mark it as a false positive in PatchHog.

## Scope
- Free: .github/workflows/ci.yml (the `uses:` lines only), server/auth/routes.ts (the passthrough send only), server/app/build-app.ts (the one header hook), suppression comments on the four flagged lines, and tests.
- Don't touch: security-scans.yml, the auth flow logic (invites, rate limits, the enumeration-safe generic responses), the MCP routes, the response bodies of any API, package.json.
- If an outcome needs more than this, stop and report rather than widen scope.

## The traps
- **A header hook that breaks streaming.** /mcp uses a streamable HTTP transport that may write raw to `reply.raw`. A header set in Fastify's onSend won't apply to raw writes, and setting headers after the raw write starts throws "headers already sent". Prove nosniff appears on /mcp responses (the 401, and a real initialize) and that the MCP integration tests and the mcp-probe stay green. An onRequest hook that sets the header early (`reply.header(...)` and, for raw paths, `reply.raw.setHeader(...)`) is one safe way.
- **Over-suppressing.** A `nosemgrep` without a rule id silences every rule on that line. Use the rule id. Never add a suppression to a line that isn't one of the four named here.
- **Auth passthrough.** Changing the JSON branch, or the generic responses for sign-up, reset or verify, re-opens account enumeration (P1-I, D-031). Touch only the non-JSON send.

## Coverage (properties)
- A test that fakes an upstream auth response of `content-type: text/html` with body `<script>x</script>`, and asserts the client gets `text/plain; charset=utf-8` (not text/html), with the body unchanged.
- nosniff is present on: GET / (SPA), a static asset, GET /api/projects (authed), an /api/auth/* error, POST /mcp with a bad token (401), and GET /.well-known/oauth-protected-resource.
- The existing auth tests and the MCP tests are unchanged and green.
- A ci.yml check (test or script in the PR description): `grep -E 'uses: [^@]+@[0-9a-f]{40}( |$)'` matches every `uses:` line in ci.yml.
Mutation check you run and report: (1) remove the explicit text/plain and confirm the html-passthrough test goes red; (2) remove the nosniff hook and confirm red. Restore both.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 12849b1: 75 files / 532 tests (planner measurement). Report your counts. Unexplained movement is a finding.
Manual: start the built server locally; `curl -sI` the six URLs from Coverage and paste the X-Content-Type-Options lines into the PR. CI must be green on the PR, including verify (proves the pinned actions resolve), mcp-probe, Semgrep SAST and Trivy, and PatchHog should show these seven findings resolved or suppressed. Paste what it reports.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Out of scope
- A Content-Security-Policy or other security headers (HSTS, frame options): useful, but a separate decision with SPA testing. Not now.
- Rewriting the auth proxy.
- Other PatchHog or Semgrep findings not listed here: list any you see under RESIDUAL GAPS, but don't fix them.

## Decisions
None open for you, except the rule-id fallback in D. If you believe a finding the planner called a false positive is real, show the request that exploits it and stop.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-l-sast-findings.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-l-sast-findings -t "P2-L: Resolve PatchHog SAST findings (pin CI actions, type auth passthrough, nosniff)" -F <body file>. The body has a table of the seven findings → fixed / suppressed (rule id + reason), the curl header lines, and the verification evidence. Never leave the work only as a pushed branch.
H3. Wait for CI (verify, mcp-probe, Semgrep SAST, Trivy: all required) and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-L — Resolve PatchHog SAST findings
    LINE OF WORK: p2-l-sast-findings
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; the two mutation results; curl nosniff lines; ci.yml pin check; builds; leftover-DB check; CI jobs; PatchHog result for the 7; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files and why> (or: none)
    IDENTIFIERS USED:     P2-L; branch p2-l-sast-findings; rule ids used in nosemgrep comments
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-l; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified; other findings seen; surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, suppressing anything beyond the four named lines, touching auth logic beyond the one send, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
