import { formatTimestamp } from '../format';
import type { McpToken } from '../types';

export type TokenStatusLabel = 'Active' | 'Revoked';

export function tokenStatus(token: McpToken): TokenStatusLabel {
  return token.revokedAt === null ? 'Active' : 'Revoked';
}

/** All-projects is a mode, not the current project list. Specific scope shows names. */
export function tokenScopeLabel(token: Pick<McpToken, 'allProjects' | 'projectIds'>, projects: readonly { id: string; name: string }[]): string {
  return token.allProjects ? 'All my projects' : token.projectIds.map(id => projects.find(project => project.id === id)?.name ?? id).join(', ');
}

/** Last-used is "Never" when the token has no use, which is distinct from a null field em dash. */
export function formatLastUsed(lastUsedAt: string | null, timeZone?: string): string {
  return lastUsedAt === null ? 'Never' : formatTimestamp(lastUsedAt, timeZone);
}

export function revokedTokenCount(tokens: readonly McpToken[]): number {
  return tokens.filter(token => token.revokedAt !== null).length;
}

/**
 * Active tokens come first, most recently used first and never-used last, then newest created.
 * Revoked tokens follow the same order after every active token, and stay out until requested.
 */
export function orderedTokens(tokens: readonly McpToken[], showRevoked: boolean): McpToken[] {
  const sorted = [...tokens].sort((a, b) => {
    const group = Number(a.revokedAt !== null) - Number(b.revokedAt !== null);
    return group || compareRecency(a.lastUsedAt, b.lastUsedAt) || compareRecency(a.createdAt, b.createdAt) || a.id.localeCompare(b.id);
  });
  return showRevoked ? sorted : sorted.filter(token => token.revokedAt === null);
}

/** Newest instant first. A missing instant sorts after every present one. */
function compareRecency(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Date.parse(b) - Date.parse(a);
}
