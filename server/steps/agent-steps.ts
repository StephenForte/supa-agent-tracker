import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { runEvents, runs } from '../db/schema.js';
import { AccessError, type CredentialAccess, type Database, type Transaction } from '../repo/access.js';
import { withIdempotency } from '../repo/idempotency-keys.js';
import * as stepRepo from '../repo/next-steps.js';
import { ConflictError, jsonSafe, parseInput, requestHash } from './protocol.js';

/** JavaScript string length. A next-step instruction is a short handoff, not a document. */
export const INSTRUCTION_MAX_CHARS = 10_000;
/** JavaScript string length. The waiting note is one project-wide status line. */
export const WAITING_NOTE_MAX_CHARS = 10_000;

const id = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const revision = z.number().int().nonnegative();
const position = z.number().int().nonnegative().max(1_000_000);
const instruction = z.string().min(1).max(INSTRUCTION_MAX_CHARS);

export const listNextStepsInput = z.object({ project_id: id }).strict();
export const createNextStepInput = z.object({
  project_id: id,
  source_run_id: id,
  instruction,
  position: position.optional(),
  request_id: id,
}).strict();
export const updateNextStepInput = z.object({
  project_id: id,
  step_id: id,
  source_run_id: id,
  expected_revision: revision,
  instruction: instruction.optional(),
  position: position.optional(),
  request_id: id,
}).strict().refine((value) => value.instruction !== undefined || value.position !== undefined);
export const reorderNextStepsInput = z.object({
  project_id: id,
  order: z.array(z.object({ step_id: id, expected_revision: revision }).strict()).max(1_000),
  request_id: id,
}).strict();
export const setWaitingNoteInput = z.object({
  project_id: id,
  source_run_id: id,
  expected_revision: revision,
  text: z.string().max(WAITING_NOTE_MAX_CHARS),
  request_id: id,
}).strict();

export type AgentSaved<T> = { status: 'saved'; value: T };
export type AgentConflict = { status: 'conflict'; current: unknown };
export type AgentMismatch = { status: 'idempotency_mismatch' };
export type AgentMutation<T> = AgentSaved<T> | AgentConflict | AgentMismatch;

function requireCredential(access: CredentialAccess): void {
  if (access.kind !== 'credential') throw new AccessError('forbidden');
}

/** D-023. The repository only checks that the run is in the project. Authorship is this credential's check_in. */
async function assertOwnCheckIn(tx: Transaction, access: CredentialAccess, projectId: string, sourceRunId: string): Promise<void> {
  const [event] = await tx.select({ id: runEvents.id }).from(runEvents).innerJoin(runs, eq(runs.id, runEvents.runId)).where(and(
    eq(runEvents.runId, sourceRunId),
    eq(runEvents.kind, 'check_in'),
    eq(runEvents.actorCredentialId, access.credentialId),
    eq(runs.projectId, projectId),
  )).limit(1);
  if (!event) throw new AccessError('forbidden');
}

async function mutate<T>(db: Database, access: CredentialAccess, requestId: string, hash: string, operationName: string, operation: (tx: Transaction) => Promise<T>): Promise<AgentMutation<T>> {
  try {
    const result = await withIdempotency(db, access, requestId, hash, async (tx) => ({ status: 'saved' as const, value: jsonSafe(await operation(tx)) }), operationName);
    if (result.status === 'idempotency_mismatch') return { status: 'idempotency_mismatch' };
    return result.response as AgentSaved<T>;
  } catch (error) {
    if (error instanceof ConflictError) return { status: 'conflict', current: error.current };
    throw error;
  }
}

export async function listNextStepsForAgent(db: Database, access: CredentialAccess, input: unknown) {
  requireCredential(access);
  const parsed = parseInput(listNextStepsInput, input);
  return jsonSafe(await stepRepo.listNextSteps(db, access, parsed.project_id));
}

export async function createNextStep(db: Database, access: CredentialAccess, input: unknown): Promise<AgentMutation<stepRepo.NextStep>> {
  requireCredential(access);
  const parsed = parseInput(createNextStepInput, input);
  return mutate(db, access, parsed.request_id, requestHash({ operation: 'create_next_step', ...parsed }), 'create_next_step', async (tx) => {
    const existing = await stepRepo.listNextSteps(tx, access, parsed.project_id);
    await assertOwnCheckIn(tx, access, parsed.project_id, parsed.source_run_id);
    const nextPosition = parsed.position ?? existing.steps.reduce((max, step) => Math.max(max, step.position), -1) + 1;
    return stepRepo.createNextStep(tx, access, parsed.project_id, {
      instruction: parsed.instruction,
      position: nextPosition,
      sourceRunId: parsed.source_run_id,
    });
  });
}

export async function updateNextStep(db: Database, access: CredentialAccess, input: unknown): Promise<AgentMutation<stepRepo.NextStep>> {
  requireCredential(access);
  const parsed = parseInput(updateNextStepInput, input);
  return mutate(db, access, parsed.request_id, requestHash({ operation: 'update_next_step', ...parsed }), 'update_next_step', async (tx) => {
    await stepRepo.listNextSteps(tx, access, parsed.project_id);
    await assertOwnCheckIn(tx, access, parsed.project_id, parsed.source_run_id);
    const patch: { instruction?: string; position?: number } = {};
    if (parsed.instruction !== undefined) patch.instruction = parsed.instruction;
    if (parsed.position !== undefined) patch.position = parsed.position;
    const written = await stepRepo.updateNextStep(tx, access, parsed.project_id, parsed.step_id, parsed.source_run_id, parsed.expected_revision, patch);
    if (written.status === 'conflict') throw new ConflictError(jsonSafe(written.current));
    return written.value;
  });
}

export async function reorderNextSteps(db: Database, access: CredentialAccess, input: unknown): Promise<AgentMutation<stepRepo.NextStep[]>> {
  requireCredential(access);
  const parsed = parseInput(reorderNextStepsInput, input);
  return mutate(db, access, parsed.request_id, requestHash({ operation: 'reorder_next_steps', ...parsed }), 'reorder_next_steps', async (tx) => {
    const written = await stepRepo.reorderNextSteps(tx, access, parsed.project_id, parsed.order.map((item) => ({
      stepId: item.step_id,
      expectedRevision: item.expected_revision,
    })));
    if (written.status === 'conflict') throw new ConflictError(jsonSafe(written.current));
    return written.value;
  });
}

export async function setWaitingNote(db: Database, access: CredentialAccess, input: unknown): Promise<AgentMutation<stepRepo.WaitingNote>> {
  requireCredential(access);
  const parsed = parseInput(setWaitingNoteInput, input);
  return mutate(db, access, parsed.request_id, requestHash({ operation: 'set_waiting_note', ...parsed }), 'set_waiting_note', async (tx) => {
    await stepRepo.listNextSteps(tx, access, parsed.project_id);
    await assertOwnCheckIn(tx, access, parsed.project_id, parsed.source_run_id);
    const written = await stepRepo.setWaitingNote(tx, access, parsed.project_id, parsed.expected_revision, {
      text: parsed.text,
      sourceRunId: parsed.source_run_id,
    });
    if (written.status === 'conflict') throw new ConflictError(jsonSafe(written.current));
    return written.value;
  });
}
