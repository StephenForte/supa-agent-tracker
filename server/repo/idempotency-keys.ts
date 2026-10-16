import { and, eq, sql } from 'drizzle-orm';
import { idempotencyKeys } from '../db/schema.js';
import { AccessError, withActor, type Access, type Database, type Transaction } from './access.js';
function scope(access: Access) { return access.kind === 'user' ? `user:${access.userId}` : `credential:${access.credentialId}`; }
function validRequest(requestId: string, requestHash?: string) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || requestHash === '') throw new AccessError('validation_error');
}
export async function getIdempotencyKey(db: Database, access: Access, requestId: string) {
  validRequest(requestId);
  return withActor(db, access, async (tx) => (await tx.select().from(idempotencyKeys).where(and(
    eq(idempotencyKeys.scope, scope(access)), eq(idempotencyKeys.userId, access.userId), eq(idempotencyKeys.requestId, requestId),
  )))[0] ?? null);
}
export type IdempotencyResult = { status: 'stored' | 'replayed'; response: unknown } | { status: 'idempotency_mismatch' };
/** Serializes the request within its actor scope. The callback's domain writes and saved response
 * commit together. It must use the supplied transaction, never the outer database handle.
 */
export async function withIdempotency(db: Database, access: Access, requestId: string, requestHash: string, operation: (tx: Transaction) => Promise<unknown>): Promise<IdempotencyResult> {
  validRequest(requestId, requestHash);
  return withActor(db, access, async (tx) => {
    const actorScope = scope(access);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${actorScope + '\n' + requestId}, 0))`);
    const [current] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, actorScope), eq(idempotencyKeys.userId, access.userId), eq(idempotencyKeys.requestId, requestId)));
    if (current) return current.requestHash === requestHash ? { status: 'replayed', response: current.response } : { status: 'idempotency_mismatch' };
    const response = await operation(tx);
    await tx.insert(idempotencyKeys).values({ scope: actorScope, requestId, userId: access.userId,
      credentialId: access.kind === 'credential' ? access.credentialId : null, requestHash, response });
    return { status: 'stored', response };
  });
}
