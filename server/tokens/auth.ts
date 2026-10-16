import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import type { McpCredential } from '../app/auth-context.js';
import { authenticateCredentialHash, touchCredentialLastUsed } from '../repo/credentials.js';
import { AccessError } from '../repo/access.js';

const origins = new WeakMap<FastifyInstance, string>();
export function credentialOrigin(app: FastifyInstance): string { return origins.get(app) ?? new URL(process.env.PUBLIC_URL ?? 'http://localhost:3000').origin; }
const databases = new WeakMap<FastifyInstance, AppDatabase>();
export function bindCredentialDatabase(app: FastifyInstance, db: AppDatabase, origin: string): void { databases.set(app, db); origins.set(app, origin); }
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export async function authenticateBearer(request: FastifyRequest): Promise<McpCredential | null> {
  const header = request.headers.authorization;
  if (!header || !/^Bearer sat_[A-Za-z0-9_-]{43}$/i.test(header)) return null;
  const db = databases.get(request.server);
  if (!db) return null;
  const row = await authenticateCredentialHash(db, hashToken(header.slice(7)));
  if (!row) return null;
  try {
    await touchCredentialLastUsed(db, { kind: 'credential', userId: row.userId, credentialId: row.id, projectIds: row.projectIds });
  } catch (error) { if (error instanceof AccessError) return null; throw error; }
  return { userId: row.userId, credentialId: row.id, allowedProjectIds: row.projectIds };
}

/** Route-local logs never serialize query strings, arbitrary IDs, bodies or headers. */
export const secretSafeLogger: FastifyInstance['childLoggerFactory'] = (logger, bindings, options) => logger.child(bindings, {
  ...options, serializers: { ...options.serializers, req: (req: { method?: string }) => ({ method: req.method }) },
});
