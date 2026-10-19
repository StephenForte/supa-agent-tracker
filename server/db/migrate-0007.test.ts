import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

let scratch: ScratchDatabase;
let pool: pg.Pool;
let dir: string;

describe('0007 alerts on populated data', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    dir = await mkdtemp(path.join(tmpdir(), 'supa-0007-'));
    for (const file of ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql', '0006_public_pages.sql']) {
      await cp(path.join(migrationsDir, file), path.join(dir, file));
    }
    expect((await runMigrations(pool, dir)).applied).toEqual([
      '0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql', '0006_public_pages.sql',
    ]);
    await pool.query(`INSERT INTO users (id, email, display_name, email_verified) VALUES
      ('user-a', 'a@example.com', 'Ada', true),
      ('user-b', 'b@example.com', 'Bea', false)`);
    await pool.query(`INSERT INTO projects (id, owner_id, name, type, lifecycle) VALUES
      ('prj-live', 'user-a', 'Live', 'coding', 'active'),
      ('prj-arch', 'user-a', 'Old', 'coding', 'archived'),
      ('prj-b', 'user-b', 'Theirs', 'automation', 'active')`);
    await pool.query(`INSERT INTO agents (id, project_id, name, title, workload_type) VALUES
      ('agt-live', 'prj-live', 'worker', 'Worker', 'coding'),
      ('agt-arch', 'prj-arch', 'archivist', 'Archivist', 'coding'),
      ('agt-b', 'prj-b', 'other', 'Other', 'automation')`);
    await pool.query(`INSERT INTO runs (id, project_id, agent_id, title, workload_type, execution_state, work_status, started_at, finished_at, last_contact_at, blocker) VALUES
      ('run-live', 'prj-live', 'agt-live', 'Still going', 'coding', 'running', 'in_progress', now() - interval '2 hours', NULL, now(), NULL),
      ('run-blocked', 'prj-live', 'agt-live', 'Stuck', 'coding', 'running', 'blocked', now() - interval '3 hours', NULL, now() - interval '2 hours', 'waiting on a key'),
      ('run-review', 'prj-live', 'agt-live', 'Please look', 'coding', 'finished', 'waiting_for_review', now() - interval '1 day', now() - interval '1 hour', now() - interval '1 hour', NULL),
      ('run-done', 'prj-live', 'agt-live', 'Done', 'coding', 'finished', 'completed', now() - interval '2 days', now() - interval '1 day', now() - interval '1 day', NULL),
      ('run-failed', 'prj-live', 'agt-live', 'Broke', 'coding', 'failed', 'failed', now() - interval '2 days', now() - interval '1 day', now() - interval '1 day', NULL),
      ('run-cancelled', 'prj-live', 'agt-live', 'Stopped', 'coding', 'cancelled', 'cancelled', now() - interval '2 days', now() - interval '1 day', now() - interval '1 day', NULL),
      ('run-arch', 'prj-arch', 'agt-arch', 'Archived work', 'coding', 'finished', 'waiting_for_review', now() - interval '4 days', now() - interval '3 days', now() - interval '3 days', NULL),
      ('run-other', 'prj-b', 'agt-b', 'Someone else', 'automation', 'running', 'blocked', now() - interval '5 hours', NULL, now() - interval '4 hours', 'not yours')`);
    await cp(path.join(migrationsDir, '0007_alerts.sql'), path.join(dir, '0007_alerts.sql'));
    expect((await runMigrations(pool, dir)).applied).toEqual(['0007_alerts.sql']);
  });
  afterAll(async () => {
    await pool?.end();
    await scratch?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('enables nothing and delivers nothing', async () => {
    expect((await runMigrations(pool, dir)).applied).toEqual([]);
    const flags = await pool.query<{ alert_blocked: boolean; alert_stale: boolean; alert_review: boolean }>('SELECT alert_blocked, alert_stale, alert_review FROM users ORDER BY id');
    expect(flags.rows).toEqual([
      { alert_blocked: false, alert_stale: false, alert_review: false },
      { alert_blocked: false, alert_stale: false, alert_review: false },
    ]);
    expect((await pool.query('SELECT count(*)::int AS n FROM alert_deliveries')).rows[0]?.n).toBe(0);
    expect((await pool.query('SELECT title FROM runs ORDER BY title')).rows.map((row) => row.title)).toEqual([
      'Archived work', 'Broke', 'Done', 'Please look', 'Someone else', 'Still going', 'Stopped', 'Stuck',
    ]);
  });

  it('restricts deletes of a referenced user or run', async () => {
    await pool.query(`INSERT INTO alert_deliveries (user_id, run_id, kind, source) VALUES ('user-a', 'run-review', 'review', 'baseline')`);
    await expect(pool.query(`DELETE FROM users WHERE id = 'user-a'`)).rejects.toMatchObject({ code: '23001' });
    await expect(pool.query(`DELETE FROM runs WHERE id = 'run-review'`)).rejects.toMatchObject({ code: '23001' });
    await expect(pool.query(`INSERT INTO alert_deliveries (user_id, run_id, kind, source) VALUES ('user-a', 'run-review', 'review', 'sent')`)).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query(`INSERT INTO alert_deliveries (user_id, run_id, kind, source) VALUES ('user-a', 'run-live', 'nope', 'sent')`)).rejects.toMatchObject({ code: '23514' });
    await pool.query(`DELETE FROM alert_deliveries WHERE run_id = 'run-review'`);
  });
});
