import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import type { AppConfig } from '../config.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { buildApp } from './build-app.js';
import { errorCodes } from './errors.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';

mkdirSync('/Users/stephenforte/src/p1-b0-scratch', { recursive: true });

function testConfig(databaseUrl: string): AppConfig {
  return {
    databaseUrl,
    port: 0,
    nodeEnv: 'test',
    publicUrl: 'http://localhost:3000',
    migrateOnBoot: false,
  };
}

describe('readiness against a scratch database', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  const spaRoot = mkdtempSync(path.join('/Users/stephenforte/src/p1-b0-scratch', 'ready-spa-'));

  beforeAll(async () => {
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa-fixture</title>');
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
    rmSync(spaRoot, { recursive: true, force: true });
  });

  it('returns 503 while a migration file is pending', async () => {
    const dir = mkdtempSync(path.join('/Users/stephenforte/src/p1-b0-scratch', 'pending-'));
    writeFileSync(path.join(dir, '0098_pending.sql'), 'CREATE TABLE pending_probe (id int);');
    const app = await buildApp({
      config: testConfig(scratch.connectionString),
      pool,
      migrationsDir: dir,
      spaRoot,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: errorCodes.migrations_pending, message: 'Database migrations are not current' },
      });
      expect(response.body).not.toContain(scratch.connectionString);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 200 after the empty migration set is current', async () => {
    await runMigrations(pool, migrationsDir);
    const app = await buildApp({
      config: testConfig(scratch.connectionString),
      pool,
      migrationsDir,
      spaRoot,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ready' });
    } finally {
      await app.close();
    }
  });
});
