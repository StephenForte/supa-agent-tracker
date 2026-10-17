import { and, eq, inArray } from 'drizzle-orm';
import { mcpCredentials, mcpCredentialProjects, projects } from '../db/schema.js';
import { AccessError, checkRevision, requireUser, withActor, type Access, type Database, type Transaction, type UserAccess, type WriteResult } from './access.js';
export type Credential = typeof mcpCredentials.$inferSelect;
export type CredentialSummary = Omit<Credential, 'tokenHash'> & { projectIds: string[] };
export interface CredentialInput { label: string; tokenHash: string; displaySuffix: string; projectIds: readonly string[]; allProjects?: boolean }
async function ownedProjects(tx: Transaction, access: UserAccess, projectIds: readonly string[]) {
  const ids = [...new Set(projectIds)].sort();
  if (!ids.length) return ids;
  const rows = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.ownerId, access.userId), inArray(projects.id, ids))).orderBy(projects.id).for('update');
  if (rows.length !== ids.length) throw new AccessError('not_found'); return ids;
}
async function grantIds(tx: Transaction, credential: Credential): Promise<string[]> {
  const grants = await tx.select({ id: mcpCredentialProjects.projectId }).from(mcpCredentialProjects).where(and(eq(mcpCredentialProjects.credentialId, credential.id), eq(mcpCredentialProjects.userId, credential.userId))).orderBy(mcpCredentialProjects.projectId);
  return grants.map((grant) => grant.id);
}
/** Auth resolves an all-projects token to the owner's projects on every request. Never another owner's. */
async function ownerProjectIds(tx: Transaction, userId: string): Promise<string[]> {
  const rows = await tx.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId)).orderBy(projects.id);
  return rows.map((row) => row.id);
}
async function summary(tx: Transaction, credential: Credential): Promise<CredentialSummary> {
  const { tokenHash: _hash, ...safe } = credential;
  void _hash;
  const projectIds = credential.allProjects ? await ownerProjectIds(tx, credential.userId) : await grantIds(tx, credential);
  return { ...safe, projectIds };
}
async function accessibleSummary(tx: Transaction, access: Access, credential: Credential): Promise<CredentialSummary> {
  const value = await summary(tx, credential);
  return access.kind === 'credential'
    ? { ...value, projectIds: value.projectIds.filter((id) => access.projectIds.includes(id)) }
    : value;
}

export async function createCredential(db: Database, access: UserAccess, input: CredentialInput): Promise<CredentialSummary> {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const allProjects = input.allProjects === true;
    if (allProjects && input.projectIds.length) throw new AccessError('validation_error');
    const ids = allProjects ? [] : await ownedProjects(tx, access, input.projectIds);
    const [row] = await tx.insert(mcpCredentials).values({ userId: access.userId, label: input.label, tokenHash: input.tokenHash, displaySuffix: input.displaySuffix, allProjects }).returning();
    if (ids.length) await tx.insert(mcpCredentialProjects).values(ids.map((projectId) => ({ projectId, userId: access.userId, credentialId: row!.id })));
    return summary(tx, row!);
  });
}
export async function listCredentials(db: Database, access: UserAccess): Promise<CredentialSummary[]> {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const rows = await tx.select().from(mcpCredentials).where(eq(mcpCredentials.userId, access.userId)).orderBy(mcpCredentials.createdAt, mcpCredentials.id);
    const values: CredentialSummary[] = []; for (const row of rows) values.push(await summary(tx, row)); return values;
  });
}
export async function getCredential(db: Database, access: UserAccess, credentialId: string): Promise<CredentialSummary> {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const [row] = await tx.select().from(mcpCredentials).where(and(eq(mcpCredentials.id, credentialId), eq(mcpCredentials.userId, access.userId)));
    if (!row) throw new AccessError('not_found'); return summary(tx, row);
  });
}
/** Scoped hash lookup. Initial bearer authentication is P1-C1's trusted bootstrap, before an Access exists. */
export async function findCredentialByHash(db: Database, access: UserAccess, tokenHash: string): Promise<CredentialSummary | null> {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const [row] = await tx.select().from(mcpCredentials).where(and(eq(mcpCredentials.userId, access.userId), eq(mcpCredentials.tokenHash, tokenHash)));
    return row && !row.revokedAt ? summary(tx, row) : null;
  });
}
export async function updateCredential(db: Database, access: UserAccess, credentialId: string, expectedRevision: number, patch: { label?: string; projectIds?: readonly string[]; allProjects?: boolean; revoke?: boolean }): Promise<WriteResult<CredentialSummary>> {
  requireUser(access); checkRevision(expectedRevision);
  return withActor(db, access, async (tx) => {
    const [current] = await tx.select().from(mcpCredentials).where(and(eq(mcpCredentials.id, credentialId), eq(mcpCredentials.userId, access.userId))).for('update');
    if (!current) throw new AccessError('not_found');
    if (current.revision !== expectedRevision) return { status: 'conflict', current: await summary(tx, current) };
    const changesScope = patch.allProjects !== undefined || patch.projectIds !== undefined;
    if (changesScope && current.revokedAt && !patch.revoke) throw new AccessError('validation_error');
    let allProjects = current.allProjects;
    if (patch.allProjects === true) {
      if (patch.projectIds && patch.projectIds.length) throw new AccessError('validation_error');
      await tx.delete(mcpCredentialProjects).where(and(eq(mcpCredentialProjects.credentialId, credentialId), eq(mcpCredentialProjects.userId, access.userId)));
      allProjects = true;
    } else if (patch.allProjects === false || patch.projectIds) {
      const ids = await ownedProjects(tx, access, patch.projectIds ?? []);
      await tx.delete(mcpCredentialProjects).where(and(eq(mcpCredentialProjects.credentialId, credentialId), eq(mcpCredentialProjects.userId, access.userId)));
      if (ids.length) await tx.insert(mcpCredentialProjects).values(ids.map((projectId) => ({ projectId, userId: access.userId, credentialId })));
      allProjects = false;
    }
    const [value] = await tx.update(mcpCredentials).set({ label: patch.label, allProjects, revokedAt: patch.revoke ? current.revokedAt ?? new Date() : current.revokedAt, revision: expectedRevision + 1 }).where(and(eq(mcpCredentials.id, credentialId), eq(mcpCredentials.userId, access.userId))).returning();
    return { status: 'saved', value: await summary(tx, value!) };
  });
}
/** Credential last-use bookkeeping is itself scoped and revision checked; cannot revive a token. */
export async function touchCredential(db: Database, access: Access, credentialId: string, expectedRevision: number): Promise<WriteResult<CredentialSummary>> {
  checkRevision(expectedRevision);
  return withActor(db, access, async (tx) => {
    if (access.kind === 'credential' && access.credentialId !== credentialId) throw new AccessError('not_found');
    const [current] = await tx.select().from(mcpCredentials).where(and(eq(mcpCredentials.id, credentialId), eq(mcpCredentials.userId, access.userId))).for('update');
    if (!current) throw new AccessError('not_found');
    if (current.revokedAt) throw new AccessError('forbidden');
    if (current.revision !== expectedRevision) return { status: 'conflict', current: await accessibleSummary(tx, access, current) };
    const [value] = await tx.update(mcpCredentials).set({ lastUsedAt: new Date(), revision: expectedRevision + 1 }).where(eq(mcpCredentials.id, credentialId)).returning();
    return { status: 'saved', value: await accessibleSummary(tx, access, value!) };
  });
}

/** Trusted authentication bootstrap: stored grants are the sole source of scope. */
export async function authenticateCredentialHash(db: Database, tokenHash: string): Promise<CredentialSummary | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(mcpCredentials).where(eq(mcpCredentials.tokenHash, tokenHash));
    return row && !row.revokedAt ? summary(tx, row) : null;
  });
}
/** Liveness bookkeeping, serialized with revocation, never an owner edit. */
export async function touchCredentialLastUsed(db: Database, access: import('./access.js').CredentialAccess): Promise<void> {
  await withActor(db, access, async (tx) => {
    const [row] = await tx.select().from(mcpCredentials).where(eq(mcpCredentials.id, access.credentialId));
    const now = new Date();
    if (row && (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= 60_000)) {
      await tx.update(mcpCredentials).set({ lastUsedAt: now }).where(eq(mcpCredentials.id, access.credentialId));
    }
  });
}
