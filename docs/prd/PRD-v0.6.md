# Supa Agent Tracker — PRD

Version: 0.6 — discovery draft, October 14, 2026

## Goal
Provide a central web dashboard where users monitor AI work across projects. Coding harnesses and recurring bots report activity through a remote MCP service. Deploy the application on Render with attached Postgres. Working product name: Supa Agent Tracker. The primary workflow is returning after time away, seeing what finished across projects, and knowing which human action to take first and next.

## Confirmed requirements
- Web login using UID/password and standard account lifecycle.
- Every reported agent run belongs to a project.
- Project cards show name, user-provided description, GitHub PRD link, repository name/link, running and total agent counts, latest agent status, and an agent-editable To Do section.
- Sort and filter projects; active projects first by default.
- Project detail contains an agent status grid: agent/task name (e.g. T0-11a), title, PR number, PR link displaying PR title, status, start time, live elapsed time, finish time, harness, model, and an expandable tools-used subtable.
- Support coding agents and general automation such as a daily weather bot. Inapplicable fields may be null.
- Provide reporting instructions/integration materials for Claude, Cursor, Codex, Dot, Muse, and Grokbot. Exact products, versions, and integration capabilities remain to be verified.

## Confirmed Phase 1 boundary
The system receives reports, stores them, and displays them. It does not launch agents, coordinate code edits, merge PRs, or verify task correctness. GitHub URLs are stored as metadata initially; no GitHub OAuth, API synchronization, or repository access is assumed. No billing, notifications, cost accounting, or full prompt/output capture initially.

## Identity and run model
Project → logical agent/task → runs → events and tool usage.
A logical agent can be a PRD task or a recurring bot. Each execution has its own immutable run ID; repeated daily bot executions and retries create distinct runs. Agent names are labels, not database identifiers. Optional parent_run_id represents subagents within the same authorized project.
Default grid emphasizes running agents, with expandable run details and execution history. Completed agents remain accessible through filters/history so the return-from-break workflow never hides their handoff. Show concurrent runs separately when one logical agent has several active runs. Project cards distinguish running agents, total logical agents, and run counts rather than conflating them.
One run may link to multiple PRs; store structured PR references and render the primary one plus an additional-count link.

## Accounts and authorization
Phase 1: open registration with private accounts and isolated projects. Phase 2 adds project sharing. Confirmed: email/password login with email verification and password reset. Include login/logout, password change, reset by expiring single-use email link, session expiry/revocation, and open registration with email verification. Store password hashes using an established auth library; use secure session cookies, CSRF protection where applicable, login rate limiting, and generic reset responses. Password reset requires a transactional email provider.
MCP authorization is separate from browser passwords. Confirmed requirement: users issue MCP access tokens in web account settings, with copy-once display, descriptive label, project scope, last-used time, and revocation/rotation. Store token hashes, never plaintext tokens or passwords in logs. Use HTTPS Authorization headers, not URL query tokens. Browser cookies cannot substitute for MCP tokens. Use revocable credentials with explicit project scopes, stored as hashes, displayed once on issuance. Enforce scope on every read and write, including parent IDs and To Do references. Remote MCP transport/auth must be verified against target clients; bearer token support cannot be assumed for every platform. OAuth may be required depending on target-client findings.

## Project dashboard
User manages project name, description, project type, lifecycle status, repo/PRD URLs, tags, and stale threshold. Generic projects may omit GitHub fields; coding projects expose them prominently.
Cards show running count, total run count, last update with agent name/message/time, and open To Dos. Latest activity is separate from project lifecycle status (Active, Paused, Completed, Archived).
Proposed sort: projects with currently running/non-stale runs first, then latest activity descending. Filters: text, lifecycle, project type, running/blocked/review/stale activity, harness, and tags. Archived projects hidden by default. Empty and no-match states offer clear next actions.

## Project detail
Show project metadata, activity counts, To Dos, and sortable/filterable/paginated run grid. Preserve null values as an em dash. Times are stored in UTC and displayed in user timezone. Elapsed means wall-clock start-to-now for unfinished runs and start-to-finish for finished runs; waiting is included. Stale rows continue elapsed display with a visible stale indicator until resolved. It does not estimate compute time.
Run detail shows execution and work-status timeline, completion summary, blockers, parent/subagent references, PRs, and tool usage. Users can correct metadata and manually close abandoned runs with a recorded audit event.

## Execution state, work status, and liveness
Execution state and work status are separate. Execution states: Running, Finished, Failed, Cancelled. Work statuses: In Progress, Blocked, Waiting for Review, Completed, Failed, Cancelled. Check-in creates a Running execution with In Progress work. Check-out ends the execution and sets finish time, while work may remain Waiting for Review or Blocked. Later review updates change work status without reopening execution or altering elapsed time. Further execution creates a new run. Display execution state and work status in distinct grid columns; filters support both.
Running-agent counts include only live Running executions; finished executions awaiting review never count as running. Counts distinguish live running, stale running, and review-needed work. Concurrent runs remain individually visible.
Stale is derived from last contact for Running executions, preserving reported work status. Propose configurable 15-minute threshold, adapted to client reporting capability. No stale evaluation for ended executions. Reliable periodic heartbeats require hooks/adapters; prompt-only reports cannot guarantee them. Record server receipt times and optional client occurrence times; serialize status writes with revisions and idempotency keys. Late heartbeats cannot reopen executions.

## Validation by workload
Validation belongs on the server; harness instructions provide additional guidance. Never rely on client-only required fields.
All runs require authorized project, agent label, title, workload type, and idempotency key. Server assigns run ID, start time, and receipt times. Harness and model are requested but may be unknown; do not invent values.
Coding runs additionally require task reference/identifier and a completion summary at check-out. PR metadata is nullable until a PR exists, and remains nullable for research, local-only work, or no-change tasks; accept an explicit reason when appropriate. Next steps can be empty when there are none. Automation runs permit null task, repo, PR, and next steps. Exact strictness is configurable or finalized during discovery.

## MCP contract outline
Every mutation accepts request_id; every run mutation accepts run_id and expected_revision. Authorization is derived from credentials, never a client-provided owner ID.
- list_projects: returns authorized project summaries.
- get_project: metadata, open To Dos, current work, reporting policy.
- check_in: project_id, agent_name, title, workload_type, optional task_id, harness, model, parent_run_id, external_execution_id. Returns run_id, revision, reporting policy. Reusing the same request ID returns the same run.
- update_status: status, concise message, optional blocker, summary, PR references, model/harness correction. Returns revision.
- heartbeat: confirms liveness without a narrative update.
- check_out: terminal outcome, summary, optional PRs and follow-ups. Can batch final tool-usage records.
- record_tool_usage: batched events or aggregate counts; details below.
- list_next_steps / create_next_step / update_next_step: agent-visible handoff steps only, with source run, stable ordering, done flag, and optimistic concurrency. Never expose private user notes.
Bound input sizes, batch sizes, pagination, rate limits, and stable error responses. Expose a schema/API version and useful validation errors. Exact SDK and protocol version are implementation choices requiring current documentation review.

## Tools-used subtable
Proposed MVP is aggregate rows per run/tool: tool name, source (MCP/native/shell/etc.), call count, success/failure counts when known, and optional last-used time. Record coverage as self-reported or adapter-captured; missing telemetry must not appear as zero usage. Do not assume this MCP can observe calls to other tools. Detailed per-call timing/history is an optional later tier. No raw tool arguments, outputs, credentials, or source code collected by default. Reporting adapters and batch ingestion avoid one extra MCP call for every native tool invocation.

## Next steps and private user notes
Two distinct surfaces belong to each project. Neither is a project-management backlog.

### Agent next steps
An ordered list maintained by worker agents through scoped MCP tools. Dispatchers acting as agents may contribute handoffs too. These instructions remind the user what to do after reported work: merge a PR, run a local command, verify a deployment, or provide approval in the original harness. Checking an item does not send an instruction or execute anything.
Fields: ID, project, position, instruction text (safe links/code formatting), done flag, source run, timestamps, revision. Optional waiting note captures work still in flight. Workers edit their own contributed steps; they cannot overwrite another run's steps or replace the complete list. A dispatcher can reconcile shared order with explicit project authorization and a revision check. Preserve stable IDs and completed state across updates. Deduplicate retried writes through request IDs; conflicts return a fresh-read requirement. No priority, assignment, due-date, or dependency engine in Phase 1.
Confirmed user behavior: read, check off, and reopen agent steps through the web UI; instruction text remains agent-maintained. User completion controls do not depend on the originating agent being alive. A failed or abandoned agent cannot leave an unresolvable checklist item. Record who changed completion and when; agent updates cannot silently undo user completion. Project cards show the first unfinished agent step, remaining count, waiting note, and author/update time; detail shows full list and completed items.
Example from supplied screenshot: make PR #74 ready for review and merge; merge PR #77; after Render deployment verify the Create an offer button. A separate waiting note identifies T21 still in flight.

### Private user notes / My next steps
A separate free-form text area authored and edited exclusively by the project owner through the authenticated web UI. Users can keep reminders and personal instructions here. It has its own updated timestamp and revision and appears on project detail; show a short preview on its owner's project card.
Agents have no read or write access. Store notes separately from agent-accessible project fields. Exclude notes from every MCP response, resource, search result, export, tool error, notification, and agent-facing context. Browser session authentication is required for notes operations; MCP credentials cannot authorize them. Never offer an MCP tool for private notes. Phase 2 sharing must define note visibility explicitly; default remains owner-only.
Server-side access control is mandatory, not a prompt instruction. Test with direct unauthorized requests, not just hidden UI controls. User may intentionally copy a note into agent instructions, but the system never does this automatically.
External task-board synchronization (Trello or similar) is deferred.

## Integration deliverables
Canonical reporting protocol and reusable base prompt, plus product-specific installation/configuration guides. Treat skills, repository instructions, hooks, and bot wrappers as distinct integration methods. Pilot Cursor, Claude Desktop on macOS, and Grok Bot before declaring Phase 1 integration complete. Maintain a tested matrix with exact product/version, remote MCP transport, auth, subagent tool inheritance, available model identity, tool telemetry, and heartbeat support. Initial integration targets are Cursor and Claude Desktop on macOS, plus xAI Grok Bot. Later targets are Claude Code, Codex, OpenAI dots, and Meta Muse. Product identities are supplied; custom MCP/auth/hook compatibility remains unverified. Validate the initial three clients before declaring Phase 1 compatibility. Token transport or OAuth adaptation must be tested; desired token authentication is a product requirement, not evidence that each client accepts manually entered bearer headers.

### Base instruction draft
Before work, read the configured project through MCP, then check in with project ID, task/agent name, title, workload type, and known harness/model. Retain the returned run ID and revision. Report meaningful progress, blockers, review readiness, and PR links. Report tool aggregates only when observed; never infer counts. At completion, failure, or cancellation, check out with an accurate summary and outcome. Create or update concrete follow-up To Dos without duplicating existing tasks. Each subagent reports its own run if it has access; otherwise its parent explicitly reports on its behalf. If reporting fails, continue the user's authorized work, retain pending reports where possible, and retry with the same request IDs. Do not include secrets or claim reporting succeeded when it failed.

## Data model outline
users; browser_sessions; password_reset_tokens; projects; mcp_credentials and project_scopes; agents/tasks; runs; run_events; pull_request_references; run_pr_links; tool_usage_aggregates; agent_next_steps; private_user_notes; audit_events. Add workspace/membership tables only if shared teams are in scope. Foreign keys and owner/project authorization prevent cross-account references. Index project/activity, project/status, run/event time, and next-step completion. Retain history indefinitely in Phase 1, with no automatic TTL or deletion. Later user-controlled archive hides records while retaining them. Runs are not just one row: events, tool summaries, and audit history also accumulate. Use pagination, indexes, bounded payloads and summary telemetry; monitor database growth. Indefinite retention is the application policy, distinct from backup recovery windows.

## Deployment and operations
Proposed Render application serves web UI, API, and remote MCP endpoint; attached Postgres stores persistent state. Keep authoritative state out of process memory so restarts preserve runs. Periodic UI polling (proposed 5–10 seconds) is sufficient initially. Derive stale flags from timestamps without requiring a background job. Use versioned migrations, health/readiness endpoints, structured logs without secrets, environment-managed credentials, and a documented backup/restore procedure. Avoid relying on local disk persistence. Hosting tier, supported connection lifetime, connection pooling, backup availability, email provider, and exact framework are to be verified during implementation planning. No deployment or paid service provisioning has been authorized by this draft.

## Acceptance scenarios
1. User can log in, reset password, log out, and cannot access another account's projects via web or MCP.
2. Project card displays configured links, counts, latest update, and To Dos; active-first sorting works.
3. Coding run checks in, updates, attaches named PR, waits for review, and checks out; elapsed freezes at finish.
4. Daily bot creates separate runs across days without PR fields; history groups under its logical agent.
5. Retried check-in/check-out and To Do creation do not duplicate data; simultaneous updates return conflicts.
6. An abandoned running session becomes visibly stale; a review-waiting session is not falsely labeled as crashed.
7. Unknown model, missing tools telemetry, and null PR render honestly; no fabricated values.
8. Revoked/project-restricted credentials cannot write; unauthorized foreign IDs are rejected.
9. Application restart preserves run state; malformed/outsize tool reports are rejected safely.
10. Pilot harness and recurring bot demonstrate actual setup, reporting, failure recovery, and documented limitations.

## Capacity and cross-project view
Phase 1 starts with one user, a handful of projects, and 4–5 concurrent agents. Shortly after stabilization, support a second user with similar project count and up to approximately 20 concurrent agents. Validate at least 25 concurrent active runs across isolated accounts; this is a target, not a measured result.
Add All agents as a main navigation view: all agents belonging to the signed-in user, regardless of project. Include Project column, the same expandable details/history and tools subtable, and sort/filter by status, project, agent name, harness, model, and time. Default active-first; allow completed/review-needed views. Never aggregate other users' private projects.

## Release phases
### Phase 0 — UX shell first
Deliver a navigable application shell before backend implementation. Use deterministic mock data behind a replaceable data-access interface so the same screens can later consume real APIs. Deploy the shell to Render for review. Phase 0 requires no Postgres, real authentication, MCP server, or email service; these begin in Phase 1. Clearly label the deployed shell as a demo with simulated data and login.

#### Screens and interactions
- Shared layout: Supa Agent Tracker branding, Projects and All agents navigation, account/settings entry, responsive layout.
- Account screens: login, registration, verify-email, forgot/reset-password, and logout UX using demo navigation only. Never collect or store real passwords in the demo.
- Projects dashboard: realistic cards with name, description, GitHub repo and PRD links, execution counts, latest agent update, first unfinished agent step, remaining count, waiting note, and private-note preview. Active-first ordering plus working search, sort, and filters.
- Project detail: metadata header, expandable agent grid/history, PR number/title links, execution state, work status, start/finish/live elapsed time, harness/model, and tool-summary subtable. Agent next steps support user completion/reopen controls; private free-form notes support editing. Use demo-only controls to show abandoned-run recovery.
- All agents: cross-project grid with Project column, working sorting/filtering, and the same expandable detail/history.
- Project create/edit form: metadata, repo/PRD URLs, type, lifecycle, and relevant preferences. Changes affect mock state only.
- Account settings/MCP tokens: planned token creation, copy-once reveal, scopes, last-used display, and revoke interactions using visibly fake tokens; setup area for Cursor, Claude Desktop/macOS, and Grok Bot. Do not claim actual connections or completed compatibility tests.
- Cover loading, empty, no-match, error, and long-content states. Use a representative narrow/mobile layout and keyboard-accessible controls.

#### Representative mock scenarios
Seed at least three projects with running work, finished work awaiting review, a stale/failed execution, and a recurring bot with null PR fields. Include multiple workers contributing steps, private notes, completed steps, run history, unknown model/tool telemetry, and concurrent runs. Example data must distinguish Finished execution from Waiting for Review work. Show realistic named GitHub links without fetching GitHub or performing mutations.

#### State and implementation boundary
Interactions work in browser mock state with a reset-demo action; persistence across reloads is optional. No real account isolation or private-note security is claimed in Phase 0. Keep private notes in a separate mock data structure/interface so Phase 1 can enforce their server-side separation. Never use real secrets or confidential project data. Demo controls cannot run workstation commands, merge PRs, deploy projects, or invoke agents. Structure UI components and view models for reuse in Phase 1 rather than creating a disposable screenshot prototype.

#### Phase 0 completion criteria
1. Render-hosted demo is reachable and all primary routes/navigation work.
2. User can inspect cards, open a project, switch to All agents, and sort/filter mock activity.
3. User can expand run/tool history, observe elapsed counters, check/reopen agent steps, and edit private notes in mock state.
4. Project form and account/token screens demonstrate the intended flow with clear simulated-state labels.
5. Running counts, review states, null fields, and stale/failed cases display consistently across screens.
6. Representative desktop and narrow layouts, keyboard interactions, and empty/error states are reviewed.
7. User reviews the shell and UX adjustments are incorporated before Phase 1 backend wiring; no backend-complete claim is made.

### Phase 1 — usable monitoring product
Render application and Postgres; open registration and standard auth; private project ownership; scoped MCP access; project cards; project and All agents grids; run history and elapsed times; summary tool usage; agent-maintained ordered human handoffs and separate private user notes; agent-supplied GitHub links; indefinite retention; setup instructions and tested integration matrix. Generic bots permit null coding fields. No outbound commands/messages. Build sequence: schema/auth → projects/MCP lifecycle → dashboard/grids/checklists → integrations → deployment and QA.
### Phase 2 — collaboration and richer observation
Project sharing and roles; user-controlled archive; potentially GitHub link verification and PR observation. Define the latter's exact scope before implementation.
### Phase 3 and beyond
Potential outbound messages/actions, GitHub observation if not implemented in Phase 2, and Trello or similar synchronization. No commitment to autonomous execution, merging, or deployment.

## Additional Phase 1 acceptance scenarios
11. Returning user can see completed work and the first unfinished human step on each project without reconstructing agent conversations.
12. All agents grid spans authorized projects, supports active/completed filters, and expands history.
13. Agent next-step updates preserve completion flags and other workers’ contributions; conflicts do not overwrite data.
14. Public registration creates isolated accounts; representative 25-run workload works across two accounts.
15. History survives restarts and is not automatically purged.

## Confirmed discovery decisions
- Email/password registration, verification, and reset; separate revocable MCP access tokens.
- Initial clients: Cursor, Claude Desktop on macOS, Grok Bot. Other named clients follow later.
- Check-out ends execution; work may await review afterward.
- Agent-maintained next steps and a separate free-form user-only field; no agent access to the latter.

## Remaining decisions
1. Proposed contribution policy: each worker edits its own steps, while dispatchers can reconcile the list without overwriting private notes or manual completion flags. Confirm any different ownership intent.
2. Repository/stack, email provider, exact MCP client authentication compatibility, and deployment details remain implementation decisions.

## Additional v0.3 acceptance scenarios
16. Token issued through account settings can report only within its authorized projects; revoked tokens fail immediately.
17. Checked-out execution with Waiting for Review work has a finish time and frozen elapsed time and is absent from running counts.
18. Worker can contribute next steps without overwriting another worker's instructions; retries do not duplicate steps.
19. Owner can write private notes; every MCP read/write/search/export path omits or rejects access, including direct requests using valid project tokens.
20. Cursor, Claude Desktop/macOS, and Grok Bot each complete the tested connection/check-in/update/check-out flow, with documented capability limitations.

## Supplied product references
- Grok Bot: https://x.ai/bot
- OpenAI dots: https://openai.com/index/introducing-dots/
- Meta Muse: https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/
These official overview pages were opened October 14, 2026 to ground product identity. They do not establish tested compatibility with this tracker.

This is a discovery draft. Confirmed scope above incorporates user decisions; proposed behavior and remaining decisions are explicit. No integration compatibility or load target has yet been verified.

## v0.4 confirmation and recovery acceptance
User accepted agent-controlled step text with user-controlled completion. Users may mark steps done or reopen them even after the originating run fails or disappears. Users can manually close an abandoned execution as Failed or Cancelled with an audit event; stale detection alone never invents success. Closing a run does not automatically complete its outstanding human steps, and completing a step does not revive or change the execution. Agent writes must preserve user completion state unless the user explicitly authorizes a change.

## Phase 0 implementation tasks
These are implementation instructions, not a request to implement or deploy in this planning session. Each task should be a focused PR. Read the full Phase 0 requirements and confirmed behavior above before implementing. Use the existing repository conventions if a repository is supplied. Repository, framework and package-manager choices must be recorded in T0-01 before subsequent work. Do not provision Postgres or implement real authentication/MCP in Phase 0.

### T0-01 — Application foundation and mock-data contract
Dependencies: none.
Scope: initialize the repository/application if needed; record framework, package manager and supported runtime; add repeatable install/build/start commands. Build the shared responsive layout, navigation and routes for Projects, Project detail, All agents, account flows and settings. Define typed view models/data interfaces and seed deterministic mock projects, logical agents, runs, tool summaries, next steps and separately stored private notes. Use one shared mock store for all screens. Provide reset-demo and a persistent demo indicator. Seed running, finished/review-needed, failed/stale, recurring/null-field and concurrent-run cases.
Non-goals: backend, auth, MCP, database, real credentials, paid infrastructure.
Acceptance: clean install/build succeeds; all routes render without errors, including direct navigation; navigation and reset work; stable IDs link mock records; execution state and work status are distinct; private notes have a separate interface. Include a short developer README and a fixture scenario inventory. Commit lockfile and expose a standard production build command.
Validation: production build and route/navigation smoke check. Establish any existing lint/type checks once; do not add tests that merely mirror static fixtures.

### T0-02 — Project cards and dashboard
Dependencies: T0-01.
Scope: implement Projects view with cards showing name, description, repo/PRD links, running and total logical-agent counts, latest update/time, first unfinished agent step, remaining count, waiting note, and private-note preview. Implement text search, active-first default sort, alternate sorts and status/activity filters. Build project create/edit form with name, description, type, lifecycle, links and reporting preferences; persist edits only in mock state. Include empty/no-match/loading/error examples.
Acceptance: active projects sort first consistently; no running count includes Finished/Waiting for Review executions; project card opens correct detail; external links do not trigger card navigation; filters compose and clear; create/edit changes immediately update card and shared mock state. Long names and missing links remain usable.
Validation: manually exercise seeded scenarios, filtering and create/edit; run build and applicable checks.

### T0-03 — Project detail and reusable agent grid
Dependencies: T0-01. May be implemented independently of T0-02 using its route/fixtures.
Scope: build project header and reusable grid. Columns: agent/task name, title, execution state, work status, PR number and linked title, start, elapsed, finish, harness and model. Expand rows for run history, status timeline, parent/subagents, completion/blocker summary and tool aggregates. Prioritize running agents while keeping review-needed/recently finished work accessible through filters/history. Handle concurrent runs explicitly. Implement mock manual close-as-Failed/Cancelled with an audit entry.
Acceptance: null values show em dash or Unknown as appropriate; missing tool telemetry differs from zero; live elapsed advances and finished elapsed freezes; closing abandoned execution removes it from running counts across views without completing next steps; sortable/filterable grid works; expanded details match selected agent/run. Tool subtable shows aggregate names/counts with provenance, not fabricated native-call observations.
Validation: meaningful checks for duration/count derivation if implemented as shared logic; manually inspect running/review/stale/recurring cases and grid keyboard behavior.

### T0-04 — Agent next steps and private notes
Dependencies: T0-01; integrate into T0-02/T0-03 when available.
Scope: implement ordered agent-authored next steps with completion/reopen UI, waiting note, source and updated time. Instruction text is read-only to the user; simulate worker/dispatcher updates through fixture scenarios, not an unrestricted normal-user editor. Implement separate owner-only free-form notes editor and saved-state feedback in mock state. Reuse compact previews on cards and complete sections on detail.
Acceptance: checking/reopening updates all relevant views; user completion survives simulated agent instruction updates; a failed source run does not disable completion; unfinished steps survive run closure; notes never appear in agent-facing mock project representations or setup prompt previews. Clearly document that real authorization arrives in Phase 1. Concurrent-update/conflict example explains retry/reconciliation without silent overwrite.
Validation: exercise user-completion preservation, reset and separate-note behavior; use a targeted state-transition test if shared update logic warrants it.

### T0-05 — All agents cross-project view
Dependencies: T0-03; T0-02 for integrated navigation polish.
Scope: reuse the grid and run details across all signed-in demo-user projects; add Project column/link and filters for project, execution state, work status, name, harness, model and time. Active-first default with explicit review-needed and completed views. Avoid duplicating business logic or fixtures.
Acceptance: a run appears consistently in project and global views; filters combine/clear; project links navigate correctly; manual close and next-step state stay synchronized; no-match state is useful. Historical runs remain accessible with bounded rendering/pagination.
Validation: compare counts/state between project and global views; inspect concurrent runs and mixed null fields.

### T0-06 — Account, token and setup UX
Dependencies: T0-01; integrate into shared navigation.
Scope: build simulated login/register/verify-email/forgot/reset-password/logout flow and account settings. Use demo identities and avoid accepting/storing real passwords. Token UX covers label, project scopes, create, one-time reveal/copy, last used, rotation/revocation and empty state, all with unmistakably fake token values. Setup area targets Cursor, Claude Desktop/macOS and Grok Bot; use clearly marked configuration placeholders and reporting-protocol preview. Do not present unverified client-specific setup commands as working instructions.
Acceptance: all flows are navigable; reveal/copy/revoke behave consistently in mock state; no secret appears in URLs or logs; token cannot be mistaken for a live credential; users see integration status as Not connected / Not tested rather than invented success. Private notes are absent from reporting examples.
Validation: navigate each flow and token lifecycle; check clipboard fallback/error feedback where needed; build and applicable checks.

### T0-07 — Integration, Render deployment and UX review
Dependencies: T0-02 through T0-06.
Scope: integrate PRs and resolve UI inconsistencies; configure reproducible Render hosting for the chosen framework with route fallback/direct-link support. Document build, output/start settings and redeploy procedure. Deploy in the user's authorized repository/Render environment when available; otherwise prepare exact deployment instructions and report the external-access blocker without claiming deployment. Exercise responsive/keyboard/error states and the return-after-break workflow.
Acceptance: deployed shell URL loads and direct routes work; consistent demo label; no live backend dependency; no real commands/merges/deploy actions triggered by demo controls; reset restores fixtures. Review: user returns to three projects, identifies finished and still-running work, sees first human step, opens review-needed PR link, checks a step, writes a private reminder, and filters All agents. Record UX feedback and resolve agreed changes before Phase 1.
Validation: production build plus existing lint/type checks; desktop and narrow layout inspection; keyboard navigation; smoke the deployed URL and nested-route reload. Capture unresolved issues with severity and scope. Do not claim user UX approval until received.

### Dependency and dispatch guidance
Implement T0-01 first to settle shared contracts. T0-02, T0-03 and T0-06 can then be assigned independently if desired. T0-04 integrates checklist/notes previews and details; T0-05 reuses T0-03; T0-07 follows integration of all tasks. Each handoff records changed files, checks performed, PR link, remaining limitations and concrete human next steps. No agent should rely on the tracker itself being operational during this build.

## High-level later-phase backlog
### Phase 1 — Backend and verified monitoring
- P1-A: verify remote MCP transport and auth flows in Cursor, Claude Desktop/macOS and Grok Bot; resolve token/OAuth compatibility before final API design.
- P1-B: Postgres schema/migrations, isolated ownership, browser authentication, email verification/reset and transactional email.
- P1-C: scoped token issuance/revocation, authorization, idempotent run lifecycle, separate execution/work states, event history and liveness.
- P1-D: agent next-step contribution/reconciliation rules, user completion controls, and server-protected private notes.
- P1-E: live project/global views, pagination, counts, summaries, indefinite retention and manual abandoned-run recovery.
- P1-F: real reporting instructions/configuration for the initial clients; recurring-run and failure-recovery integration checks.
- P1-G: Render/Postgres operations, migrations, backups/restore procedure, account-isolation tests and representative 25-run validation.
Convert these into detailed worker tasks only after Phase 0 UX review and the authentication compatibility spike.
### Phase 2 — Collaboration and observation
Shared projects and roles; owner-only private-note rules; user-controlled archive; additional client integrations; potential GitHub PR verification/observation. Define scope and acceptance before task decomposition.
### Phase 3 and beyond — Optional extensions
Outbound instructions/messages/actions, GitHub observation if deferred, Trello/task-board synchronization. Define authorization, delivery semantics and product scope separately; no implementation tasks committed yet.
