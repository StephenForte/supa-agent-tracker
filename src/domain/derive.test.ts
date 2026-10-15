import { describe, expect, it } from 'vitest';
import { createClock } from './clock';
import { activeFirstProjectSortKey, compareProjectsActiveFirst, elapsed, isStale, latestActivity, nextStepSummary, projectCounts } from './derive';
import { formatElapsed, formatIdentity, formatNullable, formatTimestamp, formatToolTelemetry } from './format';
import { seedTracker } from '../data/mock/seed';
const now = Date.parse('2026-10-14T20:00:00Z');
const seed = seedTracker(now);
const base = seed.runs[0]!;
const project = seed.projects[0]!;
describe('elapsed and liveness properties', () => {
  it('running elapsed advances with an injected clock', () => { const clock = createClock(now); const before = elapsed(base, clock.now()); clock.advance(60_000); expect(elapsed(base, clock.now()) - before).toBe(60_000); });
  it.each(['finished', 'failed', 'cancelled'] as const)('%s elapsed stays frozen as time advances', executionState => { const run = { ...base, executionState, finishedAt: new Date(now - 20_000).toISOString() }; expect(elapsed(run, now)).toBe(elapsed(run, now + 86_400_000)); });
  it('uses a strict threshold and preserves reported work status', () => { const run = { ...base, workStatus: 'blocked' as const, lastContactAt: new Date(now - 15 * 60_000).toISOString() }; expect(isStale(run, project, now)).toBe(false); expect(isStale(run, project, now + 1)).toBe(true); expect(run.workStatus).toBe('blocked'); });
  it.each(['finished', 'failed', 'cancelled'] as const)('ended %s executions are never stale', executionState => { expect(isStale({ ...base, executionState }, project, now + 86_400_000)).toBe(false); });
  it('never counts finished review work as running and distinguishes concurrent agents from runs', () => {
    const runs = [{ ...base, id: 'a' }, { ...base, id: 'b' }, { ...base, id: 'c', executionState: 'finished' as const, workStatus: 'waiting_for_review' as const }, { ...base, id: 'd', lastContactAt: new Date(now - 3600_000).toISOString() }];
    expect(projectCounts(project, runs, seed.agents, now)).toMatchObject({ liveRunning: 2, liveRunningAgents: 1, staleRunning: 1, reviewNeeded: 1, totalRuns: 4 });
  });
  it('counts only the requested project and logical agent membership', () => { expect(projectCounts({ ...project, id: 'missing' }, seed.runs, seed.agents, now)).toEqual({ liveRunning: 0, liveRunningAgents: 0, staleRunning: 0, reviewNeeded: 0, totalRuns: 0, totalLogicalAgents: 0 }); });
  it('selects latest activity independently of input order and lifecycle', () => { expect(latestActivity(project.id, [...seed.runs].reverse())?.updatedAt).toBe(latestActivity(project.id, seed.runs)?.updatedAt); expect(latestActivity('missing', seed.runs)).toBeNull(); });
  it('selects the first unfinished step by stable position without mutating input', () => { const steps = [...seed.steps].reverse(); const before = structuredClone(steps); const result = nextStepSummary(steps); expect(result.first?.done).toBe(false); expect(result.remaining).toBe(steps.filter(step => !step.done).length); expect(steps).toEqual(before); expect(nextStepSummary([])).toEqual({ first: null, remaining: 0 }); });
  it('sorts live work before more recent stale-only activity with deterministic tie breaks', () => { const a = { ...project, id: 'a', name: 'Alpha' }, b = { ...project, id: 'b', name: 'Beta' }; const runs = [{ ...base, projectId: 'a' }, { ...base, projectId: 'b', lastContactAt: new Date(now - 3600_000).toISOString(), updatedAt: new Date(now).toISOString() }]; expect(compareProjectsActiveFirst(a, b, runs, now)).toBeLessThan(0); expect(activeFirstProjectSortKey(a, runs, now)[0]).toBe(0); expect(compareProjectsActiveFirst(a, b, [], now)).toBeLessThan(0); });
});
describe('honest display formatters', () => {
  it('distinguishes null from zero and unknown identities', () => { expect(formatNullable(null)).toBe('—'); expect(formatNullable(0)).toBe('0'); expect(formatIdentity(null)).toBe('Unknown'); expect(formatIdentity(' ')).toBe('Unknown'); });
  it('distinguishes absent telemetry from zero-call rows', () => { expect(formatToolTelemetry(null)).toBe('No telemetry reported'); expect(formatToolTelemetry(seed.runs[1]!.tools)).toBe('0 calls reported'); });
  it('formats frozen durations and null timestamps', () => { expect(formatElapsed(3661_000)).toBe('1h 1m 1s'); expect(formatTimestamp(null)).toBe('—'); expect(formatTimestamp('2026-10-14T20:00:00Z', 'UTC')).toContain('2026'); });
});
