import { z } from 'zod';
import type { Database } from '../repo/access.js';
import { AccessError, withProject } from '../repo/access.js';
import { getProject, listProjects } from '../repo/projects.js';
import { createAgent, listAgents } from '../repo/agents.js';
import { createRun, getRun, heartbeatRun, listRuns, updateRun, type Run } from '../repo/runs.js';
import { listNextSteps } from '../repo/next-steps.js';
import type { ToolRegistrar } from './registry.js';
import type { CredentialAccess } from '../repo/access.js';
import { id, ProtocolError, requestId, revision, short, text, workStatus } from './protocol.js';

export const API_VERSION = '1';
const prs = z.array(z.strictObject({ number: z.number().int().positive().max(2147483647), title: short,
  url: z.url().max(2048).refine((v) => /^https?:\/\//.test(v)), repositoryName: short, primary: z.boolean().optional(),
})).max(20).refine((v) => v.filter((r) => r.primary).length <= 1);
const tools = z.array(z.strictObject({ name: short, source: z.enum(['mcp', 'native', 'shell', 'other']),
  callCount: z.number().int().min(0).max(2147483647), successCount: z.number().int().min(0).max(2147483647).nullable().optional(),
  failureCount: z.number().int().min(0).max(2147483647).nullable().optional(), lastUsedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  coverage: z.enum(['self_reported', 'adapter_captured']).default('self_reported'),
}).refine((v) => (v.successCount ?? 0) + (v.failureCount ?? 0) <= v.callCount)).max(100);
const mutation = { request_id: requestId };
const runMutation = { ...mutation, run_id: id };
const metadata = { harness: short.optional(), model: short.optional() };
function policy(project: Awaited<ReturnType<typeof getProject>>) {
  return { reporting_instructions: project.reportingInstructions, stale_threshold_minutes: project.staleThresholdMinutes, heartbeat_expected: project.heartbeatExpected };
}
async function findRun(db: Database, access: CredentialAccess, runId: string) {
  // Resolve foreign IDs only through granted projects. No unscoped aggregate lookup.
  for (const projectId of access.projectIds) {
    try { return await getRun(db, access, projectId, runId); }
    catch (error) { if (!(error instanceof AccessError) || error.code !== 'not_found') throw error; }
  }
  throw new AccessError('not_found');
}
function saved(result: Awaited<ReturnType<typeof updateRun>>): Run {
  if (result.status === 'conflict') throw new ProtocolError('conflict', result.current);
  return result.value;
}
function toolValues(input: z.infer<typeof tools> | undefined) {
  return input?.map((row) => ({ ...row, lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null }));
}

/** Additive registration seam: P1-D2 can call another registrar with the same dependencies. */
export function registerRunTools(register: ToolRegistrar): void {
  register('list_projects', { cursor: z.string().max(512).optional(), limit: z.number().int().positive().optional() }, false,
    (input, db, ctx) => listProjects(db, ctx.access, { cursor: input.cursor, limit: input.limit?.toString() }));
  register('get_project', { project_id: id }, false, async (input, db, ctx) => {
    return withProject(db, ctx.access, input.project_id, async (tx) => {
      const project = await getProject(tx, ctx.access, input.project_id);
      const next = await listNextSteps(tx, ctx.access, input.project_id);
      const running: Run[] = []; let cursor: string | undefined;
      do {
        const page = await listRuns(tx, ctx.access, input.project_id, { cursor, limit: '100' });
        running.push(...page.items.filter((r) => r.executionState === 'running'));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return { project, open_to_dos: next.steps.filter((s) => !s.done), waiting_note: next.waitingNote, running_runs: running,
        reporting_policy: policy(project), api_version: API_VERSION };
    });
  });
  register('check_in', { ...mutation, project_id: id, agent_name: short, title: short, workload_type: z.enum(['coding', 'automation']),
    task_id: short.optional(), ...metadata, parent_run_id: id.optional(), external_execution_id: short.optional() }, true,
    async (input, db, ctx) => {
      if (input.workload_type === 'coding' && !input.task_id) throw new ProtocolError('validation_error');
      return withProject(db, ctx.access, input.project_id, async (tx) => {
        const project = await getProject(tx, ctx.access, input.project_id);
        let agent = (await listAgents(tx, ctx.access, input.project_id)).find((a) => a.name === input.agent_name);
        agent ??= await createAgent(tx, ctx.access, input.project_id, { name: input.agent_name, title: input.title, workloadType: input.workload_type });
        const run = await createRun(tx, ctx.access, input.project_id, { agentId: agent.id, title: input.title, workloadType: input.workload_type,
          taskId: input.task_id, harness: input.harness, model: input.model, parentRunId: input.parent_run_id,
          externalExecutionId: input.external_execution_id, observedClientInfo: ctx.clientInfo, observedUserAgent: ctx.userAgent });
        return { run_id: run.id, revision: run.revision, reporting_policy: policy(project) };
      });
    });
  register('update_status', { ...runMutation, expected_revision: revision, work_status: workStatus.optional(), message: text.optional(),
    blocker: text.optional(), completion_summary: text.optional(), pr_references: prs.optional(), ...metadata }, true, async (input, db, ctx) => {
    const run = await findRun(db, ctx.access, input.run_id);
    const value = saved(await updateRun(db, ctx.access, run.projectId, run.id, input.expected_revision, { workStatus: input.work_status,
      message: input.message, blocker: input.blocker, completionSummary: input.completion_summary, harness: input.harness, model: input.model },
    { prReferences: input.pr_references }));
    return { run_id: value.id, revision: value.revision };
  });
  register('heartbeat', runMutation, true, async (input, db, ctx) => {
    const run = await findRun(db, ctx.access, input.run_id);
    const value = await heartbeatRun(db, ctx.access, run.projectId, run.id);
    return { run_id: value.id, revision: value.revision, last_contact_at: value.lastContactAt };
  });
  register('check_out', { ...runMutation, expected_revision: revision, execution_state: z.enum(['finished', 'failed', 'cancelled']),
    work_status: workStatus, completion_summary: text.optional(), pr_references: prs.optional(), no_pr_reason: text.optional(), tools: tools.optional() }, true,
    async (input, db, ctx) => {
      const run = await findRun(db, ctx.access, input.run_id);
      if (run.revision !== input.expected_revision) throw new ProtocolError('conflict', run);
      if (run.executionState !== 'running') throw new ProtocolError('validation_error');
      if (run.workloadType === 'coding' && (!input.completion_summary?.trim()
        || !(input.pr_references?.length || run.prReferences.length || input.no_pr_reason || run.noPrReason))) throw new ProtocolError('validation_error');
      const value = saved(await updateRun(db, ctx.access, run.projectId, run.id, input.expected_revision, { executionState: input.execution_state,
        workStatus: input.work_status, completionSummary: input.completion_summary, noPrReason: input.no_pr_reason },
      { event: { kind: 'check_out' }, prReferences: input.pr_references, tools: toolValues(input.tools) }));
      return { run_id: value.id, revision: value.revision, finished_at: value.finishedAt, work_status: value.workStatus };
    });
  register('record_tool_usage', { ...runMutation, tools }, true, async (input, db, ctx) => {
    const run = await findRun(db, ctx.access, input.run_id);
    const value = saved(await updateRun(db, ctx.access, run.projectId, run.id, run.revision, {}, { tools: toolValues(input.tools) }));
    return { run_id: value.id, revision: value.revision };
  });
}
