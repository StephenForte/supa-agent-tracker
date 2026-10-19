import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { pageItems, parsePageQuery, PaginationError, type Page } from '../app/pagination.js';
import { agents, projects, pullRequestRefs, runs, toolUsageAggregates, users } from '../db/schema.js';
import { AccessError, requireUser, withActor, withProject, type Database, type Transaction, type UserAccess } from './access.js';

type AgentRow = typeof agents.$inferSelect;
type RunRow = typeof runs.$inferSelect;
type PrRow = typeof pullRequestRefs.$inferSelect;
type ToolRow = typeof toolUsageAggregates.$inferSelect;

export interface RunListRecord {
  run: RunRow;
  prReferences: PrRow[];
  tools: ToolRow[] | null;
  childRunIds: string[];
}

export async function readAccount(db: Database, access: UserAccess) {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const [user] = await tx.select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      emailVerified: users.emailVerified,
      publicHandle: users.publicHandle,
      alertBlocked: users.alertBlocked,
      alertStale: users.alertStale,
      alertReview: users.alertReview,
    }).from(users).where(eq(users.id, access.userId));
    if (!user) throw new AccessError('not_found');
    return user;
  });
}

/** Resolves a run to its project for this user. The owner predicate is the authorization boundary. */
export async function findOwnedRun(db: Database, access: UserAccess, runId: string): Promise<{ projectId: string }> {
  requireUser(access);
  return withActor(db, access, async (tx) => {
    const [row] = await tx.select({ projectId: runs.projectId }).from(runs)
      .innerJoin(projects, eq(projects.id, runs.projectId))
      .where(and(eq(runs.id, runId), eq(projects.ownerId, access.userId)));
    if (!row) throw new AccessError('not_found');
    return row;
  });
}

export async function listUserAgents(
  db: Database,
  access: UserAccess,
  query: { projectId?: string; cursor?: unknown; limit?: unknown } = {},
): Promise<Page<AgentRow>> {
  requireUser(access);
  const { cursor, limit } = parsePageQuery(query);
  const read = (tx: Transaction) => listAgents(tx, access, query.projectId, cursor, limit);
  if (query.projectId) return withProject(db, access, query.projectId, read);
  return withActor(db, access, read);
}

async function listAgents(tx: Transaction, access: UserAccess, projectId: string | undefined, cursor: string | null, limit: number): Promise<Page<AgentRow>> {
  const afterId = cursor ? decodeIdCursor(cursor) : null;
  let boundary: ReturnType<typeof sql> | undefined;
  if (afterId) {
    const [anchor] = await tx.select({ name: agents.name }).from(agents)
      .innerJoin(projects, eq(projects.id, agents.projectId))
      .where(and(eq(agents.id, afterId), eq(projects.ownerId, access.userId), projectId ? eq(agents.projectId, projectId) : undefined));
    if (!anchor) throw new PaginationError('cursor is invalid');
    boundary = sql`(${agents.name}, ${agents.id}) > (${anchor.name}, ${afterId})`;
  }
  const rows = await tx.select({ agent: agents }).from(agents)
    .innerJoin(projects, eq(projects.id, agents.projectId))
    .where(and(eq(projects.ownerId, access.userId), projectId ? eq(agents.projectId, projectId) : undefined, boundary))
    .orderBy(agents.name, agents.id)
    .limit(limit + 1);
  const page = pageItems(rows, limit, (row) => encodeIdCursor(row.agent.id));
  return { items: page.items.map((row) => row.agent), nextCursor: page.nextCursor };
}

export async function listUserRuns(
  db: Database,
  access: UserAccess,
  query: { projectId?: string; cursor?: unknown; limit?: unknown } = {},
): Promise<Page<RunListRecord>> {
  requireUser(access);
  const { cursor, limit } = parsePageQuery(query);
  if (cursor && !/^[A-Za-z0-9-]{1,128}$/.test(cursor)) throw new PaginationError('cursor is invalid');
  const read = (tx: Transaction) => listRuns(tx, access, query.projectId, cursor, limit);
  if (query.projectId) return withProject(db, access, query.projectId, read);
  return withActor(db, access, read);
}

async function listRuns(tx: Transaction, access: UserAccess, projectId: string | undefined, cursor: string | null, limit: number): Promise<Page<RunListRecord>> {
  const rows = await tx.select({ run: runs }).from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(and(
      eq(projects.ownerId, access.userId),
      projectId ? eq(runs.projectId, projectId) : undefined,
      cursor ? lt(runs.id, cursor) : undefined,
    ))
    .orderBy(desc(runs.id))
    .limit(limit + 1);
  const page = pageItems(rows.map((row) => row.run), limit, (run) => run.id);
  const attached = await attachments(tx, access, page.items.map((run) => run.id));
  return {
    items: page.items.map((run) => ({
      run,
      prReferences: attached.prs.get(run.id) ?? [],
      tools: attached.tools.get(run.id) ?? null,
      childRunIds: attached.children.get(run.id) ?? [],
    })),
    nextCursor: page.nextCursor,
  };
}

async function attachments(tx: Transaction, access: UserAccess, runIds: readonly string[]) {
  const prs = new Map<string, PrRow[]>();
  const tools = new Map<string, ToolRow[]>();
  const children = new Map<string, string[]>();
  if (runIds.length === 0) return { prs, tools, children };
  const ids = [...runIds];
  const owned = and(eq(projects.ownerId, access.userId), inArray(runs.id, ids));
  const prRows = await tx.select({ pr: pullRequestRefs }).from(pullRequestRefs)
    .innerJoin(runs, eq(runs.id, pullRequestRefs.runId))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(owned)
    .orderBy(desc(pullRequestRefs.primary), pullRequestRefs.repositoryName, pullRequestRefs.number);
  for (const row of prRows) {
    const list = prs.get(row.pr.runId) ?? [];
    list.push(row.pr);
    prs.set(row.pr.runId, list);
  }
  const toolRows = await tx.select({ tool: toolUsageAggregates }).from(toolUsageAggregates)
    .innerJoin(runs, eq(runs.id, toolUsageAggregates.runId))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(owned)
    .orderBy(toolUsageAggregates.name, toolUsageAggregates.source);
  for (const row of toolRows) {
    const list = tools.get(row.tool.runId) ?? [];
    list.push(row.tool);
    tools.set(row.tool.runId, list);
  }
  const childRows = await tx.select({ id: runs.id, parentRunId: runs.parentRunId }).from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(and(eq(projects.ownerId, access.userId), inArray(runs.parentRunId, ids)))
    .orderBy(runs.id);
  for (const row of childRows) {
    if (!row.parentRunId) continue;
    const list = children.get(row.parentRunId) ?? [];
    list.push(row.id);
    children.set(row.parentRunId, list);
  }
  return { prs, tools, children };
}

function encodeIdCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}

function decodeIdCursor(raw: string): string {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { id?: unknown };
    if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 128) throw new Error('bad cursor');
    return value.id;
  } catch {
    throw new PaginationError('cursor is invalid');
  }
}
