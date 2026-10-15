import { describe, expect, it } from 'vitest';
import { seedTracker } from '../../data/mock/seed';
import type { Lifecycle, Project, Run } from '../types';
import { filterRuns, stale } from '../runs/grid';
import { activityFor, applyGridFilters, applyViewParam, initialAgentViewState, ownedScope, parseAgentView, selectAgentView, showAllRuns, viewHasNoRows, type AgentView, type AgentViewState } from './allAgents';

const now = Date.parse('2026-10-15T12:00:00Z');
const seed = seedTracker(now);
const baseRun = seed.runs[0]!;
const context = { projects: seed.projects, agents: seed.agents, now };

function project(id: string, ownerId: string, lifecycle: Lifecycle): Project {
  return { ...seed.projects[0]!, id, ownerId, lifecycle, name: id };
}
function run(id: string, projectId: string, patch: Partial<Run> = {}): Run {
  return { ...baseRun, ...patch, id, projectId };
}

describe('owned projects', () => {
  it('keeps every lifecycle the owner has and drops every other account', () => {
    const projects = [project('active', 'usr_demo', 'active'), project('archived', 'usr_demo', 'archived'), project('paused', 'usr_demo', 'paused'), project('foreign', 'usr_other', 'active'), project('foreign-archived', 'usr_other', 'archived')];
    const runs = [run('own-active', 'active'), run('own-archived', 'archived'), run('foreign-run', 'foreign'), run('orphan', 'missing')];
    const agents = seed.agents.map((agent, index) => ({ ...agent, id: `agent-${index}`, projectId: projects[index]?.id ?? 'missing' }));
    const before = structuredClone({ projects, runs, agents });
    const scope = ownedScope('usr_demo', projects, runs, agents);
    expect(scope.projects.map(item => item.id)).toEqual(['active', 'archived', 'paused']);
    expect(scope.runs.map(item => item.id)).toEqual(['own-active', 'own-archived']);
    expect(scope.agents.every(agent => ['active', 'archived', 'paused'].includes(agent.projectId))).toBe(true);
    expect(scope.projects.some(item => item.lifecycle === 'archived')).toBe(true);
    expect({ projects, runs, agents }).toEqual(before);
  });
});

describe('view presets', () => {
  const known: AgentView[] = ['active', 'live', 'review', 'completed'];
  it('maps only the four link values and treats everything else as active', () => {
    for (const view of known) {
      expect(parseAgentView(view)).toBe(view);
      expect(initialAgentViewState(view)).toMatchObject({ view, sort: { field: 'activity', direction: 'asc' }, filters: { activity: activityFor(view) } });
    }
    for (const value of [null, '', 'nope', 'LIVE', 'stale', 'all']) expect(parseAgentView(value)).toBe('active');
    expect(activityFor('active')).toBe('all');
  });

  it('composes a preset with the grid filters and lets clear drop back to active', () => {
    let state: AgentViewState = { ...initialAgentViewState(null), filters: { activity: 'all', harnesses: ['Scheduled bot'], projectIds: ['prj_weather'], query: 'daily' } };
    state = selectAgentView(state, 'live');
    expect(state).toMatchObject({ view: 'live', sort: { field: 'activity', direction: 'asc' }, filters: { activity: 'live', harnesses: ['Scheduled bot'], projectIds: ['prj_weather'], query: 'daily' } });
    state = applyGridFilters(state, { ...state.filters, activity: 'stale' });
    expect(state.view).toBeNull();
    expect(state.filters.activity).toBe('stale');
    expect(state.filters.harnesses).toEqual(['Scheduled bot']);
    state = applyGridFilters(state, {});
    expect(state).toMatchObject({ view: 'active', filters: {} });
    expect(applyGridFilters(state, {})).toEqual(state);
  });

  it('applies a linked view without discarding the filters already chosen', () => {
    const state = applyViewParam({ ...initialAgentViewState('live'), filters: { activity: 'live', models: [null] } }, 'completed');
    expect(state.filters).toEqual({ activity: 'completed', models: [null] });
    expect(applyViewParam(state, 'nope').view).toBe('active');
  });

  it('show all forgets composing filters', () => {
    expect(showAllRuns()).toEqual(initialAgentViewState('active'));
  });

  it('live activity excludes stale running work and ended review work', () => {
    const recent = run('recent', 'prj_offers', { executionState: 'running', workStatus: 'in_progress', lastContactAt: new Date(now).toISOString(), finishedAt: null });
    const old = run('old', 'prj_dashboard', { executionState: 'running', workStatus: 'blocked', lastContactAt: new Date(now - 3_600_000).toISOString(), finishedAt: null });
    const review = run('review', 'prj_offers', { executionState: 'finished', workStatus: 'waiting_for_review', finishedAt: new Date(now - 1000).toISOString() });
    const done = run('done', 'prj_weather', { executionState: 'finished', workStatus: 'completed', finishedAt: new Date(now - 1000).toISOString() });
    const runs = [recent, old, review, done];
    const live = filterRuns(runs, { activity: activityFor('live') }, context, true);
    expect(live.map(item => item.id)).toEqual(['recent']);
    expect(stale(old, context)).toBe(true);
    expect(live.some(item => item.workStatus === 'waiting_for_review' || stale(item, context))).toBe(false);
    expect(viewHasNoRows(runs, 'live', context)).toBe(false);
    expect(viewHasNoRows([old, review], 'live', context)).toBe(true);
    expect(viewHasNoRows([done], 'completed', context)).toBe(false);
    expect(viewHasNoRows(runs, 'active', context)).toBe(false);
    expect(viewHasNoRows([], 'completed', context)).toBe(false);
  });
});
