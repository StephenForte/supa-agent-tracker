import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { registerProtectedResourceMetadata } from '../mcp/routes.js';
import { isReservedPath, registerSpa } from './spa.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

it('reserves /.well-known without swallowing app routes or assets', () => {
  expect(isReservedPath('/.well-known')).toBe(true);
  expect(isReservedPath('/.well-known/oauth-authorization-server')).toBe(true);
  expect(isReservedPath('/.well-known/openid-configuration')).toBe(true);
  expect(isReservedPath('/.well-known/oauth-protected-resource/extra')).toBe(true);
  for (const pathname of ['/', '/needs-me', '/register', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png', '/assets/index.js']) {
    expect(isReservedPath(pathname), pathname).toBe(false);
  }
  expect(isReservedPath('/mcp')).toBe(true);
  expect(isReservedPath('/api/tokens')).toBe(true);
});

it('returns identical protected-resource JSON and keeps the SPA for app routes', async () => {
  const scratch = path.join(tmpdir(), `supa-p2-j-spa-${Date.now()}`);
  mkdirSync(scratch, { recursive: true });
  const html = '<!doctype html><title>Supa Agent Tracker</title>';
  const manifest = '{"name":"Supa Agent Tracker"}';
  writeFileSync(path.join(scratch, 'index.html'), html);
  writeFileSync(path.join(scratch, 'manifest.webmanifest'), manifest);
  writeFileSync(path.join(scratch, 'icon-192.png'), png);
  writeFileSync(path.join(scratch, 'icon-512.png'), png);
  writeFileSync(path.join(scratch, 'favicon-32.png'), png);
  const app = Fastify();
  try {
    await registerSpa(app, scratch);
    registerProtectedResourceMetadata(app, 'https://tracker.example');
    const root = await app.inject('/.well-known/oauth-protected-resource');
    const nested = await app.inject('/.well-known/oauth-protected-resource/mcp');
    expect(nested.statusCode).toBe(200);
    expect(nested.headers['cache-control']).toBe('no-store');
    expect(nested.json()).toEqual(root.json());
    expect(nested.body).toBe(root.body);
    expect(nested.body).toBe('{"resource":"https://tracker.example/mcp","bearer_methods_supported":["header"],"resource_name":"Supa Agent Tracker"}');
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
      const missing = await app.inject(path);
      expect(missing.statusCode, path).toBe(404);
      expect(missing.headers['content-type']).toContain('application/json');
      expect(missing.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
      expect(missing.body).not.toContain('Supa Agent Tracker');
    }
    for (const path of ['/', '/needs-me', '/register']) {
      const page = await app.inject(path);
      expect(page.statusCode, path).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.body).toBe(html);
    }
    const manifestResponse = await app.inject('/manifest.webmanifest');
    expect(manifestResponse.statusCode).toBe(200);
    expect(manifestResponse.body).toBe(manifest);
    expect(manifestResponse.headers['content-type']).not.toContain('text/html');
    for (const icon of ['/icon-192.png', '/icon-512.png', '/favicon-32.png']) {
      const image = await app.inject(icon);
      expect(image.statusCode, icon).toBe(200);
      expect(image.headers['content-type']).toContain('image/png');
      expect(image.rawPayload).toEqual(png);
    }
  } finally {
    await app.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});
