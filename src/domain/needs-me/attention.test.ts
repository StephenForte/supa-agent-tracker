import { describe, expect, it } from 'vitest';
import { seedTracker } from '../../data/mock/seed';
import type { Run } from '../types';
import { needsAttention } from './attention';
const now = Date.parse('2026-10-19T20:00:00Z');
const seed = seedTracker(now);
const base = seed.runs[0]!;
const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const select = (runs: Run[], projects = seed.projects) => needsAttention(seed.account.id, projects, runs, seed.agents, now);

describe('attention membership and precedence', () => {
  it.each(['running', 'finished', 'cancelled', 'failed'] as const)('puts blocked %s work under Blocked only', executionState => {
    const result = select([{ ...base, executionState, workStatus: 'blocked', lastContactAt: at(90) }]);
    expect(result.groups.blocked).toHaveLength(1);
    expect(result.groups.stale).toEqual([]);
    expect(result.groups.review).toEqual([]);
    expect(result.total).toBe(1);
  });
  it('uses the project threshold, including the strict boundary', () => {
    const project = { ...seed.projects[0]!, reportingPolicy: { ...seed.projects[0]!.reportingPolicy, staleThresholdMinutes: 30 } };
    const runs = [29, 30, 31].map(age => ({ ...base, id: String(age), lastContactAt: at(age) }));
    expect(select(runs, [project]).groups.stale.map(run => run.id)).toEqual(['31']);
  });
  it('includes only finished review work and excludes other ended, completed and live runs', () => {
    const runs: Run[] = [
      { ...base, id: 'review', executionState: 'finished', workStatus: 'waiting_for_review', finishedAt: at(4) },
      ...(['failed', 'cancelled'] as const).map(executionState => ({ ...base, id: executionState, executionState, workStatus: 'waiting_for_review' as const })),
      { ...base, id: 'done', executionState: 'finished', workStatus: 'completed' },
      { ...base, id: 'live' },
    ];
    const result = select(runs);
    expect(result.groups.review.map(run => run.id)).toEqual(['review']);
    expect(result.total).toBe(1);
  });
  it('excludes archived, foreign and unknown projects even for blocked work', () => {
    const projects = [...seed.projects, { ...seed.projects[0]!, id: 'foreign', ownerId: 'another-owner' }];
    const runs = ['prj_archive', 'foreign', 'missing'].map(projectId => ({ ...base, projectId, workStatus: 'blocked' as const }));
    expect(select(runs, projects).total).toBe(0);
  });
  it('orders each group oldest first using its specified timestamp without mutating inputs', () => {
    const runs: Run[] = [
      ...[1, 3, 2].map(age => ({ ...base, id: `b${age}`, workStatus: 'blocked' as const, updatedAt: at(age), lastContactAt: at(10 - age) })),
      ...[40, 60, 50].map(age => ({ ...base, id: `s${age}`, lastContactAt: at(age), updatedAt: at(100 - age) })),
      ...[1, 3, 2].map(age => ({ ...base, id: `r${age}`, executionState: 'finished' as const, workStatus: 'waiting_for_review' as const, finishedAt: at(age), updatedAt: at(10 - age) })),
    ];
    const before = structuredClone(runs);
    const result = select(runs);
    expect(result.groups.blocked.map(run => run.id)).toEqual(['b3', 'b2', 'b1']);
    expect(result.groups.stale.map(run => run.id)).toEqual(['s60', 's50', 's40']);
    expect(result.groups.review.map(run => run.id)).toEqual(['r3', 'r2', 'r1']);
    expect(result.total).toBe(9);
    expect(runs).toEqual(before);
  });
  it('has a demo item in every group', () => {
    const result = select(seed.runs);
    expect(result.groups.blocked.map(run => run.id)).toEqual(['run_4']);
    expect(result.groups.stale.map(run => run.id)).toEqual(['run_11']);
    expect(result.groups.review.map(run => run.id)).toEqual(['run_3']);
  });
});
