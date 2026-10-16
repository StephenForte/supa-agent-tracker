import { and, eq } from 'drizzle-orm';
import { nextSteps, waitingNotes, auditEvents, runs } from '../db/schema.js';
import { AccessError, actorColumns, checkRevision, requireUser, withProject, type Access, type CredentialAccess, type Database, type Transaction, type UserAccess, type WriteResult } from './access.js';
export type NextStep = typeof nextSteps.$inferSelect;
export type WaitingNote = typeof waitingNotes.$inferSelect;
export interface StepInput { instruction: string; position: number; sourceRunId: string }
async function requireSource(tx: Transaction, projectId: string, runId: string) {
  const [run] = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.id, runId), eq(runs.projectId, projectId)));
  if (!run) throw new AccessError('not_found');
}

export async function listNextSteps(db: Database, access: Access, projectId: string) {
  return withProject(db, access, projectId, async (tx) => ({
    steps: await tx.select().from(nextSteps).where(eq(nextSteps.projectId, projectId)).orderBy(nextSteps.position, nextSteps.id),
    waitingNote: (await tx.select().from(waitingNotes).where(eq(waitingNotes.projectId, projectId)))[0] ?? null,
  }));
}
export async function createNextStep(db: Database, access: CredentialAccess, projectId: string, input: StepInput): Promise<NextStep> {
  if (access.kind !== 'credential') throw new AccessError('forbidden');
  return withProject(db, access, projectId, async (tx) => {
    await requireSource(tx, projectId, input.sourceRunId);
    const [value] = await tx.insert(nextSteps).values({ projectId, instruction: input.instruction, position: input.position, sourceRunId: input.sourceRunId }).returning(); return value!;
  });
}
/** sourceRunId is an immutable ownership precondition, not a patchable field. P1-D validates the calling worker identity. */
export async function updateNextStep(db: Database, access: CredentialAccess, projectId: string, stepId: string, sourceRunId: string, expectedRevision: number, patch: { instruction?: string; position?: number }): Promise<WriteResult<NextStep>> {
  if (access.kind !== 'credential') throw new AccessError('forbidden'); checkRevision(expectedRevision);
  return withProject(db, access, projectId, async (tx) => {
    const [current] = await tx.select().from(nextSteps).where(and(eq(nextSteps.id, stepId), eq(nextSteps.projectId, projectId))).for('update');
    if (!current) throw new AccessError('not_found');
    if (current.sourceRunId !== sourceRunId) throw new AccessError('forbidden');
    if (current.revision !== expectedRevision) return { status: 'conflict', current };
    const [value] = await tx.update(nextSteps).set({ instruction: patch.instruction, position: patch.position, updatedAt: new Date(), revision: expectedRevision + 1 }).where(eq(nextSteps.id, stepId)).returning();
    return { status: 'saved', value: value! };
  });
}
export async function setStepCompletion(db: Database, access: UserAccess, projectId: string, stepId: string, expectedRevision: number, done: boolean): Promise<WriteResult<NextStep>> {
  requireUser(access); checkRevision(expectedRevision);
  return withProject(db, access, projectId, async (tx) => {
    const [current] = await tx.select().from(nextSteps).where(and(eq(nextSteps.id, stepId), eq(nextSteps.projectId, projectId))).for('update');
    if (!current) throw new AccessError('not_found');
    if (current.revision !== expectedRevision) return { status: 'conflict', current };
    const now = new Date();
    const [value] = await tx.update(nextSteps).set({ done, completionChangedBy: access.userId, completionChangedAt: now, updatedAt: now, revision: expectedRevision + 1 }).where(eq(nextSteps.id, stepId)).returning();
    await tx.insert(auditEvents).values({ userId: access.userId, projectId, ...actorColumns(access),
      action: done ? 'next_step_completed' : 'next_step_reopened', target: stepId, details: { done, revision: value!.revision } });
    return { status: 'saved', value: value! };
  });
}
/** expectedRevision=0 creates the first note. A competing creation returns the existing row. */
export async function setWaitingNote(db: Database, access: CredentialAccess, projectId: string, expectedRevision: number, input: { text: string; sourceRunId: string }): Promise<WriteResult<WaitingNote>> {
  if (access.kind !== 'credential') throw new AccessError('forbidden'); checkRevision(expectedRevision);
  return withProject(db, access, projectId, async (tx) => {
    const [current] = await tx.select().from(waitingNotes).where(eq(waitingNotes.projectId, projectId)).for('update');
    if (current && current.revision !== expectedRevision) return { status: 'conflict', current };
    if (!current && expectedRevision !== 0) throw new AccessError('not_found');
    await requireSource(tx, projectId, input.sourceRunId);
    const values = { projectId, text: input.text, sourceRunId: input.sourceRunId, updatedAt: new Date(), revision: expectedRevision + 1 };
    const [value] = current ? await tx.update(waitingNotes).set(values).where(eq(waitingNotes.projectId, projectId)).returning() : await tx.insert(waitingNotes).values(values).returning();
    return { status: 'saved', value: value! };
  });
}
