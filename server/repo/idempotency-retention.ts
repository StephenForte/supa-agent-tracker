import { sql } from 'drizzle-orm';
import type { Database } from './access.js';

/** D-033. Heartbeat replays only record another contact and do not change revision.
 *  Every other operation, including a NULL legacy row, stays for 30 days so an agent
 *  that was offline overnight or over a weekend can still retry the same request_id.
 *  The windows are product policy, not environment settings.
 */
export const HEARTBEAT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const OTHER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PRUNE_BATCH_LIMIT = 5_000;
export const RETENTION_BOOT_DELAY_MS = 1_000;
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

const HEARTBEAT_OPERATION = 'heartbeat';

export interface PruneResult {
  heartbeat: number;
  other: number;
  statements: number;
}

let activeSchedulers = 0;

/** Schedulers started and not yet stopped. Importing this module does not start one. */
export function idempotencyRetentionActive(): number {
  return activeSchedulers;
}

function deletedOperations(result: unknown): Array<string | null> {
  const rows = (result as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const operation = (row as { operation?: unknown }).operation;
    return typeof operation === 'string' ? operation : null;
  });
}

/** Deletes expired keys in batches. `now` is the caller's clock. Each batch is its own transaction.
 *  Only operation exactly equal to `heartbeat` uses the 24-hour cutoff. NULL and every other
 *  name use 30 days. The loop stops when a batch deletes fewer than `limit` rows.
 */
export async function pruneIdempotencyKeys(db: Database, now: Date, options?: { limit?: number }): Promise<PruneResult> {
  const limit = options?.limit ?? PRUNE_BATCH_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('idempotency prune limit must be a positive integer');
  const heartbeatBefore = new Date(now.getTime() - HEARTBEAT_RETENTION_MS);
  const otherBefore = new Date(now.getTime() - OTHER_RETENTION_MS);
  let heartbeat = 0;
  let other = 0;
  let statements = 0;
  for (;;) {
    const operations = await db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        delete from idempotency_keys
        where (scope, request_id) in (
          select scope, request_id from idempotency_keys
          where (operation = ${HEARTBEAT_OPERATION} and created_at < ${heartbeatBefore})
             or (operation is distinct from ${HEARTBEAT_OPERATION} and created_at < ${otherBefore})
          order by created_at, scope, request_id
          limit ${limit}
        )
        returning operation
      `);
      return deletedOperations(result);
    });
    statements += 1;
    for (const operation of operations) {
      if (operation === HEARTBEAT_OPERATION) heartbeat += 1;
      else other += 1;
    }
    if (operations.length < limit) break;
  }
  return { heartbeat, other, statements };
}

export function retentionSummary(result: PruneResult): string {
  return `idempotency retention deleted heartbeat=${result.heartbeat} other=${result.other}`;
}

/** SQLSTATE only. Never the message: Postgres and drivers can echo bind values. */
export function retentionFailureLine(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : 'unknown';
  return `idempotency retention failed code=${code}`;
}

/** Boot once, then hourly. Timers are unref'd so they do not keep the process alive, and stop() clears them. */
export function startIdempotencyRetention(db: Database, options?: {
  now?: () => Date;
  bootDelayMs?: number;
  intervalMs?: number;
  limit?: number;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}): { stop: () => void } {
  const now = options?.now ?? (() => new Date());
  const log = options?.log ?? ((line: string) => { console.log(line); });
  const logError = options?.logError ?? ((line: string) => { console.error(line); });
  const limit = options?.limit;
  let stopped = false;
  let running = false;
  activeSchedulers += 1;
  const run = () => {
    if (stopped || running) return;
    running = true;
    void pruneIdempotencyKeys(db, now(), limit === undefined ? undefined : { limit })
      .then((result) => { if (!stopped) log(retentionSummary(result)); })
      .catch((error: unknown) => { if (!stopped) logError(retentionFailureLine(error)); })
      .finally(() => { running = false; });
  };
  const boot = setTimeout(run, options?.bootDelayMs ?? RETENTION_BOOT_DELAY_MS);
  const interval = setInterval(run, options?.intervalMs ?? RETENTION_INTERVAL_MS);
  boot.unref();
  interval.unref();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      activeSchedulers -= 1;
      clearTimeout(boot);
      clearInterval(interval);
    },
  };
}
