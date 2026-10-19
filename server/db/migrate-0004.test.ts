import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { migrationsDir } from '../paths.js';
import { createDb } from './client.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { authenticateCredentialHash } from '../repo/credentials.js';
import { listProjects } from '../repo/projects.js';

const plaintext = `sat_${'a'.repeat(43)}`;
const tokenHash = createHash('sha256').update(plaintext).digest('hex');
let scratch: ScratchDatabase; let pool: pg.Pool; let dir: string;

describe('0004 all_projects on populated data', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    dir = await mkdtemp(path.join(tmpdir(), 'supa-0004-'));
    for (const file of ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql']) {
      await cp(path.join(migrationsDir, file), path.join(dir, file));
    }
    expect((await runMigrations(pool, dir)).applied).toEqual(['0001_initial.sql', '0002_auth.sql', '0003_invites.sql']);
    await pool.query("INSERT INTO users (id, email) VALUES ('user-a', 'a@example.com'), ('user-b', 'b@example.com')");
    await pool.query("INSERT INTO projects (id, owner_id, name, type) VALUES ('prj-a', 'user-a', 'Granted', 'coding'), ('prj-b', 'user-a', 'Ungranted', 'coding'), ('prj-c', 'user-b', 'Foreign', 'automation')");
    await pool.query("INSERT INTO agents (id, project_id, name, title, workload_type) VALUES ('agt-a', 'prj-a', 'worker', 'Worker', 'coding')");
    await pool.query('INSERT INTO mcp_credentials (id, user_id, label, token_hash, display_suffix) VALUES ($1, $2, $3, $4, $5)', ['cred-1', 'user-a', 'Specific', tokenHash, 'aaaa']);
    await pool.query("INSERT INTO mcp_credential_projects (credential_id, project_id, user_id) VALUES ('cred-1', 'prj-a', 'user-a')");
    await pool.query("INSERT INTO runs (id, project_id, agent_id, title, workload_type) VALUES ('run-a', 'prj-a', 'agt-a', 'Existing', 'coding')");
    await pool.query("INSERT INTO idempotency_keys (scope, request_id, user_id, credential_id, credential_project_ids, request_hash, response) VALUES ('credential:cred-1', 'req-1', 'user-a', 'cred-1', ARRAY['prj-a'], 'hash', '{\"kept\":true}'::jsonb)");
    await cp(path.join(migrationsDir, '0004_token_all_projects.sql'), path.join(dir, '0004_token_all_projects.sql'));
    expect((await runMigrations(pool, dir)).applied).toEqual(['0004_token_all_projects.sql']);
  });
  afterAll(async () => {
    await pool?.end(); await scratch?.drop(); if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('leaves existing tokens specific, with grants, runs and idempotency keys unchanged', async () => {
    const credential = await pool.query<{ all_projects: boolean }>('select all_projects from mcp_credentials where id = $1', ['cred-1']);
    expect(credential.rows[0]!.all_projects).toBe(false);
    expect((await pool.query('select project_id from mcp_credential_projects where credential_id = $1', ['cred-1'])).rows).toEqual([{ project_id: 'prj-a' }]);
    expect((await pool.query('select id from runs')).rows).toEqual([{ id: 'run-a' }]);
    expect((await pool.query('select request_id, credential_project_ids from idempotency_keys')).rows).toEqual([{ request_id: 'req-1', credential_project_ids: ['prj-a'] }]);
    const db = createDb(pool);
    const row = await authenticateCredentialHash(db, tokenHash);
    expect(row).toMatchObject({ allProjects: false, projectIds: ['prj-a'] });
    for (const file of ['0005_idempotency_retention.sql', '0006_public_pages.sql']) {
      await cp(path.join(migrationsDir, file), path.join(dir, file));
    }
    expect((await runMigrations(pool, dir)).applied).toEqual(['0005_idempotency_retention.sql', '0006_public_pages.sql']);
    const access = { kind: 'credential' as const, userId: 'user-a', credentialId: 'cred-1', projectIds: row!.projectIds };
    expect((await listProjects(db, access)).items.map((project) => project.id)).toEqual(['prj-a']);
  });
});
