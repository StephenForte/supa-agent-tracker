import { describe, expect, it, vi } from 'vitest';
import { createPool } from './pool.js';

describe('production database pool', () => {
  it('absorbs idle errors and logs a SQLSTATE without raw error or connection details', async () => {
    const connectionString = 'postgres://secret-user:secret-password@localhost/private-db';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = createPool(connectionString);
    try {
      expect(pool.listenerCount('error')).toBeGreaterThan(0);
      const error = Object.assign(new Error(`Connection failed: ${connectionString}`), {
        code: '57P01', detail: connectionString,
      });
      expect(() => pool.emit('error', error)).not.toThrow();
      expect(log).toHaveBeenCalledWith('Database pool idle client error', { code: '57P01' });
      // Even an unexpected code must not become a channel for raw error details.
      pool.emit('error', Object.assign(error, { code: connectionString }));
      pool.emit('error', new Error(connectionString));
      expect(log).toHaveBeenLastCalledWith('Database pool idle client error', { code: 'unknown' });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-user|secret-password|private-db|postgres:/);
    } finally {
      await pool.end();
      log.mockRestore();
    }
  });
});
