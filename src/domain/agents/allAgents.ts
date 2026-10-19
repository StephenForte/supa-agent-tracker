import type { RunGridFilters, RunGridSort } from '../../features/runs/RunGrid';
import type { LogicalAgent, Project, Run } from '../types';
import { filterRuns, type GridContext } from '../runs/grid';

export const agentViews = ['active', 'live', 'review', 'completed'] as const;
export type AgentView = (typeof agentViews)[number];
export const agentViewLabels: Record<AgentView, string> = {
  active: 'Active',
  live: 'Live',
  review: 'Waiting for review',
  completed: 'Completed',
};
export const activeFirstSort: RunGridSort = { field: 'activity', direction: 'asc' };

export interface AgentViewState {
  view: AgentView | null;
  sort: RunGridSort;
  filters: RunGridFilters;
}

/** Unknown and absent params both open the default Active view. */
export function parseAgentView(value: string | null): AgentView {
  return value === 'live' || value === 'review' || value === 'completed' || value === 'active' ? value : 'active';
}

export function activityFor(view: AgentView): NonNullable<RunGridFilters['activity']> {
  return view === 'active' ? 'all' : view;
}

export function initialAgentViewState(param: string | null): AgentViewState {
  const view = parseAgentView(param);
  return { view, sort: activeFirstSort, filters: { activity: activityFor(view) } };
}

/** Preset click: replace activity and return to active-first order. Other filters stay. */
export function selectAgentView(state: AgentViewState, view: AgentView): AgentViewState {
  return { view, sort: activeFirstSort, filters: { ...state.filters, activity: activityFor(view) } };
}

export function showAllRuns(): AgentViewState {
  return initialAgentViewState('active');
}

export function applyGridSort(state: AgentViewState, sort: RunGridSort): AgentViewState {
  return { ...state, sort };
}

/**
 * Grid filter changes compose with the preset. An empty filter object is the grid's
 * Clear control: drop every field and return to Active. Stale is a grid activity with
 * no preset, so the view becomes unset until the next preset or clear.
 */
export function applyGridFilters(state: AgentViewState, next: RunGridFilters): AgentViewState {
  if (Object.keys(next).length === 0) return { view: 'active', sort: state.sort, filters: {} };
  return { view: viewFromActivity(next.activity), sort: state.sort, filters: next };
}

export function applyViewParam(state: AgentViewState, param: string | null): AgentViewState {
  return selectAgentView(state, parseAgentView(param));
}

function viewFromActivity(activity: RunGridFilters['activity'] | undefined): AgentView | null {
  switch (activity) {
    case 'live':
    case 'review':
    case 'completed':
      return activity;
    case 'all':
    case undefined:
      return 'active';
    default:
      return null;
  }
}

/** True only when the preset itself matches nothing. An empty run list stays the grid's empty state. */
export function viewHasNoRows(runs: readonly Run[], view: AgentView, context: GridContext): boolean {
  return runs.length > 0 && filterRuns(runs, { activity: activityFor(view) }, context, true).length === 0;
}

export interface OwnedScope {
  projects: Project[];
  runs: Run[];
  agents: LogicalAgent[];
  /** Owned runs on archived projects that are not in `runs`. */
  hiddenArchivedRunCount: number;
}

export function hiddenArchivedRunsLine(count: number): string | null {
  if (count < 1) return null;
  return `${count === 1 ? '1 run' : `${count} runs`} from archived projects hidden`;
}

/**
 * Signed-in owner's projects only. Archived projects are omitted unless
 * includeArchived is set, so their runs stay out of the default view.
 * A deep link can add one of those runs back without turning the rest on.
 */
export function ownedScope(accountId: string, projects: readonly Project[], runs: readonly Run[], agents: readonly LogicalAgent[], options?: { includeArchived?: boolean }): OwnedScope {
  const owned = projects.filter(project => project.ownerId === accountId);
  const archivedIds = new Set(owned.filter(project => project.lifecycle === 'archived').map(project => project.id));
  const visible = options?.includeArchived ? owned : owned.filter(project => project.lifecycle !== 'archived');
  const visibleIds = new Set(visible.map(project => project.id));
  const ownedIds = new Set(owned.map(project => project.id));
  const ownedRuns = runs.filter(run => ownedIds.has(run.projectId));
  return {
    projects: visible,
    runs: options?.includeArchived ? ownedRuns : ownedRuns.filter(run => visibleIds.has(run.projectId)),
    agents: agents.filter(agent => visibleIds.has(agent.projectId)),
    hiddenArchivedRunCount: options?.includeArchived ? 0 : ownedRuns.filter(run => archivedIds.has(run.projectId)).length,
  };
}

/** Keep a `?run=` target visible when its project is archived and the rest stay hidden. */
export function openArchivedRun(scope: OwnedScope, source: { accountId: string; projects: readonly Project[]; runs: readonly Run[]; agents: readonly LogicalAgent[] }, runId: string | null): OwnedScope & { notice: string | null } {
  if (!runId || scope.runs.some(run => run.id === runId)) return { ...scope, notice: null };
  const run = source.runs.find(item => item.id === runId);
  const project = run && source.projects.find(item => item.id === run.projectId && item.ownerId === source.accountId && item.lifecycle === 'archived');
  if (!run || !project) return { ...scope, notice: null };
  const knownAgents = new Set(scope.agents.map(agent => agent.id));
  return {
    projects: scope.projects.some(item => item.id === project.id) ? scope.projects : [...scope.projects, project],
    runs: [...scope.runs, run],
    agents: [...scope.agents, ...source.agents.filter(agent => agent.projectId === project.id && !knownAgents.has(agent.id))],
    hiddenArchivedRunCount: Math.max(0, scope.hiddenArchivedRunCount - 1),
    notice: `Showing ${run.id} from archived project ${project.name}.`,
  };
}
