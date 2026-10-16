import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { createDb } from './client.js';
import { migrationsAreCurrent, runMigrations } from './migrate.js';
import { createPool } from './pool.js';

describe('migration runner', () => {
  let scratch!: ScratchDatabase;
  let pool!: pg.Pool;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
  });

  afterAll(async () => {
    await pool?.end();
    await scratch?.drop();
  });

  it('treats the empty migrations directory as current', async () => {
    const result = await runMigrations(pool, migrationsDir);
    expect(result.applied).toEqual([]);
    expect(await migrationsAreCurrent(pool, migrationsDir)).toEqual({ current: true, pending: [] });
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(['schema_migrations']);
    expect(createDb(pool).$client).toBe(pool);
  });

  it('applies one SQL file once and then reports current', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'supa-migrations-'));
    writeFileSync(path.join(dir, '0099_probe.sql'), 'CREATE TABLE probe (id int);');
    try {
      expect(await migrationsAreCurrent(pool, dir)).toEqual({ current: false, pending: ['0099_probe.sql'] });
      expect((await runMigrations(pool, dir)).applied).toEqual(['0099_probe.sql']);
      expect((await runMigrations(pool, dir)).applied).toEqual([]);
      expect((await migrationsAreCurrent(pool, dir)).current).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
