import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createScratchDatabase } from './database.js';

async function expectGone(name: string) {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT datname FROM pg_database WHERE datname = $1', [name]);
    expect(rows).toEqual([]);
  } finally {
    await admin.end();
  }
}

describe('scratch database teardown', () => {
  it('drops after a client begins closing without awaiting its end', async () => {
    const scratch = await createScratchDatabase();
    const client = new pg.Client({ connectionString: scratch.connectionString });
    const errors: Error[] = [];
    client.on('error', (error) => errors.push(error));
    let dropped = false;
    try {
      await client.connect();
      await client.query('SELECT 1');
      const closing = client.end();
      await scratch.drop();
      dropped = true;
      await closing;
      await expectGone(scratch.name);
      expect(errors).toEqual([]);
    } finally {
      await client.end();
      if (!dropped) await scratch.drop();
    }
  });

  it('waits for a lingering backend to close gracefully instead of killing it', async () => {
    const scratch = await createScratchDatabase();
    const client = new pg.Client({ connectionString: scratch.connectionString });
    const errors: Error[] = [];
    client.on('error', (error) => errors.push(error));
    let closing: Promise<void> | undefined;
    let dropped = false;
    try {
      await client.connect();
      closing = delay(150).then(() => client.end());
      await scratch.drop();
      dropped = true;
      await closing;
      await expectGone(scratch.name);
      expect(errors).toEqual([]);
    } finally {
      await closing;
      await client.end();
      if (!dropped) await scratch.drop();
    }
  });

  it('reports a leak within a bounded wait without killing it, and permits cleanup retry', async () => {
    const scratch = await createScratchDatabase();
    const client = new pg.Client({ connectionString: scratch.connectionString });
    const errors: Error[] = [];
    client.on('error', (error) => errors.push(error));
    try {
      await client.connect();
      await expect(scratch.drop()).rejects.toThrow('Timed out waiting for connections');
      expect((await client.query('SELECT 1 AS alive')).rows).toEqual([{ alive: 1 }]);
      expect(errors).toEqual([]);
    } finally {
      await client.end();
      await scratch.drop();
    }
    await expectGone(scratch.name);
  }, 10_000);
});
