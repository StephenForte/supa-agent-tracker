import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../config.js';

const base = { DATABASE_URL: 'postgres://localhost/postgres', PUBLIC_URL: 'http://localhost:3000' };
describe('auth environment validation', () => {
  it('requires a sufficiently long secret outside tests, naming fields without values', () => {
    for (const NODE_ENV of ['development', 'production']) {
      for (const BETTER_AUTH_SECRET of [undefined, 'private-short-marker']) {
        expect(() => loadConfig({ ...base, NODE_ENV, BETTER_AUTH_SECRET })).toThrow('BETTER_AUTH_SECRET');
        try { loadConfig({ ...base, NODE_ENV, BETTER_AUTH_SECRET }); } catch (error) {
          expect(error).toBeInstanceOf(ConfigError);
          expect(String(error)).not.toContain('private-short-marker');
        }
      }
    }
  });
  it('requires Resend key and sender only for Resend and rejects unknown providers', () => {
    const env = { ...base, NODE_ENV: 'test' };
    expect(() => loadConfig({ ...env, EMAIL_PROVIDER: 'resend' })).toThrow('RESEND_API_KEY');
    expect(() => loadConfig({ ...env, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-secret' })).toThrow('EMAIL_FROM');
    expect(() => loadConfig({ ...env, EMAIL_PROVIDER: 'private-provider-marker' })).toThrow('EMAIL_PROVIDER');
    expect(loadConfig(env).auth?.emailProvider).toBe('console');
    expect(loadConfig({ ...env, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-secret', EMAIL_FROM: 'sender@example.test' }).auth?.emailProvider).toBe('resend');
  });
  it('parses one optional trimmed case-insensitive admin email, rejecting invalid configured values', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'test', ADMIN_EMAIL: ' ONE@example.test ' }).auth?.adminEmail).toBe('one@example.test');
    expect(loadConfig({ ...base, NODE_ENV: 'test' }).auth?.adminEmail).toBeUndefined();
    for (const ADMIN_EMAIL of ['', ' ', 'bad', 'one@example.test,two@example.test']) {
      expect(() => loadConfig({ ...base, NODE_ENV: 'test', ADMIN_EMAIL })).toThrow('ADMIN_EMAIL');
    }
  });
});
