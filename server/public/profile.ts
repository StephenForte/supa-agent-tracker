import { and, eq, sql } from 'drizzle-orm';

import { projects, userAvatars, users } from '../db/schema.js';
import type { Database } from '../repo/access.js';
import { publicHandleFromParam } from './handle.js';
import { activityWindow, countsForDates, currentStreakDays, harnessSeries, harnessWindow, longestStreakDays, type HarnessDayCount } from './stats.js';

export interface PublicProfile {
  owner: {
    handle: string;
    name: string | null;
    bio: string | null;
    links: { github: string | null; x: string | null; linkedin: string | null };
    joinedAt: string;
    avatarUrl: string | null;
  };
  stats: {
    agentRuns: number;
    longestRunSeconds: number;
    currentStreakDays: number;
    longestStreakDays: number;
  };
  activity: { start: string; end: string; counts: number[] };
  harnesses: { start: string; end: string; series: { harness: string; counts: number[] }[] };
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

function asInt(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) throw new Error('profile aggregate is not an integer');
  return number;
}

function asDay(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error('profile day is not a calendar date');
}

export async function readPublicProfile(db: Database, rawHandle: string, now: Date): Promise<PublicProfile | null> {
  const handle = publicHandleFromParam(rawHandle);
  if (!handle) return null;
  const [owner] = await db.select({
    id: users.id,
    handle: users.publicHandle,
    name: users.publicName,
    bio: users.publicBio,
    github: users.publicGithub,
    x: users.publicX,
    linkedin: users.publicLinkedin,
    timezone: users.profileTimezone,
    joinedAt: users.createdAt,
    avatarSha: userAvatars.sha256,
  }).from(users)
    .leftJoin(userAvatars, eq(userAvatars.userId, users.id))
    .where(sql`lower(${users.publicHandle}) = ${handle}`);
  if (!owner?.handle) return null;

  const [project] = await db.select({ id: projects.id }).from(projects).where(and(
    eq(projects.ownerId, owner.id),
    eq(projects.isPublic, true),
    sql`${projects.lifecycle} <> 'archived'`,
  )).limit(1);
  if (!project) return null;

  const activity = activityWindow(now, owner.timezone);
  const harnesses = harnessWindow(now, owner.timezone);
  // Same three predicates as readPublicAgents: this owner, is_public, not archived.
  // ::text keeps the calendar date out of the process-local date parser.
  const dayResult = await db.execute(sql`
    SELECT ((runs.started_at AT TIME ZONE ${owner.timezone})::date)::text AS day,
           count(*)::int AS count,
           coalesce(max(floor(extract(epoch FROM (coalesce(runs.finished_at, runs.last_contact_at) - runs.started_at))))::int, 0) AS longest
    FROM runs
    INNER JOIN projects ON projects.id = runs.project_id
    WHERE projects.owner_id = ${owner.id}
      AND projects.is_public = true
      AND projects.lifecycle <> 'archived'
    GROUP BY 1
  `);
  const harnessResult = await db.execute(sql`
    SELECT runs.harness AS harness,
           ((runs.started_at AT TIME ZONE ${owner.timezone})::date)::text AS day,
           count(*)::int AS count
    FROM runs
    INNER JOIN projects ON projects.id = runs.project_id
    WHERE projects.owner_id = ${owner.id}
      AND projects.is_public = true
      AND projects.lifecycle <> 'archived'
      AND ((runs.started_at AT TIME ZONE ${owner.timezone})::date) BETWEEN ${harnesses.start}::date AND ${harnesses.end}::date
    GROUP BY 1, 2
  `);

  const dayCounts = new Map<string, number>();
  let agentRuns = 0;
  let longestRunSeconds = 0;
  for (const row of rowsOf(dayResult)) {
    const count = asInt(row.count);
    const longest = asInt(row.longest);
    agentRuns += count;
    if (longest > longestRunSeconds) longestRunSeconds = longest;
    if (count > 0) dayCounts.set(asDay(row.day), count);
  }
  const harnessRows: HarnessDayCount[] = rowsOf(harnessResult).map((row) => ({
    harness: typeof row.harness === 'string' ? row.harness : null,
    day: asDay(row.day),
    count: asInt(row.count),
  }));
  const activeDays = new Set(dayCounts.keys());
  const avatarUrl = owner.avatarSha === null
    ? null
    : `/api/public/${owner.handle}/avatar?v=${owner.avatarSha.slice(0, 16)}`;

  return {
    owner: {
      handle: owner.handle,
      name: owner.name,
      bio: owner.bio,
      links: { github: owner.github, x: owner.x, linkedin: owner.linkedin },
      joinedAt: owner.joinedAt.toISOString(),
      avatarUrl,
    },
    stats: {
      agentRuns,
      longestRunSeconds,
      currentStreakDays: currentStreakDays(activeDays, owner.timezone, now),
      longestStreakDays: longestStreakDays(activeDays),
    },
    activity: { start: activity.start, end: activity.end, counts: countsForDates(dayCounts, activity.dates) },
    harnesses: { start: harnesses.start, end: harnesses.end, series: harnessSeries(harnessRows, harnesses.dates) },
  };
}
