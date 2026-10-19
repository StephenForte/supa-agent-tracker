import { describe, expect, it } from 'vitest';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../clock';
import { defaultFilters, describeFilters, filterOptions, projectSearchParams, readProjectControls, selectProjects } from './dashboard';
import { draftInput, projectDraft, validateDraft } from './form';
const now = Date.parse('2026-10-14T20:00:00Z');
async function data() {
  const { tracker } = createDemoSources({ clock: createClock(now) });
  return { projects: await tracker.listProjects(), runs: await tracker.listRuns(), agents: await tracker.listAgents() };
}
describe('project selection', () => {
  it('prioritizes live executions, then activity, and hides archives by default without mutating inputs', async () => {
    const { projects, runs, agents } = await data();
    const original = projects.map(project => project.id);
    expect(selectProjects(projects, runs, agents, defaultFilters, 'active', now).map(project => project.id)).toEqual(['prj_offers', 'prj_dashboard', 'prj_weather']);
    expect(projects.map(project => project.id)).toEqual(original);
    expect(selectProjects(projects, runs, agents, { ...defaultFilters, activity: 'live' }, 'active', now).map(project => project.id)).toEqual(['prj_offers']);
    expect(selectProjects(projects, runs, agents, { ...defaultFilters, activity: 'stale' }, 'active', now).map(project => project.id)).toEqual(['prj_dashboard']);
    expect(selectProjects(projects, runs, agents, { ...defaultFilters, activity: 'review-needed' }, 'active', now).map(project => project.id)).toEqual(['prj_offers']);
  });
  it('composes every filter, including unknown harness, blocked and archived', async () => {
    const { projects, runs, agents } = await data();
    const project = projects.find(project => project.id === 'prj_dashboard')!;
    const filters = { ...defaultFilters, text: project.repositoryName!.toUpperCase(), type: 'coding', lifecycle: 'active', activity: 'blocked', harness: 'Unknown', tag: project.tags[0]! };
    expect(selectProjects(projects, runs, agents, filters, 'name', now)).toEqual([project]);
    expect(describeFilters(filters)).toEqual(['Text: EXAMPLE-ORG/DASHBOARD', 'Lifecycle: Active', 'Type: Coding', 'Activity: Blocked work', 'Harness: Unknown', 'Tag: product']);
    expect(selectProjects(projects, runs, agents, { ...filters, type: 'automation' }, 'name', now)).toEqual([]);
    expect(selectProjects(projects, runs, agents, { ...defaultFilters, lifecycle: 'archived' }, 'name', now).map(project => project.id)).toEqual(['prj_archive']);
    expect(filterOptions(projects, runs).harnesses).toContain('Unknown');
  });
  it('searches name, description, tags, repository name and URL case insensitively', async () => {
    const { projects, runs, agents } = await data();
    const project = projects[0]!;
    for (const text of [project.name, project.description, project.tags[0]!, project.repositoryName!, project.repositoryUrl!]) {
      expect(selectProjects(projects, runs, agents, { ...defaultFilters, lifecycle: '', text: ` ${text.toUpperCase()} ` }, 'name', now)).toContainEqual(project);
    }
  });
  it('orders name, latest activity and creation independently with stable tie breaks', async () => {
    const { projects, runs, agents } = await data();
    const first = { ...projects[0]!, id: 'z', name: 'Alpha', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
    const second = { ...first, id: 'a', name: 'Zulu', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' };
    expect(selectProjects([second, first], runs, agents, defaultFilters, 'name', now)).toEqual([first, second]);
    for (const sort of ['latest', 'created'] as const) expect(selectProjects([first, second], runs, agents, defaultFilters, sort, now)).toEqual([second, first]);
  });
  it('keeps sort and filters in the query and leaves defaults out of it', () => {
    expect(readProjectControls(new URLSearchParams())).toEqual({ filters: defaultFilters, sort: 'active' });
    expect(projectSearchParams(new URLSearchParams(), defaultFilters, 'active').toString()).toBe('');
    const filters = { ...defaultFilters, text: 'weather', lifecycle: '', activity: 'stale' };
    const params = projectSearchParams(new URLSearchParams('demo=empty'), filters, 'name');
    expect(params.toString()).toBe('demo=empty&q=weather&lifecycle=all&activity=stale&sort=name');
    expect(readProjectControls(params)).toEqual({ filters, sort: 'name' });
    expect(projectSearchParams(params, defaultFilters, 'active').toString()).toBe('demo=empty');
    expect(readProjectControls(new URLSearchParams('sort=nope&lifecycle=archived'))).toEqual({ filters: { ...defaultFilters, lifecycle: 'archived' }, sort: 'active' });
  });
});
it('normalizes optional form fields, preserves reporting preferences and rejects unsafe links and bad thresholds', () => {
  const draft = { ...projectDraft(), name: ' Example ', tags: 'one, two, one, ', repositoryName: ' ', staleThresholdMinutes: '2.5' };
  expect(draftInput(draft)).toMatchObject({ name: 'Example', tags: ['one', 'two'], repositoryName: null, repositoryUrl: null, reportingPolicy: { staleThresholdMinutes: 2.5 } });
  expect(validateDraft(draft)).toEqual({});
  expect(validateDraft({ ...draft, name: ' ', repositoryUrl: 'javascript:alert(1)', prdUrl: 'missing', staleThresholdMinutes: '0' })).toHaveProperty('repositoryUrl');
  for (const value of ['0', '-1', '', 'NaN', 'Infinity']) expect(validateDraft({ ...draft, staleThresholdMinutes: value })).toHaveProperty('staleThresholdMinutes');
});
