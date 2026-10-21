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
  alertBlocked: boolean;
  alertStale: boolean;
  alertReview: boolean;
}

export type HandleUpdate = { status: 'saved'; user: AccountRow } | { status: 'taken' };

export interface PublicProfileInput {
  name: string | null;
  bio: string | null;
  github: string | null;
  x: string | null;
  linkedin: string | null;
  timezone: string;
}

const accountColumns = {
  id: users.id,
  displayName: users.displayName,
  email: users.email,
  emailVerified: users.emailVerified,
  publicHandle: users.publicHandle,
  alertBlocked: users.alertBlocked,
  alertStale: users.alertStale,
  alertReview: users.alertReview,
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

/** Writes profile text and timezone only. public_handle and alert flags stay as they are. */
export async function setPublicProfile(db: Database, access: UserAccess, profile: PublicProfileInput): Promise<void> {
  requireUser(access);
  await db.update(users).set({
    publicName: profile.name,
    publicBio: profile.bio,
    publicGithub: profile.github,
    publicX: profile.x,
    publicLinkedin: profile.linkedin,
    profileTimezone: profile.timezone,
    updatedAt: new Date(),
  }).where(eq(users.id, access.userId));
}
