DISPATCH · Model: Opus 5.5 (strongest tier: this replaces the registration gate on a live, internet-facing auth boundary) · Order: after ops PR #46 (database disk) merges; nothing else is in flight on these files.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: current tip of main at dispatch (it includes the 1 GB disk change from PR #46). Rebase onto the current tip of main before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 2–3 h. Report wall-clock in RESIDUAL GAPS.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p1-i, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: one PR into main.
Teardown: after the PR is pushed and CI is green: stop every process you started and run the clone-scoped process check in AGENTS.md "Workspace and process hygiene"; drop every database you created; delete the clone; end your session. Report all of it on the CLONE line.
Deploy note: main now auto-deploys the **live production app** (`supa-agent-tracker-app`, Render) as well as the static demo. A merge of this PR changes production registration. The demo build must stay free of `/api`.

# P1-I — Invite links replace the registration allowlist (D-031)

Today registration is gated by `REGISTRATION_ALLOWLIST`, a comma-separated env var (D-025). Every invite means editing a Render secret and redeploying. The operator called it "horrible design", and D-031 replaces it.

Under D-031, an **admin** creates a single-use, expiring **invite link** for an email address in the web app. Registration requires a valid invite, and the invite is consumed atomically. The only bootstrap is `ADMIN_EMAIL`: that one address may register without an invite and is the admin.

## Line of work
Branch p1-i-invites from the current tip of main. PR title: "P1-I: Invite links replace the registration allowlist". Pre-assigned, overriding any convention you'd pick (if one looks wrong, stop and ask):
- migration: server/db/migrations/0003_invites.sql (main has 0001 and 0002 only; 0003 was reserved for P1-C1 and never used, so it's yours now)
- server code: server/invites/** (new); route registration as one line in server/app/routes.ts: `await registerInviteRoutes(app, deps);`
- env: `ADMIN_EMAIL` (optional, one address, case-insensitive). `REGISTRATION_ALLOWLIST` is **removed** from code, docs and render.yaml (as `ADMIN_EMAIL` with `sync: false`)
- invite token: `inv_` + 32 random bytes base64url, stored as SHA-256 hex only; default expiry 7 days
- web: an "Invites" tab at `/settings/invites` (http mode only; hidden in demo mode); the register page reads `?invite=` from the URL
- no new dependencies

## Step 0 — get your own clone (do this first, before reading or running anything)
    pwd
If /Users/stephenforte does not exist on this machine, stop and report. Otherwise, if the path above contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p1-i, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p1-i && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p1-i
    cd /Users/stephenforte/src/supa-agent-tracker-p1-i
    pwd
The final pwd must print /Users/stephenforte/src/supa-agent-tracker-p1-i before anything else. If the clone path exists, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
Confirm Postgres: /Applications/Postgres.app/Contents/Versions/latest/bin/pg_isready -h localhost -p 5432 → "accepting connections", else stop and report. Never start, stop or reconfigure it.

## Read first (they govern; trust them and the repo over this brief)
- AGENTS.md; docs/api.md "Authentication" (CSRF, rate limits, generic responses) and "Tokens" (the copy-once pattern to mirror); server/README.md "Auth (P1-B2)".
- docs/plan/DECISIONS.md D-022, D-025 (superseded), D-027, D-031.
- server/auth/routes.ts (the sign-up gate at the `registrationAllowlist` check, generic responses, `logLevel: 'silent'`), server/auth/runtime.ts (better-auth config and email sender), server/config.ts, server/tokens/routes.ts (copy-once + idempotency without storing plaintext), server/repo/idempotency-keys.ts, server/db/schema.ts and schema.test.ts (drift test, forbidden-column scan).
- src/pages/auth/LiveAuthScreen.tsx (live register), src/pages/settings/SettingsPage.tsx, src/features/tokens/LiveTokensPanel.tsx and TokenReveal.tsx (the reveal pattern to reuse), src/app/useDemoAccount.ts.
If you think the approach is wrong, argue it in DECISIONS NEEDED with evidence instead of half-implementing it.

## Outcomes
1. **0003_invites.sql**: an `invites` table with:
   - id (text), email (text, stored lower-case), token_hash (unique), invited_by (→ users, RESTRICT);
   - created_at, expires_at, used_at, used_by (→ users, RESTRICT), revoked_at;
   - CHECKs: used_at and used_by set together; not both used and revoked;
   - an index on email; **no plaintext token column**.
   Append the Drizzle definition to server/db/schema.ts. The drift test must pass. Extend schema.test.ts's sensitive-column allowlist only for `invites.token_hash`, and declare it.
2. **Admin**: a signed-in user is admin exactly when their **verified** email equals `ADMIN_EMAIL` (case-insensitive). There's no role column. With `ADMIN_EMAIL` unset, there's no admin and nobody can create invites; the server still boots.
3. **Invite API** (server/invites/**; all `requireUser` + admin check, otherwise 403 `forbidden`; mutations use `request_id` per docs/api.md):
   - POST /api/invites {email, request_id} → `{ invite, link }`. `link` is `${PUBLIC_URL}/register?invite=<token>`, shown once. Also send the link by email via the existing email sender ("You're invited…"). If email delivery fails, still return the link and report `emailSent: false`.
   - GET /api/invites → the admin's invites with status `pending | used | expired | revoked`, never a token or hash.
   - POST /api/invites/:id/revoke {request_id} → revoked; a pending invite becomes unusable immediately.
   - Idempotency must **never store the plaintext link or token**. Mirror the P1-C1 token pattern: a replay returns `link: null` (D-024's copy-once rule).
4. **Sign-up gate** (server/auth/routes.ts): replace the allowlist check. Sign-up succeeds only when:
   - the body's email equals `ADMIN_EMAIL` (bootstrap, no invite needed), **or**
   - the request carries an `invite` token whose hash matches a pending invite (unused, unrevoked, unexpired) **for the same email**.
   Consume the invite **atomically with user creation**, so two concurrent sign-ups on one invite yield exactly one account. If better-auth can't share a transaction, use a conditional `UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING` before the library call and release it on failure; prove the race in a test.
   Any failure → 403 `forbidden` with the generic message "This invitation is invalid or has expired". The same message for an unknown token, a used token, an expired token, an email mismatch, and no token at all, so nothing is enumerable. Keep P1-B2's generic response for an already-registered email.
5. **Remove the allowlist**: delete `REGISTRATION_ALLOWLIST` parsing, config fields, tests and docs. Add `ADMIN_EMAIL` to config.ts (optional; trimmed and lower-cased; it must look like an email if set, otherwise a config error naming the variable). In render.yaml, replace the `REGISTRATION_ALLOWLIST` env entry with `ADMIN_EMAIL` `sync: false`, changing nothing else. Update server/README.md, docs/api.md and docs/ops/deploy-phase1.md.
6. **Web** (http mode only):
   - `/settings/invites`: the tab is visible only to the admin (derive it from `/api/account` email vs. a new `isAdmin` boolean on that response). The page has: a create form (email) → reveal the link once with copy, reusing the TokenReveal pattern (no storage, cleared on dismiss) → a list with status and revoke.
   - The register page passes `?invite=` from the URL in the sign-up body, then strips it from the address bar after reading it.
   - Demo mode: no Invites tab, and demo auth screens unchanged.
   - Allowed small additions: `isAdmin` on GET /api/account (server/api/**) and an optional `isAdmin` on the web `Account` type. Declare both.
7. **Tests** (real Postgres scratch databases, `app.inject`):
   - admin creates an invite → link returned once; the replay returns `link: null`; the plaintext appears nowhere in the DB (scan all text/jsonb, idempotency_keys included) or logs;
   - a non-admin and an unauthenticated caller → 403 / 401;
   - sign-up with a valid invite + matching email → account created, invite `used`; reusing it → generic 403;
   - expired, revoked, wrong email, garbage token and missing token → the same generic 403 body and status;
   - `ADMIN_EMAIL` registers without an invite; with `ADMIN_EMAIL` unset, nobody registers;
   - **concurrent** sign-ups (Promise.all) on one invite → exactly one user and one `used` invite;
   - the email sender is called with the link; a delivery failure still returns the link with `emailSent: false`;
   - web: the Invites tab is hidden for non-admins and in demo mode; the reveal clears on dismiss; the register page strips `invite` from the URL.
   Update existing allowlist tests to the invite rule, and declare each one under EXISTING CHECKS MODIFIED.

## The traps
1. **Storing the link.** The idempotency table saves response JSON. If invite creation goes through it unchanged, every invite link sits in plaintext forever. Same fix as P1-C1 tokens.
2. **A race that mints two accounts.** Checking "unused" and then creating the user in separate steps lets two simultaneous sign-ups both pass. Consume conditionally and atomically, and test it with concurrency.
3. **Enumeration.** Different messages for "expired" and "wrong email" tell an attacker which invites exist. Use one generic response.
4. **Locking the operator out.** Removing the allowlist before `ADMIN_EMAIL` works would close registration. `ADMIN_EMAIL` bootstrap must be tested, and deploy-phase1.md must tell the operator to set `ADMIN_EMAIL` in the dashboard **before** merging.
5. **Touching the operator's other databases.** Only your own `supa_test_*` scratch databases.

## Must hold
- No edits outside the Scope list; no new dependencies; the demo bundle has no `/api`.
- No plaintext invite token or link stored or logged anywhere.
- render.yaml: only the env entry swap described above.
- Existing checks not weakened, skipped or deleted except the allowlist tests being replaced (declared).

## Scope
- Freely changeable: server/invites/** (new), server/db/migrations/0003_invites.sql (new), server/auth/routes.ts and server/auth/runtime.ts (the sign-up gate only), server/config.ts (ADMIN_EMAIL in, REGISTRATION_ALLOWLIST out), src/features/invites/** (new), src/pages/settings/** (Invites tab), src/pages/auth/LiveAuthScreen.tsx (invite param), and their tests.
- Additive only: server/app/routes.ts (one line); server/db/schema.ts (append); server/db/schema.test.ts (one allowlisted column); server/api/** and src/domain/types.ts (`isAdmin` only); src/data/http/** (invite calls and `isAdmin` mapping only); docs/api.md, server/README.md, docs/ops/deploy-phase1.md; render.yaml (the env swap).
- Out of scope, with reasons:
  - multiple admins or roles (Phase 2 sharing);
  - open registration (D-022);
  - Render dashboard changes (the operator sets ADMIN_EMAIL);
  - P1-H retention.
If the work appears to need anything outside this, stop and report rather than widen scope.

## Verification (run against current main at hand-back; rebase first if main moved)
    T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server
Expected: report web and server counts against main's baseline at dispatch. Unexplained movement is a finding.
Demo bundle: `env -i PATH="$PATH" HOME="$HOME" npm run build && grep -rl "/api/" dist || echo "no /api in demo bundle"` must print the echo line.
Render build: `NODE_ENV=production npm ci --include=dev && VITE_DATA_SOURCE=http npm run build && npm run build:server` succeeds.
Migration on populated data: 0001+0002 with a user, project and run, then 0003; the data survives; a re-run is a no-op.
Live smoke: the compiled server (NODE_ENV=development, EMAIL_PROVIDER=console, ADMIN_EMAIL set to a test address, a generated BETTER_AUTH_SECRET). Admin registers without an invite → verify → log in → create an invite → sign up a second user with the link → the reused link fails. Paste the status codes; never paste tokens.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must print nothing at hand-back.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p1-i-invites to StephenForte/supa-agent-tracker. Commit subjects start with "P1-I: ".
H2. Open the PR yourself (gh pr create -R StephenForte/supa-agent-tracker -B main -H p1-i-invites -t "P1-I: Invite links replace the registration allowlist" -F <body file in $T>). The body's first line: "Before merging: set ADMIN_EMAIL in the Render dashboard (supa-agent-tracker-app → Environment)." Then: design, endpoints, the race proof, removed env, verification evidence, the return block. Do not merge it.
H3. Wait for CI on the PR head (all jobs); fix failures within scope.
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H5. Teardown per the header (processes, databases, clone), then end with the return block as your final message, inside one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P1-I — Invite links replace the registration allowlist
    LINE OF WORK: p1-i-invites
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <web and server test counts; builds incl. the Render build; demo-bundle grep; migration on populated data; race test; live smoke status codes; leftover-DB check; CI jobs> (run against main @ <sha> at hand-back)
    MIGRATION:   0003_invites.sql — applied forward on populated data: yes/no; re-run no-op: yes/no
    SHARED FILES TOUCHED: <every file outside server/invites, src/features/invites and 0003 — what and why>
    IDENTIFIERS USED:     p1-i-invites; 0003_invites.sql; server/invites/**; registerInviteRoutes; ADMIN_EMAIL; inv_ token; /settings/invites
    EXISTING CHECKS MODIFIED: <path — before → after; why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p1-i; processes stopped: <PIDs or none>; clone-scoped process check output: <empty or listed>; scratch databases created: <count> — all dropped: yes/no
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <atomicity approach if better-auth limits it; other>
    RESIDUAL GAPS:       what was verified by hand vs automatically; the surface and model you actually ran in; wall-clock time
Disclosure in the last four fields counts as diligence, not failure.

The standing goal below authorises fixing CI and review-bot findings on this PR only. It does not authorise widening scope, editing files outside the Scope section, editing planner-owned files, touching other databases or Render, weakening or skipping checks, or deciding anything listed under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
