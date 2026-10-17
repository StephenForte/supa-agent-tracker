# Reporting protocol

Canonical Phase 1 agent protocol, checked against [the API](../api.md) and strict server schemas. The server implements 12 tools. Do not send extra fields or an owner ID. Authentication is a bearer token scoped to specific projects or to all of the owner's current and future projects; observed clientInfo/User-Agent are metadata, never agent or model identity. Private user notes have no MCP projection.

## Start and identity

Use `list_projects` with optional `cursor`, `limit` to discover authorized projects (default 50, maximum 100; follow `nextCursor`). Match this workspace's repository (git remote URL or owner/name) against each project's `repositoryName` and `repositoryUrl` (`repository_name` / `repository_url`). Exactly one match: use it. None or several: ask the user once, then keep that answer for the session. If nobody can be asked, do the work without reporting. Call `get_project` with `project_id`. Read `reporting_policy` (`reporting_instructions`, `stale_threshold_minutes`, `heartbeat_expected`), `open_to_dos`, `waiting_note` and `running_runs` before starting.

Call `check_in` with `project_id`, `agent_name`, `title`, `workload_type` (`coding` or `automation`), and a fresh `request_id`. Coding also requires `task_id`. Optional known values: `harness`, `model`, `parent_run_id`, `external_execution_id`. Never infer harness/model from connection metadata; omit unknown values. Retain returned `run_id`, `revision`, and policy. Every recurring execution checks in separately, rather than reusing yesterday's run.

For a local hook, create `.supa/` in the agent workspace root and write only the returned run ID to `.supa/run-id`. Keep revisions in agent state, not that file. One file supports one active run. Concurrent runs/subagents must use distinct files and matching `SUPA_RUN_ID_FILE` hook environments; do not overwrite a parent's file. Remote clients without workspace access rely on agent heartbeats.

## Progress and liveness

Call `update_status` on meaningful change (progress, blocker, review readiness, PR link) with `run_id`, latest `expected_revision`, fresh `request_id`, and any of `work_status`, `message`, `blocker`, `completion_summary`, `pr_references`, `harness`, `model`. Save the returned revision. Work statuses: `in_progress`, `blocked`, `waiting_for_review`, `completed`, `failed`, `cancelled`.

On `conflict`, reconcile `error.details.current` with the intended update. Retry once using its revision and a **new** request ID. A second conflict stays pending for a fresh read/reconciliation; never blindly overwrite newer state. Updates to ended runs can correct work status without reopening execution.

Call `heartbeat` with `run_id`, `request_id`; it advances contact time and appends an event **without changing revision** (D-024). Use the [adapter](../../adapters/heartbeat/README.md) where hooks exist; otherwise report at natural pauses. A run is stale only while execution is running and time since server receipt of last contact exceeds the project's `stale_threshold_minutes` (default 15). Staleness preserves work status. Ended runs are never stale; heartbeats cannot reopen them. Event hooks and prompts cannot guarantee periodic contact during silent work.

## Tool usage

Batch `tools` once in `check_out`, only for calls actually observed. Each row has `name`, `source` (`mcp`, `native`, `shell`, `other`), `callCount`; optional nullable `successCount`, `failureCount`, `lastUsedAt` (ISO timestamp), and `coverage` (`self_reported` default; `adapter_captured` only with actual capture). Unknown telemetry is omitted, never represented as zero. Zero is valid only when measured. Do not collect raw arguments, outputs, credentials or code.

`record_tool_usage` exists with `run_id`, `tools`, `request_id`, but this integration does not call it separately. It upserts cumulative totals by name/source and **increments revision**; independent adapter telemetry would conflict with agent writes. If an explicit workflow uses it, retain its returned revision. The heartbeat adapter never reports tool usage or status (dispatch's D-029 policy).

## Handoffs

Call `list_next_steps` with `project_id` before adding anything; results include completed steps and `waitingNote`. Avoid duplicate instructions. `create_next_step` requires `project_id`, `source_run_id`, `instruction`, `request_id`; optional `position` appends if omitted. `update_next_step` requires `project_id`, `step_id`, `source_run_id`, `expected_revision`, `request_id`, and at least one of `instruction`, `position`. Edit only steps whose source run was checked in by your credential (D-023). Another token, including a rotated replacement, cannot take over authorship. User completion and its actor/time are preserved; never send a done field.

Only a dispatcher should call `reorder_next_steps`: `project_id`, `order` containing every current `{ step_id, expected_revision }` exactly once, and `request_id`. Any project-granted credential may dispatch, but missing, duplicate or stale entries conflict atomically. Text, source and completion do not change. `set_waiting_note` takes `project_id`, your `source_run_id`, `expected_revision` (0 to create), `text`, `request_id`; use it for work in flight elsewhere. Empty text clears the displayed note. Step/note conflicts return their current value; reorders return the current step list. Reconcile before retrying.

## Finish and subagents

Call `check_out` with `run_id`, `expected_revision`, `execution_state` (`finished`, `failed`, `cancelled`), `work_status`, `request_id`; optional `completion_summary`, `pr_references`, `no_pr_reason`, `tools`. Coding must supply a nonempty completion summary and PR references or explicit no-PR reason (a previously stored PR/reason also satisfies the server). Prefer supplying both at checkout so the report is self-contained. Automation can omit task/PR/follow-ups. A finished execution may remain `waiting_for_review` or `blocked`; elapsed time freezes. Record the returned revision. After confirmed checkout, delete the run-id file only if it still contains this run; retain it and the pending checkout on failure. Subagents check in with their own `agent_name` and `parent_run_id` if they have tools; otherwise the parent explicitly reports on their behalf using separate run IDs/revisions.

PR rows use `number`, `title`, `url` (absolute HTTP/HTTPS), `repositoryName`, optional `primary`. Never submit a bare URL string in place of the row.

## Transport, limits and recovery

Use `/mcp` Streamable HTTP with `Authorization: Bearer <YOUR_TOKEN>` on every request, and `Accept: application/json, text/event-stream`. No Origin header: even an empty one is rejected. The pinned SDK transport negotiates `2025-11-25`; initialize, retain `mcp-session-id`, send `notifications/initialized`, then tool calls with that session and protocol header. DELETE closes the session. Bearer tokens belong in private client settings/env, never prompts, command argv, query strings or messages.

All mutation request IDs use 1–128 characters from `A-Za-z0-9._:-`. For lost responses/transient failure, retain the pending body and retry **identically with the same request_id**, even after reconnecting. Do not reuse it with changed arguments. Failed reporting never blocks the user's authorized work and must never be described as successful. Redact diagnostic logs and keep pending payloads outside committed files. After a restart, use the same pending check-in request rather than creating a duplicate run.

Limits: 120 authenticated HTTP requests per credential per fixed 60 seconds (including handshake/notifications), HTTP 429 with `Retry-After: 60`. At most 200 sessions, idle expiry 15 minutes. Reinitialize on expired-session 404 without replacing pending mutation IDs. Each heartbeat adapter attempt uses four HTTP requests including DELETE. IDs max 128; short labels/title/task/harness/model/tool/PR names max 200; narratives max 8,000; PR URL max 2,048; max 20 PRs (one primary), 100 tool rows. Counts are nonnegative int32, successes + failures ≤ calls. Step positions 0–1,000,000, instructions 1–10,000, waiting text 0–10,000; reorder max 1,000 entries. Run expected revisions are positive safe integers; step/note revisions are nonnegative integers. Global JSON cap is 1 MiB. Unknown fields are rejected.

Tool results contain JSON in the first text content item. Inspect `isError` and parse `{ error: { code, message, details? } }`; HTTP 200 alone does not mean a tool succeeded. HTTP/auth failures use the same safe error envelope; JSON-RPC envelope errors require correcting the protocol or reconnecting, not interpreting them as a tool success.

| Error code | Action |
|---|---|
| `validation_error` | Correct fields against tools/list/schema; ended-run heartbeat is rejected. Do not retry unchanged invalid input. |
| `unauthenticated` | Stop sending the rejected token; obtain an issued token in settings. Never paste it into chat. |
| `forbidden` | Check project grants/authorship and remove any Origin header; do not try another identity. |
| `not_found` | Check authorized resource IDs; HTTP session 404 means reinitialize. |
| `conflict` | Reconcile details.current, retry once with its revision and a new request ID. |
| `idempotency_mismatch` | Recover the original pending body; a changed operation needs a new ID after reconciliation. |
| `payload_too_large` | Reduce to documented caps; do not lose pending observed telemetry. |
| `rate_limited` | Back off by Retry-After (60 seconds when supplied); keep pending body/ID. |
| `internal_error` | Keep pending report; bounded backoff and identical retry, continue user work. |
| `database_unreachable` | Readiness failure: retain reports and retry later; operator checks database. |
| `migrations_pending` | Readiness failure: operator applies migrations; never self-modify server schema. |

The last two codes belong to readiness, not tool results. Production client verification is reserved for P1-G2.
