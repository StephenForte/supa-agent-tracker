import { and, desc, eq, isNull } from 'drizzle-orm';
import { auditEvents } from '../db/schema.js';
import { AccessError, actorColumns, withActor, withProject, type Access, type Database, type Transaction } from './access.js';
export interface AuditInput { action: string; target: string; details?: unknown }
function scoped<T>(db: Database, access: Access, projectId: string | null, operation: (tx: Transaction) => Promise<T>) {
  if (projectId !== null) return withProject(db, access, projectId, operation);
  if (access.kind !== 'user') throw new AccessError('forbidden');
  return withActor(db, access, operation);
}
export async function appendAuditEvent(db: Database, access: Access, projectId: string | null, input: AuditInput) {
  return scoped(db, access, projectId, async (tx) => {
    const [value] = await tx.insert(auditEvents).values({ userId: access.userId, projectId, ...actorColumns(access), action: input.action, target: input.target, details: input.details ?? {} }).returning();
    return value!;
  });
}
export async function listAuditEvents(db: Database, access: Access, projectId: string | null) {
  return scoped(db, access, projectId, (tx) => tx.select().from(auditEvents).where(and(
    eq(auditEvents.userId, access.userId), projectId === null ? isNull(auditEvents.projectId) : eq(auditEvents.projectId, projectId),
  )).orderBy(desc(auditEvents.createdAt), auditEvents.id));
}
