import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { migrationsDir } from '../paths.js';
import { createDb } from './client.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { withIdempotency } from '../repo/idempotency-keys.js';

let scratch: ScratchDatabase;
let pool: pg.Pool;
let dir: string;

describe('0005 operation on populated data', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    dir = await mkdtemp(path.join(tmpdir(), 'supa-0005-'));
    for (const file of ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql']) {
      await cp(path.join(migrationsDir, file), path.join(dir, file));
    }
    expect((await runMigrations(pool, dir)).applied).toEqual(['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql']);
    await pool.query("INSERT INTO users (id, email) VALUES ('user-a', 'a@example.com')");
    await pool.query("INSERT INTO projects (id, owner_id, name, type) VALUES ('prj-a', 'user-a', 'Kept', 'automation')");
    await pool.query("INSERT INTO agents (id, project_id, name, title, workload_type) VALUES ('agt-a', 'prj-a', 'worker', 'Worker', 'automation')");
    await pool.query("INSERT INTO mcp_credentials (id, user_id, label, token_hash, display_suffix) VALUES ('cred-1', 'user-a', 'Agent', 'hash-cred-1', 'c123')");
    await pool.query("INSERT INTO mcp_credential_projects (credential_id, project_id, user_id) VALUES ('cred-1', 'prj-a', 'user-a')");
    await pool.query("INSERT INTO runs (id, project_id, agent_id, title, workload_type) VALUES ('run-a', 'prj-a', 'agt-a', 'Existing', 'automation')");
    await pool.query(`INSERT INTO idempotency_keys (scope, request_id, user_id, credential_id, credential_project_ids, request_hash, response)
      VALUES ('credential:cred-1', 'mcp-1', 'user-a', 'cred-1', ARRAY['prj-a'], 'hash-mcp', '{"run_id":"run-a"}'::jsonb),
             ('user:user-a', 'rest-1', 'user-a', NULL, NULL, 'hash-rest', '{"token":{"id":"tok-1"}}'::jsonb)`);
    await cp(path.join(migrationsDir, '0005_idempotency_retention.sql'), path.join(dir, '0005_idempotency_retention.sql'));
    expect((await runMigrations(pool, dir)).applied).toEqual(['0005_idempotency_retention.sql']);
  });
  afterAll(async () => {
    await pool?.end();
    await scratch?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('keeps pre-0005 rows with a null operation and records the operation on new writes', async () => {
    expect((await runMigrations(pool, dir)).applied).toEqual([]);
    const prior = await pool.query<{ request_id: string; operation: string | null; response: unknown }>(
      'select request_id, operation, response from idempotency_keys order by request_id',
    );
    expect(prior.rows).toEqual([
      { request_id: 'mcp-1', operation: null, response: { run_id: 'run-a' } },
      { request_id: 'rest-1', operation: null, response: { token: { id: 'tok-1' } } },
    ]);
    expect((await pool.query('select id from runs')).rows).toEqual([{ id: 'run-a' }]);
    const indexes = await pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'idempotency_keys' and indexname like 'idempotency_keys_%created_at' order by indexname",
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'idempotency_keys_heartbeat_created_at',
      'idempotency_keys_other_created_at',
    ]);
    const database = createDb(pool);
    const access = { kind: 'credential' as const, userId: 'user-a', credentialId: 'cred-1', projectIds: ['prj-a'] };
    await withIdempotency(database, access, 'mcp-new', 'hash-new', async () => ({ run_id: 'run-a' }), 'check_in');
    await withIdempotency(database, { kind: 'user', userId: 'user-a' }, 'rest-new', 'hash-token', async () => ({ ok: true }), 'token_issue');
    const written = await pool.query<{ request_id: string; operation: string | null }>(
      "select request_id, operation from idempotency_keys where request_id in ('mcp-new', 'rest-new') order by request_id",
    );
    expect(written.rows).toEqual([
      { request_id: 'mcp-new', operation: 'check_in' },
      { request_id: 'rest-new', operation: 'token_issue' },
    ]);
    expect(prior.rows.every((row) => row.operation === null)).toBe(true);
  });
});
