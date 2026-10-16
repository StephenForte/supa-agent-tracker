import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

const LEDGER = 'schema_migrations';
const ADVISORY_LOCK_KEY = 742019;

export interface MigrationStatus {
  current: boolean;
  pending: string[];
}

export interface MigrationResult {
  applied: string[];
}

export async function listMigrationFiles(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
  return names.filter((name) => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
}

/**
 * Applies pending SQL files in filename order. Each file is one transaction.
 * Files must not open their own transaction. The ledger table is runner
 * bookkeeping, not an application migration — 0001 belongs to P1-B1.
 */
export async function runMigrations(pool: pg.Pool, dir: string): Promise<MigrationResult> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${LEDGER} (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const files = await listMigrationFiles(dir);
    const existing = await client.query<{ id: string }>(`SELECT id FROM ${LEDGER}`);
    const appliedIds = new Set(existing.rows.map((row) => row.id));
    for (const file of files) {
      if (appliedIds.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        if (sql.trim().length > 0) await client.query(sql);
        await client.query(`INSERT INTO ${LEDGER} (id) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return { applied };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch {
      // The connection is about to be released. Unlock failure should not hide the migration result.
    }
    client.release();
  }
}

/** True when every SQL file in dir is recorded. An empty directory is current. */
export async function migrationsAreCurrent(pool: pg.Pool, dir: string): Promise<MigrationStatus> {
  const files = await listMigrationFiles(dir);
  if (files.length === 0) return { current: true, pending: [] };
  const found = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS "exists"`,
    [LEDGER],
  );
  if (found.rows[0]?.exists !== true) return { current: false, pending: files };
  const existing = await pool.query<{ id: string }>(`SELECT id FROM ${LEDGER}`);
  const appliedIds = new Set(existing.rows.map((row) => row.id));
  const pending = files.filter((file) => !appliedIds.has(file));
  return { current: pending.length === 0, pending };
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
