import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { createDb, type AppDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { createPool } from './pool.js';
import { migrationsDir } from '../paths.js';
import type { UserAccess } from '../repo/access.js';
import * as agentsRepo from '../repo/agents.js';
import * as projectsRepo from '../repo/projects.js';
import * as runsRepo from '../repo/runs.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

const prior = ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql', '0006_public_pages.sql', '0007_alerts.sql'];

describe('0008 public profile on populated data', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let db: AppDatabase;
  let dir: string;
  let runId = '';

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    dir = await mkdtemp(path.join(tmpdir(), 'supa-0008-'));
    for (const file of prior) await cp(path.join(migrationsDir, file), path.join(dir, file));
    expect((await runMigrations(pool, dir)).applied).toEqual(prior);
    await pool.query(`INSERT INTO users (id, email, display_name, email_verified) VALUES
      ('user-a', 'a@example.com', 'Ada', true),
      ('user-b', 'b@example.com', 'Bea', false)`);
    const accessA: UserAccess = { kind: 'user', userId: 'user-a' };
    const project = await projectsRepo.createProject(db, accessA, {
      name: 'Live', description: '', type: 'coding', lifecycle: 'active', repositoryName: null, repositoryUrl: null, prdUrl: null, tags: [],
      isPublic: true, staleThresholdMinutes: 15, heartbeatExpected: false, reportingInstructions: '',
    });
    const agent = await agentsRepo.createAgent(db, accessA, project.id, { name: 'worker', title: 'Worker', workloadType: 'coding' });
    const run = await runsRepo.createRun(db, accessA, project.id, { agentId: agent.id, title: 'Kept run', workloadType: 'coding' });
    runId = run.id;
    await cp(path.join(migrationsDir, '0008_public_profile.sql'), path.join(dir, '0008_public_profile.sql'));
    expect((await runMigrations(pool, dir)).applied).toEqual(['0008_public_profile.sql']);
  });

  afterAll(async () => {
    await pool?.end();
    await scratch?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('leaves existing users on UTC with null profile fields and keeps their runs', async () => {
    expect((await runMigrations(pool, dir)).applied).toEqual([]);
    const rows = await pool.query<{
      id: string;
      public_name: string | null;
      public_bio: string | null;
      public_github: string | null;
      public_x: string | null;
      public_linkedin: string | null;
      profile_timezone: string;
    }>('SELECT id, public_name, public_bio, public_github, public_x, public_linkedin, profile_timezone FROM users ORDER BY id');
    expect(rows.rows).toEqual([
      { id: 'user-a', public_name: null, public_bio: null, public_github: null, public_x: null, public_linkedin: null, profile_timezone: 'UTC' },
      { id: 'user-b', public_name: null, public_bio: null, public_github: null, public_x: null, public_linkedin: null, profile_timezone: 'UTC' },
    ]);
    expect((await pool.query('SELECT title FROM runs WHERE id = $1', [runId])).rows).toEqual([{ title: 'Kept run' }]);
    expect((await pool.query('SELECT count(*)::int AS n FROM user_avatars')).rows[0]?.n).toBe(0);
  });

  it('rejects profile and avatar rows that break the contract and cascades the avatar', async () => {
    await expect(pool.query(`UPDATE users SET public_name = '  Ada' WHERE id = 'user-a'`)).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE users SET public_github = 'bad handle' WHERE id = 'user-a'`)).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE users SET profile_timezone = '' WHERE id = 'user-a'`)).rejects.toMatchObject({ code: '23514' });
    await pool.query(`UPDATE users SET public_name = 'Ada Lovelace', public_bio = 'Builds agents', public_github = 'ada', public_x = 'ada_bot', public_linkedin = 'ada-lovelace', profile_timezone = 'America/Los_Angeles' WHERE id = 'user-a'`);
    const saved = await pool.query(`SELECT public_name, profile_timezone FROM users WHERE id = 'user-a'`);
    expect(saved.rows).toEqual([{ public_name: 'Ada Lovelace', profile_timezone: 'America/Los_Angeles' }]);

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const sha = 'ab'.repeat(32);
    await pool.query(`INSERT INTO users (id, email, display_name) VALUES ('user-c', 'c@example.com', 'Cara')`);
    await pool.query(
      `INSERT INTO user_avatars (user_id, content_type, bytes, byte_size, sha256) VALUES ('user-c', 'image/png', $1, $2, $3)`,
      [png, png.length, sha],
    );
    await expect(pool.query(
      `INSERT INTO user_avatars (user_id, content_type, bytes, byte_size, sha256) VALUES ('user-b', 'image/svg+xml', $1, $2, $3)`,
      [png, png.length, sha],
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      `INSERT INTO user_avatars (user_id, content_type, bytes, byte_size, sha256) VALUES ('user-b', 'image/png', $1, 0, $2)`,
      [png, sha],
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      `INSERT INTO user_avatars (user_id, content_type, bytes, byte_size, sha256) VALUES ('user-b', 'image/png', $1, $2, 'ABCD')`,
      [png, png.length],
    )).rejects.toMatchObject({ code: '23514' });
    await pool.query(`DELETE FROM users WHERE id = 'user-c'`);
    expect((await pool.query(`SELECT count(*)::int AS n FROM user_avatars WHERE user_id = 'user-c'`)).rows[0]?.n).toBe(0);
  });
});
