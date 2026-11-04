import { and, asc, desc, eq, getTableColumns, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { agents, auditEvents, boardEntries as board, projects, runs } from '../db/schema.js';
import { AccessError, actorColumns, withProject, type Access, type Database, type Transaction, type UserAccess } from './access.js';
import { ConflictError, jsonSafe } from '../steps/protocol.js';
import { validationRule } from '../mcp/protocol.js';
import type { listInput } from '../board/inputs.js';

export type BoardRow = typeof board.$inferSelect;
const author = { agentName: agents.name, taskId: runs.taskId };
const selection = { ...getTableColumns(board), author };
function entries(tx: Transaction) {
  return tx.select(selection).from(board).innerJoin(runs, and(eq(runs.id, board.sourceRunId), eq(runs.projectId, board.projectId))).innerJoin(agents, and(eq(agents.id, runs.agentId), eq(agents.projectId, board.projectId)));
}
export async function entry(tx: Transaction, projectId: string, entryId: string) {
  const [row] = await entries(tx).where(and(eq(board.projectId, projectId), eq(board.id, entryId)));
  if (!row) throw new AccessError('not_found');
  return row;
}
export async function listBoard(db: Database, access: Access, input: z.infer<typeof listInput>) {
  return withProject(db, access, input.project_id, async (tx) => {
    const filters = [eq(board.projectId, input.project_id)];
    if (input.status !== 'all') filters.push(eq(board.status, input.status));
    if (input.kind !== undefined) filters.push(eq(board.kind, input.kind));
    if (input.key !== undefined) filters.push(eq(board.key, input.key));
    if (input.task_ref !== undefined) filters.push(eq(board.taskRef, input.task_ref));
    if (input.cursor) {
      let cursor: { at: string; id: string };
      try {
        cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString()) as typeof cursor;
        if (typeof cursor.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(cursor.at) || !Number.isFinite(Date.parse(cursor.at)) || typeof cursor.id !== 'string' || cursor.id.length > 128) throw new Error();
      } catch { throw new AccessError('validation_error'); }
      filters.push(or(sql`${board.updatedAt} < ${cursor.at}::timestamptz`, and(sql`${board.updatedAt} = ${cursor.at}::timestamptz`, sql`${board.id} > ${cursor.id}`))!);
    }
    const rows = await tx.select({ ...selection, cursorTime: sql<string>`to_char(${board.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(board).innerJoin(runs, and(eq(runs.id, board.sourceRunId), eq(runs.projectId, board.projectId))).innerJoin(agents, and(eq(agents.id, runs.agentId), eq(agents.projectId, board.projectId))).where(and(...filters)).orderBy(desc(board.updatedAt), asc(board.id)).limit(input.limit + 1);
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    const items = visible.map(({ cursorTime, ...row }) => { void cursorTime; return row; });
    return { items, nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify({ at: last.cursorTime, id: last.id })).toString('base64url') : null };
  });
}
export async function boardDigest(db: Database, access: Access, projectId: string) {
  return withProject(db, access, projectId, async (tx) => {
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(board).where(and(eq(board.projectId, projectId), eq(board.status, 'open')));
    const rows = await entries(tx).where(and(eq(board.projectId, projectId), eq(board.status, 'open')))
      .orderBy(sql`CASE ${board.kind} WHEN 'hazard' THEN 0 WHEN 'question' THEN 1 ELSE 2 END`, desc(board.updatedAt), asc(board.id)).limit(20);
    return { open_count: count!.n, entries: rows.map(({ id, kind, key, title, taskRef, addressedTo, updatedAt, revision, author }) => ({ id, kind, key, title, taskRef, addressedTo, updatedAt, revision, author })) };
  });
}
/** Called under withProject's project lock: check+insert is serialized across credentials. */
export async function assertCapacity(tx: Transaction, projectId: string) {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(board).where(and(eq(board.projectId, projectId), eq(board.status, 'open')));
  if (row!.n >= 500) throw validationRule('board_full');
}
export const clearResolution = { status: 'open', resolution: null, resolvedAt: null, resolvedByRunId: null, resolvedByUserId: null };
export async function changeStatus(tx: Transaction, access: Access, projectId: string, entryId: string, expected: number, resolved: boolean, input: { sourceRunId?: string; resolution?: string } = {}) {
  const current = await entry(tx, projectId, entryId);
  if (current.revision !== expected || (current.status === 'resolved') === resolved) throw new ConflictError(jsonSafe(current));
  await tx.update(board).set({
    ...(resolved ? { status: 'resolved', resolution: input.resolution ?? null, resolvedAt: new Date(), resolvedByRunId: input.sourceRunId ?? null, resolvedByUserId: access.kind === 'user' ? access.userId : null } : clearResolution),
    updatedAt: new Date(), revision: current.revision + 1,
  }).where(and(eq(board.id, entryId), eq(board.projectId, projectId)));
  await tx.insert(auditEvents).values({ userId: access.userId, projectId, ...actorColumns(access), action: resolved ? 'board_entry_resolved' : 'board_entry_reopened', target: entryId, details: { revision: current.revision + 1 } });
  return entry(tx, projectId, entryId);
}
export async function ownerStatus(db: Database, access: UserAccess, projectId: string, entryId: string, expected: number, resolved: boolean, resolution?: string) {
  return withProject(db, access, projectId, (tx) => changeStatus(tx, access, projectId, entryId, expected, resolved, { resolution }));
}
/** A single SQL statement, owner-filtered before aggregation; no project loop. */
export async function boardSummary(db: Database, access: UserAccess) {
  if (access.kind !== 'user') throw new AccessError('forbidden');
  const result = await db.execute(sql`
    SELECT b.project_id AS "projectId", count(*)::int AS "openCount",
      count(*) FILTER (WHERE b.kind = 'question')::int AS "questionCount",
      count(*) FILTER (WHERE b.kind = 'hazard')::int AS "hazardCount",
      (jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'title', b.title, 'updatedAt', b.updated_at) ORDER BY b.updated_at DESC, b.id ASC)->0) AS latest
    FROM ${board} b INNER JOIN ${projects} p ON p.id = b.project_id
    WHERE p.owner_id = ${access.userId} AND b.status = 'open'
    GROUP BY b.project_id ORDER BY b.project_id`);
  return { items: result.rows };
}
