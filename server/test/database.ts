import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

const ledgerPath = path.join(tmpdir(), 'supa-p1-b0-databases.txt');

function requiredDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Database tests refuse to skip. Point DATABASE_URL at the local Postgres server; tests create and drop their own supa_test_* database.',
    );
  }
  return url;
}

const adminDatabaseUrl = requiredDatabaseUrl();

export interface ScratchDatabase {
  name: string;
  connectionString: string;
  drop: () => Promise<void>;
}

/** Creates one database this process named. drop() removes that database only. */
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const name = `supa_test_${randomBytes(8).toString('hex')}`;
  if (!/^supa_test_[a-f0-9]{16}$/.test(name)) {
    throw new Error(`Refusing to create unexpected database name ${name}`);
  }
  appendFileSync(ledgerPath, `created ${name}\n`);
  const admin = new pg.Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  return {
    name,
    connectionString: withDatabase(adminDatabaseUrl, name),
    drop: async () => {
      // A fresh admin pool also lets callers retry cleanup after closing a leaked client.
      const admin = new pg.Pool({ connectionString: adminDatabaseUrl, max: 1 });
      try {
        // pool.end() can resolve before its clients' sockets/backends have closed.
        // Never terminate them: a late FATAL can become an unhandled client error.
        const deadline = performance.now() + 5_000;
        while (true) {
          const { rows } = await admin.query(
            'SELECT 1 FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [name],
          );
          if (rows.length === 0) break;
          if (performance.now() >= deadline) {
            throw new Error(`Timed out waiting for connections to ${name} to close; close leaked clients before retrying drop()`);
          }
          await delay(25);
        }
        await admin.query(`DROP DATABASE "${name}"`);
        appendFileSync(ledgerPath, `dropped ${name}\n`);
      } finally {
        await admin.end();
      }
    },
  };
}

function withDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
