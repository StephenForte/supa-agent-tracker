import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { buildApp } from '../app/build-app.js';
import { requireUser } from '../app/auth-context.js';
import { createLoggerOptions } from '../app/logging.js';
import { loadConfig, loadAuthConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir, spaRoot } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import type { Email } from '../email/index.js';

const origin = 'https://tracker.example.test';
const password = 'original-password-unique-123!';
const replacement = 'replacement-password-unique-456!';
function cookieOf(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((s): s is string => typeof s === 'string').map((s) => s.split(';')[0]).join('; ');
}
function emailToken(mail: Email): string { return new URL(mail.text.split(' ').at(-1)!).searchParams.get('token')!; }

describe('browser authentication through HTTP and Postgres', () => {
  let scratch: ScratchDatabase; let pool: pg.Pool; let app: FastifyInstance;
  const inbox: Email[] = []; const logs: string[] = [];
  const secret = 'production-secret-unique-at-least-32-characters';
  const resendKey = 'production-resend-key-unique-marker';
  let address = 0;
  const post = (path: string, body: Record<string, unknown>, cookie?: string, ip = `192.0.10.${++address}`) => app.inject({
    method: 'POST', url: `/api/auth${path}`, payload: body,
    headers: { origin, ...(cookie ? { cookie } : {}) }, remoteAddress: ip,
  });
  const get = (path: string, cookie?: string) => app.inject({ method: 'GET', url: path, headers: cookie ? { cookie } : {} });
  async function signup(email: string) {
    const result = await post('/sign-up/email', { name: 'Invited User', email, password });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ status: true });
  }
  async function verify(email: string) {
    const mail = [...inbox].reverse().find((m) => m.to === email && m.subject === 'Verify your email')!;
    expect(new URL(mail.text.split(' ').at(-1)!).pathname).toBe('/verify-email');
    const result = await get(`/api/auth/verify-email?token=${encodeURIComponent(emailToken(mail))}`);
    expect(result.statusCode).toBe(200);
  }
  async function login(email: string, pass = password, ip = '192.0.2.2') {
    const result = await post('/sign-in/email', { email, password: pass }, undefined, ip);
    expect(result.statusCode).toBe(200);
    expect(String(result.headers['set-cookie'])).toMatch(/HttpOnly/i);
    expect(String(result.headers['set-cookie'])).toMatch(/SameSite=Lax/i);
    expect(String(result.headers['set-cookie'])).toMatch(/Secure/i);
    return cookieOf(result);
  }
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString);
    await runMigrations(pool, migrationsDir);
    const config = loadConfig({ DATABASE_URL: scratch.connectionString, PUBLIC_URL: origin, NODE_ENV: 'production', BETTER_AUTH_SECRET: secret,
      EMAIL_PROVIDER: 'resend', RESEND_API_KEY: resendKey, EMAIL_FROM: 'sender@example.test',
      REGISTRATION_ALLOWLIST: ' Invited@Example.test , reset@example.test, change@example.test, expire@example.test, logs@example.test, race@example.test, legacy@example.test ',
    });
    app = await buildApp({ config, pool, migrationsDir, spaRoot, logger: createLoggerOptions({ write: (msg) => logs.push(msg) }) });
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { inbox.push(JSON.parse(String(init.body)) as Email); return new Response('{}', { status: 200 }); });
    app.get('/api/protected', { preHandler: requireUser }, async (req) => ({ userId: req.user!.userId }));
    app.post('/api/protected', { preHandler: requireUser }, async () => ({ ok: true }));
  });
  afterAll(async () => { await app?.close(); await pool?.end(); await scratch?.drop(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('denies non-invited sign-up without inserting a user; empty allowlist denies everyone', async () => {
    const response = await post('/sign-up/email', { name: 'No', email: 'outsider@example.test', password });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: 'forbidden', message: 'Registration is by invitation only' } });
    expect((await pool.query('SELECT id FROM users WHERE email=$1', ['outsider@example.test'])).rowCount).toBe(0);
    expect(loadAuthConfig({}, 'test').registrationAllowlist).toEqual([]);
  });
  it('normalizes the allowlist and address, refuses unverified login, then verifies and signs in', async () => {
    await signup(' INVITED@Example.test ');
    expect((await pool.query('SELECT email_verified, display_name FROM users WHERE email=$1', ['invited@example.test'])).rows).toEqual([{ email_verified: false, display_name: 'Invited User' }]);
    const unverified = await post('/sign-in/email', { email: 'invited@example.test', password });
    expect(unverified.statusCode).toBe(403);
    await verify('invited@example.test');
    const cookie = await login('invited@example.test');
    expect((await get('/api/protected', cookie)).statusCode).toBe(200);
    const sessions = await get('/api/auth/list-sessions', cookie);
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json()).toHaveLength(1);
    const lifetime = sessions.json()[0];
    // The library takes these two wall-clock readings separately.
    const duration = new Date(lifetime.expiresAt).getTime() - new Date(lifetime.createdAt).getTime();
    expect(duration).toBeGreaterThanOrEqual(7 * 24 * 3600_000 - 1000);
    expect(duration).toBeLessThanOrEqual(7 * 24 * 3600_000);
    const logout = await post('/sign-out', {}, cookie);
    expect(logout.statusCode).toBe(200);
    expect((await get('/api/protected', cookie)).statusCode).toBe(401);
  });
  it('stores library password hashes and rejects non-null unused OAuth credentials', async () => {
    const hashes = await pool.query('SELECT password_hash FROM accounts');
    expect(hashes.rowCount).toBeGreaterThan(0);
    for (const row of hashes.rows) {
      expect(row.password_hash).not.toBe(password);
      expect(row.password_hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    }
    for (const column of ['access_token', 'refresh_token', 'id_token']) {
      await expect(pool.query(`UPDATE accounts SET ${column}=$1`, ['forbidden-plain-value'])).rejects.toThrow();
    }
  });
  it('returns the identical sign-up response for existing allowlisted addresses', async () => {
    const response = await post('/sign-up/email', { name: 'Invited User', email: 'invited@example.test', password });
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ status: true });
    expect((await pool.query('SELECT id FROM users WHERE email=$1', ['invited@example.test'])).rowCount).toBe(1);
  });
  it('revokes a session immediately, enforces ownership and expires sessions', async () => {
    const cookie = await login('invited@example.test', password, '192.0.2.3');
    const second = await login('invited@example.test', password, '192.0.2.3');
    const list = (await get('/api/auth/list-sessions', cookie)).json();
    const own = (await get('/api/auth/get-session', second)).json().session.token;
    expect(list.some((s: { token: string }) => s.token === own)).toBe(true);
    expect((await post('/revoke-session', { token: own }, cookie)).statusCode).toBe(200);
    expect((await get('/api/protected', second)).statusCode).toBe(401);
    await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
    expect((await get('/api/protected', cookie)).statusCode).toBe(401);
  });
  it('rejects cross-origin API/auth POSTs and missing Origin with a session cookie', async () => {
    for (const url of ['/api/auth/sign-out', '/api/protected']) {
      const response = await app.inject({ method: 'POST', url, headers: { origin: 'https://attacker.test' }, payload: {} });
      expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe('forbidden');
      const absent = await app.inject({ method: 'POST', url, headers: { cookie: 'anything=value' }, payload: {} });
      expect(absent.statusCode).toBe(403);
    }
  });
  it('limits failed logins by email across IPs and by IP across emails with stable JSON', async () => {
    for (let i = 0; i < 5; i++) expect((await post('/sign-in/email', { email: 'absent@example.test', password }, undefined, `192.0.3.${i}`)).statusCode).toBe(401);
    const limited = await post('/sign-in/email', { email: ' ABSENT@example.test ', password }, undefined, '192.0.4.1');
    expect(limited.statusCode).toBe(429); expect(limited.json().error.code).toBe('rate_limited');
    for (let i = 0; i < 5; i++) expect((await post('/sign-in/email', { email: `absent${i}@example.test`, password }, undefined, '192.0.5.1')).statusCode).toBe(401);
    expect((await post('/sign-in/email', { email: 'different@example.test', password }, undefined, '192.0.5.1')).statusCode).toBe(429);
  });
  it('resets generically, hashes reset identifiers, consumes once and revokes all sessions', async () => {
    await signup('reset@example.test'); await verify('reset@example.test');
    const cookie = await login('reset@example.test', password, '192.0.6.1');
    const unknown = await post('/request-password-reset', { email: 'unknown@example.test' });
    const known = await post('/request-password-reset', { email: 'reset@example.test' });
    expect(known.statusCode).toBe(200); expect(known.body).toBe(unknown.body);
    const token = emailToken([...inbox].reverse().find((m) => m.to === 'reset@example.test' && m.subject === 'Reset your password')!);
    const rows = await pool.query('SELECT identifier, value, expires_at, created_at FROM auth_verifications');
    expect(JSON.stringify(rows.rows)).not.toContain(token);
    expect(rows.rows.some((r) => new Date(r.expires_at).getTime() - new Date(r.created_at).getTime() <= 3600_000)).toBe(true);
    expect((await post('/reset-password', { token, newPassword: replacement })).statusCode).toBe(200);
    expect((await get('/api/protected', cookie)).statusCode).toBe(401);
    expect((await post('/reset-password', { token, newPassword: password })).statusCode).toBe(400);
    await login('reset@example.test', replacement, '192.0.6.2');
  });
  it('rejects an expired reset link and gives generic verification resend responses', async () => {
    await signup('expire@example.test');
    const known = await post('/send-verification-email', { email: 'expire@example.test' });
    const unknown = await post('/send-verification-email', { email: 'unknown@example.test' });
    expect(known.statusCode).toBe(200); expect(known.body).toBe(unknown.body);
    await post('/request-password-reset', { email: 'expire@example.test' });
    const token = emailToken([...inbox].reverse().find((m) => m.subject === 'Reset your password' && m.to === 'expire@example.test')!);
    await pool.query("UPDATE auth_verifications SET expires_at=now()-interval '1 second'");
    expect((await post('/reset-password', { token, newPassword: replacement })).statusCode).toBe(400);
  });
  it('forces password changes to revoke other sessions even when the client opts out', async () => {
    await signup('change@example.test'); await verify('change@example.test');
    const first = await login('change@example.test', password, '192.0.7.1');
    const second = await login('change@example.test', password, '192.0.7.1');
    const response = await post('/change-password', { currentPassword: password, newPassword: replacement, revokeOtherSessions: false }, first);
    expect(response.statusCode).toBe(200);
    expect((await get('/api/protected', second)).statusCode).toBe(401);
    expect((await get('/api/protected', cookieOf(response))).statusCode).toBe(200);
  });
  it('ignores the test identity header in development and production', async () => {
    for (const env of ['development', 'production']) {
      vi.stubEnv('NODE_ENV', env);
      const response = await app.inject({ method: 'GET', url: '/api/protected', headers: { 'x-test-user-id': 'forged' } });
      expect(response.statusCode).toBe(401);
    }
    vi.unstubAllEnvs();
  });
  it('returns JSON for unknown or unsupported auth routes', async () => {
    for (const url of ['/api/auth/nope', '/api/auth/reset-password/secret-in-path', '/api/auth/error?token=secret-in-query']) {
      const response = await get(url);
      expect(response.statusCode).toBe(404); expect(response.json().error.code).toBe('not_found');
    }
  });
  it('cannot revoke another account session and keeps that session valid', async () => {
    const owner = await login('invited@example.test', password, '192.0.20.1');
    const foreign = await login('reset@example.test', replacement, '192.0.20.2');
    const token = (await get('/api/auth/get-session', foreign)).json().session.token;
    await post('/revoke-session', { token }, owner);
    expect((await get('/api/protected', foreign)).statusCode).toBe(200);
    const ownerSessions = (await get('/api/auth/list-sessions', owner)).json();
    expect(ownerSessions.some((session: { token: string }) => session.token === token)).toBe(false);
  });
  it('allows exactly one concurrent use of a reset link', async () => {
    await post('/request-password-reset', { email: 'reset@example.test' });
    const token = emailToken([...inbox].reverse().find((m) => m.subject === 'Reset your password' && m.to === 'reset@example.test')!);
    const responses = await Promise.all([
      post('/reset-password', { token, newPassword: password }),
      post('/reset-password', { token, newPassword: replacement }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });
  it('bounds limiter keys before storing sign-in attempts', async () => {
    const tooLong = await post('/sign-in/email', { email: `${'a'.repeat(300)}@example.test`, password });
    expect(tooLong.statusCode).toBe(400);
  });
  it('keeps concurrent duplicate registrations generic', async () => {
    const responses = await Promise.all([
      post('/sign-up/email', { name: 'Racing User', email: 'race@example.test', password }),
      post('/sign-up/email', { name: 'Racing User', email: 'race@example.test', password }),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: true });
    }
    expect((await pool.query('SELECT id FROM users WHERE email=$1', ['race@example.test'])).rowCount).toBe(1);
  });
  it('does not expose an existing mixed-case domain identity on registration', async () => {
    await pool.query("INSERT INTO users(id,email) VALUES ('legacy-user','LEGACY@example.test')");
    const response = await post('/sign-up/email', { name: 'Legacy', email: 'legacy@example.test', password });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: true });
    expect((await pool.query("SELECT id FROM users WHERE lower(email)='legacy@example.test'")).rows).toEqual([{ id: 'legacy-user' }]);
  });
  it('never logs submitted secrets or email/session tokens during the production auth lifecycle', async () => {
    await signup('logs@example.test'); await verify('logs@example.test');
    const cookie = await login('logs@example.test', password, '192.0.8.1');
    await post('/request-password-reset', { email: 'logs@example.test' });
    const reset = emailToken([...inbox].reverse().find((m) => m.subject === 'Reset your password' && m.to === 'logs@example.test')!);
    expect((await post('/reset-password', { token: reset, newPassword: replacement })).statusCode).toBe(200);
    const output = logs.join('');
    for (const marker of [password, replacement, secret, resendKey, cookie, reset, 'secret-in-query', 'secret-in-path', ...inbox.map(emailToken)]) expect(output).not.toContain(marker);
    expect(output).toContain('request completed');
  });
});
