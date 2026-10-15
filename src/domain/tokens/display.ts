import { formatTimestamp } from '../format';
import type { McpToken } from '../types';

export type TokenStatusLabel = 'Active' | 'Revoked';

export function tokenStatus(token: McpToken): TokenStatusLabel {
  return token.revokedAt === null ? 'Active' : 'Revoked';
}

/** Last-used is "Never" when the token has no use, which is distinct from a null field em dash. */
export function formatLastUsed(lastUsedAt: string | null, timeZone?: string): string {
  return lastUsedAt === null ? 'Never' : formatTimestamp(lastUsedAt, timeZone);
}
