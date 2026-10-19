import { describe, expect, it } from 'vitest';
import { seedTracker } from '../../data/mock/seed';
import type { ExecutionState, Run, WorkStatus } from '../types';
import { activityGroup, dateTimeInput, executionLabels, filterRuns, isConcurrent, liveContact, paginate, sortRuns, stale, workLabels } from './grid';
import { elapsed } from '../derive';
const now = Date.parse('2026-10-15T12:00:00Z');
const seed = seedTracker(now);
const context = { projects: seed.projects, agents: seed.agents, now };
const base = seed.runs[0]!;
describe('execution, work and liveness invariants', () => {
  for (const executionState of Object.keys(executionLabels) as ExecutionState[]) {
    for (const workStatus of Object.keys(workLabels) as WorkStatus[]) {
      for (const old of [false, true]) {
        it(`${executionState}/${workStatus}/${old ? 'old' : 'recent'} retains independent semantics`, () => {
          const run: Run = { ...base, executionState, workStatus, lastContactAt: new Date(now - (old ? 3600000 : 0)).toISOString(), finishedAt: executionState === 'running' ? null : new Date(now - 1000).toISOString() };
          const live = filterRuns([run], { activity: 'live' }, context, false);
          expect(live.length).toBe(executionState === 'running' && !old ? 1 : 0);
          expect(stale(run, context)).toBe(executionState === 'running' && old);
          if (executionState !== 'running') {
            expect(activityGroup(run, context)).toBeGreaterThanOrEqual(2);
            expect(elapsed(run, now + 100000)).toBe(elapsed(run, now));
          }
        });
      }
    }
  }
  it('clearing any composition restores all records and never mutates inputs', () => {
    const original = structuredClone(seed.runs);
    for (const filters of [{ activity: 'live' as const }, { query: 'missing' }, { executionStates: ['failed' as const], models: [null] }, { projectIds: ['prj_weather'] }]) {
      filterRuns(seed.runs, filters, context, true);
      expect(filterRuns(seed.runs, {}, context, true)).toEqual(original);
    }
    expect(seed.runs).toEqual(original);
  });
  it('orders live then stale then ended review then latest other activity', () => {
    const sorted = sortRuns([...seed.runs].reverse(), { field: 'activity', direction: 'asc' }, context);
    const groups = sorted.map(run => activityGroup(run, context));
    expect(groups).toEqual([...groups].sort());
    expect(sorted.filter(run => run.executionState !== 'running').every(run => activityGroup(run, context) >= 2)).toBe(true);
  });
  it('sorts every field deterministically in either direction without changing the input', () => {
    const fields = ['activity', 'agent', 'title', 'project', 'executionState', 'workStatus', 'startedAt', 'elapsed', 'finishedAt', 'harness', 'model'] as const;
    for (const field of fields) for (const direction of ['asc', 'desc'] as const) {
      const sorted = sortRuns(seed.runs, { field, direction }, context);
      expect(sorted).toEqual(sortRuns([...seed.runs].reverse(), { field, direction }, context));
      expect(new Set(sorted.map(run => run.id)).size).toBe(seed.runs.length);
      if (field !== 'activity') expect(sortRuns(sorted, { field, direction }, context)).toEqual(sorted);
    }
  });
  it('composes all typed filters, nullable identities and inclusive time bounds', () => {
    const run = seed.runs.find(run => run.id === 'run_4')!;
    expect(filterRuns(seed.runs, { query: run.title, projectIds: [run.projectId], executionStates: ['running'], workStatuses: ['blocked'], models: [null], harnesses: [run.harness], startedAfter: run.startedAt, startedBefore: run.startedAt, activity: 'stale' }, context, true)).toEqual([run]);
    expect(filterRuns(seed.runs, { projectIds: ['missing'] }, context, false)).toEqual(seed.runs);
    expect(filterRuns([run], { startedAfter: new Date(now).toISOString() }, context, true)).toEqual([]);
    expect(filterRuns([run], { startedBefore: new Date(0).toISOString() }, context, true)).toEqual([]);
  });
  it('marks only simultaneous running executions as concurrent', () => {
    expect(isConcurrent(base, seed.runs)).toBe(true);
    expect(isConcurrent({ ...base, executionState: 'finished' }, seed.runs)).toBe(false);
    expect(isConcurrent(base, [base, { ...base, id: 'ended', executionState: 'finished' }])).toBe(false);
  });
  it('bounds pagination, handles empty lists and clamps out-of-range pages', () => {
    const items = Array.from({ length: 63 }, (_, index) => index);
    expect(paginate(items, 0).items).toHaveLength(25);
    expect(paginate(items, 99)).toMatchObject({ page: 2, start: 51, end: 63, total: 63 });
    expect(paginate([], 99)).toMatchObject({ page: 0, start: 0, end: 0, pages: 1 });
  });
});

it('shows live contact, stale contact, and nothing for a finished run', () => {
  const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const recent = { ...base, executionState: 'running' as const, lastContactAt: at(2) };
  expect(liveContact(recent, context)).toEqual({ state: 'live', relative: '2 min ago' });
  expect(stale(recent, context)).toBe(false);
  const aged = { ...recent, lastContactAt: at(20) };
  expect(liveContact(aged, context)).toEqual({ state: 'stale', relative: '20 min ago' });
  expect(stale(aged, context)).toBe(true);
  for (const executionState of ['finished', 'failed', 'cancelled'] as const) {
    expect(liveContact({ ...recent, executionState }, context)).toBeNull();
  }
});

it('formats controlled UTC time filters in local time without changing their instant', () => {
  const iso = '2026-10-15T12:00:00Z';
  expect(Date.parse(dateTimeInput(iso))).toBe(Date.parse(iso));
  expect(dateTimeInput(undefined)).toBe('');
  expect(dateTimeInput('invalid')).toBe('');
});
