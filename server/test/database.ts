import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
  } catch (error) {
    await admin.end();
    throw error;
  }
  return {
    name,
    connectionString: withDatabase(adminDatabaseUrl, name),
    drop: async () => {
      try {
        await admin.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [name],
        );
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
