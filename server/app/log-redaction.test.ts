import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';

import type { AppConfig } from '../config.js';
import { buildApp } from './build-app.js';
import { createLoggerOptions, logRedactCensor } from './logging.js';

const scratchRoot = mkdtempSync(path.join(tmpdir(), 'supa-log-'));

function testConfig(): AppConfig {
  return {
    databaseUrl: 'postgresql://127.0.0.1:1/unused',
    port: 0,
    nodeEnv: 'production',
    publicUrl: 'http://localhost:3000',
    migrateOnBoot: false,
  };
}

function idlePool(): pg.Pool {
  return { end: async () => undefined } as unknown as pg.Pool;
}

describe('log redaction', () => {
  const lines: string[] = [];
  let app: FastifyInstance | undefined;
  const token = 'super-secret-token-value';
  const cookie = 'super-secret-cookie-value';

  afterAll(async () => {
    await app?.close();
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('never writes an Authorization header or cookie to the log', async () => {
    const spaRoot = scratchRoot;
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa-fixture</title>');
    app = await buildApp({
      config: testConfig(),
      pool: idlePool(),
      migrationsDir: spaRoot,
      spaRoot,
      logger: createLoggerOptions({
        write(message) {
          lines.push(message);
        },
      }),
    });
    app.get('/__cookie', async (_request, reply) => {
      reply.header('set-cookie', `session=${cookie}`);
      return { ok: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/__cookie',
      headers: {
        authorization: `Bearer ${token}`,
        cookie: `session=${cookie}`,
      },
    });
    expect(response.statusCode).toBe(200);
    const logged = lines.join('\n');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(cookie);
    expect(logged).toContain(logRedactCensor);
  });
});
