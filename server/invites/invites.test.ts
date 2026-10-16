import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app/build-app.js';
import { createLoggerOptions } from '../app/logging.js';
import { authRuntime } from '../auth/runtime.js';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir, spaRoot } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { hashToken } from '../tokens/auth.js';
import { createEmailSender } from '../email/index.js';

const origin = 'https://invites.example.test';
const password = 'invite-test-password-strong!';
const forbidden = { error: { code: 'forbidden', message: 'This invitation is invalid or has expired' } };
describe('P1-I invites through HTTP and real Postgres', () => {
  let scratch: ScratchDatabase; let pool: pg.Pool; let app: FastifyInstance; let closed: FastifyInstance;
  let adminCookie: string; let adminId: string; let address = 0;
  const logs: string[] = [];
  const post = (url: string, payload: Record<string, unknown>, cookie?: string) => app.inject({ method: 'POST', url, payload,
    remoteAddress: `192.0.11.${++address}`, headers: { origin, ...(cookie ? { cookie } : {}) } });
  const signup = (email: string, invite?: string, extra = {}) => post('/api/auth/sign-up/email', { name: 'Invitee', email, password, ...(invite ? { invite } : {}), ...extra });
  const runtime = () => authRuntime(app)!;
  async function create(email: string, request_id: string = randomUUID()) {
    const result = await post('/api/invites', { email, request_id }, adminCookie);
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toBe('no-store');
    return result.json<{ invite: { id: string; email: string; status: string }; link: string; emailSent: boolean }>();
  }
  function token(link: string) { return new URL(link).searchParams.get('invite')!; }
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString);
    await runMigrations(pool, migrationsDir);
    const config = loadConfig({ DATABASE_URL: scratch.connectionString, PUBLIC_URL: origin, NODE_ENV: 'test', ADMIN_EMAIL: ' ADMIN@Example.test ' });
    app = await buildApp({ config, pool, migrationsDir, spaRoot, logger: createLoggerOptions({ write: value => logs.push(value) }) });
    expect((await signup(' ADMIN@Example.test ')).statusCode).toBe(200);
    const mail = runtime().email.captured.find(mail => mail.subject === 'Verify your email')!;
    const verification = new URL(mail.text.split(' ').at(-1)!).searchParams.get('token');
    expect((await app.inject({ url: `/api/auth/verify-email?token=${verification}` })).statusCode).toBe(200);
    const signedIn = await post('/api/auth/sign-in/email', { email: 'admin@example.test', password });
    expect(signedIn.statusCode).toBe(200);
    const raw = signedIn.headers['set-cookie'];
    adminCookie = (Array.isArray(raw) ? raw : [String(raw)]).map(value => value.split(';')[0]).join('; ');
    adminId = (await pool.query("SELECT id FROM users WHERE email='admin@example.test'")).rows[0].id;
    await pool.query("INSERT INTO users(id,email,email_verified) VALUES ('other-user','other@example.test',true),('unverified-admin','ADMIN@example.invalid',false)");
  });
  afterAll(async () => { await app?.close(); await closed?.close(); await pool?.end(); await scratch?.drop(); vi.restoreAllMocks(); });
  it('requires authentication and a currently verified admin; account reports the same rule', async () => {
    for (const [method, url, payload] of [['GET', '/api/invites', undefined], ['POST', '/api/invites', { email: 'x@example.test', request_id: 'x' }], ['POST', '/api/invites/missing/revoke', { request_id: 'x' }]] as const) {
      expect((await app.inject({ method, url, payload })).statusCode).toBe(401);
      expect((await app.inject({ method, url, payload, headers: { origin, 'x-test-user-id': 'other-user' } })).statusCode).toBe(403);
    }
    const account = await app.inject({ url: '/api/account', headers: { cookie: adminCookie } });
    expect(account.json().isAdmin).toBe(true);
    expect((await app.inject({ url: '/api/account', headers: { 'x-test-user-id': 'other-user' } })).json().isAdmin).toBe(false);
    await pool.query('UPDATE users SET email_verified=false WHERE id=$1', [adminId]);
    expect((await post('/api/invites', { email: 'x@example.test', request_id: 'unverified' }, adminCookie)).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/account', headers: { cookie: adminCookie } })).json().isAdmin).toBe(false);
    await pool.query('UPDATE users SET email_verified=true WHERE id=$1', [adminId]);
  });
  it('creates an expiring invite, emails the link, and replays only metadata without DB or log plaintext', async () => {
    const first = await create(' Copy@Example.test ', 'copy-once');
    expect(first.invite.email).toBe('copy@example.test'); expect(first.invite.status).toBe('pending'); expect(first.emailSent).toBe(true);
    expect(first.link).toMatch(/^https:\/\/invites\.example\.test\/register\?invite=inv_[A-Za-z0-9_-]{43}$/);
    const before = runtime().email.captured.length;
    expect(runtime().email.captured.at(-1)?.text).toContain(first.link);
    const replay = await post('/api/invites', { email: ' Copy@Example.test ', request_id: 'copy-once' }, adminCookie);
    expect(replay.json()).toMatchObject({ invite: first.invite, link: null, emailSent: false });
    expect(runtime().email.captured.length).toBe(before);
    expect((await post('/api/invites', { email: 'different@example.test', request_id: 'copy-once' }, adminCookie)).statusCode).toBe(409);
    const row = (await pool.query('SELECT * FROM invites WHERE id=$1', [first.invite.id])).rows[0];
    expect(row.token_hash).toBe(hashToken(token(first.link)));
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(7 * 86400_000);
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    // Whole-row JSON scans every text/jsonb value, including idempotency response JSON.
    for (const { table_name } of tables.rows) {
      const rows = await pool.query(`SELECT to_jsonb(t)::text AS value FROM "${table_name}" t`);
      for (const { value } of rows.rows) { expect(value).not.toContain(first.link); expect(value).not.toContain(token(first.link)); }
    }
    const list = await app.inject({ url: '/api/invites', headers: { cookie: adminCookie } });
    expect(list.body).not.toContain(row.token_hash); expect(list.body).not.toContain(token(first.link));
    const landing = await app.inject({ url: new URL(first.link).pathname + new URL(first.link).search });
    expect(landing.statusCode).toBe(200); expect(landing.headers['referrer-policy']).toBe('no-referrer');
    expect(logs.join('')).not.toContain(first.link); expect(logs.join('')).not.toContain(token(first.link));
  });
  it('returns the link on delivery failure and suppresses invite contents in development only', async () => {
    const sender = vi.spyOn(runtime().email, 'sendEmail').mockRejectedValueOnce(new Error('provider-secret-marker'));
    const result = await create('delivery@example.test'); expect(result.emailSent).toBe(false); expect(result.link).toBeTruthy();
    expect(logs.join('')).not.toContain('provider-secret-marker'); sender.mockRestore();
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const dev = createEmailSender(runtime().settings, 'development');
      await dev.sendEmail({ to: 'a@example.test', subject: "You're invited to Supa Agent Tracker", text: result.link });
      expect(output).toHaveBeenLastCalledWith('Invite email suppressed; use the link shown once in the app');
      expect(JSON.stringify(output.mock.calls)).not.toContain(result.link);
      await dev.sendEmail({ to: 'a@example.test', subject: 'Verify your email', text: 'verification-marker' });
      expect(output.mock.calls.at(-1)?.[0]).toContain('verification-marker');
      await dev.sendEmail({ to: 'a@example.test', subject: 'Reset your password', text: 'reset-marker' });
      expect(output.mock.calls.at(-1)?.[0]).toContain('reset-marker');
    } finally { output.mockRestore(); }
  });
  it('registers the matching address once and makes reused, expired, revoked, mismatched, garbage and missing tokens identical', async () => {
    const valid = await create('valid@example.test');
    expect((await signup(' VALID@Example.test ', token(valid.link))).json()).toEqual({ status: true });
    const row = (await pool.query('SELECT used_at,used_by FROM invites WHERE id=$1', [valid.invite.id])).rows[0];
    expect(row.used_at).toBeInstanceOf(Date);
    expect(row.used_by).toBe((await pool.query("SELECT id FROM users WHERE email='valid@example.test'")).rows[0].id);
    const expired = await create('expired@example.test'); await pool.query("UPDATE invites SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.invite.id]);
    const revoked = await create('revoked@example.test');
    const revocation = { request_id: 'revoke:once' };
    expect((await post(`/api/invites/${revoked.invite.id}/revoke`, revocation, adminCookie)).json().invite.status).toBe('revoked');
    expect((await post(`/api/invites/${revoked.invite.id}/revoke`, revocation, adminCookie)).json().invite.status).toBe('revoked');
    const wrong = await create('right@example.test');
    for (const [email, invite] of [['valid@example.test', token(valid.link)], ['expired@example.test', token(expired.link)], ['revoked@example.test', token(revoked.link)], ['wrong@example.test', token(wrong.link)], ['garbage@example.test', 'garbage'], ['unknown@example.test', `inv_${randomBytes(32).toString('base64url')}`], ['missing@example.test', undefined]]) {
      const response = await signup(email!, invite); expect(response.statusCode).toBe(403); expect(response.json()).toEqual(forbidden);
    }
    const list = (await app.inject({ url: '/api/invites', headers: { cookie: adminCookie } })).json<{ id: string; status: string }[]>();
    for (const [id, status] of [[valid.invite.id, 'used'], [expired.invite.id, 'expired'], [revoked.invite.id, 'revoked'], [wrong.invite.id, 'pending']]) expect(list.find(row => row.id === id)?.status).toBe(status);
    expect((await post(`/api/invites/${valid.invite.id}/revoke`, { request_id: 'revoke-used' }, adminCookie)).statusCode).toBe(409);
  });
  it('serializes simultaneous signups on one invite: exactly one account and used invite', async () => {
    const invite = await create('racing@example.test');
    const responses = await Promise.all([signup('racing@example.test', token(invite.link)), signup('racing@example.test', token(invite.link))]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 403]);
    expect(responses.find(response => response.statusCode === 403)?.json()).toEqual(forbidden);
    expect((await pool.query("SELECT id FROM users WHERE email='racing@example.test'")).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM invites WHERE id=$1 AND used_at IS NOT NULL AND used_by IS NOT NULL', [invite.invite.id])).rowCount).toBe(1);
  });
  it('rolls back both account creation and invite consumption on failure, allowing a later retry', async () => {
    const invite = await create('rollback@example.test');
    // Force a credential insert failure AFTER Better Auth has inserted the user.
    await pool.query(`CREATE FUNCTION reject_invite_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM users WHERE id=NEW.user_id AND email='rollback@example.test') THEN RAISE EXCEPTION 'test account failure'; END IF;
      RETURN NEW; END $$; CREATE TRIGGER reject_invite_account BEFORE INSERT ON accounts FOR EACH ROW EXECUTE FUNCTION reject_invite_account()`);
    let response;
    try { response = await signup('rollback@example.test', token(invite.link)); }
    finally { await pool.query('DROP TRIGGER reject_invite_account ON accounts; DROP FUNCTION reject_invite_account()'); }
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect((await pool.query("SELECT id FROM users WHERE email='rollback@example.test'")).rowCount).toBe(0);
    expect((await pool.query('SELECT used_at FROM invites WHERE id=$1', [invite.invite.id])).rows[0].used_at).toBeNull();
    expect((await signup('rollback@example.test', token(invite.link))).statusCode).toBe(200);
  });
  it('boots with no ADMIN_EMAIL, denying bootstrap registration and invite administration', async () => {
    closed = await buildApp({ config: loadConfig({ DATABASE_URL: scratch.connectionString, PUBLIC_URL: origin, NODE_ENV: 'test' }), pool, migrationsDir, spaRoot });
    const response = await closed.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin }, payload: { name: 'No', email: 'noadmin@example.test', password } });
    expect(response.statusCode).toBe(403); expect(response.json()).toEqual(forbidden);
    expect((await closed.inject({ url: '/api/invites', headers: { 'x-test-user-id': adminId } })).statusCode).toBe(403);
    expect((await closed.inject({ url: '/api/account', headers: { 'x-test-user-id': adminId } })).json().isAdmin).toBe(false);
  });
});
