import { eq } from 'drizzle-orm';
import { privateNotes } from '../db/schema.js';
import { AccessError, checkRevision, requireUser, withProject, type Database, type UserAccess, type WriteResult } from './access.js';
export type PrivateNote = typeof privateNotes.$inferSelect;
export async function getPrivateNote(db: Database, access: UserAccess, projectId: string): Promise<PrivateNote | null> {
  requireUser(access);
  return withProject(db, access, projectId, async (tx) => (await tx.select().from(privateNotes).where(eq(privateNotes.projectId, projectId)))[0] ?? null);
}
export async function setPrivateNote(db: Database, access: UserAccess, projectId: string, expectedRevision: number, text: string): Promise<WriteResult<PrivateNote>> {
  requireUser(access); checkRevision(expectedRevision);
  return withProject(db, access, projectId, async (tx) => {
    const [current] = await tx.select().from(privateNotes).where(eq(privateNotes.projectId, projectId)).for('update');
    if (current && current.revision !== expectedRevision) return { status: 'conflict', current };
    if (!current && expectedRevision !== 0) throw new AccessError('not_found');
    const values = { projectId, text, updatedAt: new Date(), revision: expectedRevision + 1 };
    const [value] = current ? await tx.update(privateNotes).set(values).where(eq(privateNotes.projectId, projectId)).returning() : await tx.insert(privateNotes).values(values).returning();
    return { status: 'saved', value: value! };
  });
}
