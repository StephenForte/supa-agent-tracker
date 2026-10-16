import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { buildApp } from './build-app.js';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir, spaRoot } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

const origin = 'https://tracker.example.test';
const secret = 'trust-proxy-secret-at-least-32-characters';
const proxy = '10.0.0.8';

describe('trusted proxy hops', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let direct: FastifyInstance;
  let behind: FastifyInstance;

  const who = (app: FastifyInstance, forwarded?: string) => app.inject({
    method: 'GET',
    url: '/api/client-ip',
    remoteAddress: proxy,
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  });

  const signIn = (forwarded: string, email: string) => behind.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    remoteAddress: proxy,
    headers: { origin, 'x-forwarded-for': forwarded },
    payload: { email, password: 'not-the-password' },
  });

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    await runMigrations(pool, migrationsDir);
    const shared = {
      DATABASE_URL: scratch.connectionString,
      PUBLIC_URL: origin,
      NODE_ENV: 'production' as const,
      BETTER_AUTH_SECRET: secret,
      REGISTRATION_ALLOWLIST: 'nobody@example.test',
    };
    direct = await buildApp({
      config: loadConfig({ ...shared, TRUST_PROXY_HOPS: '0' }),
      pool, migrationsDir, spaRoot, logger: false,
    });
    behind = await buildApp({
      config: loadConfig({ ...shared, TRUST_PROXY_HOPS: '1' }),
      pool, migrationsDir, spaRoot, logger: false,
    });
    for (const app of [direct, behind]) {
      app.get('/api/client-ip', async (request) => ({ ip: request.ip }));
    }
  });

  afterAll(async () => {
    await direct?.close();
    await behind?.close();
    await pool?.end();
    await scratch?.drop();
  });

  it('ignores X-Forwarded-For when TRUST_PROXY_HOPS is 0', async () => {
    const response = await who(direct, '203.0.113.10');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ip: proxy });
  });

  it('uses the rightmost X-Forwarded-For entry when TRUST_PROXY_HOPS is 1', async () => {
    const real = '203.0.113.10';
    expect((await who(behind, real)).json()).toEqual({ ip: real });
    expect((await who(behind, `1.2.3.4, ${real}`)).json()).toEqual({ ip: real });
  });

  it('keeps sign-in limit buckets on the real client IP behind one hop', async () => {
    const realA = '203.0.113.10';
    const realB = '203.0.113.20';
    for (let i = 0; i < 5; i++) {
      expect((await signIn(realA, `bucket-a-${i}@example.test`)).statusCode).toBe(401);
    }
    expect((await signIn(realA, 'bucket-a-extra@example.test')).statusCode).toBe(429);
    expect((await signIn(`1.2.3.4, ${realA}`, 'bucket-a-spoof@example.test')).statusCode).toBe(429);
    expect((await signIn(realB, 'bucket-b@example.test')).statusCode).toBe(401);
  });
});
