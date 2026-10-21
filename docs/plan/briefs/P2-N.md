DISPATCH · Model: mid tier (Sonnet 5.5 or Grok 4.7): client-only UI against a fixed contract; the risks are date math and the upload path, both pinned by tests below · Order: wave 13, now, parallel with P2-M (server) and later P2-O. You build against the Contract; P2-M's endpoints won't exist on main until it merges, so test with loaders/fakes.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 5987a58 (P2-L merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24 (.node-version), npm, git, authenticated gh, Postgres.app for the existing server suites in the gate.
Runtime: unmeasured; expect 1.5–3 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-n, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: branch p2-n-profile-page → a new PR into main.
Teardown: after the push and green CI, stop your processes, drop your databases, delete the clone, end your session (H5).

# P2-N — Public profile page and profile settings (client)

## Why (operator, 2026-10-21)
"Update the Public Agents page to be a profile similar to Cursor's, include the ability to upload an image/avatar as well as show the public agents in a table/grid format. Include the streaks, etc like Cursor: https://cursor.com/@stevef". Cursor's page, top to bottom: avatar + name + @handle; a left column with "Joined 498 days ago" and X / GitHub / LinkedIn links; four stat tiles (Longest Agent 4h · Agents 218 · Longest Streak 102d · Current Streak 102d); a year heatmap (12 month labels across, M/W/F row labels, orange intensity cells); a tokens line chart; an "Agents" daily bar chart stacked Local/Cloud with a legend. Planner decision D-039 is on the planner docs branch (PR #74), not main, so **this brief is the full spec**. P2-M builds the server half in parallel against the Contract below.

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-035 (public page rules), D-007 (routes frozen — this task has explicit approval for the two route lines below), D-010 (no deps: charts and heatmap are hand-built SVG/CSS). Code: src/pages/public/PublicAgentsPage.tsx (+test; the 30 s visible-only polling, noindex, P2-H row order), src/data/public/{client,load,types}.ts, src/app/routes.tsx, src/pages/settings/{AccountSettings,LiveAccountControls,SettingsPage}.tsx (publicHandle + alerts UI), src/data/contracts.ts, src/data/http/tracker.ts, src/data/mock/{schema,seed,trackerStore}.ts, src/domain/types.ts, src/domain/format.ts, src/components/ui/Badge.tsx, src/styles/app.css (mobile rules). docs/plan/PLAN.md "Known traps" (useNow / fake timers).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-n, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-n && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-n
    cd /Users/stephenforte/src/supa-agent-tracker-p2-n && git checkout -b p2-n-profile-page origin/main
    pwd
- The final pwd must print the clone path. If the clone path already exists, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.
- Scratch: one directory from mktemp -d, captured in a variable with trap 'rm -rf "$T"' EXIT. No bare /tmp paths.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-N", title "P2-N: Public profile page and profile settings", workload_type "coding", task_id "P2-N", a fresh request_id. Include harness and model only if you know them. Keep run_id and revision; write only the run_id to .supa/run-id.
- R2. update_status at each milestone, always with the latest expected_revision: gate green; PR opened (pr_references with the PR URL); bot review settled ("PR #<n>: all <k> bot comments resolved (<fixed> fixed, <answered> answered); CI green on <sha>", sent again if a later push draws new bot comments); blocked (with the reason).
- R3. Heartbeat at natural pauses, at least every 10 minutes while working.
- R4. After H4 and before teardown: check_out with execution_state finished (or failed), work_status waiting_for_review (or blocked), a one-paragraph completion_summary and the PR reference. Delete .supa/run-id only after check_out succeeds.
- R5. Reporting never blocks the task. On a transient failure retry the identical body with the same request_id. If the tools are missing or keep failing, carry on and say so on the TRACKING line. Never paste, print, log or commit the token.

## Line of work
Branch p2-n-profile-page, cut from origin/main. PR title "P2-N: Public profile page and profile settings". Commit subjects start with "P2-N: ". Don't edit docs/plan/** or docs/prd/**. No new dependencies (D-010).

## Pre-assigned identifiers
- Decision: D-039 (planner-written; cite it). No migration in this task (P2-M owns 0008).
- New folder: src/domain/public/ for pure helpers (date grid, levels, duration formatting, view param).

## Contract (D-039) — identical text in the P2-M and P2-N briefs. Neither task changes it alone; a needed change is a DECISIONS NEEDED item.
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
1. **Routes.** /public/:handle renders the profile page; /public/:handle/agents renders the same page (old links keep working). Only those two route lines change in src/app/routes.tsx. Keep noindex; document.title becomes "<name or handle> (@<handle>)".
2. **Header.** Avatar (img from avatarUrl, alt "<name or handle> avatar") or an initials circle when null; name (fallback: handle); @handle; "Joined N days ago" from joinedAt; link list for each non-null of github / x / linkedin, built only as https://github.com/<h>, https://x.com/<h>, https://www.linkedin.com/in/<h> with target="_blank" rel="noopener noreferrer". Bio under the name when present.
3. **Four stat tiles:** Longest agent (longestRunSeconds as "45s" / "37m" / "4h" / "2d", largest whole unit, like Cursor), Agent runs, Longest streak "Nd", Current streak "Nd".
4. **Activity heatmap** from activity: week columns, Monday-first rows, M/W/F row labels, month labels; 5 intensity levels (0 = empty; 1–4 by quartiles of the nonzero counts); every cell has an accessible label like "Oct 3, 2026: 4 runs". Inside its own overflow-x container so the page never scrolls sideways at 375 px.
5. **Agents chart** from harnesses: 30 daily stacked bars, legend with each series' total ("Cursor (175)"), the total in the heading ("218 agent runs" for the 30 days). Hand-built SVG, colours from existing tokens, readable in both themes the app supports.
6. **Agents section** from the existing /agents payload and polling: a Grid / Table toggle, URL param ?view=table (grid default, invalid value → grid). Grid = one card per logical agent (project name, agent name, latest run title, execution and work badges, Live/Stale, harness, run count shown, last contact), cards ordered by latest lastContactAt desc, agents with no runs last. Table = today's table unchanged in content and P2-H order.
7. **Loading/missing/error.** The profile loads once on mount and again when the tab becomes visible; the agents part keeps its 30 s poll. A 404 from either shows the existing "No public page here." Demo mode (no live loader) keeps "Public pages need the live app."
8. **Settings → Public profile** (in the live account controls, beside the handle): avatar picker with preview + Remove; name, bio (counter), GitHub / X / LinkedIn handle fields with inline validation matching the Contract; timezone select (Intl.supportedValuesOf('timeZone') + UTC), preselected to the browser zone when the saved value is the default UTC and nothing else is set; Save sends PATCH publicProfile with a fresh request_id. A link to the public page when a handle exists. Demo mode: fields work against the mock store; the avatar control says it needs the live app.
9. **Avatar upload path.** Reject files over 10 MB before decoding. Decode with createImageBitmap, center-crop square, draw to a 256×256 canvas, canvas.toBlob as image/webp (fall back to image/png if the browser returns another type or null), check ≤ 262144 bytes, then PUT /api/account/avatar with that Blob and its type. Never upload the original file. Revoke every object URL you create.
10. Account types: add publicProfile to the account type in src/domain/types.ts / contracts, map it in src/data/http, and seed it in the mock store (null fields, timezone UTC).

## The trap
- **Calendar dates shift a day in the browser.** activity.start/end are calendar strings in the owner's zone. new Date("2026-10-21") is UTC midnight, which renders as Oct 20 in Pacific, so the whole heatmap slides a day and month labels land on the wrong column, while tests run in UTC pass. Do all grid math on the "YYYY-MM-DD" strings (or Date.UTC + getUTC* only). Required tests run under TZ=America/Los_Angeles as well as UTC (report both): the last cell is labelled with activity.end; Monday-first placement of a known date is right; a year spanning a DST change still has 365 cells.
- **Leaking the original image.** Uploading the picked File sends the full-size original with its EXIF, including GPS location from a phone photo. Required test: the PUT body is the canvas Blob (mock createImageBitmap/canvas in jsdom), its type is webp or png, and the original File object is never passed to fetch.
- **Unsafe links.** Rendering a stored value as an href would let a crafted handle become javascript:. Links are built only from the fixed hosts above, and a test asserts the href for each.

## Must survive
PublicAgentsPage's existing behaviour and tests: visible-only polling, noindex, P2-H ordering, D-035's field set (show nothing that isn't in the payloads). Account settings' publicHandle and alerts flows. src/data/mock is never imported by views directly. No horizontal page scroll at 375 px; tap targets ≥ 44 px per the existing mobile rules.

## Coverage (as properties)
Duration formatting boundaries (59s, 60s, 3599s, 3600s, 86400s); heatmap levels (all zeros → all level 0; quartile boundaries); harness legend totals and Other last; ?view=table switch and fallback; grid card order; profile 404 → "No public page here."; avatar size gate (10 MB pre-check, 256 KiB post-check error message); settings validation messages for each field; timezone preselect rule.

## Out of scope (with reasons)
- server/** and migrations — P2-M owns them and is building now.
- A tokens chart — the tracker doesn't collect tokens (D-039).
- Image editing beyond center-crop — not requested.
- Changing other pages' links to the public page (they still work through the /agents alias).

## Scope
- Owns: src/pages/public/**, src/data/public/**, src/domain/public/** (new).
- Add only (keep edits additive): src/app/routes.tsx (two route entries only), src/pages/settings/** (new Public profile section), src/domain/types.ts, src/data/contracts.ts, src/data/http/** (account mapping + avatar calls), src/data/mock/** (publicProfile field), src/styles/app.css (only if a utility can't do it).
- Must not touch: server/** (P2-M), src/domain/integrations/**, src/features/tokens/**, src/features/integrations/**, docs/integrations/** (P2-O), package*.json, docs/plan/**, docs/prd/**.
## Verification (run against current origin/main at hand-back)
    git fetch origin && git merge origin/main     # if main moved; then rerun everything
    npm ci && npm run typecheck && npm run lint && npm test && npm run build
Server tests use the operator's Postgres.app (PostgreSQL 18, localhost:5432) the way the existing suites do; any database you create gets dropped at the end. State test-file and test counts before and after; unexplained movement is a finding. Existing checks may not be weakened, skipped or deleted. A test that encoded behaviour this task deliberately changes may change: declare it under EXISTING CHECKS MODIFIED with before, after, and why it's a strengthening.

## Stop and report
If the task seems to need a file outside "Owns" / "Add only", or a change to the Contract, stop and report it under DECISIONS NEEDED instead of widening scope. If you think the approach is wrong, argue it with evidence rather than implementing it half-heartedly.

## Hand-back — do all of these yourself, in order, without waiting to be asked
- H1. Commit and push p2-n-profile-page to StephenForte/supa-agent-tracker.
- H2. gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-n-profile-page -t "P2-N: Public profile page and profile settings" -F <body file in your mktemp dir> (summary + verification evidence + the return block). If the PR exists, update its body. Never leave only a pushed branch. Don't merge.
- H3. Wait for CI on the PR head; fix failures within scope. Address review-bot comments within scope.
- H4. Post the return block as a PR comment: gh pr comment <n> -F <file>.
- H4b. R4 check_out.
- H5. Teardown: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone and the scratch dir, end your session.
- H6. Your final message is the return block below, inside one fenced code block, unprompted.

## Return block (these labels, this order; one fenced code block)
    TASK:        P2-N — <one line>
    LINE OF WORK: p2-n-profile-page
    REVIEW ARTIFACT: <PR url>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <each check> — pass/fail, with counts (against origin/main <sha> at hand-back)
    MIGRATION:   none | <name> — applied forward on populated data: yes/no, evidence
    SHARED FILES TOUCHED: <path> — what, why additive (or none)
    IDENTIFIERS USED: <pre-assigned ones consumed>
    EXISTING CHECKS MODIFIED: <path> — before → after; why stronger (or none)
    CLONE:       deleted /Users/stephenforte/src/supa-agent-tracker-p2-n (+ processes stopped)
    TRACKING:    run <run_id> checked in and out (<work_status>) | not available: <why>
    TEMP:        none | <paths> — deleted: yes/no
    DECISIONS NEEDED: none | <question + what you did meanwhile>
    RESIDUAL GAPS: <what's not covered; hand vs automated; risk>
Disclosure in the last three fields counts as diligence, not failure.

The goal line below authorises fixing CI and bot findings on this PR only. It doesn't widen scope, permit weakening checks, or settle DECISIONS NEEDED items.
/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
