import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { userAvatars } from '../db/schema.js';
import { requireUser, withActor, type Database, type UserAccess } from '../repo/access.js';
import type { AvatarMediaType } from './image.js';
import { publicHandleFromParam } from './handle.js';

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

export async function putUserAvatar(db: Database, access: UserAccess, contentType: AvatarMediaType, bytes: Buffer): Promise<void> {
  requireUser(access);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const updatedAt = new Date();
  await withActor(db, access, async (tx) => {
    await tx.insert(userAvatars).values({
      userId: access.userId,
      contentType,
      bytes,
      byteSize: bytes.length,
      sha256,
      updatedAt,
    }).onConflictDoUpdate({
      target: userAvatars.userId,
      set: { contentType, bytes, byteSize: bytes.length, sha256, updatedAt },
    });
  });
}

/** Deleting a missing avatar is success. The account row is unchanged. */
export async function deleteUserAvatar(db: Database, access: UserAccess): Promise<void> {
  requireUser(access);
  await withActor(db, access, async (tx) => {
    await tx.delete(userAvatars).where(eq(userAvatars.userId, access.userId));
  });
}

export interface PublicAvatar {
  contentType: string;
  bytes: Buffer;
  sha256: string;
}

/** Null when the handle is unusable, the owner has nothing public, or no avatar is stored. */
export async function readPublicAvatar(db: Database, rawHandle: string): Promise<PublicAvatar | null> {
  const handle = publicHandleFromParam(rawHandle);
  if (!handle) return null;
  const result = await db.execute(sql`
    SELECT user_avatars.content_type, user_avatars.bytes, user_avatars.sha256
    FROM users
    INNER JOIN user_avatars ON user_avatars.user_id = users.id
    WHERE lower(users.public_handle) = ${handle}
      AND EXISTS (
        SELECT 1 FROM projects
        WHERE projects.owner_id = users.id
          AND projects.is_public = true
          AND projects.lifecycle <> 'archived'
      )
  `);
  const [row] = rowsOf(result);
  if (!row) return null;
  const contentType = row.content_type;
  const sha256 = row.sha256;
  const raw = row.bytes;
  if (typeof contentType !== 'string' || typeof sha256 !== 'string' || raw == null) return null;
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
  return { contentType, bytes, sha256 };
}
