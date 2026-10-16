import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { is, getTableName } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import type pg from 'pg';
import * as schema from './schema.js';
import { createPool } from './pool.js';
import { runMigrations, migrationsAreCurrent } from './migrate.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

describe('0001 schema', () => {
  let scratch: ScratchDatabase; let pool: pg.Pool;
  beforeAll(async () => { scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); });
  afterAll(async () => { await pool?.end(); await scratch?.drop(); });
  it('applies on an empty database exactly once', async () => {
    expect(await migrationsAreCurrent(pool, migrationsDir)).toEqual({ current: false, pending: ['0001_initial.sql'] });
    expect(await runMigrations(pool, migrationsDir)).toEqual({ applied: ['0001_initial.sql'] });
    expect(await runMigrations(pool, migrationsDir)).toEqual({ applied: [] });
    expect(await migrationsAreCurrent(pool, migrationsDir)).toEqual({ current: true, pending: [] });
  });
  it('matches every migrated table and column name, type and nullability in both directions', async () => {
    const tables = Object.values(schema).filter((value) => is(value, PgTable));
    const actual = await pool.query<{ table_name: string; column_name: string; type: string; nullable: boolean }>(`
      SELECT c.relname AS table_name, a.attname AS column_name,
        format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND c.relname <> 'schema_migrations'
      ORDER BY c.relname, a.attname`);
    const expected = tables.flatMap((table) => getTableConfig(table).columns.map((column) => ({
      table_name: getTableName(table), column_name: column.name, type: column.getSQLType(), nullable: !column.notNull,
    }))).sort((a, b) => a.table_name.localeCompare(b.table_name) || a.column_name.localeCompare(b.column_name));
    expect(actual.rows).toEqual(expected);
    const information = await pool.query(`SELECT table_name, column_name, is_nullable, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name <> 'schema_migrations' ORDER BY table_name, column_name`);
    expect(information.rowCount).toBe(expected.length);
    for (const row of information.rows) {
      const column = expected.find((c) => c.table_name === row.table_name && c.column_name === row.column_name)!;
      expect(row.is_nullable).toBe(column.nullable ? 'YES' : 'NO');
      expect(row.data_type === 'ARRAY' ? `${row.udt_name.slice(1)}[]` : row.data_type).toBe(column.type);
    }
  });
  it('has no auth-library or plaintext-secret tables/columns and no cascading FKs', async () => {
    const forbidden = await pool.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name IN ('token','password','plaintext_token') OR table_name IN ('sessions','accounts','invites','verification_tokens'))`);
    expect(forbidden.rows).toEqual([]);
    expect((await pool.query(`SELECT conname FROM pg_constraint WHERE contype='f' AND confdeltype='c' AND connamespace='public'::regnamespace`)).rows).toEqual([]);
  });
});
