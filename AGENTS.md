# Working on Supa Agent Tracker

Read `docs/prd/PRD-v0.6.md`, `docs/plan/DECISIONS.md`, and `docs/plan/PLAN.md` before work. The PRD and planning files govern over dispatch summaries.

Gate command (before every hand-back):

```sh
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```

Use Node 24 (`.node-version`) and npm.

## Workspace and process hygiene (all tasks)

- **Never work in the operator's Dropbox checkout** (`~/Library/CloudStorage/Dropbox-Personal/Dev/SupaAgentDashboard`). Clone to the path your brief names (normally `/Users/stephenforte/src/supa-agent-tracker-<task>`) and work only there.
- **Leave no process behind.** Before your final message, stop everything you started: dev or preview servers, watchers, test runners, MCP inspectors, tunnels, and any **extra agent or CLI sessions** (for example a second `cursor-agent` you or your harness opened in the clone or in the Dropbox folder). Then check that nothing is still running from your clone or the Dropbox folder:

  ```sh
  for p in $(pgrep -f 'node|cursor-agent|vite|tsx'); do d=$(lsof -a -p $p -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'); case "$d" in *supa-agent-tracker-*|*SupaAgentDashboard*) echo "$p $d";; esac; done
  ```

  Stop each PID it lists, except the session you're running in right now. Report what you stopped on the CLONE line, plus anything you couldn't stop and why.
- **Delete your clone and scratch directories last**, after the PR is pushed and CI is green. Then end your session (exit the CLI or close the agent), so no agent keeps running from a deleted directory.
- **Drop every database you created.** Never touch any other database on the operator's Postgres.

Never edit `docs/plan/**` or `docs/prd/**`.
Never add dependencies (D-010) after T0-01 without planner approval.
Never checkout/switch/reset/stash/clean in a working tree whose branch you did not create.

## Ownership

The complete ownership, append-only directories, pre-assigned identifiers and merge contract live in `docs/plan/PLAN.md`; consult that table before changing files.

- T0-01: foundation at creation; shared app/data/domain/UI/styles, package files/configs, README and fixture inventory. Data layer, routes and slot props freeze after merge.
- T0-02: `src/pages/projects/**`, `src/features/projects/**`; may add pure helpers/tests in `src/domain/projects/`.
- T0-03: `src/pages/project-detail/**`, `src/features/runs/**`; may add in `src/domain/runs/`.
- T0-04: `src/features/next-steps/**`, `src/features/private-notes/**`; may add in `src/domain/next-steps/`.
- T0-05: `src/pages/agents/**`; may add in `src/features/agents/`; reuse RunGrid without editing it.
- T0-06: `src/pages/auth/**`, `src/pages/settings/**`, `src/features/tokens/**`, `src/features/integrations/**`.
- T0-07: integration fixes, Render and deployment docs. Planner owns this file and CLAUDE.md after T0-01 merges.

Views use `src/data/hooks.tsx` and the async contracts, never import `src/data/mock/` directly. Pure business derivations belong in `src/domain/`. Keep private notes entirely outside tracker records. No external fetch/XHR, real credentials, backend/auth/MCP or deployment in Phase 0 foundation. GitHub links are plain anchors with `target="_blank" rel="noopener noreferrer"`.

## Hand-back H1–H5

H1. Commit and push the pre-assigned task branch to `StephenForte/supa-agent-tracker`. Subjects start `T0-0N: ` (T0-01 uses `t0-01-foundation`). Fetch current main; if it moved, rebase your own branch and rerun the gate.

H2. Open a PR into main yourself using `gh pr create`, or update the existing PR body. Include summary, verification evidence and the dispatch return block. T0-01 title: `T0-01: Application foundation and mock-data contract`. Never leave only a pushed branch. Do not merge.

H3. Wait for CI on the current PR head; fix failures within scope without weakening/skipping checks. Address review-bot findings within the authorized task scope.

H4. Post the complete dispatch return block as a PR comment with `gh pr comment --body-file`.

H5. End with the full dispatch return block in one fenced code block. Preserve its labels/order: TASK, LINE OF WORK, REVIEW ARTIFACT, STATUS, VERIFICATION, MIGRATION, SHARED FILES TOUCHED, IDENTIFIERS USED, EXISTING CHECKS MODIFIED, CLONE, TEMP, DECISIONS NEEDED, RESIDUAL GAPS. State manual vs automated verification honestly, test counts, baseline main SHA, and limitations. For T0-01 include contract coverage against T0-02…06, xattr output and elapsed wall-clock.

Use one scratch directory outside the repo and delete it before final hand-back. Later tasks needing missing mutations, fixtures, slot props or dependencies report the gap for planner dispatch rather than editing another owner's files.
