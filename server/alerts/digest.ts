import { sql } from 'drizzle-orm';
import type pg from 'pg';

import type { EmailSender } from '../email/index.js';
import type { Database } from '../repo/access.js';
import { composeDigest } from './compose.js';
import { claimMatches, type AlertKind } from './match.js';

const LOCK_KEY = 'supa-alert-digest';

export interface DigestCycleResult {
  lock: 'acquired' | 'busy';
  users: number;
  emails: number;
  items: number;
  failures: number;
}

interface EligibleUser {
  id: string;
  email: string;
  alert_blocked: boolean;
  alert_stale: boolean;
  alert_review: boolean;
}

function userRows(result: unknown): EligibleUser[] {
  if (Array.isArray(result)) return result as EligibleUser[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as EligibleUser[] : [];
}

function enabledKinds(user: EligibleUser): AlertKind[] {
  const kinds: AlertKind[] = [];
  if (user.alert_blocked) kinds.push('blocked');
  if (user.alert_stale) kinds.push('stale');
  if (user.alert_review) kinds.push('review');
  return kinds;
}

async function tryLock(client: pg.PoolClient): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [LOCK_KEY]);
  return result.rows[0]?.locked === true;
}

async function unlock(client: pg.PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY]);
}

export function alertDigestSummary(result: DigestCycleResult): string {
  return `alert digest users=${result.users} emails=${result.emails} items=${result.items} failures=${result.failures}`;
}

/** SQLSTATE only. A sender failure is counted inside the cycle and never logged with its message. */
export function alertDigestFailureLine(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : 'unknown';
  return `alert digest failed code=${code}`;
}

/** One pass. The advisory lock is session-scoped on a dedicated connection so two processes
 *  cannot deliver the same digest. Each user is its own transaction: rows are inserted and the
 *  email is sent before commit. A send error rolls the rows back for the next pass.
 */
export async function runAlertDigestCycle(input: {
  pool: pg.Pool;
  db: Database;
  sender: EmailSender;
  publicUrl: string;
  now?: Date;
  /** Test hook, called only after this process holds the lock and before any send. */
  afterLock?: () => Promise<void>;
}): Promise<DigestCycleResult> {
  const now = input.now ?? new Date();
  const client = await input.pool.connect();
  let locked = false;
  try {
    locked = await tryLock(client);
    if (!locked) return { lock: 'busy', users: 0, emails: 0, items: 0, failures: 0 };
    if (input.afterLock) await input.afterLock();
    const users = userRows(await input.db.execute(sql`
      SELECT id, email, alert_blocked, alert_stale, alert_review
      FROM users
      WHERE email_verified = true
        AND (alert_blocked OR alert_stale OR alert_review)
      ORDER BY id
    `));
    let emails = 0;
    let items = 0;
    let failures = 0;
    for (const user of users) {
      const kinds = enabledKinds(user);
      try {
        const claimed = await input.db.transaction(async (tx) => {
          const pending = await claimMatches(tx, { userId: user.id, now, kinds, source: 'sent' });
          if (pending.length === 0) return [];
          const message = composeDigest(pending, input.publicUrl, now);
          await input.sender.sendEmail({ to: user.email, subject: message.subject, text: message.text, html: message.html });
          return pending;
        });
        if (claimed.length > 0) {
          emails += 1;
          items += claimed.length;
        }
      } catch {
        failures += 1;
      }
    }
    return { lock: 'acquired', users: users.length, emails, items, failures };
  } finally {
    let releaseError: Error | undefined;
    if (locked) {
      try {
        await unlock(client);
      } catch (error) {
        releaseError = error instanceof Error ? error : new Error('unlock failed');
      }
    }
    client.release(releaseError);
  }
}
