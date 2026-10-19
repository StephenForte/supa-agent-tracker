DISPATCH · Model: Sonnet (one new client-side screen over existing data and actions, plus icon assets; no server logic, no schema) · Order: now, alone. Dispatch promptly: Step 0 copies the icon source from a temporary path.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 4fdf2e2 (P2-E merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only (macOS `sips` is available for image work). Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 1.5–2.5 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-f, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-f-needs-me → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-F — "Needs me" home screen + the operator's new app icon

## Why (operator, 2026-10-19)
- The operator wants a phone-first screen showing only what needs their attention, with the actions right there.
- They supplied a new app icon to replace P2-E's generated "S" mark.

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-007 (routes), D-034 (archived projects hidden by default). This screen's rules are recorded as D-036 on the planner's docs branch, which isn't on main yet. **This brief is the full spec**, so don't look for D-036 in the repo; src/app/{routes.tsx,Shell.tsx}; src/domain/runs/grid.ts (`stale()`, `liveContact()`; reuse them, don't copy the rules); src/features/runs/{RunGrid,CloseRunDialog}.tsx (the existing Close run and Mark done flows); public/manifest.webmanifest and public/generate-icons.py (from P2-E).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-f, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-f && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-f
    cd /Users/stephenforte/src/supa-agent-tracker-p2-f && git checkout -b p2-f-needs-me origin/main
    mkdir -p assets/icon
    cp /private/tmp/claude-501/-Users-stephenforte-Library-CloudStorage-Dropbox-Personal-Dev-SupaAgentDashboard/13ef910d-dd5e-4632-ab91-b2305adfb9e8/images/5.jpg assets/icon/source.jpg
    shasum -a 256 assets/icon/source.jpg
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- The sha256 must start with 46702b7854d58896 (1024×1024 JPEG). If the copy fails or the hash differs, stop and ask the operator to save the icon image and give you its path.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker ("Agent Dashboard"). If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-F", title "P2-F: Needs me screen + new app icon", workload_type "coding", task_id "P2-F" and a fresh request_id.
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
Branch p2-f-needs-me. PR title "P2-F: Needs me screen and new app icon". Commit subjects start with "P2-F: ". No migrations, no server changes beyond what static serving already does. Don't edit docs/plan/**.

## Outcomes
### A. "Needs me" screen (D-036)
1. **Route** `/needs-me` behind SessionGuard, in both the demo and http builds.
   - Add it as the **first** main-nav item, "Needs me", with a count badge of items, hidden when 0.
   - The nav must still fit at 375 px with no wrap and no horizontal page scroll. Shortening "Account & settings" to "Settings" on mobile is fine.
   - The browser root `/` keeps redirecting to `/projects`, unchanged.
   - Set the PWA `start_url` to `/needs-me`, so the home-screen app opens here.
2. **What counts as "needs me"**: the signed-in owner's runs in non-archived projects only (same scope as All agents' default, D-034). Three groups, in this order:
   - **Blocked**: `work_status = blocked` (any execution state). Show the blocker text.
   - **Stale**: running and `stale()` is true. Show "last contact N min ago".
   - **Waiting for review**: `execution_state = finished` and `work_status = waiting_for_review`. Show the PR link(s) if any, else the completion summary, truncated.
   Within each group, oldest first: by last contact for stale, by finish time for review, by updated time for blocked. A run appears in at most one group, with Blocked taking precedence.
3. **Each item** is a compact card (reuse P2-E's card styling): agent / task, title, project name (linking to the project), group-specific line, the latest status message (one line), and actions:
   - Waiting for review → **Mark done** (the existing flow) and **Open PR** (if a PR exists).
   - Stale → **Close run** (the existing CloseRunDialog flow).
   - Blocked → **Open run** (deep link to its details).
   Successful actions remove the item without a full reload. Conflicts use the existing conflict path.
4. **Header and empty state**: the page shows the total and per-group counts. When nothing needs attention: "Nothing needs you right now", with links to All agents and Projects.
5. It refreshes with the existing 7 s poller and no new polling. It works in the demo build: the demo seed has at least one item in each group, so add seed data in src/data/mock only if needed.

### B. New app icon
6. Generate every icon from `assets/icon/source.jpg` (copied in Step 0). The source has two problems to remove by cropping: **white rounded corners** and a **small sparkle watermark in the bottom-right corner**.
   - Crop a centred square, inset about 80 px on each side of the 1024 px source (about 864 px). Verify the corners and the bottom-right area contain no near-white pixels from the old rounding and no watermark.
   - Output:
     - apple-touch-icon 180 (iOS rounds it itself, so it must be full-bleed with no white corners);
     - icon-192 and icon-512 (`purpose: any`);
     - icon-maskable-512: the important content (face and the "F" emblem) inside the central 80% safe circle, padded with a background colour sampled from the image's dark blue;
     - favicon-32: a tighter crop of the head so it reads at 32 px.
   - Replace `favicon.svg` with a PNG favicon link if a faithful SVG isn't possible, and update index.html accordingly.
7. **Generator and source location.** Move the generator out of `public/` so build scripts aren't published: today `public/generate-icons.py` ships to `dist/` and production. Put it at `assets/icon/generate.sh` (or `.py`) and make it reproducible from `source.jpg`. Using macOS `sips` is fine; document the exact commands in the script header. `public/` should contain only the served files.
8. **In-app brand mark.** Replace the text "S" brand mark in the header (Shell.tsx `.brand-mark`) with the new icon image at the same visual size, with alt text empty because it's decorative next to the product name.
9. The manifest keeps its name, short_name, theme colour and display. It updates `start_url` (A.1) and the icon entries if file names change. Keep the P2-E server test (manifest and icons served with the right types) passing; update its file list if needed.

## Must hold (tests as properties)
- Grouping, from a fixed seed and clock:
  - a blocked run appears under Blocked only, even if it's also stale or finished;
  - a running run past its project's threshold is under Stale;
  - a finished + waiting_for_review run is under Waiting for review;
  - completed, cancelled, failed (not blocked), live running and archived-project runs don't appear;
  - another owner's runs never appear;
  - the ordering within groups is as specified.
- The count badge equals the item count and is hidden at 0. The empty state renders at 0.
- Actions: Mark done removes the item and calls the existing mark-done path once; Close run opens the existing dialog; a conflict shows the conflict path.
- Nav at 375 px: four items fit (no wrap, `scrollWidth` 375). The tap-target helper from P2-E passes on /needs-me.
- `/` still redirects to /projects. The manifest `start_url` is "/needs-me".
- Icons:
  - every manifest/link icon file exists in the built `dist/` with the stated pixel size;
  - `dist/` contains no `.py`/`.sh` generator;
  - the corner pixels of apple-touch-icon are not near-white (each RGB channel < 230);
  - served types are still correct (the existing P2-E server test).
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free:
  - src/pages/needs-me/** (new), src/domain/needs-me/** (new; reuse the grid helpers);
  - src/app/routes.tsx, src/app/Shell.tsx;
  - src/features/runs/** (only to reuse or expose card and action components);
  - src/data/mock/** (seed only);
  - public/** (icons and manifest), index.html, assets/icon/** (new);
  - src/styles/** (layout only);
  - the P2-E static-asset test (file list only);
  - tests for all of these.
- Don't touch:
  - server logic, migrations;
  - MCP, auth and tokens;
  - server/public/** and src/pages/public/** (the public page is unchanged and keeps noindex);
  - data-source contracts beyond reusing existing methods;
  - docs/plan/**, render.yaml, Render or production.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- Push or email alerts for these items: a separate decision (option 3).
- Changing the browser root `/`: kept as /projects (D-036); only the installed app opens on Needs me.
- New run actions (reopen, acknowledge failed): not requested.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 4fdf2e2: 65 files / 467 tests (planner measurement). Report your counts.
Manual, demo build in Chrome device emulation at 375×812:
- /needs-me shows all three groups; Mark done removes an item; the badge count updates;
- the nav fits;
- the icon renders in the header;
- `/manifest.webmanifest` lists the new icons and `start_url` "/needs-me";
- view each generated icon and confirm no white corners and no watermark. Describe what you checked.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths. The Step 0 copy into assets/icon/ is part of the commit, not scratch.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-f-needs-me.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-f-needs-me -t "P2-F: Needs me screen and new app icon" -F <body file>. The body includes a summary, the verification evidence, and a note that iPhone users who already added the app must remove and re-add it to pick up the new icon and start page. Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-F — Needs me screen and new app icon
    LINE OF WORK: p2-f-needs-me
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; manual checks; icon checks (corners/watermark, sizes); builds; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     route /needs-me; assets/icon/source.jpg (sha256 46702b78…)
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-f; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. a real iPhone re-add); surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, server changes, changing `/`, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
