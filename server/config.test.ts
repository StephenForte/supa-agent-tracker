import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgresql://localhost:5432/postgres',
  PUBLIC_URL: 'http://localhost:3000',
};

describe('loadConfig', () => {
  it('reads the four server environment variables', () => {
    expect(loadConfig({ ...base, PORT: '4317', NODE_ENV: 'test' })).toEqual({
      databaseUrl: base.DATABASE_URL,
      publicUrl: base.PUBLIC_URL,
      port: 4317,
      nodeEnv: 'test',
      migrateOnBoot: false,
    });
  });

  it('defaults PORT and NODE_ENV', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.migrateOnBoot).toBe(false);
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
