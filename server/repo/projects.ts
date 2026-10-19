import { and, eq, exists, inArray, sql } from 'drizzle-orm';
import { mcpCredentialProjects, projects } from '../db/schema.js';
import { pageItems, parsePageQuery, PaginationError, type Page } from '../app/pagination.js';
import { checkRevision, credentialAllowsEveryOwnedProject, requireUser, withActor, withProject, type Access, type Database, type UserAccess, type WriteResult } from './access.js';

export type Project = typeof projects.$inferSelect;
export type ProjectInput = Pick<typeof projects.$inferInsert, 'name' | 'description' | 'type' | 'lifecycle' | 'repositoryName' | 'repositoryUrl' | 'prdUrl' | 'tags' | 'isPublic' | 'staleThresholdMinutes' | 'heartbeatExpected' | 'reportingInstructions'>;

function projectValues(input: Partial<ProjectInput>) {
  return { name: input.name, description: input.description, type: input.type, lifecycle: input.lifecycle,
    repositoryName: input.repositoryName, repositoryUrl: input.repositoryUrl, prdUrl: input.prdUrl,
    tags: input.tags, isPublic: input.isPublic, staleThresholdMinutes: input.staleThresholdMinutes,
    heartbeatExpected: input.heartbeatExpected, reportingInstructions: input.reportingInstructions };
}

export async function createProject(db: Database, access: UserAccess, input: ProjectInput): Promise<Project> {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const [row] = await tx.insert(projects).values({ ...projectValues(input), name: input.name, type: input.type, ownerId: access.userId }).returning();
    return row!;
  });
}
export async function getProject(db: Database, access: Access, projectId: string): Promise<Project> {
  return withProject(db, access, projectId, async (tx) => {
    const [row] = await tx.select().from(projects).where(eq(projects.id, projectId));
    return row!;
  });
}
export async function updateProject(db: Database, access: UserAccess, projectId: string, expectedRevision: number, patch: Partial<ProjectInput>): Promise<WriteResult<Project>> {
  requireUser(access); checkRevision(expectedRevision);
  return withProject(db, access, projectId, async (tx) => {
    const [current] = await tx.select().from(projects).where(eq(projects.id, projectId));
    if (current!.revision !== expectedRevision) return { status: 'conflict', current: current! };
    const [value] = await tx.update(projects).set({ ...projectValues(patch), updatedAt: new Date(), revision: expectedRevision + 1 }).where(eq(projects.id, projectId)).returning();
    return { status: 'saved', value: value! };
  });
}

interface ProjectCursor { live: boolean; activity: string; id: string }
function decodeCursor(raw: string): ProjectCursor {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as ProjectCursor;
    if (typeof value.live !== 'boolean' || typeof value.id !== 'string' || value.id.length > 128 || typeof value.activity !== 'string' || !Number.isFinite(Date.parse(value.activity))) throw new Error();
    return value;
  } catch { throw new PaginationError('cursor is invalid'); }
}
/** Active = at least one non-stale running execution, then latest run update (or project update).
 * Keyset cursor uses name then unique ID tie-breakers; timestamps retain Postgres microseconds.
 * Archived projects stay hidden unless includeArchived is true.
 */
export async function listProjects(db: Database, access: Access, query: { cursor?: unknown; limit?: unknown; includeArchived?: boolean } = {}): Promise<Page<Project>> {
  const { cursor, limit } = parsePageQuery(query);
  const after = cursor ? decodeCursor(cursor) : null;
  return withActor(db, access, async (tx) => {
    const allProjects = access.kind === 'credential' && await credentialAllowsEveryOwnedProject(tx, access);
    const scope = access.kind !== 'credential' ? undefined : allProjects
      ? (access.projectIds.length ? inArray(projects.id, [...access.projectIds]) : sql`false`)
      : exists(tx.select({ id: mcpCredentialProjects.projectId }).from(mcpCredentialProjects).where(and(
        eq(mcpCredentialProjects.projectId, projects.id), eq(mcpCredentialProjects.userId, access.userId),
        eq(mcpCredentialProjects.credentialId, access.credentialId),
        inArray(projects.id, [...access.projectIds]),
      )));
    const live = sql<boolean>`EXISTS (SELECT 1 FROM runs r WHERE r.project_id = "projects"."id" AND r.execution_state = 'running' AND r.last_contact_at >= now() - "projects"."stale_threshold_minutes" * interval '1 minute')`;
    const activity = sql<string>`to_char(coalesce((SELECT max(r.updated_at) FROM runs r WHERE r.project_id = "projects"."id"), "projects"."updated_at") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
    // Resolve the name from an authorized cursor anchor so arbitrarily long names do not
    // make the opaque cursor exceed the shared 512-character limit.
    let afterName: string | undefined;
    if (after) {
      const [anchor] = await tx.select({ name: sql<string>`lower(${projects.name}) COLLATE "C"` }).from(projects).where(and(eq(projects.ownerId, access.userId), eq(projects.id, after.id), scope));
      if (!anchor) throw new PaginationError('cursor is invalid');
      afterName = anchor.name;
    }
    const boundary = after ? sql`(${live} < ${after.live} OR (${live} = ${after.live} AND
      (${activity} < ${after.activity} OR (${activity} = ${after.activity} AND
      (lower(${projects.name}) COLLATE "C", ${projects.id}) > (${afterName}, ${after.id})))))` : undefined;
    const lifecycle = query.includeArchived === true ? undefined : sql`${projects.lifecycle} <> 'archived'`;
    const rows = await tx.select({ project: projects, live, activity }).from(projects).where(and(
      eq(projects.ownerId, access.userId), lifecycle, scope, boundary,
    )).orderBy(sql`${live} DESC`, sql`${activity} DESC`, sql`lower(${projects.name}) COLLATE "C" ASC`, sql`${projects.id} ASC`).limit(limit + 1);
    const page = pageItems(rows, limit, (row) => Buffer.from(JSON.stringify({ live: row.live, activity: row.activity, id: row.project.id })).toString('base64url'));
    return { items: page.items.map((r) => r.project), nextCursor: page.nextCursor };
  });
}

// Deliberately no delete: archival retains history.
