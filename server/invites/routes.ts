import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteDeps } from '../app/routes.js';
import { requireUser } from '../app/auth-context.js';
import { authRuntime } from '../auth/runtime.js';
import { createDb } from '../db/client.js';
import { invites } from '../db/schema.js';
import { withIdempotency } from '../repo/idempotency-keys.js';
import { failure, httpStatus, id, ProtocolError, requestHash, requestId } from '../mcp/protocol.js';
import { hashToken } from '../tokens/auth.js';
import { userIsAdmin } from './admin.js';

const createInput = z.strictObject({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()), request_id: requestId });
const revokeInput = z.strictObject({ request_id: requestId });
export function inviteView(row: typeof invites.$inferSelect) {
  return { id: row.id, email: row.email, createdAt: row.createdAt, expiresAt: row.expiresAt, usedAt: row.usedAt, revokedAt: row.revokedAt,
    status: row.usedAt ? 'used' : row.revokedAt ? 'revoked' : row.expiresAt.getTime() <= Date.now() ? 'expired' : 'pending' };
}
export async function registerInviteRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  // Fastify logs the incoming URL before hooks. Invite links land here before
  // the browser can strip their query parameter, so serve this SPA entry silently.
  app.get('/register', { logLevel: 'silent' }, async (_request, reply) => {
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    return reply.sendFile('index.html');
  });
  const db = createDb(deps.pool);
  const runtime = authRuntime(app)!;
  const guard = { preHandler: requireUser, logLevel: 'silent' as const };
  app.get('/api/invites', guard, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      if (!await userIsAdmin(db, request.user!.userId, runtime.settings)) throw new ProtocolError('forbidden');
      return (await db.select().from(invites).where(eq(invites.invitedBy, request.user!.userId)).orderBy(desc(invites.createdAt), desc(invites.id))).map(inviteView);
    } catch (error) { const body = failure(error); return reply.code(httpStatus(body.error.code)).send(body); }
  });
  for (const action of ['create', 'revoke'] as const) {
    app.post(action === 'create' ? '/api/invites' : '/api/invites/:id/revoke', guard, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        if (!await userIsAdmin(db, request.user!.userId, runtime.settings)) throw new ProtocolError('forbidden');
        const input = action === 'create' ? createInput.parse(request.body) : revokeInput.parse(request.body);
        const inviteId = action === 'create' ? null : id.parse((request.params as { id: string }).id);
        let link: string | null = null;
        const result = await withIdempotency(db, { kind: 'user', userId: request.user!.userId }, input.request_id,
          requestHash({ action: `invite:${action}`, inviteId, input }), async tx => {
            // Recheck verified identity inside the transaction on every mutation.
            if (!await userIsAdmin(tx, request.user!.userId, runtime.settings)) throw new ProtocolError('forbidden');
            if (action === 'create') {
              const { email } = createInput.parse(input);
              const token = `inv_${randomBytes(32).toString('base64url')}`;
              const [row] = await tx.insert(invites).values({ email, tokenHash: hashToken(token), invitedBy: request.user!.userId }).returning();
              const url = new URL('/register', runtime.config.publicUrl); url.searchParams.set('invite', token); link = url.href;
              // Never put the secret in the saved response, including on replay.
              return { invite: inviteView(row!), link: null };
            }
            const [row] = await tx.select().from(invites).where(and(eq(invites.id, inviteId!), eq(invites.invitedBy, request.user!.userId))).for('update');
            if (!row) throw new ProtocolError('not_found');
            if (row.usedAt) throw new ProtocolError('conflict', inviteView(row));
            const [saved] = await tx.update(invites).set({ revokedAt: row.revokedAt ?? sql`now()` }).where(and(eq(invites.id, row.id), isNull(invites.usedAt))).returning();
            return { invite: inviteView(saved!) };
          }, action === 'create' ? 'invite_create' : 'invite_revoke');
        if (result.status === 'idempotency_mismatch') throw new ProtocolError(result.status);
        if (action === 'revoke') return result.response;
        let emailSent = false;
        if (result.status === 'stored' && link) {
          try {
            await runtime.email.sendEmail({ to: (input as z.infer<typeof createInput>).email,
              subject: "You're invited to Supa Agent Tracker", text: `You're invited to Supa Agent Tracker. Register within 7 days: ${link}` });
            emailSent = true;
          } catch { /* The copy-once link remains available even when delivery fails. */ }
        }
        return { ...(result.response as object), link: result.status === 'stored' ? link : null, emailSent };
      } catch (error) { const body = failure(error); return reply.code(httpStatus(body.error.code)).send(body); }
    });
  }
}
