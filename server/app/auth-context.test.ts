import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireMcpCredential, requireUser } from './auth-context.js';

describe('browser test seam and bearer enforcement', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('attaches a test user and refuses the retired stub bearer', async () => {
    const app = Fastify({ logger: false });
    app.get('/me', { preHandler: requireUser }, async (request) => ({ userId: request.user?.userId ?? null }));
    app.get('/mcp', { preHandler: requireMcpCredential }, async (request) => ({
      userId: request.mcpCredential?.userId ?? null,
      allowedProjectIds: request.mcpCredential?.allowedProjectIds ?? [],
    }));

    const missing = await app.inject({ method: 'GET', url: '/me' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({ error: { code: 'unauthenticated', message: 'Sign in required' } });

    const user = await app.inject({ method: 'GET', url: '/me', headers: { 'x-test-user-id': 'usr_demo' } });
    expect(user.statusCode).toBe(200);
    expect(user.json()).toEqual({ userId: 'usr_demo' });

    const credential = await app.inject({
      method: 'GET',
      url: '/mcp',
      headers: { authorization: 'Bearer stub:usr_demo:prj_offers,prj_other' },
    });
    expect(credential.statusCode).toBe(401);
    expect(credential.headers['www-authenticate']).toContain('error="invalid_token"');
    await app.close();
  });

  it('refuses the test headers outside the test environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = Fastify({ logger: false });
    app.get('/me', { preHandler: requireUser }, async () => ({ ok: true }));
    app.get('/mcp', { preHandler: requireMcpCredential }, async () => ({ ok: true }));
    const user = await app.inject({ method: 'GET', url: '/me', headers: { 'x-test-user-id': 'usr_demo' } });
    const credential = await app.inject({
      method: 'GET',
      url: '/mcp',
      headers: { authorization: 'Bearer stub:usr_demo:prj_offers' },
    });
    expect(user.statusCode).toBe(401);
    expect(credential.statusCode).toBe(401);
    expect(user.json().error.code).toBe('unauthenticated');
    await app.close();
  });

  it('describes a missing or rejected bearer without echoing the token', async () => {
    const app = Fastify({ logger: false });
    app.post('/mcp', { preHandler: requireMcpCredential }, async () => ({ ok: true }));
    const missingDescription = 'Supa Agent Tracker uses bearer tokens; add Authorization: Bearer <token> (Settings -> MCP tokens). OAuth sign-in is not available.';
    const rejectedDescription = 'Token missing, revoked or mistyped; create a new one in Settings -> MCP tokens.';
    const missing = await app.inject({ method: 'POST', url: '/mcp' });
    expect(missing.statusCode).toBe(401);
    const missingHeader = String(missing.headers['www-authenticate']);
    expect(missingHeader).toContain('resource_metadata=');
    expect(missingHeader).toContain(`error_description="${missingDescription}"`);
    expect(missingHeader).not.toContain('error="invalid_token"');
    expect(missing.json()).toEqual({ error: { code: 'unauthenticated', message: missingDescription } });

    const sentinel = `sat_${'a'.repeat(35)}ZZZZP2C1`;
    const malformed = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${sentinel}` } });
    expect(malformed.statusCode).toBe(401);
    const malformedHeader = String(malformed.headers['www-authenticate']);
    expect(malformedHeader).toContain('resource_metadata=');
    expect(malformedHeader).toContain('error="invalid_token"');
    expect(malformedHeader).toContain(`error_description="${rejectedDescription}"`);
    expect(malformed.json()).toEqual({ error: { code: 'unauthenticated', message: rejectedDescription } });
    expect(malformedHeader).not.toContain('ZZZZP2C1');
    expect(malformed.body).not.toContain('ZZZZP2C1');
    expect(malformed.body).not.toContain(sentinel);
    await app.close();
  });
});
