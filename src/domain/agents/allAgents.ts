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

/**
 * Signed-in owner's projects only. Archived projects stay: their history, including
 * cancelled runs, must remain reachable from this page.
 */
export function ownedScope(accountId: string, projects: readonly Project[], runs: readonly Run[], agents: readonly LogicalAgent[]) {
  const owned = projects.filter(project => project.ownerId === accountId);
  const ids = new Set(owned.map(project => project.id));
  return {
    projects: owned,
    runs: runs.filter(run => ids.has(run.projectId)),
    agents: agents.filter(agent => ids.has(agent.projectId)),
  };
}
