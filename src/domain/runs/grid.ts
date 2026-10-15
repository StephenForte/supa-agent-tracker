import type { LogicalAgent, Project, Run, ExecutionState, WorkStatus } from '../types';
import { elapsed, isStale } from '../derive';
import { formatIdentity } from '../format';
import type { RunGridFilters, RunGridSort } from '../../features/runs/RunGrid';
export const executionLabels: Record<ExecutionState, string> = { running: 'Running', finished: 'Finished', failed: 'Failed', cancelled: 'Cancelled' };
export const workLabels: Record<WorkStatus, string> = { in_progress: 'In progress', blocked: 'Blocked', waiting_for_review: 'Waiting for review', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };
export interface GridContext { projects: readonly Project[]; agents: readonly LogicalAgent[]; now: number }
export const agentName = (run: Run, agents: readonly LogicalAgent[]) => agents.find(agent => agent.id === run.agentId)?.name ?? '—';
export const projectName = (run: Run, projects: readonly Project[]) => projects.find(project => project.id === run.projectId)?.name ?? '—';
export function stale(run: Run, context: GridContext) {
  const project = context.projects.find(project => project.id === run.projectId);
  return project ? isStale(run, project, context.now) : false;
}
/** Execution takes precedence: ended review work can never enter either running group. */
export function activityGroup(run: Run, context: GridContext): number {
  if (run.executionState === 'running') return stale(run, context) ? 1 : 0;
  return run.workStatus === 'waiting_for_review' ? 2 : 3;
}
export function filterRuns(runs: readonly Run[], filters: RunGridFilters, context: GridContext, showProjectColumn: boolean) {
  const query = filters.query?.trim().toLowerCase();
  return runs.filter(run => {
    if (query && ![agentName(run, context.agents), run.title, run.taskId, run.id, ...(showProjectColumn ? [projectName(run, context.projects)] : [])].join(' ').toLowerCase().includes(query)) return false;
    if (showProjectColumn && filters.projectIds?.length && !filters.projectIds.includes(run.projectId)) return false;
    if (filters.executionStates?.length && !filters.executionStates.includes(run.executionState)) return false;
    if (filters.workStatuses?.length && !filters.workStatuses.includes(run.workStatus)) return false;
    if (filters.harnesses?.length && !filters.harnesses.includes(run.harness)) return false;
    if (filters.models?.length && !filters.models.includes(run.model)) return false;
    if (filters.startedAfter && Date.parse(run.startedAt) < Date.parse(filters.startedAfter)) return false;
    if (filters.startedBefore && Date.parse(run.startedAt) > Date.parse(filters.startedBefore)) return false;
    switch (filters.activity) {
      case 'live': return run.executionState === 'running' && !stale(run, context);
      case 'stale': return stale(run, context);
      case 'review': return run.workStatus === 'waiting_for_review';
      case 'completed': return run.workStatus === 'completed';
      default: return true;
    }
  });
}
export function sortRuns(runs: readonly Run[], sort: RunGridSort, context: GridContext) {
  function value(run: Run): string | number {
    switch (sort.field) {
      case 'activity': return Date.parse(run.updatedAt);
      case 'agent': return agentName(run, context.agents);
      case 'project': return projectName(run, context.projects);
      case 'elapsed': return elapsed(run, context.now);
      case 'startedAt': return Date.parse(run.startedAt);
      case 'finishedAt': return run.finishedAt ? Date.parse(run.finishedAt) : -Infinity;
      case 'harness': case 'model': return formatIdentity(run[sort.field]);
      case 'executionState': return executionLabels[run.executionState];
      case 'workStatus': return workLabels[run.workStatus];
      default: return run.title;
    }
  }
  return [...runs].sort((a, b) => {
    if (sort.field === 'activity') {
      const group = activityGroup(a, context) - activityGroup(b, context);
      if (group) return sort.direction === 'asc' ? group : -group;
      // Active-first always uses newest activity within each group.
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id);
    }
    const x = value(a), y = value(b);
    const comparison = typeof x === 'number' && typeof y === 'number' ? (x === y ? 0 : x < y ? -1 : 1) : String(x).localeCompare(String(y));
    return comparison * (sort.direction === 'asc' ? 1 : -1) || a.id.localeCompare(b.id);
  });
}
export const primaryPr = (run: Run) => run.prReferences.find(pr => pr.primary) ?? run.prReferences[0];
export const additionalPrCount = (run: Run) => Math.max(0, run.prReferences.length - 1);
export const isConcurrent = (run: Run, runs: readonly Run[]) => run.executionState === 'running' && runs.some(other => other.id !== run.id && other.agentId === run.agentId && other.executionState === 'running');
export function executionHistory(run: Run, runs: readonly Run[]) {
  return runs.filter(other => other.agentId === run.agentId && other.id !== run.id).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.id.localeCompare(b.id));
}
export function paginate<T>(items: readonly T[], requested: number, size = 25) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(0, Math.min(requested, pages - 1));
  return { items: items.slice(page * size, (page + 1) * size), page, pages, total: items.length, start: items.length ? page * size + 1 : 0, end: Math.min((page + 1) * size, items.length) };
}
export const pageForRun = (runs: readonly Run[], id: string) => Math.max(0, Math.floor(runs.findIndex(run => run.id === id) / 25));
export const identityOptions = (runs: readonly Run[], field: 'harness' | 'model') => [...new Set(runs.map(run => run[field]))].sort((a, b) => formatIdentity(a).localeCompare(formatIdentity(b)));
/** datetime-local displays local wall time even when a controlled caller supplies UTC ISO. */
export function dateTimeInput(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
