import { sql } from 'drizzle-orm';

import type { Database } from '../repo/access.js';

export const alertKinds = ['blocked', 'stale', 'review'] as const;
export type AlertKind = (typeof alertKinds)[number];

export interface DigestItem {
  runId: string;
  title: string;
  agentName: string;
  projectName: string;
  blocker: string | null;
  lastContactAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  kind: AlertKind;
}

interface MatchRow {
  run_id: string;
  title: string;
  agent_name: string;
  project_name: string;
  blocker: string | null;
  last_contact_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
  kind: string;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowsOf(result: unknown): MatchRow[] {
  if (Array.isArray(result)) return result as MatchRow[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as MatchRow[] : [];
}

function isKind(value: string): value is AlertKind {
  return value === 'blocked' || value === 'stale' || value === 'review';
}

function toItem(row: MatchRow): DigestItem | null {
  if (!isKind(row.kind)) return null;
  return {
    runId: row.run_id,
    title: row.title,
    agentName: row.agent_name,
    projectName: row.project_name,
    blocker: row.blocker,
    lastContactAt: asDate(row.last_contact_at),
    updatedAt: asDate(row.updated_at),
    finishedAt: row.finished_at === null ? null : asDate(row.finished_at),
    kind: row.kind,
  };
}

/** Same precedence as needsAttention: blocked, then stale, then waiting for review.
 *  Stale is strict: last contact older than the project's threshold, matching isStale's `>`.
 *  owner_id is the tenant boundary. Archived projects are out.
 */
function matchesQuery(userId: string, now: Date) {
  return sql`
    SELECT r.id AS run_id,
           r.title,
           a.name AS agent_name,
           p.name AS project_name,
           r.blocker,
           r.last_contact_at,
           r.updated_at,
           r.finished_at,
           CASE
             WHEN r.work_status = 'blocked' THEN 'blocked'
             WHEN r.execution_state = 'running'
               AND r.last_contact_at < (${now})::timestamptz - (p.stale_threshold_minutes * interval '1 minute')
             THEN 'stale'
             WHEN r.execution_state = 'finished' AND r.work_status = 'waiting_for_review' THEN 'review'
           END AS kind
    FROM runs r
    INNER JOIN projects p ON p.id = r.project_id
    INNER JOIN agents a ON a.id = r.agent_id AND a.project_id = r.project_id
    WHERE p.owner_id = ${userId}
      AND p.lifecycle <> 'archived'
  `;
}

function kindList(kinds: readonly AlertKind[]) {
  return sql.join(kinds.map((kind) => sql`${kind}`), sql`, `);
}

/** Every current match for this owner, including ones already delivered. Agreement tests use this. */
export async function selectAttention(db: Database, userId: string, now: Date): Promise<Array<{ runId: string; kind: AlertKind }>> {
  const result = await db.execute(sql`
    SELECT run_id, kind
    FROM (${matchesQuery(userId, now)}) matches
    WHERE kind IS NOT NULL
    ORDER BY run_id, kind
  `);
  return rowsOf(result).flatMap((row) => isKind(row.kind) ? [{ runId: row.run_id, kind: row.kind }] : []);
}

/** Inserts a delivery row for each undelivered match and returns only the rows this statement inserted. */
export async function claimMatches(db: Database, input: {
  userId: string;
  now: Date;
  kinds: readonly AlertKind[];
  source: 'baseline' | 'sent';
}): Promise<DigestItem[]> {
  if (input.kinds.length === 0) return [];
  const result = await db.execute(sql`
    WITH matches AS (${matchesQuery(input.userId, input.now)}),
    pending AS (
      SELECT * FROM matches WHERE kind IN (${kindList(input.kinds)})
    ),
    inserted AS (
      INSERT INTO alert_deliveries (user_id, run_id, kind, source, recorded_at)
      SELECT ${input.userId}, run_id, kind, ${input.source}, ${input.now}
      FROM pending
      ON CONFLICT (run_id, kind) DO NOTHING
      RETURNING run_id, kind
    )
    SELECT p.run_id, p.title, p.agent_name, p.project_name, p.blocker,
           p.last_contact_at, p.updated_at, p.finished_at, p.kind
    FROM pending p
    INNER JOIN inserted i ON i.run_id = p.run_id AND i.kind = p.kind
  `);
  return rowsOf(result).flatMap((row) => {
    const item = toItem(row);
    return item ? [item] : [];
  });
}
