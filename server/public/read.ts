import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { agents, projects, runs, users } from '../db/schema.js';
import type { Database } from '../repo/access.js';
import { PUBLIC_RUN_LIMIT, publicHandleFromParam } from './handle.js';

export interface PublicRun {
  title: string;
  executionState: 'running' | 'finished' | 'failed' | 'cancelled';
  workStatus: 'in_progress' | 'blocked' | 'waiting_for_review' | 'completed' | 'failed' | 'cancelled';
  stale: boolean;
  harness: string | null;
  startedAt: string;
  lastContactAt: string;
  finishedAt: string | null;
}

export interface PublicAgent {
  name: string;
  runs: PublicRun[];
}

export interface PublicProject {
  name: string;
  agents: PublicAgent[];
}

export interface PublicAgentsPage {
  owner: { handle: string };
  projects: PublicProject[];
}

/** Handle → that owner → their public, non-archived projects → agents and runs of exactly those projects.
 * Objects are built field by field. Do not spread a repository row into this response.
 */
export async function readPublicAgents(db: Database, rawHandle: string): Promise<PublicAgentsPage | null> {
  const handle = publicHandleFromParam(rawHandle);
  if (!handle) return null;
  const [owner] = await db.select({ id: users.id, handle: users.publicHandle }).from(users)
    .where(sql`lower(${users.publicHandle}) = ${handle}`);
  if (!owner?.handle) return null;

  const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(and(
    eq(projects.ownerId, owner.id),
    eq(projects.isPublic, true),
    sql`${projects.lifecycle} <> 'archived'`,
  )).orderBy(sql`lower(${projects.name}) COLLATE "C"`, projects.id);
  if (projectRows.length === 0) return null;

  const projectIds = projectRows.map((project) => project.id);
  const ownerProjects = and(
    eq(projects.ownerId, owner.id),
    eq(projects.isPublic, true),
    sql`${projects.lifecycle} <> 'archived'`,
    inArray(projects.id, projectIds),
  );
  const agentRows = await db.select({ id: agents.id, projectId: agents.projectId, name: agents.name }).from(agents)
    .innerJoin(projects, eq(projects.id, agents.projectId))
    .where(ownerProjects)
    .orderBy(agents.name, agents.id);
  const runRows = await db.select({
    agentId: runs.agentId,
    title: runs.title,
    executionState: runs.executionState,
    workStatus: runs.workStatus,
    harness: runs.harness,
    startedAt: runs.startedAt,
    lastContactAt: runs.lastContactAt,
    finishedAt: runs.finishedAt,
    stale: sql<boolean>`${runs.executionState} = 'running' AND ${runs.lastContactAt} < now() - ${projects.staleThresholdMinutes} * interval '1 minute'`,
  }).from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(ownerProjects)
    .orderBy(desc(runs.lastContactAt), desc(runs.id))
    .limit(PUBLIC_RUN_LIMIT);

  const runsByAgent = new Map<string, PublicRun[]>();
  for (const row of runRows) {
    const list = runsByAgent.get(row.agentId) ?? [];
    list.push({
      title: row.title,
      executionState: row.executionState,
      workStatus: row.workStatus,
      stale: row.stale === true,
      harness: row.harness,
      startedAt: row.startedAt.toISOString(),
      lastContactAt: row.lastContactAt.toISOString(),
      finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
    });
    runsByAgent.set(row.agentId, list);
  }

  return {
    owner: { handle: owner.handle },
    projects: projectRows.map((project) => ({
      name: project.name,
      agents: agentRows.filter((agent) => agent.projectId === project.id).map((agent) => ({
        name: agent.name,
        runs: runsByAgent.get(agent.id) ?? [],
      })),
    })),
  };
}
