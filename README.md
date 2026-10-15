# Supa Agent Tracker

Phase 0 foundation for a dashboard that monitors AI work across projects. **Demo only — simulated data.** Routes contain titled placeholders owned by T0-02 through T0-06, not finished product screens. No backend, authentication, MCP connection, credential validation or deployment is implemented.

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

## Folder map and contracts

- `src/app/`: frozen D-007 data-router map, responsive shared shell, reset confirmation.
- `src/pages/`: titled placeholders divided by the screen owner's directory.
- `src/features/`: final-prop slots for RunGrid, next steps and private notes; other owner directories have `.gitkeep` files.
- `src/components/ui/`: Button, native Disclosure/Dialog, status Badge, EmptyState and ErrorState.
- `src/styles/`: Tailwind v4 and shared status tokens.
- `src/domain/`: types, injectable clock (`useNow` ticks once per second), pure counts/sort/liveness/duration/next-step derivations and honest formatters.
- `src/data/contracts.ts`: async `TrackerDataSource` and separate `PrivateNotesSource`.
- `src/data/hooks.tsx`: `DataProvider`, `useTrackerData`, `usePrivateNotes`, `useSourceQuery` on `useSyncExternalStore`.
- `src/data/mock/`: deterministic fixtures, singleton composition, independent tracker/note stores, validated versioned persistence.
- `docs/fixtures.md`: complete scenario/ID inventory and contract coverage for later tasks.

Phase 1 swaps the sources supplied to `DataProvider` for HTTP clients implementing the same contracts. Only `src/data/runtime.ts` chooses the default implementation. Views never import mock modules. Subscription and numeric `getSnapshot` are synchronous React protocol methods; every business read/write returns a Promise. `useSourceQuery` takes a memoized callback (`useCallback`) and reruns on source revisions, including reset. It exposes loading/error/ready states and ignores outdated responses. See `src/pages/project-detail/ProjectDetailPage.tsx` for usage.

List methods return **all records**, including archived projects and run history. Views compose filters, sorts and bounded pagination locally. Use shared domain derivations everywhere; `projectCounts` distinguishes live runs, distinct live logical agents, stale runs, review-needed work, logical agents and total runs. Default project sort prioritizes live execution then latest activity. Project lifecycle remains a separate filter; archived projects are hidden by the later dashboard implementation. Run objects include events, structured PR references, parent/child links, summaries, blockers and tool aggregates. Fetch `listRuns(projectId)` for logical-agent history, then group by `agentId`. Null telemetry differs from an empty report or a zero-call tool row.

`WriteResult` discriminates `saved`, `conflict` (fresh current record), `not_found`, and `invalid`. Read latest revision before retrying a conflict; never silently overwrite. `updateRunMetadata` supports revision-checked, audited metadata corrections without changing execution, liveness or completion. `closeRun` only closes running executions, records an actor/time/reason audit event, and leaves next steps unchanged. The demo agent-update path edits only its source run's instruction, preserving user completion and provenance. Private-note get/save exists solely on its own interface and module. There is no backend authorization in this browser demo.

Token create/rotate returns fake `sat_demo_NOT_A_REAL_TOKEN_…` plaintext once, only in that response. The store retains a masked suffix display, never full plaintext, and does not authenticate anything. Rotation revokes the old token and creates a new token ID. Clipboard handling belongs to T0-06. Every external URL in the fixtures is fictional and uses `github.com/example-org/`; do not fetch links. Integration compatibility is unverified.

Mock state persists in one localStorage key, `supa-agent-tracker:demo:v1`. Both sections are separately validated, including nested records and project references. Invalid/incompatible JSON falls back to seed; unavailable/full storage falls back to the live memory store. No confidential data should be entered. Reset clears the key, reseeds both stores relative to the injected clock and notifies all subscribers; it does not immediately persist the seed. Token identifiers are generated using browser UUIDs; only the seed is deterministic.

Native `<dialog>` supplies modal focus trapping, Escape handling and inert background. Dialog restores trigger focus; disclosure uses native keyboard behavior. All routes retain the demo banner and reset control. Auth placeholders contain navigation only and collect no passwords. No network APIs are used by application source.

Task boundaries and hand-back rules are in [AGENTS.md](AGENTS.md) and the planner-owned [plan](docs/plan/PLAN.md).
