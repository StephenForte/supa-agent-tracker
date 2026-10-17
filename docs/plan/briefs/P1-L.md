DISPATCH · Model: Sonnet (one config line, one polling change and tests; the evidence and the library mechanism are already established) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 63d7fad (P1-J merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 30–60 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-l, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p1-l-session-limit → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P1-L — Leaving the web app open must not lock the user out (429 on get-session); check the token Copy button

## Evidence (production, 2026-10-17)
- The operator had two browser windows open (their account plus a second invited account) and got "Too many requests" for about a minute.
- Render request logs from client 73.231.x:
  - 16:34:32–16:35:32Z: 19 × `GET /api/auth/get-session` → 200, alternating between the two accounts (response sizes 692 / 679 bytes);
  - then 16:35:35–16:36:32Z: about 28 × `GET /api/auth/get-session` → **429**, after which it recovered.
- The MCP load test that ran afterwards (25 agents, 10 min) had 0 errors and 0 × 429. So this is the browser path only.

## Cause (confirmed in source; verify)
1. server/auth/runtime.ts:79 configures better-auth's limiter: `rateLimit: { enabled: true, window: 60, max: 100, storage: 'memory', customRules: { '/sign-in/email': { window: 60, max: 5 } } }`. It's keyed per IP + path (routes.ts passes the trusted client IP in `x-supa-auth-ip`).
2. better-auth 1.7.7 `dist/api/rate-limiter/index.mjs` `decideConsume`:
   - the counter resets only when `now - data.lastRequest >= window`, and every allowed request sets `lastRequest = now`;
   - so it is not a per-minute cap: the count resets only after **60 s with no requests** from that IP on that path.
3. The web app's shared poller (src/data/http/observable.ts:10) refreshes every **7 s** while a tab is visible. The session read (`observable.read('session', … '/api/auth/get-session')` in src/data/http/tracker.ts, used by SessionGuard and Shell) is re-fetched on every poll.
4. One visible tab therefore sends about 8.6 get-session calls per minute and never goes 60 s quiet. It hits 100 after about **11.7 minutes**, two tabs after about 6, and then every page shows 429 until the user stops for a minute. Users behind one NAT share the bucket.
better-auth supports exempting a path: in `resolveRateLimitConfig`, a custom rule that resolves to `false` returns `null` (no limit). E.g. `customRules: { '/get-session': false }`.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-l, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-l && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-l
    cd /Users/stephenforte/src/supa-agent-tracker-p1-l && git checkout -b p1-l-session-limit origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Line of work
Branch p1-l-session-limit. PR title "P1-L: Stop get-session rate-limit lockouts; fix token Copy". Commit subjects start with "P1-L: ". No migrations, no new identifiers. Don't edit docs/plan/**.

## Outcomes
1. **No lockout from normal use.** A signed-in user with two tabs open for 60 minutes never gets a 429 on get-session. Do both:
   - (a) exempt `/get-session` from better-auth's limiter. It's a cookie-authenticated read of the caller's own session; it creates nothing and verifies no password, so it gives an attacker no brute-force surface;
   - (b) stop re-fetching the session on every 7 s data poll. Re-read it on mount, on window focus or visibility return, after auth actions (`submit`/`verify` already invalidate), and on a 401 from any API call. The 401 path keeps sign-out and expiry working.
   If you believe (b) is wrong, argue it with evidence. (a) alone fixes the lockout, but (b) removes about 8.6 needless requests per tab-minute.
2. **Protections that must stay exactly as strict:**
   - the app's own sign-in limiter in server/auth/routes.ts (5 per minute per IP and per email);
   - better-auth's `/sign-in/email` custom rule;
   - the limiter on every other auth path (sign-up, password reset, verification resend, change-password, session revocation).
   Don't change TRUST_PROXY_HOPS handling or the `x-supa-auth-ip` wiring.
3. **Token Copy button.** The operator reported the Copy button on the one-time token reveal (src/features/tokens/TokenReveal.tsx) "may not be working" on production in Chrome, and copied the token by hand.
   - Reproduce in a production build in Chrome; check both whether the clipboard gets the value and whether the "Copied." status is visible to the user.
   - If it's broken, fix it within TokenReveal / the Dialog and keep the existing fallback (select the field + alert).
   - If it works and only the feedback is unclear, make the success state unmistakable (e.g. the button label changes to "Copied").
   - If you can't reproduce it, say so with what you tried. Don't guess.

## Must hold (tests as properties; show each failing on main where possible)
- Server: one IP sends 200 get-session requests 3–5 s apart for a signed-in user (simulated time is fine if the limiter honours it; otherwise real requests at a compressed interval with a reduced test window, explained) → no 429. A 6th sign-in from one IP within a minute → still 429. A burst on another limited auth path (e.g. send-verification-email) → still limited at its threshold.
- Web: with the poller running for N cycles, the session is fetched once, not N times. Focus/visibility return and a 401 trigger a re-read; sign-out still lands on /login.
- Existing checks are not weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free: server/auth/runtime.ts, src/data/http/tracker.ts, src/data/http/observable.ts, src/app/SessionGuard.tsx, src/app/Shell.tsx, src/features/tokens/TokenReveal.tsx, and tests for these.
- Change only if needed, and say why: server/auth/routes.ts (only to read config, never to loosen the sign-in limiter), src/data/http/client.ts (401 hook), src/components/ui/Dialog.tsx (only if the Copy fix needs it).
- Don't touch: docs/plan/**, render.yaml, Render or production, server/invites/**, server/mcp/**, migrations.
- If the fix seems to need anything else, stop and report.

## Out of scope (with reasons)
- Replacing better-auth's memory limiter or its semantics: a library concern. Exempting the safe read path is enough here.
- MCP rate limits (120/min per credential): the load test showed 0 × 429.
- Polling cadence for data (7 s): unchanged; only the session read stops riding it.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 63d7fad: 56 files / 405 tests (planner measurement). Report your counts.
Manual (say what you did):
- run the http build locally with a local Postgres; leave two signed-in tabs open for ≥15 min, or compress with a test window; confirm the browser's network panel shows no repeating get-session every 7 s and no 429;
- exercise Copy in Chrome.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-l-session-limit.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-l-session-limit -t "P1-L: Stop get-session rate-limit lockouts; fix token Copy" -F <body file> (body = summary + verification evidence). Never leave the work only as a pushed branch.
H3. Wait for CI on the PR head; fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown, then end with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-L — Stop get-session rate-limit lockouts; fix token Copy
    LINE OF WORK: p1-l-session-limit
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property red on main / green on fix; builds; manual checks; leftover-DB check; CI jobs> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-l; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. Copy not reproducible); surface and model you ran in; wall-clock>
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, loosening any sign-in or auth limiter beyond exempting /get-session, touching Render or production, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
