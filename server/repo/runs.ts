import { and, desc, eq, lt } from 'drizzle-orm';
import { runs, runEvents, pullRequestRefs, toolUsageAggregates, auditEvents, agents } from '../db/schema.js';
import { pageItems, parsePageQuery, PaginationError } from '../app/pagination.js';
import { AccessError, actorColumns, checkRevision, withProject, type Access, type Database, type Transaction, type WriteResult } from './access.js';

export type Run = typeof runs.$inferSelect;
export type RunInput = Pick<typeof runs.$inferInsert, 'agentId' | 'taskId' | 'title' | 'workloadType' | 'harness' | 'model' | 'parentRunId' | 'externalExecutionId' | 'observedClientInfo' | 'observedUserAgent'>;
export type RunPatch = Partial<Pick<Run, 'title' | 'taskId' | 'executionState' | 'workStatus' | 'harness' | 'model' | 'message' | 'completionSummary' | 'blocker' | 'noPrReason'>>;
export type EventInput = Pick<typeof runEvents.$inferInsert, 'kind' | 'occurredAt' | 'message'>;
export type PrInput = Pick<typeof pullRequestRefs.$inferInsert, 'number' | 'title' | 'url' | 'repositoryName' | 'primary'>;
export type ToolInput = Omit<typeof toolUsageAggregates.$inferInsert, 'runId'>;

async function readRun(tx: Transaction, projectId: string, runId: string): Promise<Run> {
  const [row] = await tx.select().from(runs).where(and(eq(runs.id, runId), eq(runs.projectId, projectId))).for('update');
  if (!row) throw new AccessError('not_found'); return row;
}
async function event(tx: Transaction, access: Access, row: Run, input: EventInput) {
  await tx.insert(runEvents).values({ runId: row.id, ...actorColumns(access), kind: input.kind,
    occurredAt: input.occurredAt, message: input.message ?? row.message, executionState: row.executionState, workStatus: row.workStatus });
}
export async function createRun(db: Database, access: Access, projectId: string, input: RunInput): Promise<Run> {
  return withProject(db, access, projectId, async (tx) => {
    const [agent] = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.id, input.agentId), eq(agents.projectId, projectId)));
    if (!agent) throw new AccessError('not_found');
    if (input.parentRunId) await readRun(tx, projectId, input.parentRunId);
    const [row] = await tx.insert(runs).values({ projectId, agentId: input.agentId, title: input.title,
      taskId: input.taskId, workloadType: input.workloadType, harness: input.harness, model: input.model,
      parentRunId: input.parentRunId, externalExecutionId: input.externalExecutionId,
      observedClientInfo: input.observedClientInfo, observedUserAgent: input.observedUserAgent }).returning();
    await event(tx, access, row!, { kind: 'check_in' }); return row!;
  });
}
export async function getRun(db: Database, access: Access, projectId: string, runId: string) {
  return withProject(db, access, projectId, async (tx) => {
    const row = await readRun(tx, projectId, runId);
    const events = await tx.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(runEvents.receivedAt, runEvents.id);
    const prReferences = await tx.select().from(pullRequestRefs).where(eq(pullRequestRefs.runId, runId)).orderBy(desc(pullRequestRefs.primary), pullRequestRefs.repositoryName, pullRequestRefs.number);
    const tools = await tx.select().from(toolUsageAggregates).where(eq(toolUsageAggregates.runId, runId)).orderBy(toolUsageAggregates.name, toolUsageAggregates.source);
    const children = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.parentRunId, runId), eq(runs.projectId, projectId))).orderBy(runs.id);
    return { ...row, events, prReferences, tools: tools.length ? tools : null, childRunIds: children.map((r) => r.id) };
  });
}
export async function listRuns(db: Database, access: Access, projectId: string, query: { cursor?: unknown; limit?: unknown } = {}) {
  const { cursor, limit } = parsePageQuery(query);
  if (cursor && !/^[A-Za-z0-9-]{1,128}$/.test(cursor)) throw new PaginationError('cursor is invalid');
  return withProject(db, access, projectId, async (tx) => {
    const rows = await tx.select().from(runs).where(and(eq(runs.projectId, projectId), cursor ? lt(runs.id, cursor) : undefined)).orderBy(desc(runs.id)).limit(limit + 1);
    return pageItems(rows, limit, (r) => r.id);
  });
}
/** One revision covers the run and its attached PR/tool aggregates; events append in the same transaction. */
export async function updateRun(db: Database, access: Access, projectId: string, runId: string, expectedRevision: number, patch: RunPatch,
  report: { event?: EventInput; prReferences?: readonly PrInput[]; tools?: readonly ToolInput[] } = {}): Promise<WriteResult<Run>> {
  checkRevision(expectedRevision);
  return withProject(db, access, projectId, async (tx) => {
    const current = await readRun(tx, projectId, runId);
    if (current.revision !== expectedRevision) return { status: 'conflict', current };
    if (current.executionState !== 'running' && ((patch.executionState && patch.executionState !== current.executionState) || report.event?.kind === 'heartbeat')) throw new AccessError('validation_error');
    const state = patch.executionState ?? current.executionState;
    const now = new Date();
    const [value] = await tx.update(runs).set({ title: patch.title, taskId: patch.taskId, executionState: patch.executionState,
      workStatus: patch.workStatus, harness: patch.harness, model: patch.model, message: patch.message,
      completionSummary: patch.completionSummary, blocker: patch.blocker, noPrReason: patch.noPrReason,
      finishedAt: state === 'running' ? null : current.finishedAt ?? now,
      lastContactAt: now, updatedAt: now, revision: expectedRevision + 1,
    }).where(and(eq(runs.id, runId), eq(runs.projectId, projectId))).returning();
    for (const ref of report.prReferences ?? []) {
      if (ref.primary) await tx.update(pullRequestRefs).set({ primary: false }).where(eq(pullRequestRefs.runId, runId));
      const values = { runId, number: ref.number, title: ref.title, url: ref.url, repositoryName: ref.repositoryName, primary: ref.primary ?? false };
      await tx.insert(pullRequestRefs).values(values).onConflictDoUpdate({ target: [pullRequestRefs.runId, pullRequestRefs.repositoryName, pullRequestRefs.number], set: { title: values.title, url: values.url, primary: values.primary } });
    }
    for (const tool of report.tools ?? []) {
      const values = { runId, name: tool.name, source: tool.source, callCount: tool.callCount, successCount: tool.successCount ?? null, failureCount: tool.failureCount ?? null, lastUsedAt: tool.lastUsedAt ?? null, coverage: tool.coverage };
      await tx.insert(toolUsageAggregates).values(values).onConflictDoUpdate({ target: [toolUsageAggregates.runId, toolUsageAggregates.name, toolUsageAggregates.source], set: values });
    }
    if (report.event?.kind === 'manual_close') {
      if (access.kind !== 'user' || current.executionState !== 'running' || !['failed', 'cancelled'].includes(state)) throw new AccessError('forbidden');
      await tx.insert(auditEvents).values({ userId: access.userId, projectId, ...actorColumns(access), action: 'manual_close', target: runId, details: { executionState: state, revision: value!.revision } });
    }
    await event(tx, access, value!, report.event ?? { kind: state !== current.executionState ? 'check_out' : 'status' });
    return { status: 'saved', value: value! };
  });
}
