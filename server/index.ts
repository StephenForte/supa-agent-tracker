import { existsSync } from 'node:fs';

import { startAlertDigest } from './alerts/job.js';
import { buildApp } from './app/build-app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { createEmailSender } from './email/index.js';
import { migrationsDir, spaRoot } from './paths.js';
import { startIdempotencyRetention } from './repo/idempotency-retention.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

if (!existsSync(spaRoot)) {
  console.error(`SPA build not found at ${spaRoot}. Run npm run build before starting the server.`);
  process.exit(1);
}

const pool = createPool(config.databaseUrl);

if (config.migrateOnBoot) {
  try {
    await runMigrations(pool, migrationsDir);
  } catch (error) {
    console.error(error instanceof Error && !error.message.includes('://') ? error.message : 'Migration failed');
    await pool.end();
    process.exit(1);
  }
}

const app = await buildApp({
  config,
  pool,
  migrationsDir,
  spaRoot,
});

await app.listen({ port: config.port, host: '0.0.0.0' });

const db = createDb(pool);
const retention = startIdempotencyRetention(db);
const alerts = startAlertDigest({
  pool,
  db,
  sender: createEmailSender(config.auth ?? { secret: '', emailProvider: 'console' }, config.nodeEnv),
  publicUrl: config.publicUrl,
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  alerts.stop();
  retention.stop();
  await app.close();
  await pool.end();
}

process.on('SIGINT', () => {
  shutdown().then(() => process.exit(0), () => process.exit(1));
});
process.on('SIGTERM', () => {
  shutdown().then(() => process.exit(0), () => process.exit(1));
});
