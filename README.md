# Supa Agent Tracker

Phase 0 demo shell for a dashboard that monitors AI work across projects. **Demo only — simulated data.** No backend, authentication, MCP connection, or credential validation is implemented. Hosting is a static site; see [docs/deploy.md](docs/deploy.md). Creating the Render service is a separate step and is not done from this repository.

## Run locally

Use Node **24 LTS** (`.node-version`, `engines.node >=24`) and npm. The initial lockfile was generated with npm 11.19.1 on Node 26.9.0; CI verifies Node 24.

This checkout lives in Dropbox. Before installing, exclude generated directories:

```sh
mkdir -p node_modules dist
xattr -w com.dropbox.ignored 1 node_modules dist
xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules dist
xattr -l node_modules dist
npm ci
npm run dev
```

Which attribute this Dropbox File Provider uses has not been verified. Reapply the flags if a generated directory is recreated. Outside macOS/Dropbox, omit the `xattr` commands.

```sh
npm run typecheck
npm run lint
npm test                  # vitest run
npm run build             # strict TypeScript + Vite, output dist/
npm run preview           # production assets; localhost:4173, SPA fallback
```

Gate: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
CI runs that sequence on Node 24 for pull requests and pushes to main.

## Deploy

The production build is a static `dist/` directory. [docs/deploy.md](docs/deploy.md) records the Render Blueprint settings, how to create the service, how redeploys and rollbacks work, and the direct-route check. The deployed shell is still this demo: simulated data, no backend.

## Routes

| Path | Screen |
|---|---|
| `/` | Redirects to `/projects` in the browser |
| `/projects` | Project cards, search, sort, and filters. `?demo=loading\|error\|empty` shows those states |
| `/projects/new` | Create a project (demo state only) |
| `/projects/:projectId` | Project detail, run grid, next steps, private notes. `?run=<runId>` expands that run |
| `/projects/:projectId/edit` | Edit project metadata and reporting preferences |
| `/agents` | All agents. `?view=live\|review\|completed` selects a preset (`active` is the default) |
| `/settings` | Account settings |
| `/settings/tokens` | Fake MCP tokens |
| `/settings/integrations` | Setup placeholders. Status is **Not connected · Not tested** |
| `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/logout` | Simulated account navigation. Password fields are disabled |
| Any other path | Page not found |

## Feature map

- `src/pages/projects/`, `src/features/projects/`: dashboard cards, filters, and the create/edit form.
- `src/pages/project-detail/`, `src/features/runs/`: project header and the shared run grid.
- `src/features/next-steps/`, `src/features/private-notes/`: agent instructions and the separate private-note editor. Cards use the compact previews.
- `src/pages/agents/`, `src/features/agents/`: cross-project grid. It reuses `RunGrid`.
- `src/pages/auth/`, `src/pages/settings/`, `src/features/tokens/`, `src/features/integrations/`: simulated account, tokens, and setup.
- `src/app/`: shell, demo banner, reset, and the frozen route map.
- `src/domain/`: shared counts, status words, and formatters. `src/data/`: async contracts and the mock store.

## Folder map and contracts

- `src/app/`: frozen D-007 data-router map, responsive shared shell, reset confirmation.
- `src/pages/`: one directory per screen owner. Routes above are the finished Phase 0 screens.
- `src/features/`: final-prop slots for RunGrid, next steps and private notes; other owner directories have `.gitkeep` files.
- `src/components/ui/`: Button, native Disclosure/Dialog, status Badge, EmptyState and ErrorState.
- `src/styles/`: Tailwind v4 and shared status tokens.
- `src/domain/`: types, injectable clock (`useNow` ticks once per second), pure counts/sort/liveness/duration/next-step derivations and honest formatters.
- `src/data/contracts.ts`: async `TrackerDataSource` and separate `PrivateNotesSource`.
- `src/data/hooks.tsx`: `DataProvider`, `useTrackerData`, `usePrivateNotes`, `useSourceQuery` on `useSyncExternalStore`.
- `src/data/mock/`: deterministic fixtures, singleton composition, independent tracker/note stores, validated versioned persistence.
- `docs/fixtures.md`: complete scenario/ID inventory and contract coverage for later tasks.

Phase 1 swaps the sources supplied to `DataProvider` for HTTP clients implementing the same contracts. Only `src/data/runtime.ts` chooses the default implementation. Views never import mock modules. Subscription and numeric `getSnapshot` are synchronous React protocol methods; every business read/write returns a Promise. `useSourceQuery` takes a memoized callback (`useCallback`) and reruns on source revisions, including reset. It exposes loading/error/ready states and ignores outdated responses. A same-query refresh retains ready data (`refreshing: true`) so editing components stay mounted; a changed query/source starts in loading state. See `src/pages/project-detail/ProjectDetailPage.tsx` for usage.

List methods return **all records**, including archived projects and run history. Views compose filters, sorts and bounded pagination locally. Use shared domain derivations everywhere; `projectCounts` distinguishes live runs, distinct live logical agents, stale runs, review-needed work, logical agents and total runs. Default project sort prioritizes live execution then latest activity. Project lifecycle remains a separate filter; archived projects are hidden by the later dashboard implementation. Run objects include events, structured PR references, parent/child links, summaries, blockers and tool aggregates. Fetch `listRuns(projectId)` for logical-agent history, then group by `agentId`. Null telemetry differs from an empty report or a zero-call tool row.

`WriteResult` discriminates `saved`, `conflict` (fresh current record), `not_found`, and `invalid`. Read latest revision before retrying a conflict; never silently overwrite. `updateRunMetadata` supports revision-checked, audited metadata corrections without changing execution, liveness or completion. `closeRun` only closes running executions, records an actor/time/reason audit event, and leaves next steps unchanged. The demo agent-update path edits only its source run's instruction, preserving user completion and provenance. Private-note get/save exists solely on its own interface and module. There is no backend authorization in this browser demo.

Token create/rotate returns fake `sat_demo_NOT_A_REAL_TOKEN_…` plaintext once, only in that response. The store retains a masked suffix display, never full plaintext, and does not authenticate anything. Rotation revokes the old token and creates a new token ID. Clipboard handling belongs to T0-06. Every external URL in the fixtures is fictional and uses `github.com/example-org/`; do not fetch links. Integration compatibility is unverified.

Mock state persists in one localStorage key, `supa-agent-tracker:demo:v1`. Both sections are separately validated, including nested records and project references. Invalid/incompatible JSON falls back to seed; unavailable/full storage falls back to the live memory store. No confidential data should be entered. Reset clears the key, reseeds both stores relative to the injected clock and notifies all subscribers; it does not immediately persist the seed. A mock-only `demoLiveRunIds` list keeps run_1, run_2 and run_10 live: clock notifications refresh and persist their contacts at most once per minute (sooner for shorter stale thresholds), and startup reconciles contacts after a long absence before any reads. Reads never mutate state. The stale run_4 and ended runs are excluded; start times, narrative activity, revisions and history are unchanged. Reset restores the seed and resumes its heartbeat participants on the next clock notification. Older v1 saves acquire the marker without losing edits. Mock compositions expose `dispose()` to stop their clock subscription when discarded. Token identifiers are generated using browser UUIDs; only the seed is deterministic.

Native `<dialog>` supplies modal focus trapping, Escape handling and inert background. Dialog restores trigger focus; disclosure uses native keyboard behavior. All routes retain the demo banner and reset control. Auth screens are simulated navigation and collect no passwords. No network APIs are used by application source.

Task boundaries and hand-back rules are in [AGENTS.md](AGENTS.md) and the planner-owned [plan](docs/plan/PLAN.md).
