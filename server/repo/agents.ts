import { and, eq } from 'drizzle-orm';
import { agents } from '../db/schema.js';
import { AccessError, withProject, type Access, type Database } from './access.js';
export type Agent = typeof agents.$inferSelect;
export type AgentInput = Pick<typeof agents.$inferInsert, 'name' | 'title' | 'workloadType'>;
export async function createAgent(db: Database, access: Access, projectId: string, input: AgentInput): Promise<Agent> {
  return withProject(db, access, projectId, async (tx) => {
    const [row] = await tx.insert(agents).values({ projectId, name: input.name, title: input.title, workloadType: input.workloadType }).returning(); return row!;
  });
}
export async function listAgents(db: Database, access: Access, projectId: string): Promise<Agent[]> {
  return withProject(db, access, projectId, (tx) => tx.select().from(agents).where(eq(agents.projectId, projectId)).orderBy(agents.name, agents.id));
}
export async function getAgent(db: Database, access: Access, projectId: string, agentId: string): Promise<Agent> {
  return withProject(db, access, projectId, async (tx) => {
    const [row] = await tx.select().from(agents).where(and(eq(agents.projectId, projectId), eq(agents.id, agentId)));
    if (!row) throw new AccessError('not_found'); return row;
  });
}
