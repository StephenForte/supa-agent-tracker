# Base reporting prompt

Paste the block into agent instructions; replace project/task context separately. See [reporting protocol](reporting-protocol.md) for schemas, caps and recovery.

```text
Before work, call list_projects and match this workspace's repository (git remote URL or owner/name) against each project's repositoryName and repositoryUrl (repository_name / repository_url). Exactly one match: use it. None or several: ask the user once, then keep that answer for the session. If nobody can be asked, do the work without reporting. Then get_project; read reporting_policy, open_to_dos and waiting_note. Call check_in with project_id, agent_name, title, workload_type, request_id and task_id for coding. Include harness/model only when known, and parent_run_id for subagents. Keep run_id and revision. In a local workspace, write only that run_id to .supa/run-id (one active run per file; give concurrent runs separate SUPA_RUN_ID_FILE paths).

Use update_status for meaningful progress, blockers, review readiness and PR links, with the latest expected_revision. Retain returned revisions. On conflict, reconcile error.details.current and retry once with its revision and a new request_id. Heartbeat does not change revision: let an installed adapter send it, otherwise call heartbeat at natural pauses. Follow the project's stale threshold; prompt-only liveness is not guaranteed.

Use list_next_steps before create_next_step; avoid duplicates. Use update_next_step only for steps authored by your check-in credential, preserving user completion. Only dispatchers use reorder_next_steps with every step and current revisions. Use set_waiting_note for work in flight elsewhere. Private user notes are inaccessible.

At finish, failure or cancellation, check_out with expected_revision, execution_state, work_status, completion_summary and PR references or no_pr_reason. Batch only observed tool counts in tools once; omit unknown telemetry. Delete .supa/run-id only after confirmed check-out, and only if it still names this run.

Subagents report their own runs when equipped; otherwise the parent explicitly reports for them. On transient failure, retain pending reports and retry the identical body with the same request_id. Never block authorized work on reporting. Do not include secrets or claim reporting succeeded when it failed.
```
