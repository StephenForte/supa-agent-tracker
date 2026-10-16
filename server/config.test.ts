import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config.js';

const base = {
  BETTER_AUTH_SECRET: 'config-test-secret-at-least-32-characters',
  DATABASE_URL: 'postgresql://localhost:5432/postgres',
  PUBLIC_URL: 'http://localhost:3000',
};

describe('loadConfig', () => {
  it('reads the four server environment variables', () => {
    expect(loadConfig({ ...base, PORT: '4317', NODE_ENV: 'test' })).toEqual({
      auth: { secret: base.BETTER_AUTH_SECRET, emailProvider: 'console' },
      databaseUrl: base.DATABASE_URL,
      publicUrl: base.PUBLIC_URL,
      port: 4317,
      nodeEnv: 'test',
      migrateOnBoot: false,
      trustProxyHops: 0,
    });
  });

  it('defaults PORT, NODE_ENV, and TRUST_PROXY_HOPS', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.migrateOnBoot).toBe(false);
    expect(config.trustProxyHops).toBe(0);
  });

  it('parses TRUST_PROXY_HOPS as an integer from 0 to 5 and does not echo the value', () => {
    expect(loadConfig({ ...base, TRUST_PROXY_HOPS: '0' }).trustProxyHops).toBe(0);
    expect(loadConfig({ ...base, TRUST_PROXY_HOPS: '1' }).trustProxyHops).toBe(1);
    expect(loadConfig({ ...base, TRUST_PROXY_HOPS: '5' }).trustProxyHops).toBe(5);
    const marker = 'trust-proxy-do-not-leak';
    for (const value of ['6', '-1', '1.5', 'true', marker, '']) {
      expect(() => loadConfig({ ...base, TRUST_PROXY_HOPS: value })).toThrow(ConfigError);
      try {
        loadConfig({ ...base, TRUST_PROXY_HOPS: value });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        expect(message).toContain('TRUST_PROXY_HOPS');
        expect(message).toContain('must be an integer from 0 to 5');
        expect(message).not.toContain(marker);
      }
    }
  });

  it('turns migrations on at boot only in production', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).migrateOnBoot).toBe(true);
  });

  it('fails fast and does not echo values', () => {
    const marker = 'do-not-leak-this-value';
    expect(() => loadConfig({ DATABASE_URL: '', PUBLIC_URL: marker, PORT: '0', NODE_ENV: 'staging' })).toThrow(ConfigError);
    try {
      loadConfig({ DATABASE_URL: '', PUBLIC_URL: marker, PORT: 'nope', NODE_ENV: 'staging' });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('Invalid server configuration');
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('PUBLIC_URL');
      expect(message).toContain('PORT');
      expect(message).toContain('NODE_ENV');
      expect(message).not.toContain(marker);
    }
  });
});
