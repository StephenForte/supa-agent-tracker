import { readdir } from 'node:fs/promises';
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
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
    expect(await migrationsAreCurrent(pool, migrationsDir)).toEqual({ current: false, pending: files });
    expect(await runMigrations(pool, migrationsDir)).toEqual({ applied: files });
    expect(await runMigrations(pool, migrationsDir)).toEqual({ applied: [] });
    expect(await migrationsAreCurrent(pool, migrationsDir)).toEqual({ current: true, pending: [] });
  });
  it('matches every migrated table and column name, type and nullability in both directions', async () => {
    const tables = Object.values(schema).filter((value) => is(value, PgTable));
    const actualTables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name",
    );
    expect(actualTables.rows.map((row) => row.table_name)).toEqual(tables.map(getTableName).sort());
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
  it('allows only reviewed auth secret columns and invite hashes, with RESTRICT invite FKs and only the avatar cascade', async () => {
    const inviteColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='invites' ORDER BY column_name");
    expect(inviteColumns.rows.map(row => row.column_name)).toEqual(['created_at', 'email', 'expires_at', 'id', 'invited_by', 'revoked_at', 'token_hash', 'used_at', 'used_by']);
    const inviteFks = await pool.query("SELECT confrelid::regclass::text AS target, confdeltype FROM pg_constraint WHERE conrelid='invites'::regclass AND contype='f'");
    expect(inviteFks.rows).toHaveLength(2);
    expect(inviteFks.rows.every(row => row.target === 'users' && row.confdeltype === 'r')).toBe(true);
    const sensitive = await pool.query<{ table_name: string; column_name: string }>(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ~* '(token|password|secret)'`);
    const allowed = new Set([
      'accounts.access_token', // Required adapter field, CHECK IS NULL: OAuth disabled.
      'accounts.refresh_token', // Required adapter field, CHECK IS NULL.
      'accounts.id_token', // Required adapter field, CHECK IS NULL.
      'accounts.access_token_expires_at', // Required nullable timestamp, CHECK IS NULL.
      'accounts.refresh_token_expires_at', // Required nullable timestamp, CHECK IS NULL.
      'accounts.password_hash', // Better Auth scrypt password hash.
      'sessions.token', // Plain random session identifier; cookie is signed. Planner decision disclosed.
      'invites.token_hash', // P1-I SHA-256 only; no plaintext token or link column.
      'mcp_credentials.token_hash', // Existing P1-B1 supplied MCP credential hash.
    ]);
    expect(sensitive.rows.filter((row) => !allowed.has(`${row.table_name}.${row.column_name}`))).toEqual([]);
    const cascades = await pool.query<{ conname: string; source: string; target: string }>(
      `SELECT conname, conrelid::regclass::text AS source, confrelid::regclass::text AS target
       FROM pg_constraint
       WHERE contype = 'f' AND confdeltype = 'c' AND connamespace = 'public'::regnamespace
       ORDER BY conname`,
    );
    expect(cascades.rows).toEqual([{ conname: 'user_avatars_user_fk', source: 'user_avatars', target: 'users' }]);
  });
});
