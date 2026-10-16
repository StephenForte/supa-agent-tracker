import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

/** Drizzle handle for later tasks. P1-B1 adds the schema; this task wires the client only. */
export function createDb(pool: pg.Pool) {
  return drizzle({ client: pool });
}

export type AppDatabase = ReturnType<typeof createDb>;
