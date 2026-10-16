import { eq } from 'drizzle-orm';
import type { Database } from '../repo/access.js';
import { users } from '../db/schema.js';
import type { AuthConfig } from '../config.js';

export function isAdmin(user: { email: string; emailVerified: boolean }, settings: AuthConfig): boolean {
  return !!settings.adminEmail && user.emailVerified && user.email.toLowerCase() === settings.adminEmail;
}
export async function userIsAdmin(db: Database, userId: string, settings: AuthConfig): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return !!user && isAdmin(user, settings);
}
