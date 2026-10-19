import { and, eq, inArray, sql } from 'drizzle-orm';
import { idempotencyKeys, mcpCredentialProjects, projects } from '../db/schema.js';
import { AccessError, credentialAllowsEveryOwnedProject, withActor, type Access, type Database, type Transaction } from './access.js';
function scope(access: Access) { return access.kind === 'user' ? `user:${access.userId}` : `credential:${access.credentialId}`; }
function validRequest(requestId: string, requestHash?: string) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || requestHash === '') throw new AccessError('validation_error');
}
async function effectiveProjects(tx: Transaction, access: Access): Promise<string[] | null> {
  if (access.kind === 'user') return null;
  // Snapshot every project authorized at this moment. All-projects is the owner's set, not a grant list,
  // so a later narrowing fails the replay when any snapshotted project is no longer authorized.
  if (await credentialAllowsEveryOwnedProject(tx, access)) {
    const rows = await tx.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, access.userId)).orderBy(projects.id);
    return rows.map((row) => row.id);
  }
  const grants = await tx.select({ id: mcpCredentialProjects.projectId }).from(mcpCredentialProjects).where(and(
    eq(mcpCredentialProjects.credentialId, access.credentialId), eq(mcpCredentialProjects.userId, access.userId),
    inArray(mcpCredentialProjects.projectId, [...access.projectIds]),
  )).orderBy(mcpCredentialProjects.projectId);
  return grants.map((grant) => grant.id);
}
function checkSavedScope(saved: string[] | null, current: string[] | null) {
  // Responses are opaque JSON. Conservatively require every project authorized when the
  // response was produced to remain authorized now; never inspect response contents.
  if (saved !== null && (current === null || saved.some((id) => !current.includes(id)))) throw new AccessError('forbidden');
}

export async function getIdempotencyKey(db: Database, access: Access, requestId: string) {
  validRequest(requestId);
  return withActor(db, access, async (tx) => {
    const [current] = await tx.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.scope, scope(access)), eq(idempotencyKeys.userId, access.userId), eq(idempotencyKeys.requestId, requestId),
    ));
    if (!current) return null;
    checkSavedScope(current.credentialProjectIds, await effectiveProjects(tx, access));
    return current;
  });
}
export type IdempotencyResult = { status: 'stored' | 'replayed'; response: unknown } | { status: 'idempotency_mismatch' };
/** Serializes the request within its actor scope. The callback's domain writes and saved response
 * commit together. It must use the supplied transaction, never the outer database handle.
 */
export async function withIdempotency(db: Database, access: Access, requestId: string, requestHash: string, operation: (tx: Transaction) => Promise<unknown>, operationName?: string): Promise<IdempotencyResult> {
  validRequest(requestId, requestHash);
  return withActor(db, access, async (tx) => {
    const actorScope = scope(access);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${actorScope + '\n' + requestId}, 0))`);
    const [current] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, actorScope), eq(idempotencyKeys.userId, access.userId), eq(idempotencyKeys.requestId, requestId)));
    const projectIds = await effectiveProjects(tx, access);
    if (current) checkSavedScope(current.credentialProjectIds, projectIds);
    if (current) return current.requestHash === requestHash ? { status: 'replayed', response: current.response } : { status: 'idempotency_mismatch' };
    const response = await operation(tx);
    await tx.insert(idempotencyKeys).values({ scope: actorScope, requestId, userId: access.userId,
      credentialId: access.kind === 'credential' ? access.credentialId : null, credentialProjectIds: projectIds, requestHash, response,
      operation: operationName ?? null });
    return { status: 'stored', response };
  });
}
