// Owner: T0-03. Final slot contract; placeholder body intentionally contains no grid implementation.
import type { ExecutionState, Project, Run, WorkStatus, LogicalAgent } from '../../domain/types';
export interface RunGridSort { field: 'activity' | 'agent' | 'title' | 'project' | 'executionState' | 'workStatus' | 'startedAt' | 'elapsed' | 'finishedAt' | 'harness' | 'model'; direction: 'asc' | 'desc' }
export interface RunGridFilters {
  query?: string; projectIds?: string[]; executionStates?: ExecutionState[]; workStatuses?: WorkStatus[];
  harnesses?: (string | null)[]; models?: (string | null)[]; startedAfter?: string; startedBefore?: string;
  activity?: 'all' | 'live' | 'stale' | 'review' | 'completed';
}
/** Omit state props for uncontrolled mode; default* seeds it. Controlled props pair with on*Change.
 * Lists supply full history. Expansion IDs also support the route's optional ?run= deep link.
 * Owner implements active-first default and bounded pagination internally.
 */
export interface RunGridProps {
  runs: readonly Run[]; showProjectColumn?: boolean; projects?: readonly Project[]; agents?: readonly LogicalAgent[];
  sort?: RunGridSort; defaultSort?: RunGridSort; onSortChange?: (sort: RunGridSort) => void;
  filters?: RunGridFilters; defaultFilters?: RunGridFilters; onFiltersChange?: (filters: RunGridFilters) => void;
  expandedRunIds?: readonly string[]; defaultExpandedRunIds?: readonly string[]; onExpandedRunIdsChange?: (ids: string[]) => void;
}
export function RunGrid({ showProjectColumn = false }: RunGridProps) { return <section className="slot" aria-label="Agent runs"><h2>Agent runs</h2><p>{showProjectColumn ? 'Cross-project run grid' : 'Project run grid'} · T0-03 placeholder</p></section>; }
