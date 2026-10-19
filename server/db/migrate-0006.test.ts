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
let preserved: unknown[] = [];

const preservedSql = `SELECT u.email, p.name AS project, r.title AS run, k.request_id
  FROM users u
  JOIN projects p ON p.owner_id = u.id
  JOIN runs r ON r.project_id = p.id
  JOIN idempotency_keys k ON k.user_id = u.id`;

describe('0006 public pages on populated data', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    dir = await mkdtemp(path.join(tmpdir(), 'supa-0006-'));
    for (const file of ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql']) {
      await cp(path.join(migrationsDir, file), path.join(dir, file));
    }
    expect((await runMigrations(pool, dir)).applied).toEqual([
      '0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql',
    ]);
    await pool.query("INSERT INTO users (id, email, display_name) VALUES ('user-a', 'a@example.com', 'Ada')");
    await pool.query("INSERT INTO projects (id, owner_id, name, type) VALUES ('prj-a', 'user-a', 'Kept', 'coding')");
    await pool.query("INSERT INTO agents (id, project_id, name, title, workload_type) VALUES ('agt-a', 'prj-a', 'worker', 'Worker', 'coding')");
    await pool.query("INSERT INTO runs (id, project_id, agent_id, title, workload_type) VALUES ('run-a', 'prj-a', 'agt-a', 'Existing', 'coding')");
    await pool.query("INSERT INTO mcp_credentials (id, user_id, label, token_hash, display_suffix) VALUES ('cred-1', 'user-a', 'Agent', 'hash-cred-1', 'c123')");
    await pool.query(`INSERT INTO idempotency_keys (scope, request_id, user_id, request_hash, response, operation)
      VALUES ('user:user-a', 'kept-key', 'user-a', 'hash-kept', '{"ok":true}'::jsonb, 'project_create')`);
    preserved = (await pool.query(preservedSql)).rows;
    await cp(path.join(migrationsDir, '0006_public_pages.sql'), path.join(dir, '0006_public_pages.sql'));
    expect((await runMigrations(pool, dir)).applied).toEqual(['0006_public_pages.sql']);
  });
  afterAll(async () => {
    await pool?.end();
    await scratch?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('publishes nothing: every handle stays null and every project stays private', async () => {
    expect((await runMigrations(pool, dir)).applied).toEqual([]);
    expect((await pool.query(preservedSql)).rows).toEqual(preserved);
    expect((await pool.query('SELECT public_handle FROM users')).rows).toEqual([{ public_handle: null }]);
    expect((await pool.query('SELECT is_public FROM projects')).rows).toEqual([{ is_public: false }]);
    const index = await pool.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'users_public_handle_ci'");
    expect(index.rows[0]?.indexdef).toContain('lower(public_handle)');
  });

  it('rejects a bad handle in the database and a duplicate of the same lowercase handle', async () => {
    await expect(pool.query("UPDATE users SET public_handle = 'AB' WHERE id = 'user-a'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE users SET public_handle = 'ab' WHERE id = 'user-a'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE users SET public_handle = '-abc' WHERE id = 'user-a'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE users SET public_handle = 'abc-' WHERE id = 'user-a'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE users SET public_handle = 'a_b' WHERE id = 'user-a'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE users SET public_handle = 'ABC' WHERE id = 'user-a'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE users SET public_handle = '${'a'.repeat(33)}' WHERE id = 'user-a'`)).rejects.toMatchObject({ code: '23514' });
    await pool.query("UPDATE users SET public_handle = 'ada' WHERE id = 'user-a'");
    await pool.query("INSERT INTO users (id, email) VALUES ('user-b', 'b@example.com')");
    await expect(pool.query("UPDATE users SET public_handle = 'ada' WHERE id = 'user-b'")).rejects.toMatchObject({ code: '23505' });
    await pool.query("UPDATE users SET public_handle = NULL WHERE id = 'user-a'");
    expect((await pool.query('SELECT public_handle FROM users WHERE id = $1', ['user-a'])).rows).toEqual([{ public_handle: null }]);
  });
});
