DISPATCH · Model: Sonnet (client-only auth form changes; the invite stays memory-only and the server is untouched) · Order: now, alone.
Surface: a local Claude Code, Cursor or Codex agent on the operator's Mac. Not a cloud sandbox.
Repository: StephenForte/supa-agent-tracker (private, GitHub)
Baseline: main at e6b260e (P2-H merged). If main has moved, merge current main into your branch before hand-back.
Host: the operator's Mac only. Node 24+, npm, git, authenticated gh, and the operator's Postgres.app (PostgreSQL 18 on localhost:5432) for the test suite.
Runtime: unmeasured; expect 45-90 min.
Working directory: /Users/stephenforte/src/supa-agent-tracker-p2-i, a fresh clone you create in Step 0. Never the operator's Dropbox checkout. Landing: new branch p2-i-auth-form-invites → a new PR into main.
Teardown: after the push and green CI: stop every process you started, run the clone-scoped process check in AGENTS.md, drop every database you created, delete the clone, end your session. Report it on the CLONE line.

# P2-I — Auth form layout + invite survives in-app navigation

## Why (operator, 2026-10-19)
1. A friend tried to log in and register on production and got "This invitation is invalid or has expired".
2. Feedback from a user: "the inputs overlap with everything to the left of the inputs. just needs to add some spaces between the left column stuff and the input column stuff." The operator's screenshot of /register shows "Name" with an unstyled input jammed against it ("Namegogogo"), "Emailtytus1+93@gmail.com", and Password / Confirm password with no visible boxes.

## Diagnosis (planner, read from main e6b260e; trust the repository over this)
Layout:
- src/pages/auth/LiveAuthScreen.tsx renders each field as an inline label with a bare input, for example `<label>Name<input name="name" .../></label>`. The inputs have no classes, so they sit inline right after the label text, with no border and no spacing.
- Other inputs in the app are styled explicitly, for example src/features/invites/InviteReveal.tsx uses `className="mt-1 block w-full rounded border border-slate-400 bg-white px-3 py-2 ..."`.
Invite:
- Registration is invite-only (D-022, D-031). Any missing, used, expired, revoked or email-mismatched invite returns the same 403, by design (server/invites/signup.ts, docs/api.md). The email must equal the invited address exactly (after trim and lowercase), so tytus1+93@gmail.com doesn't match an invite for tytus1@gmail.com.
- LiveAuthScreen reads `?invite=` once into component state, then strips it from the URL (deliberate: the invite must stay out of the URL, DOM and storage; pinned by src/features/invites/invites.test.tsx "strips only invite from the register URL ... retains it only in memory").
- AuthPage mounts it as `<LiveAuthScreen key={pathname} />`. So an invitee who opens the link, clicks "Log in" (or "Forgot password"), then clicks "Register" gets a fresh component with no invite. Their sign-up goes out without one and gets the generic 403. A reload loses it the same way.
- The register form doesn't say whether an invite is attached, and the 403 text doesn't hint at the email-match rule.
- The planner couldn't read production data, so which of these hit the friend is unconfirmed. The in-app navigation loss matches "tried to log in/register", and the code shows the path is real.

## Read first
AGENTS.md (gate, hygiene); docs/plan/DECISIONS.md D-022, D-031 (invite-only, one generic server response). This brief's invitee-side rules will be recorded as D-038 on the planner's docs branch, which isn't on main yet. **This brief is the full spec**, so don't look for D-038 in the repo. Also read: src/pages/auth/{AuthPage,LiveAuthScreen}.tsx, src/pages/auth/live.test.tsx, src/features/invites/invites.test.tsx, src/features/invites/InviteReveal.tsx (input styling to match), src/styles/app.css (the mobile tap-target rules under .app-shell).

## Step 0 — get your own clone (do this first)
    pwd
If the path contains "Dropbox", or is not /Users/stephenforte/src/supa-agent-tracker-p2-i, run:
    mkdir -p /Users/stephenforte/src
    test -e /Users/stephenforte/src/supa-agent-tracker-p2-i && echo "EXISTS - stop and report" || git clone https://github.com/StephenForte/supa-agent-tracker.git /Users/stephenforte/src/supa-agent-tracker-p2-i
    cd /Users/stephenforte/src/supa-agent-tracker-p2-i && git checkout -b p2-i-auth-form-invites origin/main
    pwd
- The final pwd must print the clone path. If the clone path exists already, stop and report.
- Never run checkout/switch/reset/stash/clean in a tree whose branch you didn't create.

## Reporting — the Supa Agent Tracker MCP tools should be in your session
- R1. Before any other work: check_in with project_id 2a8b9e0c-aaf2-4f66-bae9-2bd9a51d6cd7 ("Agent Dashboard"), agent_name "<your surface>-P2-I", title "P2-I: Auth form layout and invite handling", workload_type "coding", task_id "P2-I" and a fresh request_id.
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
Branch p2-i-auth-form-invites. PR title "P2-I: Auth form layout and invite handling". Commit subjects start with "P2-I: ". No migrations. Don't edit docs/plan/**.

## Outcomes
### A. Auth form layout (live screens: /login, /register, /forgot-password, /reset-password)
1. Each label sits on its own line above its input. Each input is full width (within the form's max-w-md), with a visible border, padding, a white background and a small gap below the label, matching InviteReveal's input.
2. Fields have clear vertical spacing between them. The submit button and the links below stay as they are.
3. At 375 px: no horizontal scroll, and inputs meet the existing mobile tap-target height.
4. Check the demo-mode screens (RegisterScreen, LoginScreen, ForgotPasswordScreen, ResetPasswordScreen). If they show the same overlap, fix them the same way. If they don't, leave them alone and say so.
5. Labels stay programmatically tied to their inputs. getByLabelText('Name'), ('Email'), ('Password', { exact: true }) and ('Confirm password') must keep working, unchanged.

### B. Invite survives in-app navigation (D-038, memory only)
1. Once /register?invite=... has loaded, the invite stays attached for the rest of this page session, across in-app navigation between auth pages. Example: Register → Log in → Forgot password → Register, then submit: the signup body carries the invite.
2. It stays memory-only, exactly as today: never in the URL after the first load, the DOM, localStorage, sessionStorage, cookies or logs. The existing invites.test.tsx assertions stay green, unmodified. A full page reload may lose it, and that's accepted.
3. Clear it after a successful sign-up, so a later registration in the same tab doesn't reuse a consumed invite.
4. Any mechanism that meets 1-3 is fine, such as lifting it above the keyed component or a small module-scope holder with a test-reset hook. Explain your choice in the PR.

### C. The register page says what it needs
1. With an invite attached, /register shows a short note above the form: "You're registering with an invitation. Use the email address the invitation was sent to."
2. With no invite attached, it shows: "Registration is by invitation only. Open the invitation link from your email." The form stays usable: the ADMIN_EMAIL bootstrap registers without an invite (D-031), so don't disable submit.
3. On a 403 from sign-up, the client shows: "This invitation is invalid or has expired. Use the email address the invitation was sent to, or ask for a new invitation." This is client copy only. The server's response body and status stay byte-identical (server/** is off-limits), so nothing becomes enumerable. The only existing assertion that should change is live.test.tsx "shows invitation-only registration errors" (exact text). Declare it under EXISTING CHECKS MODIFIED.

## Scope
- Free: src/pages/auth/** (including the tests there), src/features/invites/invites.test.tsx (additions only; existing assertions unchanged).
- Additive only: src/styles/app.css, if you'd rather add a shared auth-field class than inline classes. Don't change existing rules there: other screens depend on them.
- Don't touch: server/** (one generic 403 is a security decision, D-031, pinned by server tests); src/data/** (the auth client and the transport); src/features/invites/InviteReveal.tsx and InvitesPanel.tsx (the admin side, already correct).
- If an outcome seems to need anything outside these, stop and report rather than widen scope.

## The trap
Making the invite survive by writing it to sessionStorage or localStorage, or by leaving it in the URL, is the obvious fix and the wrong one. The invite is a bearer secret for creating an account. P1-I chose memory-only, and invites.test.tsx enforces it by scanning both storages and the DOM. A storage-based fix either fails that test or tempts you to weaken it. Weakening it is out of bounds.
The second trap: a module-scope holder that's never cleared leaks between tests (and between sign-ups in one tab). Clear it on success and reset it in test setup.

## Coverage (properties)
- Register?invite=X → navigate to Log in → back to Register → submit: the request body's invite === X. Without the fix this must fail (show it: run it on main first, or mutate).
- After that flow: URL, DOM, localStorage and sessionStorage never contain X.
- After a successful sign-up, a second sign-up in the same tab sends no invite.
- The invited note shows with an invite, and the invite-only note shows without one. A 403 shows the new client copy.
- Layout: each auth input carries the field styling (assert the class or a test id; jsdom can't measure overlap). Then confirm by eye in a real browser (see Verification).
Mutation check you run and report: break the persistence (for example, re-key the holder per mount) and confirm the navigation test goes red. Then restore it.

## Verification
    export DATABASE_URL=postgres://localhost:5432/postgres
    npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run build:server && VITE_DATA_SOURCE=http npm run build
Baseline on main e6b260e: 72 files / 512 tests (planner measurement). Report your counts. Unexplained movement is a finding.
Manual, in a real browser at desktop width and at 375×812 (Chrome device emulation is fine): /login, /register and /forgot-password show labels above bordered full-width inputs with no overlap. Do it in live (http) mode against a local server if you can; otherwise use the demo build, and say which. Describe what you checked.
Put any scratch files in one directory created with `T=$(mktemp -d)` and removed with `trap 'rm -rf "$T"' EXIT`. Never use bare /tmp paths.
Leftovers: `psql -h localhost -d postgres -Atc "select datname from pg_database where datname like 'supa_test_%'"` must show none of yours.

## Out of scope
- Prefilling or locking the invited email (it needs a server lookup by token: a new endpoint and an enumeration question). Not now.
- Changing server error responses, invite expiry, or the email-match rule (D-031).
- Surviving a full page reload (it would need storage, see The trap).
- Restyling inputs elsewhere in the app.

## Decisions
None open for you. If you believe memory-only is the wrong call for the invitee (for example, reloads matter more than the planner thinks), argue it in DECISIONS NEEDED and implement memory-only meanwhile.

## Hand-back — do all of these yourself, in order, without waiting to be asked
H1. Commit and push p2-i-auth-form-invites.
H2. Open the PR yourself: gh pr create -R StephenForte/supa-agent-tracker -B main -H p2-i-auth-form-invites -t "P2-I: Auth form layout and invite handling" -F <body file>. The body includes a summary, the verification evidence, and before/after screenshots or descriptions of /register at 375 px. Never leave the work only as a pushed branch.
H3. Wait for CI and bot review on the PR head. Fix failures within scope, and resolve or answer every bot comment. Then send R2 "bot review settled".
H4. Post the return block as a PR comment (gh pr comment <n> -R StephenForte/supa-agent-tracker -F <file>).
H4b. R4: check_out with the PR reference, then teardown.
H5. End with the return block in one fenced code block, unprompted. Then end your session.

## Return format (verbatim labels, this order, whole block in one fenced code block)
    TASK:        P2-I — Auth form layout and invite handling
    LINE OF WORK: p2-i-auth-form-invites
    REVIEW ARTIFACT: <PR URL>
    STATUS:      complete | complete-with-caveats | blocked
    VERIFICATION: <test counts; each property; mutation result; manual browser checks (which mode, which widths); builds; leftover-DB check; CI jobs; bot comments k fixed/answered> (run against <sha>)
    MIGRATION:   none
    SHARED FILES TOUCHED: <files outside src/pages/auth and why> (or: none)
    IDENTIFIERS USED:     P2-I; branch p2-i-auth-form-invites; D-038 (rules from this brief)
    EXISTING CHECKS MODIFIED: <path — before → after, and why> (expected: live.test.tsx 403 copy only)
    CLONE:               deleted /Users/stephenforte/src/supa-agent-tracker-p2-i; processes stopped: <PIDs or none>; clone-scoped check: <empty or listed>; databases created: <count> — all dropped: yes/no
    TRACKING:            run <run_id> checked in and out (<work_status>); bot-review-settled update sent: yes/no | not available: <why>
    TEMP:                none | <paths> — deleted: yes/no
    DECISIONS NEEDED:    none | <…>
    RESIDUAL GAPS:       <what's unverified; surface and model; wall-clock>
Disclosure in the last four fields counts as diligence, not failure. If you think part of this approach is wrong, argue it with evidence rather than implementing it half-heartedly.

The standing goal below starts after H2. It authorises fixing CI and review-bot findings on this PR only. It doesn't authorise widening scope, server changes, storing the invite anywhere but memory, weakening checks, or deciding anything under DECISIONS NEEDED.

/goal keep this PR merge-ready: fix failing CI checks and bot review comments until everything passes.
