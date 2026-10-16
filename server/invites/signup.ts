import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AuthRuntime } from '../auth/runtime.js';
import { invites, users } from '../db/schema.js';
import { hashToken } from '../tokens/auth.js';
import { apiError, errorCodes } from '../app/errors.js';

export const invalidInvitation = () => new Response(JSON.stringify(apiError(errorCodes.forbidden, 'This invitation is invalid or has expired')), { status: 403 });
class RejectedSignup { constructor(readonly response: Response) {} }
/** The adapter's async-local transaction wraps the invite lock, user AND credential writes.
 * Nested library transactions become savepoints; failure rolls back the entire signup.
 */
export async function invitedSignup(runtime: AuthRuntime, body: Record<string, unknown> | undefined, request: () => Request): Promise<Response> {
  try {
    return await runtime.signupTransaction(async tx => {
      const email = typeof body?.email === 'string' ? body.email : '';
      const [adminTaken] = await tx.select({ id: users.id }).from(users)
        .where(sql`lower(${users.email}) = ${runtime.settings.adminEmail ?? ''}`).limit(1);
      // Bootstrap only the first account; later responses must not reveal the admin address.
      const bootstrap = !!runtime.settings.adminEmail && email === runtime.settings.adminEmail && !adminTaken;
      let invite: typeof invites.$inferSelect | undefined;
      if (!bootstrap) {
        if (typeof body?.invite !== 'string' || !/^inv_[A-Za-z0-9_-]{43}$/.test(body.invite)) throw new RejectedSignup(invalidInvitation());
        [invite] = await tx.select().from(invites).where(and(eq(invites.tokenHash, hashToken(body.invite)), eq(invites.email, email),
          isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, sql`clock_timestamp()`))).for('update');
        if (!invite) throw new RejectedSignup(invalidInvitation());
      }
      // The raw invite never reaches library hooks or additional user fields.
      if (body) delete body.invite;
      let response = await runtime.auth.handler(request());
      if (response.status === 422) {
        // A pre-auth mixed-case identity can hit the case-insensitive unique
        // index after the library's exact lookup. Its savepoint has rolled back;
        // preserve the generic response AND consume this successful invitation.
        const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
        if (existing) response = new Response(JSON.stringify({ status: true }), { status: 200 });
      }
      if (!response.ok) throw new RejectedSignup(response);
      if (invite) {
        const [user] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
        if (!user) throw new RejectedSignup(invalidInvitation());
        const [used] = await tx.update(invites).set({ usedAt: sql`clock_timestamp()`, usedBy: user.id }).where(and(eq(invites.id, invite.id),
          isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, sql`clock_timestamp()`))).returning();
        if (!used) throw new RejectedSignup(invalidInvitation());
      }
      return response;
    });
  } catch (error) {
    if (error instanceof RejectedSignup) return error.response;
    throw error;
  }
}
