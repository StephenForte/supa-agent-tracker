import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { boardEntries as board } from '../db/schema.js';
import { withProject, AccessError, type CredentialAccess, type Database, type Transaction } from '../repo/access.js';
import { withIdempotency } from '../repo/idempotency-keys.js';
import * as repo from '../repo/board.js';
import { assertOwnCheckIn, type AgentMutation } from '../steps/agent-steps.js';
import { ConflictError, jsonSafe, parseInput, requestHash } from '../steps/protocol.js';
import { listInput, postInput, resolveInput, stateInput } from './inputs.js';

async function mutate<T>(db: Database, access: CredentialAccess, parsed: { project_id: string; source_run_id: string; request_id: string }, operation: string, write: (tx: Transaction) => Promise<T>): Promise<AgentMutation<T>> {
  if (access.kind !== 'credential') throw new AccessError('forbidden');
  try {
    const result = await withIdempotency(db, access, parsed.request_id, requestHash({ operation, ...parsed }), async (tx) =>
      withProject(tx, access, parsed.project_id, async (scoped) => {
        await assertOwnCheckIn(scoped, access, parsed.project_id, parsed.source_run_id);
        return { status: 'saved' as const, value: jsonSafe(await write(scoped)) };
      }), operation);
    if (result.status === 'idempotency_mismatch') return result;
    return result.response as { status: 'saved'; value: T };
  } catch (error) {
    if (error instanceof ConflictError) return { status: 'conflict', current: error.current };
    throw error;
  }
}
export async function listBoard(db: Database, access: CredentialAccess, input: unknown) {
  return jsonSafe(await repo.listBoard(db, access, parseInput(listInput, input)));
}
export async function postMessage(db: Database, access: CredentialAccess, input: unknown) {
  const p = parseInput(postInput, input);
  return mutate(db, access, p, 'post_board_message', async (tx) => {
    const superseded = p.supersedes_id ? await repo.entry(tx, p.project_id, p.supersedes_id) : null;
    if (superseded?.kind === 'state') throw new AccessError('validation_error');
    await repo.assertCapacity(tx, p.project_id);
    const [row] = await tx.insert(board).values({ projectId: p.project_id, sourceRunId: p.source_run_id, kind: p.kind, title: p.title, body: p.body, taskRef: p.task_ref, addressedTo: p.addressed_to }).returning();
    if (superseded?.status === 'open') await repo.changeStatus(tx, access, p.project_id, superseded.id, superseded.revision, true, { sourceRunId: p.source_run_id, resolution: `Superseded by ${row!.id}` });
    return repo.entry(tx, p.project_id, row!.id);
  });
}
export async function setState(db: Database, access: CredentialAccess, input: unknown) {
  const p = parseInput(stateInput, input);
  return mutate(db, access, p, 'set_board_state', async (tx) => {
    const [current] = await tx.select().from(board).where(and(eq(board.projectId, p.project_id), eq(board.key, p.key)));
    if (current && current.revision !== p.expected_revision) throw new ConflictError(jsonSafe(await repo.entry(tx, p.project_id, current.id)));
    if (!current && p.expected_revision !== 0) throw new AccessError('not_found');
    if (!current) await repo.assertCapacity(tx, p.project_id);
    const values = { projectId: p.project_id, kind: 'state', key: p.key, sourceRunId: p.source_run_id, title: p.title ?? p.key, body: p.value, taskRef: p.task_ref ?? null, ...repo.clearResolution, revision: (current?.revision ?? 0) + 1, updatedAt: new Date() };
    const [row] = current ? await tx.update(board).set(values).where(and(eq(board.id, current.id), eq(board.projectId, p.project_id))).returning() : await tx.insert(board).values(values).returning();
    return repo.entry(tx, p.project_id, row!.id);
  });
}
export async function resolveEntry(db: Database, access: CredentialAccess, input: unknown) {
  const p: z.infer<typeof resolveInput> = parseInput(resolveInput, input);
  return mutate(db, access, p, 'resolve_board_entry', (tx) => repo.changeStatus(tx, access, p.project_id, p.entry_id, p.expected_revision, true, { sourceRunId: p.source_run_id, resolution: p.resolution }));
}
