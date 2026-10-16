import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';

import type { AppConfig } from '../config.js';
import { buildApp } from './build-app.js';
import { JSON_BODY_LIMIT_BYTES, errorCodes } from './errors.js';

const scratchRoot = '/Users/stephenforte/src/p1-b0-scratch';
mkdirSync(scratchRoot, { recursive: true });

function testConfig(): AppConfig {
  return {
    databaseUrl: 'postgresql://127.0.0.1:1/unused',
    port: 0,
    nodeEnv: 'test',
    publicUrl: 'http://localhost:3000',
    migrateOnBoot: false,
  };
}

function throwingPool(): pg.Pool {
  const fail = (): never => {
    throw new Error('health must not touch the database');
  };
  return { query: fail, connect: fail, end: async () => undefined } as unknown as pg.Pool;
}

describe('HTTP foundation', () => {
  const spaRoot = mkdtempSync(path.join(scratchRoot, 'spa-'));
  let app: FastifyInstance | undefined;

  afterAll(async () => {
    await app?.close();
    rmSync(spaRoot, { recursive: true, force: true });
  });

  it('serves health without the database, echoes request ids, and falls back to the SPA', async () => {
    mkdirSync(scratchRoot, { recursive: true });
    mkdirSync(path.join(spaRoot, 'assets'), { recursive: true });
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa-fixture</title>');
    writeFileSync(path.join(spaRoot, 'assets', 'app.js'), 'console.log("asset")');
    app = await buildApp({
      config: testConfig(),
      pool: throwingPool(),
      migrationsDir: path.join(spaRoot, 'migrations'),
      spaRoot,
    });
    app.get('/__boom', async () => {
      throw new Error('super-secret-failure-detail');
    });
    app.get('/__missing', async () => {
      const error = new Error('hidden-missing-detail') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    });
    app.post('/__echo', async () => ({ ok: true }));

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(health.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'req_123.ABC' },
    });
    expect(echoed.headers['x-request-id']).toBe('req_123.ABC');

    const replaced = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id' },
    });
    expect(replaced.headers['x-request-id']).not.toBe('bad id');

    const home = await app.inject({ method: 'GET', url: '/' });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('spa-fixture');
    expect(home.headers['content-type']).toContain('text/html');

    const project = await app.inject({ method: 'GET', url: '/projects/prj_offers' });
    expect(project.statusCode).toBe(200);
    expect(project.body).toContain('spa-fixture');
    expect(project.headers['x-request-id']).toBeTruthy();

    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('asset');
    expect(asset.body).not.toContain('spa-fixture');

    const missingApi = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.headers['content-type']).toContain('application/json');
    expect(missingApi.json()).toEqual({ error: { code: errorCodes.not_found, message: 'Not found' } });
    expect(missingApi.body).not.toContain('spa-fixture');
    expect(missingApi.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const missingMcp = await app.inject({ method: 'GET', url: '/mcp/tools' });
    expect(missingMcp.statusCode).toBe(404);
    expect(missingMcp.json()).toEqual({ error: { code: errorCodes.not_found, message: 'Not found' } });
    expect(missingMcp.body).not.toContain('<');

    const missing = await app.inject({ method: 'GET', url: '/__missing' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: errorCodes.not_found, message: 'Not found' } });
    expect(missing.body).not.toContain('hidden-missing-detail');

    const boom = await app.inject({ method: 'GET', url: '/__boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.json()).toEqual({ error: { code: errorCodes.internal_error, message: 'Internal server error' } });
    expect(boom.body).not.toContain('super-secret-failure-detail');

    const tooLarge = await app.inject({
      method: 'POST',
      url: '/__echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(JSON_BODY_LIMIT_BYTES) }),
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toEqual({
      error: { code: errorCodes.payload_too_large, message: 'JSON body exceeds the size limit' },
    });
  });
});

describe('readiness when the database is unreachable', () => {
  it('returns 503 database_unreachable and does not include a connection string', async () => {
    const pool = new pg.Pool({
      connectionString: 'postgresql://127.0.0.1:1/supa_test_unreachable',
      connectionTimeoutMillis: 400,
      max: 1,
    });
    const spaRoot = mkdtempSync(path.join(scratchRoot, 'spa-ready-'));
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa-fixture</title>');
    const app = await buildApp({
      config: testConfig(),
      pool,
      migrationsDir: spaRoot,
      spaRoot,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: errorCodes.database_unreachable, message: 'Database is not reachable' },
      });
      expect(response.body).not.toContain('postgresql://');
      expect(response.headers['x-request-id']).toBeTruthy();
    } finally {
      await app.close();
      await pool.end();
      rmSync(spaRoot, { recursive: true, force: true });
    }
  });
});
