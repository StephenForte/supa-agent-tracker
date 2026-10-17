import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '../format';
import type { McpToken } from '../types';
import { formatLastUsed, tokenScopeLabel, tokenStatus } from './display';

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
});
