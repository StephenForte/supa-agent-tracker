import { and, eq, isNull } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { mcpCredentials, mcpCredentialProjects, projects, users } from '../db/schema.js';

export interface UserAccess { kind: 'user'; userId: string }
export interface CredentialAccess {
  kind: 'credential'; userId: string; credentialId: string; projectIds: readonly string[];
}
export type Access = UserAccess | CredentialAccess;
export type Transaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
export type Database = AppDatabase | Transaction;
export type WriteResult<T> = { status: 'saved'; value: T } | { status: 'conflict'; current: T };
export class AccessError extends Error {
  constructor(public readonly code: 'not_found' | 'forbidden' | 'validation_error', message = code) {
    super(message); this.name = 'AccessError';
  }
}

export function requireUser(access: UserAccess): void {
  // Runtime protection matters for JavaScript callers, deserialized input and unsafe casts too.
  if (access.kind !== 'user') throw new AccessError('forbidden');
}

/** Repositories accept a transaction so callers can atomically compose idempotency and domain writes. */
export async function withActor<T>(db: Database, access: Access, operation: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, access.userId)).for('share');
    if (!user) throw new AccessError('not_found');
    if (access.kind === 'credential') {
      const [credential] = await tx.select({ id: mcpCredentials.id }).from(mcpCredentials).where(and(
        eq(mcpCredentials.id, access.credentialId), eq(mcpCredentials.userId, access.userId), isNull(mcpCredentials.revokedAt),
      )).for('update');
      if (!credential) throw new AccessError('forbidden');
    }
    return operation(tx);
  });
}

/** Recheck the stored grant and ownership, never trust the caller's cached project IDs alone.
 * Lock order: user, credential, project, grant, aggregate. A project lock serializes project
 * operations; credential UPDATE locks linearize writes with revocation. No authorization cache.
 */
export async function withProject<T>(db: Database, access: Access, projectId: string, operation: (tx: Transaction) => Promise<T>): Promise<T> {
  return withActor(db, access, async (tx) => {
    if (access.kind === 'credential' && !access.projectIds.includes(projectId)) throw new AccessError('not_found');
    const [project] = await tx.select({ id: projects.id }).from(projects).where(and(
      eq(projects.id, projectId), eq(projects.ownerId, access.userId),
    )).for('update');
    if (!project) throw new AccessError('not_found');
    if (access.kind === 'credential') {
      const [grant] = await tx.select({ id: mcpCredentialProjects.projectId }).from(mcpCredentialProjects).where(and(
        eq(mcpCredentialProjects.credentialId, access.credentialId), eq(mcpCredentialProjects.userId, access.userId),
        eq(mcpCredentialProjects.projectId, projectId),
      )).for('share');
      if (!grant) throw new AccessError('not_found');
    }
    return operation(tx);
  });
}

export function checkRevision(expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0) throw new AccessError('validation_error');
}
export function actorColumns(access: Access) {
  return access.kind === 'user'
    ? { actorUserId: access.userId, actorCredentialId: null }
    : { actorUserId: null, actorCredentialId: access.credentialId };
}
