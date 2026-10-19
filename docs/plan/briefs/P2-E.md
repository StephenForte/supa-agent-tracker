DISPATCH · Model: Sonnet (web-only layout work plus static PWA assets; no server logic, no schema) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at 1a8ad65 (P2-A..P2-D merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432).
Runtime: unmeasured; expect 1.5–2.5 h.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-e, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-e-mobile → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-E — Mobile polish pass + installable web app (PWA)

## Evidence (planner audit of main 1a8ad65, demo build, 375×812, 2026-10-19)
- There's no horizontal scroll anywhere (`scrollWidth` 375); P2-D's run cards work. The problem is vertical: reaching content takes too long.
- **Projects** (/projects): the full filter panel (search, lifecycle, type, activity, harness, tags, sort) is always open. The first project card starts **1,187 px** down; the page is 4,155 px.
- **All agents** (/agents): description, view buttons, the archived toggle, then "Agent runs" with sort, search and filters. The first run card starts **1,064 px** down. Each mobile run card is about **250 px** tall (agent, title, id line, then three rows of badges, message, close link), so about 3 fit per screen.
- **Project page** (/projects/prj_offers): one column of **4,373 px**. Agent runs start at 801 px, "Agent next steps" at 2,585 px and "My private notes" at 3,792 px, with no way to jump between them.
- **Tap targets:** on the project page, **18 of 46** links, buttons and inputs are under 32 px tall (e.g. "Edit project", "Demo: close run"). Phone guidance is about 44 px.
- **Not installable:**
  - no `<link rel="manifest">`, no icons, no apple-touch-icon (index.html has only viewport and theme-color #172c36);
  - no favicon at all; there's no `public/` directory;
  - the static `<title>` in index.html is "Supa Agent Tracker · Demo", and production serves that HTML too. src/app/Shell.tsx fixes the title at runtime, but iOS can capture the static one when you add to home screen.
- What's fine and must stay: the three-item top nav fits; run details expand inside the card with a working "← <project>" link (P2-D).

## Read first (trust the repository over this brief)
AGENTS.md; docs/plan/DECISIONS.md D-007 (routes), D-028 (demo build via VITE_DATA_SOURCE), D-034 (URL-kept filters, archived toggle) and D-035 (the public page is noindex); server/app/spa.ts (`@fastify/static` with `wildcard: false` serving `dist/`, plus the SPA fallback for non-reserved paths).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-e, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-e && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-e
    cd /Users/stephenforte/src/supa-agent-tracker-p2-e && git checkout -b p2-e-mobile origin/main
    pwd
The final pwd must print the clone path. If it exists already, stop and report. Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: call list_projects and use the project whose repository matches StephenForte/supa-agent-tracker ("Agent Dashboard"). If there's none or several, ask the operator once.
  - check_in with agent_name "<your surface>-P2-E", title "P2-E: Mobile polish + installable web app", workload_type "coding", task_id "P2-E" and a fresh request_id.
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
Branch p2-e-mobile. PR title "P2-E: Mobile polish and installable web app". Commit subjects start with "P2-E: ". No migrations, no new identifiers. Don't edit docs/plan/**.

## Outcomes
**Targets, at 375×812 with the demo seed: the first content item starts within the first screen (top < 812 px) on Projects and All agents, and no interactive element is shorter than 44 px tall (or has a 44 px hit area).**

1. **Collapsible filters.**
   - Below the md breakpoint, the Projects filter panel and the All agents run filters (search, activity, More filters) sit behind one "Filters" button. When active filters differ from the defaults, the button shows a count.
   - It opens inline or as a sheet; your choice, but keyboard and screen-reader operable.
   - The view buttons (Active / Live / Waiting for review / Completed) stay visible but take one horizontally scrollable row, not a wrapping block. Its own internal scroll is allowed; the page must not scroll sideways.
   - The page descriptions are shortened or hidden on mobile.
   - md and up stay exactly as today.
   - URL-kept state (D-034: sort, filters, `archived`, `view`, `run`) keeps working unchanged.
2. **Compact run cards** (mobile only).
   - Collapsed, each card shows:
     - line 1: agent / task;
     - line 2: title;
     - line 3: one combined status chip (execution · work · live/stale with last contact);
     - the latest status message, one line;
     - a PR chip if any.
   - Tap to expand: the existing details, actions (Close run / Mark done), short id and project.
   - Aim for ≤ 130 px collapsed.
3. **Project page on mobile.**
   - A compact sticky in-page bar with jump links to Runs, Next steps and Notes.
   - The summary counts become a compact 3-column grid.
   - "Edit project" and "Archive project" become a tidy action row with ≥ 44 px targets.
4. **Tap targets.**
   - Raise small text links that act as controls to ≥ 44 px hit areas on mobile, via padding or min-height, without changing desktop density. That includes "Edit project", "close run", "Mark done", "+ <agent>" toggles and pagination.
   - Add a test helper that renders key pages at 375 px and asserts that no button, link or input is under 44 px. jsdom has no layout, so assert the classes or tokens you apply, or use a computed-style check you can justify. Explain your method.
5. **Sticky header.** The top bar (logo and the three nav items) stays reachable on mobile, sticky and compact. The demo banner doesn't stack on top of it into a tall block: merge them or let the banner scroll away.
6. **Installable web app (PWA), with no service worker in this task.**
   - Add `public/manifest.webmanifest` with:
     - name "Supa Agent Tracker", short_name "Supa Agents";
     - start_url "/projects", scope "/", display "standalone";
     - theme_color "#172c36" and a background_color;
     - icons 192 and 512 PNG, plus a 512 maskable.
   - Add `apple-touch-icon` (180), favicon (32 + SVG), and `apple-mobile-web-app-capable` / `-status-bar-style` / `-title` meta.
   - Create the icons from a simple "S" mark matching the in-app logo, generated deterministically from source you commit (e.g. an SVG plus a build-free conversion you document). Don't use stock or third-party artwork.
   - Change the static `<title>` in index.html to "Supa Agent Tracker". Shell.tsx keeps adding "· Demo" at runtime in demo builds.
   - Verify `@fastify/static` serves `/manifest.webmanifest` (content-type `application/manifest+json`) and the icons from the built `dist/`, and that the SPA fallback doesn't swallow them. Add a server test that fetches them from a built dist fixture.
   - **No service worker**: no offline caching, so no stale-app risk. Push notifications, which would need one, are a later task.
   - The public page (`/public/:handle/agents`) keeps `noindex` and works unchanged.

## Must hold (tests as properties)
- At 375 px (component tests with a mobile viewport or matchMedia mock): the Projects and All agents filters are collapsed by default, and the Filters button opens them and shows an active-filter count. At ≥ 768 px the filters render expanded exactly as before.
- URL state still round-trips: sort/filter on Projects, view/archived/run on All agents (the existing D-034 tests pass unchanged).
- A collapsed run card shows title, combined status and the one-line message. Expanding reveals Close run / Mark done and the short id. Mark done still works from the card.
- The project page jump links target the three section ids.
- The tap-target helper passes on Projects, All agents and the project page at mobile size.
- Manifest: valid JSON with the required fields. Every icon path it lists exists in the built `dist/`. The server serves the manifest with `application/manifest+json` and the icons as `image/png`. A request for an unknown `/nonexistent.png` still gets the existing behaviour.
- `index.html` has the manifest link, apple-touch-icon and the neutral title. The demo build's runtime title still ends with "· Demo".
- Existing checks aren't weakened, skipped or deleted. Declare any modified assertion with before → after and why.

## Scope
- Free: index.html, public/** (new), src/app/Shell.tsx, src/pages/projects/**, src/features/projects/ProjectFilters.tsx, src/features/projects/ProjectCard.tsx, src/pages/agents/AgentsPage.tsx, src/features/agents/**, src/features/runs/**, src/pages/project-detail/ProjectDetailPage.tsx, src/features/next-steps/** (layout only), src/features/private-notes/** (layout only), src/components/ui/** (size tokens for tap targets), src/styles/** (or wherever Tailwind config lives), a new test helper under src/test/**, server/app/spa.ts (only if static serving needs a MIME/type fix), and tests for all of these.
- Don't touch:
  - server logic beyond spa.ts;
  - migrations; server/public/** and src/pages/public/** except to keep noindex intact;
  - MCP, auth, tokens and data-source contracts;
  - docs/plan/**, render.yaml, Render or production.
- If the task seems to need anything else, stop and report.

## Out of scope (with reasons)
- Service worker, offline mode and push notifications: a separate, larger task. Push needs a service worker, server keys and subscriptions.
- A "Needs me" home screen: deferred by the operator. Don't add new screens.
- A native app: not planned.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main 1a8ad65: 63 files / 460 tests (planner measurement). Report your counts.
Manual, in a real browser with device emulation (375×812), demo build and http build. Report the numbers:
- first-content top on Projects and All agents, before vs after (planner's before: 1,187 px and 1,064 px);
- collapsed run-card height (before about 250 px);
- project page total height;
- count of interactive elements under 44 px on the project page (before 18 of 46);
- confirm `/manifest.webmanifest` and the icons return 200 from the built server. If available, Chrome DevTools → Application → Manifest shows no errors and offers "Install".
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-e-mobile.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-e-mobile -t "P2-E: Mobile polish and installable web app" -F <body file>. The body includes the before/after numbers table and how to install on iPhone: Safari → Share → Add to Home Screen. Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-E — Mobile polish and installable web app
    LINE OF WORK: p2-e-mobile
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; before/after numbers (first-content top ×2, card height, project page height, small targets); manifest/icons served; builds; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside the Free list and why>
    IDENTIFIERS USED:     none new
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (or: none)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-e; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified (e.g. real iPhone install); surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, adding a service worker, touching server logic beyond static serving, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
