import { compareProjectsActiveFirst, latestActivity, projectCounts } from '../derive';
import { formatIdentity, lifecycleLabels, projectTypeLabels } from '../format';
import type { Lifecycle, LogicalAgent, Project, ProjectType, Run } from '../types';

export interface ProjectFilters { text: string; lifecycle: string; type: string; activity: string; harness: string; tag: string }
export const defaultFilters: ProjectFilters = { text: '', lifecycle: 'unarchived', type: '', activity: '', harness: '', tag: '' };
export type ProjectSort = 'active' | 'latest' | 'name' | 'created';
/** Option labels for the project activity filter. The summary must use these words, not the stored values. */
export const projectActivityLabels = { live: 'Live running', stale: 'Stale running', 'review-needed': 'Waiting for review', blocked: 'Blocked work' } as const;
export function describeFilters(filters: ProjectFilters): string[] {
  const lifecycle = filters.lifecycle === 'unarchived' ? 'Archived hidden' : filters.lifecycle ? lifecycleLabels[filters.lifecycle as Lifecycle] ?? filters.lifecycle : 'All';
  const activity = projectActivityLabels[filters.activity as keyof typeof projectActivityLabels];
  return [filters.text.trim() && `Text: ${filters.text.trim()}`, `Lifecycle: ${lifecycle}`,
    filters.type && `Type: ${projectTypeLabels[filters.type as ProjectType] ?? filters.type}`, filters.activity && `Activity: ${activity ?? filters.activity}`, filters.harness && `Harness: ${filters.harness}`, filters.tag && `Tag: ${filters.tag}`].filter((value): value is string => !!value);
}
export function filterOptions(projects: readonly Project[], runs: readonly Run[]) {
  return { tags: [...new Set(projects.flatMap(project => project.tags))].sort(), harnesses: [...new Set(runs.map(run => formatIdentity(run.harness)))].sort() };
}
export function selectProjects(projects: readonly Project[], runs: readonly Run[], agents: readonly LogicalAgent[], filters: ProjectFilters, sort: ProjectSort, now: number) {
  const selected = projects.filter(project => {
    if (filters.lifecycle === 'unarchived' ? project.lifecycle === 'archived' : filters.lifecycle && project.lifecycle !== filters.lifecycle) return false;
    if (filters.type && project.type !== filters.type) return false;
    const text = filters.text.trim().toLowerCase();
    if (text && ![project.name, project.description, ...project.tags, project.repositoryName ?? '', project.repositoryUrl ?? ''].join(' ').toLowerCase().includes(text)) return false;
    if (filters.tag && !project.tags.includes(filters.tag)) return false;
    const ownRuns = runs.filter(run => run.projectId === project.id);
    if (filters.harness && !ownRuns.some(run => formatIdentity(run.harness) === filters.harness)) return false;
    const counts = projectCounts(project, runs, agents, now);
    if (filters.activity === 'live' && !counts.liveRunning) return false;
    if (filters.activity === 'stale' && !counts.staleRunning) return false;
    if (filters.activity === 'review-needed' && !counts.reviewNeeded) return false;
    if (filters.activity === 'blocked' && !ownRuns.some(run => run.workStatus === 'blocked')) return false;
    return true;
  });
  return selected.sort((a, b) => {
    if (sort === 'active') return compareProjectsActiveFirst(a, b, runs, now);
    const tie = a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    if (sort === 'name') return tie;
    if (sort === 'created') return Date.parse(b.createdAt) - Date.parse(a.createdAt) || tie;
    return Date.parse(latestActivity(b.id, runs)?.updatedAt ?? b.updatedAt) - Date.parse(latestActivity(a.id, runs)?.updatedAt ?? a.updatedAt) || tie;
  });
}

const projectSorts: readonly ProjectSort[] = ['latest', 'name', 'created'];

/** Defaults stay off the query string: sort Active, lifecycle Archived hidden, other filters empty. */
export function readProjectControls(params: URLSearchParams): { filters: ProjectFilters; sort: ProjectSort } {
  const lifecycle = params.get('lifecycle');
  const sort = params.get('sort');
  return {
    filters: {
      text: params.get('q') ?? '',
      lifecycle: lifecycle === null || lifecycle === 'unarchived' ? 'unarchived' : lifecycle === 'all' ? '' : lifecycle,
      type: params.get('type') ?? '',
      activity: params.get('activity') ?? '',
      harness: params.get('harness') ?? '',
      tag: params.get('tag') ?? '',
    },
    sort: projectSorts.includes(sort as ProjectSort) ? sort as ProjectSort : 'active',
  };
}

/** Preserve unrelated params such as `demo`. Omit every control that is still at its default. */
export function projectSearchParams(current: URLSearchParams, filters: ProjectFilters, sort: ProjectSort): URLSearchParams {
  const next = new URLSearchParams(current);
  const setOrDelete = (key: string, value: string) => { if (value) next.set(key, value); else next.delete(key); };
  setOrDelete('q', filters.text);
  if (filters.lifecycle === 'unarchived') next.delete('lifecycle');
  else if (filters.lifecycle === '') next.set('lifecycle', 'all');
  else next.set('lifecycle', filters.lifecycle);
  setOrDelete('type', filters.type);
  setOrDelete('activity', filters.activity);
  setOrDelete('harness', filters.harness);
  setOrDelete('tag', filters.tag);
  if (sort === 'active') next.delete('sort');
  else next.set('sort', sort);
  return next;
}
