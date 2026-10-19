import { eq } from 'drizzle-orm';

import { users } from '../db/schema.js';
import { AccessError, type Database } from '../repo/access.js';
import { alertKinds, claimMatches, type AlertKind } from './match.js';

export interface AlertPreferences {
  blocked: boolean;
  stale: boolean;
  review: boolean;
}

function flagsOf(row: { alertBlocked: boolean; alertStale: boolean; alertReview: boolean }): AlertPreferences {
  return { blocked: row.alertBlocked, stale: row.alertStale, review: row.alertReview };
}

/** Turns preferences on or off. A kind that goes from off to on baselines every run that
 *  currently matches it, in this same transaction, so existing history is not emailed.
 */
export async function applyAlertPreferences(db: Database, userId: string, next: AlertPreferences, now: Date): Promise<AlertPreferences> {
  const [current] = await db.select({
    alertBlocked: users.alertBlocked,
    alertStale: users.alertStale,
    alertReview: users.alertReview,
  }).from(users).where(eq(users.id, userId)).for('update');
  if (!current) throw new AccessError('not_found');
  const previous = flagsOf(current);
  await db.update(users).set({
    alertBlocked: next.blocked,
    alertStale: next.stale,
    alertReview: next.review,
    updatedAt: now,
  }).where(eq(users.id, userId));
  const enabling = alertKinds.filter((kind: AlertKind) => !previous[kind] && next[kind]);
  for (const kind of enabling) {
    await claimMatches(db, { userId, now, kinds: [kind], source: 'baseline' });
  }
  return { blocked: next.blocked, stale: next.stale, review: next.review };
}
