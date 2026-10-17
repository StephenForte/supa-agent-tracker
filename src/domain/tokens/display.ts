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
