# Phase 0 fixture inventory and shared contract coverage

Seed identity: `usr_demo` (`demo@example.invalid`); all GitHub references are fictional under `github.com/example-org/`. Times are UTC, relative to injectable `Clock.now()` at initial load/reset. Persisted reloads retain the saved timestamps so stale/elapsed continue naturally. Seed is deterministic for the same clock. No live endpoints, credentials or integration tests exist.

| Scenario | Project | Logical agent | Runs / steps / token |
|---|---|---|---|
| Live in-progress work | prj_offers | agt_offers_1 | run_1 |
| Two concurrent runs for one logical agent | prj_offers | agt_offers_1 | run_1, run_2 |
| Finished execution with review-needed work, frozen elapsed | prj_offers | agt_offers_2 | run_3 |
| Stale running, blocked work, unknown model | prj_dashboard | agt_dashboard_1 | run_4 |
| Failed execution, unknown harness | prj_dashboard | agt_dashboard_2 | run_5 |
| Cancelled execution, archived project | prj_archive | agt_archive_1 | run_6 |
| Daily automation history across three days, null task/repo/PR | prj_weather | agt_weather_1 | run_7, run_8, run_9 |
| Parent and child execution in one project | prj_offers | agt_offers_1, agt_offers_2 | run_1 → run_10 |
| No tool telemetry | prj_offers | agt_offers_1 | run_1 (`tools: null`) |
| Explicit zero-call aggregate, self-reported | prj_offers | agt_offers_1 | run_2 (`shell: 0`) |
| Nonzero aggregate, self-reported provenance | prj_offers | agt_offers_2 | run_3 (`edit_file`, 8 calls, 7 success, 1 failure) |
| Two named PRs, primary/additional | prj_offers | agt_offers_2 | run_3 → example-org/offers #74, #77 |
| Ordered handoffs from two source runs | prj_offers | agt_offers_2, agt_offers_1 | step_1 ← run_3; step_2 ← run_1 |
| User-completed instruction, completion actor/time | prj_offers | agt_offers_1 | step_2 |
| Open instruction from failed source, can still complete/reopen | prj_dashboard | agt_dashboard_2 | step_3 ← run_5 |
| Waiting note with source/update time | prj_offers | agt_offers_1 | waitingNotes[prj_offers] ← run_1 |
| Private notes in separate store | prj_offers, prj_dashboard | — | keyed by project ID, revision 1 |
| Very long project name | prj_dashboard | — | project name wraps naturally |
| No repository or PRD links | prj_weather | agt_weather_1 | all links null |
| Fake scoped token, last used | prj_offers | — | tok_1, `sat_demo_…FAKE_1` display only |
| Fake scoped token, never used | prj_weather | — | tok_2, `sat_demo_…FAKE_2` display only |

Totals: 4 projects, 6 logical agents, runs `run_1`–`run_10`, steps `step_1`–`step_3`, one waiting note and two private notes, tokens `tok_1`–`tok_2`. New demo entities use a persisted monotonic sequence starting at 10 (`prj_demo_`, `tok_`, `evt_demo_`); generated fake-token plaintext uses UUID randomness and is never stored. Reset restores the fixed ID inventory.

## Contract coverage: checked against T0-02…06

| Screen/task and displayed or mutated value | Source / shared derivation |
|---|---|
| T0-02 cards: metadata, lifecycle, repo/PRD links, tags/reporting preferences; filters for text/type/lifecycle/harness/activity; archived hidden by default | `listProjects`, `listAgents`, `listRuns`; full record lists permit composable client filtering |
| T0-02 cards: live/stale/review counts, distinct logical agents, total runs, latest agent/message/time, active-first order | `projectCounts`, `latestActivity`, `activeFirstProjectSortKey` / `compareProjectsActiveFirst`; latest run identifies its agent via `agentId` |
| T0-02 form: create/edit metadata and preferences, lifecycle archive | `createProject`, `updateProject` with optimistic revision; no delete; typed invalid/conflict result |
| T0-02 compact handoff: first open instruction/remaining count, waiting note, source/update time; private preview | `listNextSteps`, `nextStepSummary`; separate `PrivateNotesSource.get` |
| T0-03 project detail: metadata and all RunGrid columns incl. nullable task/PR/harness/model | `getProject`, `listAgents(projectId)`, `listRuns(projectId)`; shared formatters; no agent-name duplication in run records |
| T0-03 expansion/history: execution/work timeline, receipt and occurrence time, summary, blocker, tools/source/counts/coverage, PR list, parent/child links | Full `Run` in list/get; filter history by `agentId`; `getRun` and stable IDs; `updateRunMetadata` corrects title/task/harness/model/PR/summary/blocker metadata with a revision and audit event; no fabricated observations |
| T0-03 elapsed/liveness and manual close | injectable `Clock`, `useNow`, `elapsed`, `isStale`; `closeRun` audits actor/time/reason and leaves all next steps unchanged |
| T0-04 instruction display/complete/reopen, source/update time, waiting note | `listNextSteps`, `setNextStepDone` with revision and completion actor/time |
| T0-04 simulated agent update and conflict reconciliation | `simulateAgentStepUpdate` accepts sourceRunId + expectedRevision; typed fresh-current conflict; preserves user completion |
| T0-04 separate free-form notes and saved feedback | `PrivateNotesSource.get/save` with text, updatedAt, revision; empty note revision 0 for new projects; conflict result |
| T0-05 global grid/project column, combined filters/time windows, history/pagination and shared mutations | `listProjects`, `listAgents`, `listRuns` return all records; RunGrid controlled/uncontrolled sort/filter/expansion props; local bounded pagination is T0-03 responsibility |
| T0-06 simulated auth/account identity | `getAccount`; static demo navigation, no password capture, real session or auth mutations needed |
| T0-06 token label/scopes/last-use/create/copy-once/rotation/revocation | `listTokens`, `createToken`, `rotateToken`, `revokeToken`; create/rotate response is sole plaintext path; view owns reveal clearing/clipboard error feedback |
| T0-06 setup/prompt previews | tracker-only project/reportingPolicy/agent/run/step reads; integration status is static Not connected · Not tested; `<PLACEHOLDER>` config authoring belongs to T0-06 |
| All screens: loading/error/empty/no-match and synchronized reset | async methods, `useSourceQuery` states, reusable UI primitives; no-match from filtered empty arrays; `resetDemo` reseeds/notifies both sources and clears storage |

The source lists intentionally return all data, so later screens own filtering and pagination rather than inventing data-layer methods. No Phase 1 server write API is implied. Project metadata correction uses `updateProject`; run metadata correction uses `updateRunMetadata`. Execution/work-state transitions remain separate from metadata correction. Read-only reporting examples can never reach private-note text via tracker records or method results.

## Verification boundaries

Property/transition tests cover elapsed freeze, strict stale threshold, distinct execution/work status counts, sort/next-step derivations, completion preservation, concurrent conflicts, close audit, notes isolation, token plaintext absence, persistence fallback/reset and hook synchronization. Route smoke renders every frozen route, a run deep link, an unknown project/detail-edit and an unknown path through a memory router. These validate the foundation; future screen interactions remain owned by their tasks.
