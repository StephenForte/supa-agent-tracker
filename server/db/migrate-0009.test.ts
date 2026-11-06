import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { runMigrations } from './migrate.js';
import { createPool } from './pool.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

const prior = ['0001_initial.sql', '0002_auth.sql', '0003_invites.sql', '0004_token_all_projects.sql', '0005_idempotency_retention.sql', '0006_public_pages.sql', '0007_alerts.sql', '0008_public_profile.sql'];
let scratch: ScratchDatabase; let pool: pg.Pool;
let before: unknown;
async function snapshot() {
  return Promise.all(['users', 'projects', 'agents', 'runs', 'next_steps'].map(async table =>
    (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows));
}
const insert = (extra = '', values = '') => pool.query(`INSERT INTO board_entries (project_id,source_run_id,kind,title${extra}) VALUES ('p','r','note','Valid'${values}) RETURNING *`);

describe('0009 message board forward migration and database invariants', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString);
    for (const file of prior) await pool.query(await readFile(path.join(migrationsDir, file), 'utf8'));
    await pool.query('CREATE TABLE schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of prior) await pool.query('INSERT INTO schema_migrations(id) VALUES ($1)', [file]);
    await pool.query(`INSERT INTO users(id,email) VALUES ('u','migration-board@example.test');
      INSERT INTO projects(id,owner_id,name,type) VALUES ('p','u','Populated','coding'),('q','u','Other','coding');
      INSERT INTO agents(id,project_id,name,title,workload_type) VALUES ('a','p','Agent','Existing','coding'),('b','q','Other','Other','coding');
      INSERT INTO runs(id,project_id,agent_id,title,workload_type) VALUES ('r','p','a','Keep me','coding'),('s','q','b','Other','coding');
      INSERT INTO next_steps(id,project_id,source_run_id,position,instruction) VALUES ('step','p','r',0,'Keep this too')`);
    before = await snapshot();
    expect((await runMigrations(pool, migrationsDir)).applied).toEqual(['0009_message_board.sql', '0010_agent_step_completion.sql']);
  });
  afterAll(async () => { await pool?.end(); await scratch?.drop(); });
  it('preserves populated rows and reruns as a no-op', async () => {
    const after = await snapshot();
    // 0010 adds two nullable next_steps columns. Earlier columns stay byte-for-byte; the new ones are null.
    const strip = (sets: { row: Record<string, unknown> }[][]) => sets.map((rows) => rows.map(({ row }) => {
      const copy = { ...row };
      delete copy.completed_by_run_id;
      delete copy.completion_note;
      return copy;
    }));
    expect(strip(after as { row: Record<string, unknown> }[][])).toEqual(strip(before as { row: Record<string, unknown> }[][]));
    const steps = after[4] as { row: { completed_by_run_id: null; completion_note: null } }[];
    expect(steps.every(({ row }) => row.completed_by_run_id === null && row.completion_note === null)).toBe(true);
    expect((await runMigrations(pool, migrationsDir)).applied).toEqual([]);
    expect((await pool.query('SELECT count(*)::int n FROM board_entries')).rows[0].n).toBe(0);
  });
  it('provides defaults and rejects invalid kinds, bounds, statuses and revisions', async () => {
    const row = (await insert()).rows[0];
    expect(row).toMatchObject({ body: '', status: 'open', revision: 1, key: null, resolution: null });
    for (const patch of ["kind='unknown'", "title=''", "title=repeat('x',201)", "body=repeat('x',10001)", "task_ref=repeat('x',201)", "addressed_to=repeat('x',201)", "resolution=repeat('x',2001)", "status='invalid'", 'revision=0']) {
      await expect(pool.query(`UPDATE board_entries SET ${patch} WHERE id=$1`, [row.id])).rejects.toMatchObject({ code: '23514' });
    }
  });
  it('enforces state iff key, key syntax and project-local uniqueness', async () => {
    await expect(insert(',key', ",'bad-for-note'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("INSERT INTO board_entries(project_id,source_run_id,kind,title) VALUES ('p','r','state','No key')")).rejects.toMatchObject({ code: '23514' });
    for (const key of ['', 'Upper', '-bad', 'a'.repeat(65)]) {
      await expect(pool.query("INSERT INTO board_entries(project_id,source_run_id,kind,title,key) VALUES ('p','r','state','Invalid',$1)", [key])).rejects.toMatchObject({ code: '23514' });
    }
    await pool.query("INSERT INTO board_entries(project_id,source_run_id,kind,title,key) VALUES ('p','r','state','First','key'),('q','s','state','Second','key')");
    await expect(pool.query("INSERT INTO board_entries(project_id,source_run_id,kind,title,key) VALUES ('p','r','state','Duplicate','key')")).rejects.toMatchObject({ code: '23505' });
  });
  it('enforces resolved timestamp/exactly one actor and open resolution nulls', async () => {
    const row = (await insert()).rows[0];
    for (const patch of ["status='resolved'", "resolved_at=now()", "resolved_by_run_id='r'", "resolved_by_user_id='u'", "resolution='text'", "status='resolved',resolved_at=now()", "status='resolved',resolved_at=now(),resolved_by_run_id='r',resolved_by_user_id='u'"]) {
      await expect(pool.query(`UPDATE board_entries SET ${patch} WHERE id=$1`, [row.id])).rejects.toMatchObject({ code: '23514' });
    }
    await pool.query("UPDATE board_entries SET status='resolved',resolved_at=now(),resolved_by_run_id='r' WHERE id=$1", [row.id]);
    await pool.query("UPDATE board_entries SET resolved_by_run_id=null,resolved_by_user_id='u' WHERE id=$1", [row.id]);
  });
  it('rejects cross-project source/resolver and RESTRICTs all referenced records', async () => {
    await expect(pool.query("INSERT INTO board_entries(project_id,source_run_id,kind,title) VALUES ('p','s','note','Cross')")).rejects.toMatchObject({ code: '23503' });
    const row = (await insert()).rows[0];
    await expect(pool.query("UPDATE board_entries SET status='resolved',resolved_at=now(),resolved_by_run_id='s' WHERE id=$1", [row.id])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query("UPDATE board_entries SET status='resolved',resolved_at=now(),resolved_by_user_id='missing' WHERE id=$1", [row.id])).rejects.toMatchObject({ code: '23503' });
    for (const [table, id] of [['runs', 'r'], ['projects', 'p'], ['users', 'u']]) await expect(pool.query(`DELETE FROM ${table} WHERE id=$1`, [id])).rejects.toMatchObject({ code: '23001' });
    const constraints = await pool.query("SELECT confdeltype FROM pg_constraint WHERE conrelid='board_entries'::regclass AND contype='f'");
    expect(constraints.rows).toHaveLength(4); expect(constraints.rows.every(c => c.confdeltype === 'r')).toBe(true);
  });
});
