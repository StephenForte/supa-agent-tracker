import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '../format';
import type { McpToken } from '../types';
import { formatLastUsed, orderedTokens, revokedTokenCount, tokenScopeLabel, tokenStatus } from './display';

function token(overrides: Partial<McpToken> = {}): McpToken {
  return {
    id: 'tok_x', label: 'Client', allProjects: false, projectIds: ['prj_a'], display: 'sat_demo_…masked',
    createdAt: '2026-10-14T00:00:00.000Z', lastUsedAt: null, revokedAt: null, ...overrides,
  };
}

describe('token display', () => {
  it('labels a token revoked only after revokedAt is set', () => {
    expect(tokenStatus(token())).toBe('Active');
    expect(tokenStatus(token({ revokedAt: '2026-10-14T01:00:00.000Z' }))).toBe('Revoked');
  });

  it('shows all-projects as a mode and specific scope as project names', () => {
    const projects = [{ id: 'prj_a', name: 'Alpha' }];
    expect(tokenScopeLabel(token({ allProjects: true, projectIds: [] }), projects)).toBe('All my projects');
    expect(tokenScopeLabel(token(), projects)).toBe('Alpha');
  });

  it('says Never for a missing last-used time and otherwise uses the shared timestamp formatter', () => {
    expect(formatLastUsed(null)).toBe('Never');
    const stamp = '2026-10-14T18:00:00.000Z';
    expect(formatLastUsed(stamp, 'UTC')).toBe(formatTimestamp(stamp, 'UTC'));
  });

  it('sorts active tokens by last use and hides revoked tokens until asked', () => {
    const olderUsed = token({ id: 'older', label: 'Older', lastUsedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' });
    const recentUsed = token({ id: 'recent', label: 'Recent', lastUsedAt: '2026-10-18T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' });
    const neverOlder = token({ id: 'never-old', label: 'Never older', lastUsedAt: null, createdAt: '2026-10-10T00:00:00.000Z' });
    const neverNewer = token({ id: 'never-new', label: 'Never newer', lastUsedAt: null, createdAt: '2026-10-12T00:00:00.000Z' });
    const revokedRecent = token({ id: 'rev-recent', label: 'Revoked recent', lastUsedAt: '2026-10-19T00:00:00.000Z', revokedAt: '2026-10-19T01:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' });
    const revokedOlder = token({ id: 'rev-older', label: 'Revoked older', lastUsedAt: '2026-10-02T00:00:00.000Z', revokedAt: '2026-10-03T00:00:00.000Z', createdAt: '2026-01-02T00:00:00.000Z' });
    const tokens = [revokedOlder, neverOlder, olderUsed, revokedRecent, neverNewer, recentUsed];
    const before = tokens.map(item => item.id);
    expect(revokedTokenCount(tokens)).toBe(2);
    expect(orderedTokens(tokens, false).map(item => item.id)).toEqual(['recent', 'older', 'never-new', 'never-old']);
    expect(orderedTokens(tokens, true).map(item => item.id)).toEqual(['recent', 'older', 'never-new', 'never-old', 'rev-recent', 'rev-older']);
    expect(tokens.map(item => item.id)).toEqual(before);
  });
});
