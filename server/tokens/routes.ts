import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDatabase } from '../db/client.js';
import { requireUser } from '../app/auth-context.js';
import { createCredential, getCredential, listCredentials, updateCredential, type CredentialSummary } from '../repo/credentials.js';
import { withIdempotency } from '../repo/idempotency-keys.js';
import { secretSafeLogger, hashToken } from './auth.js';
import { failure, httpStatus, id, ProtocolError, requestHash, requestId, revision, short } from '../mcp/protocol.js';

export function tokenView(row: CredentialSummary) {
  return { id: row.id, label: row.label, projectIds: row.projectIds, display: `••••${row.displaySuffix}`,
    createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, revokedAt: row.revokedAt, revision: row.revision };
}
const issue = z.strictObject({ label: short, project_ids: z.array(id).max(100), request_id: requestId });
const edit = z.strictObject({ request_id: requestId, expected_revision: revision });

export async function registerTokenRoutes(app: FastifyInstance, db: AppDatabase): Promise<void> {
  app.get('/api/tokens', { preHandler: requireUser, childLoggerFactory: secretSafeLogger }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return (await listCredentials(db, { kind: 'user', userId: request.user!.userId })).map(tokenView); }
    catch (error) { const body = failure(error); return reply.code(httpStatus(body.error.code)).send(body); }
  });
  for (const action of ['issue', 'rotate', 'revoke'] as const) {
    const url = action === 'issue' ? '/api/tokens' : `/api/tokens/:id/${action}`;
    app.post(url, { preHandler: requireUser, childLoggerFactory: secretSafeLogger }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        const input = action === 'issue' ? issue.parse(request.body) : edit.parse(request.body);
        const tokenId = action === 'issue' ? null : id.parse((request.params as { id: string }).id);
        const access = { kind: 'user' as const, userId: request.user!.userId };
        let plaintext: string | null = null;
        const result = await withIdempotency(db, access, input.request_id, requestHash({ action, tokenId, input }), async (tx) => {
          let label: string; let projectIds: readonly string[];
          if ('label' in input) { label = input.label; projectIds = input.project_ids; }
          else {
            const previous = await getCredential(tx, access, tokenId!);
            if (action === 'rotate' && previous.revokedAt) throw new ProtocolError('validation_error');
            const saved = await updateCredential(tx, access, tokenId!, input.expected_revision, { revoke: true });
            if (saved.status === 'conflict') throw new ProtocolError('conflict', tokenView(saved.current));
            if (action === 'revoke') return { token: tokenView(saved.value) };
            label = previous.label; projectIds = previous.projectIds;
          }
          plaintext = `sat_${randomBytes(32).toString('base64url')}`;
          const row = await createCredential(tx, access, { label, projectIds, tokenHash: hashToken(plaintext), displaySuffix: plaintext.slice(-4) });
          // Only safe metadata enters idempotency_keys.response. Copy-once even on retries.
          return { token: tokenView(row), plaintext: null };
        });
        if (result.status === 'idempotency_mismatch') throw new ProtocolError(result.status);
        return action === 'revoke' ? result.response : { ...(result.response as object), plaintext: result.status === 'stored' ? plaintext : null };
      } catch (error) { const body = failure(error); return reply.code(httpStatus(body.error.code)).send(body); }
    });
  }
}
