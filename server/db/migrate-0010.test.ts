import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { runMigrations } from './migrate.js';
import { createPool } from './pool.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

const prior = ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql', '0006_public_pages.sql', '0007_alerts.sql', '0008_public_profile.sql', '0009_message_board.sql'];
let scratch: ScratchDatabase; let pool: pg.Pool;
let beforeSteps: unknown; let beforeOthers: unknown;
async function legacySteps() {
  return (await pool.query(`SELECT id, project_id, position, instruction, done, source_run_id, completion_changed_by, completion_changed_at, created_at, updated_at, revision
    FROM next_steps ORDER BY id`)).rows;
}
async function otherTables() {
  return Promise.all(['users', 'projects', 'agents', 'runs'].map(async table =>
    (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows));
}

describe('0010 agent step completion forward migration', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString);
    for (const file of prior) await pool.query(await readFile(path.join(migrationsDir, file), 'utf8'));
    await pool.query('CREATE TABLE schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of prior) await pool.query('INSERT INTO schema_migrations(id) VALUES ($1)', [file]);
    await pool.query(`INSERT INTO users(id,email) VALUES ('u','migration-steps@example.test');
      INSERT INTO projects(id,owner_id,name,type) VALUES ('p','u','Populated','coding'),('q','u','Other','coding');
      INSERT INTO agents(id,project_id,name,title,workload_type) VALUES ('a','p','Agent','Existing','coding'),('b','q','Other','Other','coding');
      INSERT INTO runs(id,project_id,agent_id,title,workload_type) VALUES ('r','p','a','Keep me','coding'),('s','q','b','Other','coding');
      INSERT INTO next_steps(id,project_id,source_run_id,position,instruction,done)
        VALUES ('open','p','r',0,'Still open',false);
      INSERT INTO next_steps(id,project_id,source_run_id,position,instruction,done,completion_changed_by,completion_changed_at)
        VALUES ('owner','p','r',1,'Owner finished',true,'u',now())`);
    beforeSteps = await legacySteps(); beforeOthers = await otherTables();
    expect((await runMigrations(pool, migrationsDir)).applied).toEqual(['0010_agent_step_completion.sql']);
  });
  afterAll(async () => { await pool?.end(); await scratch?.drop(); });

  it('leaves populated open and owner-done rows unchanged and reruns as a no-op', async () => {
    expect(await legacySteps()).toEqual(beforeSteps);
    expect(await otherTables()).toEqual(beforeOthers);
    const added = await pool.query(`SELECT id, completed_by_run_id, completion_note FROM next_steps ORDER BY id`);
    expect(added.rows).toEqual([
      { id: 'open', completed_by_run_id: null, completion_note: null },
      { id: 'owner', completed_by_run_id: null, completion_note: null },
    ]);
    expect((await runMigrations(pool, migrationsDir)).applied).toEqual([]);
    expect(await legacySteps()).toEqual(beforeSteps);
  });

  it('pairs the completing run with the note and requires done', async () => {
    await expect(pool.query(`UPDATE next_steps SET completed_by_run_id='r' WHERE id='open'`)).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE next_steps SET completion_note='why' WHERE id='open'`)).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE next_steps SET done=true, completed_by_run_id='r', completion_changed_by='u', completion_changed_at=now() WHERE id='open'`)).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE next_steps SET done=true, completion_note='why', completion_changed_by='u', completion_changed_at=now() WHERE id='open'`)).rejects.toMatchObject({ code: '23514' });
    await pool.query(`UPDATE next_steps SET done=true, completed_by_run_id='r', completion_note='Closed by the run', completion_changed_by='u', completion_changed_at=now() WHERE id='open'`);
    await expect(pool.query(`UPDATE next_steps SET done=false WHERE id='open'`)).rejects.toMatchObject({ code: '23514' });
    const owner = await pool.query(`SELECT completed_by_run_id, completion_note, done FROM next_steps WHERE id='owner'`);
    expect(owner.rows[0]).toEqual({ completed_by_run_id: null, completion_note: null, done: true });
  });

  it('rejects a cross-project completing run and RESTRICTs deleting that run', async () => {
    await expect(pool.query(`UPDATE next_steps SET done=true, completed_by_run_id='s', completion_note='cross', completion_changed_by='u', completion_changed_at=now() WHERE id='owner'`)).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(`DELETE FROM runs WHERE id='r'`)).rejects.toMatchObject({ code: '23001' });
    const constraint = await pool.query(`SELECT confdeltype FROM pg_constraint WHERE conname='next_steps_completed_by_run_fk'`);
    expect(constraint.rows).toEqual([{ confdeltype: 'r' }]);
  });
});
