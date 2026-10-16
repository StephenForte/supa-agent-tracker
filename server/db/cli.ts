import type pg from 'pg';

import { ConfigError, loadConfig } from '../config.js';
import { migrationsDir } from '../paths.js';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';

let pool: pg.Pool | undefined;

try {
  const config = loadConfig();
  pool = createPool(config.databaseUrl);
  const result = await runMigrations(pool, migrationsDir);
  if (result.applied.length === 0) {
    console.log('No pending migrations');
  } else {
    console.log(`Applied ${result.applied.join(', ')}`);
  }
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : safeMessage(error));
  process.exitCode = 1;
} finally {
  await pool?.end();
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && !error.message.includes('://')) return error.message;
  return 'Migration failed';
}
