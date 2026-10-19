import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from '../db/schema.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir, repoRoot } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { users } from '../db/schema.js';
import type { CredentialAccess, UserAccess } from './access.js';
import * as projects from './projects.js';
import * as agents from './agents.js';
import * as runs from './runs.js';
import * as credentials from './credentials.js';
import { withIdempotency } from './idempotency-keys.js';
import {
  HEARTBEAT_RETENTION_MS,
  OTHER_RETENTION_MS,
  PRUNE_BATCH_LIMIT,
  idempotencyRetentionActive,
  pruneIdempotencyKeys,
  startIdempotencyRetention,
} from './idempotency-retention.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T = new Date('2026-06-01T00:00:00.000Z');
const owner: UserAccess = { kind: 'user', userId: 'user-a' };
const other: UserAccess = { kind: 'user', userId: 'user-b' };

let scratch: ScratchDatabase;
let pool: pg.Pool;
let db: AppDatabase;

function age(ms: number): Date {
  return new Date(T.getTime() - ms);
}

async function insertKey(row: { requestId: string; userId: string; operation: string | null; createdAt: Date; credentialId?: string; projectIds?: string[] }) {
  const credentialId = row.credentialId ?? null;
  await db.insert(schema.idempotencyKeys).values({
    scope: credentialId ? `credential:${credentialId}` : `user:${row.userId}`,
    requestId: row.requestId,
    userId: row.userId,
    credentialId,
    credentialProjectIds: credentialId ? row.projectIds ?? [] : null,
    requestHash: `hash-${row.requestId}`,
    response: { requestId: row.requestId },
    operation: row.operation,
    createdAt: row.createdAt,
  });
}

async function remaining(requestId: string): Promise<number> {
  const result = await pool.query('select count(*)::int n from idempotency_keys where request_id = $1', [requestId]);
  return result.rows[0]!.n;
}

async function tableCounts(): Promise<Record<string, number>> {
  const names = ['users', 'projects', 'agents', 'runs', 'run_events', 'mcp_credentials', 'mcp_credential_projects', 'audit_events'];
  const counts: Record<string, number> = {};
  for (const name of names) {
    const result = await pool.query<{ n: number }>(`select count(*)::int n from ${name}`);
    counts[name] = result.rows[0]!.n;
  }
  return counts;
}

describe('idempotency retention', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: owner.userId, email: 'a@example.com' }, { id: other.userId, email: 'b@example.com' }]);
  });
  afterAll(async () => { await pool?.end(); await scratch?.drop(); });

  it('keeps the published windows as constants', () => {
    expect(HEARTBEAT_RETENTION_MS).toBe(24 * HOUR);
    expect(OTHER_RETENTION_MS).toBe(30 * DAY);
    expect(PRUNE_BATCH_LIMIT).toBe(5000);
  });

  it('deletes only heartbeats older than 24h and every other operation older than 30d', async () => {
    const project = await projects.createProject(db, owner, { name: 'Kept', type: 'automation' });
    const credential = await credentials.createCredential(db, owner, { label: 'A', tokenHash: 'hash-retention-a', displaySuffix: 'a123', projectIds: [project.id] });
    await insertKey({ requestId: 'beat-23h', userId: owner.userId, operation: 'heartbeat', createdAt: age(23 * HOUR), credentialId: credential.id, projectIds: [project.id] });
    await insertKey({ requestId: 'beat-25h', userId: owner.userId, operation: 'heartbeat', createdAt: age(25 * HOUR), credentialId: credential.id, projectIds: [project.id] });
    await insertKey({ requestId: 'check-29d', userId: owner.userId, operation: 'check_in', createdAt: age(29 * DAY), credentialId: credential.id, projectIds: [project.id] });
    await insertKey({ requestId: 'check-31d', userId: owner.userId, operation: 'check_in', createdAt: age(31 * DAY), credentialId: credential.id, projectIds: [project.id] });
    await insertKey({ requestId: 'legacy-2d', userId: owner.userId, operation: null, createdAt: age(2 * DAY) });
    await insertKey({ requestId: 'legacy-31d', userId: owner.userId, operation: null, createdAt: age(31 * DAY) });
    await insertKey({ requestId: 'token-29d', userId: owner.userId, operation: 'token_issue', createdAt: age(29 * DAY) });
    await insertKey({ requestId: 'token-31d', userId: owner.userId, operation: 'token_issue', createdAt: age(31 * DAY) });
    await insertKey({ requestId: 'other-beat-1h', userId: other.userId, operation: 'heartbeat', createdAt: age(HOUR) });
    await insertKey({ requestId: 'other-check-1d', userId: other.userId, operation: 'check_in', createdAt: age(DAY) });
    const before = await tableCounts();

    const result = await pruneIdempotencyKeys(db, T);

    expect(await remaining('beat-23h')).toBe(1);
    expect(await remaining('beat-25h')).toBe(0);
    expect(await remaining('check-29d')).toBe(1);
    expect(await remaining('check-31d')).toBe(0);
    expect(await remaining('legacy-2d')).toBe(1);
    expect(await remaining('legacy-31d')).toBe(0);
    expect(await remaining('token-29d')).toBe(1);
    expect(await remaining('token-31d')).toBe(0);
    expect(await remaining('other-beat-1h')).toBe(1);
    expect(await remaining('other-check-1d')).toBe(1);
    expect(result.heartbeat).toBe(1);
    expect(result.other).toBe(3);
    expect(await tableCounts()).toEqual(before);
  });

  it('deletes 2.5 batches of expired rows in three statements', async () => {
    const limit = 4;
    const expired = Math.ceil(2.5 * limit);
    expect(expired).toBe(10);
    for (let index = 0; index < expired; index += 1) {
      await insertKey({ requestId: `batch-${index}`, userId: owner.userId, operation: index % 2 === 0 ? 'heartbeat' : 'check_in', createdAt: age(index % 2 === 0 ? 25 * HOUR : 31 * DAY) });
    }
    await insertKey({ requestId: 'batch-survivor', userId: other.userId, operation: 'check_in', createdAt: age(DAY) });
    await pool.query(`
      CREATE TABLE prune_statement_log (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
      CREATE FUNCTION prune_statement_log_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO prune_statement_log DEFAULT VALUES;
        RETURN NULL;
      END;
      $$;
      CREATE TRIGGER prune_statement_log_trg
        AFTER DELETE ON idempotency_keys
        FOR EACH STATEMENT
        EXECUTE FUNCTION prune_statement_log_fn();
    `);
    const queries: string[] = [];
    const logged = drizzle({ client: pool, schema, logger: { logQuery(query) { queries.push(query); } } });

    const result = await pruneIdempotencyKeys(logged, T, { limit });

    const deletes = queries.filter((query) => /^delete from "?idempotency_keys"?/i.test(query.trim()));
    const loggedStatements = await pool.query<{ n: number }>('select count(*)::int n from prune_statement_log');
    expect(result.statements).toBe(3);
    expect(deletes).toHaveLength(3);
    expect(loggedStatements.rows[0]!.n).toBe(3);
    expect(result.heartbeat + result.other).toBe(expired);
    expect(await remaining('batch-survivor')).toBe(1);
    for (let index = 0; index < expired; index += 1) expect(await remaining(`batch-${index}`)).toBe(0);
    await pool.query('DROP TRIGGER prune_statement_log_trg ON idempotency_keys; DROP FUNCTION prune_statement_log_fn(); DROP TABLE prune_statement_log');
  });

  it('replays a surviving check_in and re-executes an expired heartbeat without changing revision', async () => {
    const project = await projects.createProject(db, owner, { name: 'Replay', type: 'automation' });
    const agent = await agents.createAgent(db, owner, project.id, { name: 'worker', title: 'Worker', workloadType: 'automation' });
    const credential = await credentials.createCredential(db, owner, { label: 'Replay', tokenHash: 'hash-retention-replay', displaySuffix: 'r123', projectIds: [project.id] });
    const access: CredentialAccess = { kind: 'credential', userId: owner.userId, credentialId: credential.id, projectIds: [project.id] };
    let checkIns = 0;
    const stored = await withIdempotency(db, access, 'replay-check', 'hash-replay-check', async (tx) => {
      checkIns += 1;
      const run = await runs.createRun(tx, access, project.id, { agentId: agent.id, title: 'Daily', workloadType: 'automation' });
      return { run_id: run.id, revision: run.revision };
    }, 'check_in');
    expect(stored.status).toBe('stored');
    if (stored.status !== 'stored') return;
    const runId = (stored.response as { run_id: string }).run_id;
    let beats = 0;
    const beat = await withIdempotency(db, access, 'replay-beat', 'hash-replay-beat', async (tx) => {
      beats += 1;
      const row = await runs.heartbeatRun(tx, access, project.id, runId);
      return { run_id: row.id, revision: row.revision, execution_state: row.executionState };
    }, 'heartbeat');
    expect(beat).toMatchObject({ status: 'stored', response: { revision: 1, execution_state: 'running' } });
    await db.execute(sql`UPDATE idempotency_keys SET created_at = ${age(25 * HOUR)} WHERE request_id = 'replay-beat'`);
    const runsBefore = (await pool.query<{ n: number }>('select count(*)::int n from runs')).rows[0]!.n;
    const eventsBefore = (await pool.query<{ n: number }>("select count(*)::int n from run_events where kind = 'check_in'")).rows[0]!.n;

    await pruneIdempotencyKeys(db, T);
    const replay = await withIdempotency(db, access, 'replay-check', 'hash-replay-check', async () => {
      checkIns += 1;
      throw new Error('check_in must not re-execute');
    }, 'check_in');
    const again = await withIdempotency(db, access, 'replay-beat', 'hash-replay-beat', async (tx) => {
      beats += 1;
      const row = await runs.heartbeatRun(tx, access, project.id, runId);
      return { run_id: row.id, revision: row.revision, execution_state: row.executionState };
    }, 'heartbeat');

    expect(replay).toEqual({ status: 'replayed', response: stored.response });
    expect(checkIns).toBe(1);
    expect((await pool.query<{ n: number }>('select count(*)::int n from runs')).rows[0]!.n).toBe(runsBefore);
    expect((await pool.query<{ n: number }>("select count(*)::int n from run_events where kind = 'check_in'")).rows[0]!.n).toBe(eventsBefore);
    expect(again.status).toBe('stored');
    expect(beats).toBe(2);
    const run = await pool.query<{ revision: number; execution_state: string }>('select revision, execution_state from runs where id = $1', [runId]);
    expect(run.rows[0]).toEqual({ revision: 1, execution_state: 'running' });
    expect((await pool.query<{ n: number }>("select count(*)::int n from run_events where run_id = $1 and kind = 'heartbeat'", [runId])).rows[0]!.n).toBe(2);
  });

  it('does not start a timer on import, and stop prevents another run', async () => {
    expect(idempotencyRetentionActive()).toBe(0);
    let runs = 0;
    const retention = startIdempotencyRetention(db, {
      bootDelayMs: 15,
      intervalMs: 20,
      log: () => { runs += 1; },
      logError: () => { runs += 1; },
    });
    try {
      expect(idempotencyRetentionActive()).toBe(1);
      await waitFor(() => runs >= 1);
      retention.stop();
      expect(idempotencyRetentionActive()).toBe(0);
      const stoppedAt = runs;
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(runs).toBe(stoppedAt);
    } finally {
      retention.stop();
    }
  });

  it('logs one summary from the boot timer and a failure without row contents', async () => {
    await insertKey({ requestId: 'boot-expired', userId: owner.userId, operation: 'heartbeat', createdAt: age(25 * HOUR) });
    const lines: string[] = [];
    const started = startIdempotencyRetention(db, {
      now: () => T,
      bootDelayMs: 0,
      intervalMs: 60_000,
      log: (line) => lines.push(line),
      logError: (line) => lines.push(line),
    });
    try {
      await waitFor(() => lines.length > 0);
      expect(lines).toEqual([expect.stringMatching(/^idempotency retention deleted heartbeat=\d+ other=\d+$/)]);
      expect(await remaining('boot-expired')).toBe(0);
    } finally {
      started.stop();
    }

    const secret = 'sat_supersecretplaintext';
    const errors: string[] = [];
    const failing = startIdempotencyRetention({
      transaction: async () => { throw new Error(`response ${secret} {"request_id":"leak"}`); },
    } as unknown as AppDatabase, {
      bootDelayMs: 0,
      intervalMs: 60_000,
      log: () => {},
      logError: (line) => errors.push(line),
    });
    try {
      await waitFor(() => errors.length > 0);
      expect(errors).toEqual(['idempotency retention failed code=unknown']);
      expect(errors.join('\n')).not.toContain(secret);
      expect(errors.join('\n')).not.toContain('request_id');
    } finally {
      failing.stop();
    }
  });

  it('does not keep the process alive when the timer is left running', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', [
      "import { startIdempotencyRetention } from './server/repo/idempotency-retention.ts';",
      'startIdempotencyRetention({ transaction: async () => ({ rows: [] }) }, { bootDelayMs: 60000, intervalMs: 60000, log() {}, logError() {} });',
    ].join('\n')], { cwd: repoRoot });
    const outcome = await new Promise<number | 'timeout'>((resolve) => {
      const timer = setTimeout(() => { child.kill(); resolve('timeout'); }, 3_000);
      child.on('exit', (status) => { clearTimeout(timer); resolve(status ?? 1); });
    });
    expect(outcome).toBe(0);
  });

  it('starts retention from the production entry point only', async () => {
    const source = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
    expect(source).toContain('startIdempotencyRetention(');
    expect(idempotencyRetentionActive()).toBe(0);
  });
});

async function waitFor(ready: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for retention timer');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
