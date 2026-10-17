import pg from 'pg';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (error: Error & { code?: string }) => {
    // Raw messages/client objects can contain credentials. Log only a SQLSTATE.
    const code = typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unknown';
    console.error('Database pool idle client error', { code });
  });
  return pool;
}
