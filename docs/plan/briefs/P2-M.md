DISPATCH · Model: strongest tier (Opus 5.5 or GPT-6): migration, a public unauthenticated endpoint under an allowlist, binary upload, timezone-correct aggregation · Order: wave 13, now, parallel with P2-N (client) and later P2-O; the contract below is shared with P2-N.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 5987a58 (P2-L merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app (PostgreSQL 18, localhost:5432).
Runtime: unmeasured; expect 1.5–3 h. Morning or early-afternoon dispatch.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-m, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-m-profile-server → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-M — Public profile: server (migration 0008, profile fields, avatar, profile endpoint)

## Why (operator, 2026-10-21)
"Update the Public Agents page to be a profile similar to Cursor's, include the ability to upload an image/avatar as well as show the public agents in a table/grid format. Include the streaks, etc like Cursor: https://cursor.com/@stevef". That page shows: avatar, name, @handle, "Joined 498 days ago", X/GitHub/LinkedIn links, four tiles (Longest Agent 4h · Agents 218 · Longest Streak 102d · Current Streak 102d), a year heatmap of daily activity, a tokens chart, and an agents-per-day chart split Local/Cloud. The planner's decision is D-040; it's on the planner docs branch (PR #74), not main, so **this brief is the full spec**. P2-N builds the page and settings UI in parallel against the Contract below.

## Read first (trust the repository over this brief)
AGENTS.md (gate, hygiene); docs/plan/DECISIONS.md D-035 (public page rules: opt-in, allowlist, identical 404, rate limit, no-store, no IDs), D-010 (no deps), D-033 (idempotency). Code: server/public/{read,routes,handle,limit,account}.ts and public.test.ts (the exact-key allowlist tests to copy), server/api/{user-routes,schemas,map}.ts (PATCH /api/account with publicHandle + alerts), server/repo/views.ts (readAccount), server/db/schema.ts, server/db/migrations/0006_public_pages.sql and 0007_alerts.sql (style), server/app/build-app.ts (bodyLimit 1 MiB, global nosniff from P2-L), server/app/auth-context.ts (requireUser), docs/api.md.

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-m, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-m && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-m
    cd /Users/stephenforte/src/supa-agent-tracker-p2-m && git checkout -b p2-m-profile-server origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-M", title "P2-M: Public profile server, avatar upload and stats", workload_type "coding", task_id "P2-M", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-m-profile-server, cut from origin/main. PR title "P2-M: Public profile server, avatar upload and stats". Commit subjects start with "P2-M: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).

## Pre-assigned identifiers (override any "next number" convention; stop and ask if taken)
- Migration: server/db/migrations/0008_public_profile.sql (0007_alerts is the latest on main).
- Decision: D-040 (already written by the planner; cite it, don't add to DECISIONS.md).

## Contract (D-040) — identical text in the P2-M and P2-N briefs. Neither task changes it alone; a needed change is a DECISIONS NEEDED item.
Account body (GET /api/account and every PATCH/PUT/DELETE account response) gains:
    publicProfile: { name: string|null, bio: string|null, github: string|null, x: string|null, linkedin: string|null, timezone: string, avatarUpdatedAt: string|null (ISO 8601) }
PATCH /api/account body gains optional `publicProfile: { name, bio, github, x, linkedin, timezone }`. When present, all six keys are required. null clears a text field. Same request_id idempotency as publicHandle and alerts today. 400 validation_error unless:
    name: trimmed, 1–60 chars, or null      bio: trimmed, 1–160 chars, or null
    github: ^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$ or null
    x: ^[A-Za-z0-9_]{1,15}$ or null          linkedin: ^[A-Za-z0-9-]{3,100}$ or null
    timezone: "UTC" or a member of Intl.supportedValuesOf('timeZone')
PUT /api/account/avatar — raw request body, Content-Type image/png | image/jpeg | image/webp, at most 262144 bytes. 200 → account body. 415 any other type (incl. image/svg+xml, multipart, text/plain), 413 too large, 400 when the magic bytes don't match the declared type or the body is empty.
DELETE /api/account/avatar — 200 → account body; idempotent (no avatar is still 200).
Both avatar routes: signed-in session only (same guard as PATCH /api/account); MCP bearer tokens get 401.
GET /api/public/:handle/profile — unauthenticated, same rate limiter family, cache-control no-store, and the identical 404 as /api/public/:handle/agents (unknown, malformed, or no public non-archived project). 200 body, these keys exactly at every level:
    { owner: { handle, name, bio, links: { github, x, linkedin }, joinedAt, avatarUrl },
      stats: { agentRuns, longestRunSeconds, currentStreakDays, longestStreakDays },
      activity: { start, end, counts },
      harnesses: { start, end, series: [ { harness, counts } ] } }
    joinedAt = users.created_at ISO. avatarUrl = "/api/public/<handle>/avatar?v=<first 16 hex chars of the avatar sha256>" or null.
    activity: start/end are "YYYY-MM-DD" calendar dates in the owner's profile timezone; end = today there; 365 entries, start..end inclusive; counts[i] = runs started that day.
    harnesses: last 30 days ending today (owner zone), counts arrays of length 30. At most 5 series: the top 4 harnesses by 30-day total (desc; tie → name asc), then "Other" for the rest if nonzero. A null harness is labelled "Unknown". Series with a zero total are omitted. Order: the top 4 in rank order, "Other" last.
    stats over the owner's public, non-archived projects, all runs (subagents included), all time: agentRuns = count of runs; longestRunSeconds = floor(max(coalesce(finished_at, last_contact_at) − started_at)), 0 with no runs; an active day = an owner-zone day with ≥1 run started; currentStreakDays = consecutive active days ending today, or ending yesterday if today has none, else 0; longestStreakDays = the longest such run ever.
GET /api/public/:handle/avatar — the stored bytes with the stored Content-Type, x-content-type-options: nosniff, content-security-policy: default-src 'none'; sandbox, ETag "<full sha256 hex>", cache-control: no-cache; 304 when If-None-Match matches. 404 identical to the profile 404, and also when there's no avatar. Rate-limited per IP with its own limiter.
Unchanged: GET /api/public/:handle/agents keeps its exact payload and tests.

## Outcomes
1. Migration 0008: users gains public_name, public_bio, public_github, public_x, public_linkedin (text NULL, CHECK constraints matching the Contract's rules) and profile_timezone text NOT NULL DEFAULT 'UTC'. New table user_avatars (user_id PK → users ON DELETE CASCADE, content_type CHECK in the three types, bytes bytea NOT NULL, byte_size int CHECK 1..262144, sha256 text NOT NULL, updated_at timestamptz). Keep the bytes out of the users table so account reads never load them. Existing rows: all new fields NULL, timezone UTC.
2. GET/PATCH /api/account carry publicProfile per the Contract; PATCH validation lives in schemas.ts beside publicHandle/alerts, applied inside the same transaction and idempotency path. Updating publicProfile doesn't touch publicHandle or alerts, and vice versa.
3. PUT/DELETE /api/account/avatar per the Contract. Register an image content-type parser scoped to these routes only (Fastify addContentTypeParser with parseAs buffer and a 262144 bodyLimit on the route), never globally. Sniff magic bytes yourself: PNG 89 50 4E 47 0D 0A 1A 0A; JPEG FF D8 FF; WebP "RIFF" at bytes 0–3 and "WEBP" at bytes 8–11. Store sha256 of the bytes. Write an audit/event row if the account PATCH writes one today; otherwise don't invent one.
4. GET /api/public/:handle/profile per the Contract, built field by field like readPublicAgents (never spread a row). Put the streak/day math in a pure module (e.g. server/public/stats.ts) that takes the active-day set, the owner timezone and "now", with unit tests. Do the day bucketing in SQL with (started_at AT TIME ZONE <zone>)::date, or in JS with Intl.DateTimeFormat in that zone; never with the process's local time.
5. GET /api/public/:handle/avatar per the Contract.
6. docs/api.md documents all five route changes, including the 404 and 413/415/400 cases.

## The trap
- **Privacy leak through aggregates.** The stats, heatmap and harness chart must use exactly the agents endpoint's scoping: this owner, is_public = true, lifecycle <> 'archived'. A query that forgets one condition leaks the existence and timing of private work to anonymous visitors, and nothing on the page looks wrong. Required tests: a private project's runs and an archived public project's runs change none of agentRuns, longestRunSeconds, the streaks, activity.counts or harnesses; another owner's runs likewise; the exact-key test fails on any extra key at any level (copy the agents allowlist test style).
- **Timezone day boundaries.** The operator is in America/Los_Angeles and production runs in UTC; your Mac runs in Pacific. Code that buckets with local time passes on your machine and is off by a day in production. Required tests, with an injected "now": a run at 2026-10-21T06:30Z counts on 2026-10-20 for America/Los_Angeles and on 2026-10-21 for UTC; currentStreakDays survives "today has no run yet" (ends yesterday) and drops to 0 after a missed day; activity.end equals the owner-zone today and counts has 365 entries; a DST-crossing window still has 365 entries. Run the suite once with TZ=UTC and once with TZ=America/Los_Angeles and report both.
- **Upload abuse.** No path may accept SVG, multipart or text/plain (those are simple CORS types a cross-site form can send; image/* is not). A body labelled image/png holding JPEG bytes is 400. 262145 bytes is 413. A bearer MCP token is 401 on both avatar routes. Tests for each.

## Must survive
D-035's rules and GET /api/public/:handle/agents byte-for-byte (its tests unchanged). The identical 404 body for every miss. no-store on JSON public responses. Existing account PATCH behaviour (publicHandle 409 taken, alerts, idempotent replay and mismatch). The global JSON body limit for every other route.

## Coverage (as properties)
- Migration applies forward on a database already holding users, projects and runs (seed one with the existing helpers first), and existing users read back timezone UTC and null profile fields.
- Profile stats on a known fixture: e.g. runs started on 5 consecutive owner-zone days, a gap, then 2 days ending today → current 2, longest 5; longestRunSeconds uses last_contact_at for a still-running run.
- Harness series: 6 harnesses → 4 named + Other; a null harness appears as Unknown; tie order by name.
- Avatar: round-trip bytes and content-type; ETag/304; nosniff and CSP headers present; DELETE then GET → 404; avatarUrl null after delete and changes v= after a new upload.
- Query count: the profile endpoint issues a bounded number of queries independent of run count (assert it, e.g. ≤ 6).

## Out of scope (with reasons)
- Any client code under src/** — P2-N owns it and is building against the Contract now.
- Image resizing/transcoding on the server — it needs a dependency (D-010); the client re-encodes and the server validates.
- Search indexing — still noindex per D-035, operator's call.
- Token usage — the tracker doesn't collect it (D-040).

## Scope
- Owns: server/db/migrations/0008_public_profile.sql (new), server/public/** (new files and edits), docs/api.md.
- Add only (others may touch these later; keep edits additive): server/db/schema.ts (new columns/table), server/api/user-routes.ts (avatar routes + publicProfile in PATCH), server/api/schemas.ts, server/api/map.ts (toAccount), server/repo/views.ts (readAccount columns), server/app/routes.ts only if registration needs it.
- Must not touch: src/** (P2-N), docs/plan/**, docs/prd/**, docs/integrations/** (P2-O), package*.json.

## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the Contract, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-m-profile-server to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-m-profile-server -t "P2-M: Public profile server, avatar upload and stats" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-M — <one line>
    LINE OF WORK: p2-m-profile-server
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-m (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
