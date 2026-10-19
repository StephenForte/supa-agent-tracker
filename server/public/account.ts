import { and, eq, sql } from 'drizzle-orm';

import { users } from '../db/schema.js';
import { requireUser, withActor, type Database, type UserAccess } from '../repo/access.js';
import { postgresCode } from './pg-error.js';

export interface AccountRow {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  publicHandle: string | null;
}

export type HandleUpdate = { status: 'saved'; user: AccountRow } | { status: 'taken' };

const accountColumns = {
  id: users.id,
  displayName: users.displayName,
  email: users.email,
  emailVerified: users.emailVerified,
  publicHandle: users.publicHandle,
};

/** Sets or clears this user's handle. A handle owned by someone else is `taken` and writes nothing. */
export async function setPublicHandle(db: Database, access: UserAccess, handle: string | null): Promise<HandleUpdate> {
  requireUser(access);
  try {
    return await withActor(db, access, async (tx) => {
      if (handle !== null) {
        const [other] = await tx.select({ id: users.id }).from(users).where(and(
          sql`lower(${users.publicHandle}) = ${handle}`,
          sql`${users.id} <> ${access.userId}`,
        ));
        if (other) return { status: 'taken' };
      }
      const [user] = await tx.update(users).set({ publicHandle: handle, updatedAt: new Date() })
        .where(eq(users.id, access.userId)).returning(accountColumns);
      return { status: 'saved', user: user! };
    });
  } catch (error) {
    if (postgresCode(error) === '23505') return { status: 'taken' };
    throw error;
  }
}
