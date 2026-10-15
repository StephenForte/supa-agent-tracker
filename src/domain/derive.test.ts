import { describe, expect, it } from 'vitest';
import { createClock } from './clock';
import { activeFirstProjectSortKey, compareProjectsActiveFirst, elapsed, isStale, latestActivity, nextStepSummary, projectCounts } from './derive';
import { formatDescription, formatElapsed, formatIdentity, formatNullable, formatTimestamp, formatToolTelemetry, lifecycleLabels, prdPresentation, projectCountLabels, projectsShownLine, projectTypeLabels, repositoryPresentation } from './format';
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
  it('formats frozen durations and null timestamps', () => {
    expect(formatElapsed(45_000)).toBe('45s');
    expect(formatElapsed(1_319_000)).toBe('21m 59s');
    expect(formatElapsed(3_661_000)).toBe('1h 1m 1s');
    expect(formatElapsed(3_600_000)).toBe('1h 0m 0s');
    expect(formatElapsed(0)).toBe('0s');
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp('2026-10-14T20:00:00Z', 'UTC')).toContain('2026');
  });
  it('states which projects are shown without counting hidden archived projects in a total', () => {
    expect(projectsShownLine(3, 1, 0)).toBe('3 projects shown · 1 archived hidden');
    expect(projectsShownLine(4, 0, 0)).toBe('4 projects shown');
    expect(projectsShownLine(1, 0, 0)).toBe('1 project shown');
    expect(projectsShownLine(1, 1, 2)).toBe('1 project shown · 2 hidden by filters · 1 archived hidden');
    expect(projectsShownLine(1, 0, 3)).toBe('1 project shown · 3 hidden by filters');
  });
  it('uses one vocabulary for project type, lifecycle, counts and missing links', () => {
    expect(projectTypeLabels).toEqual({ coding: 'Coding', automation: 'Automation' });
    expect(lifecycleLabels.archived).toBe('Archived');
    expect(projectCountLabels.map(([, label]) => label)).toEqual(['Live running', 'Stale running', 'Waiting for review', 'Live logical agents', 'Logical agents', 'Runs']);
    expect(formatDescription('  ')).toBe('No description yet.');
    expect(repositoryPresentation({ repositoryName: null, repositoryUrl: null })).toEqual({ href: null, text: 'Repository: —' });
    expect(prdPresentation({ prdUrl: 'https://github.com/example-org/offers/blob/main/docs/PRD.md' }).text).toBe('Project PRD');
    expect(prdPresentation({ prdUrl: null })).toEqual({ href: null, text: 'PRD: —' });
  });
});
