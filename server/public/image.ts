export const AVATAR_MAX_BYTES = 262_144;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const AVATAR_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type AvatarMediaType = (typeof AVATAR_MEDIA_TYPES)[number];

export function avatarMediaType(header: string | undefined): AvatarMediaType | null {
  if (!header) return null;
  const type = header.split(';')[0]?.trim().toLowerCase() ?? '';
  return (AVATAR_MEDIA_TYPES as readonly string[]).includes(type) ? type as AvatarMediaType : null;
}

/** True when the declared type matches the leading magic bytes. An empty body never matches. */
export function avatarMagicMatches(type: AvatarMediaType, bytes: Buffer): boolean {
  if (bytes.length < 1) return false;
  if (type === 'image/png') return bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}
