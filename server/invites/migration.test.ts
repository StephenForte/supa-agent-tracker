import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createScratchDatabase } from '../test/database.js';
import { createPool } from '../db/pool.js';
import { migrationsDir } from '../paths.js';
import { runMigrations } from '../db/migrate.js';

it('applies 0003 to populated 0001+0002, preserving all existing data, and reruns as a no-op', async () => {
  const scratch = await createScratchDatabase(); const pool = createPool(scratch.connectionString);
  try {
    for (const file of ['0001_initial.sql', '0002_auth.sql']) await pool.query(await readFile(path.join(migrationsDir, file), 'utf8'));
    await pool.query("CREATE TABLE schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(id) VALUES ('0001_initial.sql'),('0002_auth.sql')");
    await pool.query("INSERT INTO users(id,email) VALUES ('migration-user','migration@example.test'); INSERT INTO projects(id,owner_id,name,type) VALUES ('migration-project','migration-user','Kept project','coding'); INSERT INTO agents(id,project_id,name,title,workload_type) VALUES ('migration-agent','migration-project','Agent','Kept agent','coding'); INSERT INTO runs(id,project_id,agent_id,title,workload_type) VALUES ('migration-run','migration-project','migration-agent','Kept run','coding')");
    const snapshot = async () => (await Promise.all(['users', 'projects', 'agents', 'runs'].map(table => pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)))).map(result => result.rows);
    const before = await snapshot();
    expect(await runMigrations(pool, migrationsDir)).toEqual({ applied: ['0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql', '0006_public_pages.sql', '0007_alerts.sql'] });
    const after = await snapshot();
    // 0006 adds users.public_handle and projects.is_public. 0007 adds alert flags, defaulted off.
    const comparable = (sets: { row: Record<string, unknown> }[][]) => sets.map((rows) => rows.map(({ row }) => {
      const copy = { ...row };
      delete copy.public_handle;
      delete copy.is_public;
      delete copy.alert_blocked;
      delete copy.alert_stale;
      delete copy.alert_review;
      return copy;
    }));
    expect(comparable(after as { row: Record<string, unknown> }[][])).toEqual(comparable(before as { row: Record<string, unknown> }[][]));
    expect((after[0] as { row: { public_handle: string | null; alert_blocked: boolean; alert_stale: boolean; alert_review: boolean } }[]).every(({ row }) => row.public_handle === null && row.alert_blocked === false && row.alert_stale === false && row.alert_review === false)).toBe(true);
    expect((after[1] as { row: { is_public: boolean } }[]).every(({ row }) => row.is_public === false)).toBe(true);
    expect(await runMigrations(pool, migrationsDir)).toEqual({ applied: [] });
    await pool.query("INSERT INTO invites(id,email,token_hash,invited_by) VALUES ('migration-invite','invitee@example.test',repeat('a',64),'migration-user')");
    await expect(pool.query("UPDATE invites SET used_at=now() WHERE id='migration-invite'")).rejects.toThrow();
    await expect(pool.query("UPDATE invites SET used_at=now(),used_by='migration-user',revoked_at=now() WHERE id='migration-invite'")).rejects.toThrow();
    await expect(pool.query("UPDATE invites SET email='UPPER@example.test' WHERE id='migration-invite'")).rejects.toThrow();
  } finally { await pool.end(); await scratch.drop(); }
});
