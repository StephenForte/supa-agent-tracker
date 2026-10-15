// Owner: T0-03. Frozen public slot contract.
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
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useNow } from '../../domain/clock';
import { elapsed } from '../../domain/derive';
import { formatElapsed, formatIdentity, formatTimestamp } from '../../domain/format';
import { additionalPrCount, agentName, dateTimeInput, executionLabels, identityOptions, isConcurrent, filterRuns, pageForRun, paginate, primaryPr, projectName, sortRuns, stale, workLabels } from '../../domain/runs/grid';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CloseRunDialog } from './CloseRunDialog';
import { RunDetails } from './RunDetails';
const columns: { field: RunGridSort['field']; label: string }[] = [
  { field: 'agent', label: 'Agent / task' }, { field: 'title', label: 'Title' }, { field: 'project', label: 'Project' },
  { field: 'executionState', label: 'Execution state' }, { field: 'workStatus', label: 'Work status' },
  { field: 'startedAt', label: 'Started' }, { field: 'elapsed', label: 'Elapsed' }, { field: 'finishedAt', label: 'Finished' },
  { field: 'harness', label: 'Harness' }, { field: 'model', label: 'Model' },
];
function MultiFilter({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (values: string[]) => void }) {
  return <label className="grid gap-1 text-sm">{label}<select multiple className="max-w-full rounded border border-slate-300 bg-white p-2" value={value} onChange={event => onChange(Array.from(event.target.selectedOptions, option => option.value))}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
export function RunGrid(props: RunGridProps) {
  const { runs, projects = [], agents = [], showProjectColumn = false } = props;
  const now = useNow();
  const context = { projects, agents, now };
  const [localSort, setLocalSort] = useState<RunGridSort>(props.defaultSort ?? { field: 'activity', direction: 'asc' });
  const [localFilters, setLocalFilters] = useState<RunGridFilters>(props.defaultFilters ?? {});
  const [localExpanded, setLocalExpanded] = useState<readonly string[]>(props.defaultExpandedRunIds ?? []);
  const sort = props.sort ?? localSort, filters = props.filters ?? localFilters, expanded = props.expandedRunIds ?? localExpanded;
  const ordered = sortRuns(filterRuns(runs, filters, context, showProjectColumn), sort, context);
  const expandedKey = expanded.join(',');
  const [pageState, setPage] = useState(() => ({ index: pageForRun(ordered, expanded.at(-1) ?? ''), signature: JSON.stringify([filters, sort]), expandedKey }));
  const signature = JSON.stringify([filters, sort]);
  const page = paginate(ordered, expandedKey !== pageState.expandedKey ? pageForRun(ordered, expanded.at(-1) ?? '') : signature === pageState.signature ? pageState.index : 0);
  const [closing, setClosing] = useState<Run | null>(null);
  const region = useRef<HTMLDivElement>(null);
  const filterId = useId();
  useEffect(() => {
    const id = expandedKey.split(',').at(-1);
    if (id) Array.from(region.current?.querySelectorAll<HTMLElement>('[data-run-id]') ?? []).find(row => row.dataset.runId === id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [expandedKey, page.page]);
  function changeFilters(next: RunGridFilters) { if (props.filters === undefined) setLocalFilters(next); props.onFiltersChange?.(next); }
  function changeSort(next: RunGridSort) { if (props.sort === undefined) setLocalSort(next); props.onSortChange?.(next); }
  function changeExpanded(next: string[]) { if (props.expandedRunIds === undefined) setLocalExpanded(next); props.onExpandedRunIdsChange?.(next); }
  function toggle(id: string) { changeExpanded(expanded.includes(id) ? expanded.filter(value => value !== id) : [...expanded, id]); }
  function reveal(id: string) {
    changeFilters({});
    const all = sortRuns(runs, sort, context);
    setPage({ index: pageForRun(all, id), signature: JSON.stringify([{}, sort]), expandedKey: [...expanded.filter(value => value !== id), id].join(',') });
    changeExpanded([...expanded.filter(value => value !== id), id]);
  }
  const visibleColumns = columns.filter(column => showProjectColumn || column.field !== 'project');
  const identityFilter = (field: 'harness' | 'model') => {
    const key = field === 'harness' ? 'harnesses' : 'models';
    return <MultiFilter label={field === 'harness' ? 'Harness' : 'Model'} options={identityOptions(runs, field).map(value => ({ value: JSON.stringify(value), label: formatIdentity(value) }))} value={(filters[key] ?? []).map(value => JSON.stringify(value))} onChange={values => changeFilters({ ...filters, [key]: values.map(value => JSON.parse(value) as string | null) })} />;
  };
  return <section className="slot !px-3 sm:!px-5" aria-label="Agent runs"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>Agent runs</h2><p className="text-sm text-slate-600">Live work first. Each execution has its own row.</p></div><Button onClick={() => changeSort({ field: 'activity', direction: 'asc' })}>Active first</Button></div>
    <label className="grid gap-1 text-sm">Search runs<input className="w-full rounded border border-slate-300 p-2" type="search" value={filters.query ?? ''} onChange={event => changeFilters({ ...filters, query: event.target.value })} /></label>
    <div className="my-3 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Activity<select className="rounded border p-2" value={filters.activity ?? 'all'} onChange={event => changeFilters({ ...filters, activity: event.target.value as RunGridFilters['activity'] })}>{[['all', 'All activity'], ['live', 'Live running'], ['stale', 'Stale'], ['review', 'Waiting for review'], ['completed', 'Completed']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm">Sort by<select className="rounded border p-2" value={sort.field} onChange={event => changeSort({ ...sort, field: event.target.value as RunGridSort['field'] })}><option value="activity">Activity (active first)</option>{visibleColumns.map(column => <option key={column.field} value={column.field}>{column.label}</option>)}</select></label><label className="grid gap-1 text-sm">Sort direction<select className="rounded border p-2" value={sort.direction} onChange={event => changeSort({ ...sort, direction: event.target.value as RunGridSort['direction'] })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><Button onClick={() => changeFilters({})}>Clear filters</Button></div>
    <details className="my-3"><summary>More filters</summary><div id={filterId} className="grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-3">
      {showProjectColumn && <MultiFilter label="Projects" options={projects.map(project => ({ value: project.id, label: project.name }))} value={filters.projectIds ?? []} onChange={values => changeFilters({ ...filters, projectIds: values })} />}
      <MultiFilter label="Execution states" options={Object.entries(executionLabels).map(([value, label]) => ({ value, label }))} value={filters.executionStates ?? []} onChange={values => changeFilters({ ...filters, executionStates: values as ExecutionState[] })} />
      <MultiFilter label="Work statuses" options={Object.entries(workLabels).map(([value, label]) => ({ value, label }))} value={filters.workStatuses ?? []} onChange={values => changeFilters({ ...filters, workStatuses: values as WorkStatus[] })} />
      {identityFilter('harness')}{identityFilter('model')}
      <label className="grid min-w-0 gap-1 text-sm">Started after<input className="min-w-0 max-w-full rounded border p-2" type="datetime-local" value={dateTimeInput(filters.startedAfter)} onChange={event => changeFilters({ ...filters, startedAfter: event.target.value })} /></label>
      <label className="grid min-w-0 gap-1 text-sm">Started before<input className="min-w-0 max-w-full rounded border p-2" type="datetime-local" value={dateTimeInput(filters.startedBefore)} onChange={event => changeFilters({ ...filters, startedBefore: event.target.value })} /></label>
    </div></details>
    {!runs.length ? <p>No runs yet. Reported executions will appear here.</p> : !ordered.length ? <p role="status">No runs match these filters. <button className="underline" onClick={() => changeFilters({})}>Clear all filters</button></p> : <>
    <div ref={region} className="max-w-full overflow-x-auto rounded border border-slate-200" role="region" aria-label="Run grid, scroll horizontally for all columns" tabIndex={0}>
      <table className="w-full min-w-[1100px] text-left text-sm"><caption className="sr-only">Run executions with separate execution state, work status and liveness</caption><thead className="bg-slate-50"><tr>
        {visibleColumns.map(column => <Fragment key={column.field}><th className="p-3" aria-sort={sort.field === column.field ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="rounded text-left font-semibold" onClick={() => changeSort({ field: column.field, direction: sort.field === column.field && sort.direction === 'asc' ? 'desc' : 'asc' })}>{column.label}{sort.field === column.field ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>{column.field === 'workStatus' && <><th className="p-3">Liveness</th><th className="p-3">PR</th></>}</Fragment>)}
      </tr></thead><tbody>{page.items.map(run => {
        const pr = primaryPr(run), more = additionalPrCount(run), open = expanded.includes(run.id);
        return <Fragment key={run.id}><tr data-run-id={run.id} className="border-t border-slate-200 align-top">
          <td className="p-3"><button className="text-left font-semibold underline" aria-expanded={open} aria-controls={`details-${run.id}`} onClick={() => toggle(run.id)}>{open ? '−' : '+'} {agentName(run, agents)}<span className="sr-only"> {run.id}</span></button><div className="mt-1 text-xs text-slate-600">{run.taskId ?? '—'} · {run.id}</div>{isConcurrent(run, runs) && <Badge>Concurrent</Badge>}</td>
          <td className="max-w-64 p-3 break-words">{run.title}</td>
          {showProjectColumn && <td className="max-w-48 p-3 break-words"><Link to={`/projects/${run.projectId}`}>{projectName(run, projects)}</Link></td>}
          <td className="p-3"><Badge tone={run.executionState}>{executionLabels[run.executionState]}</Badge>{run.executionState === 'running' && <button className="mt-3 block text-left text-xs underline" onClick={() => setClosing(run)}>Demo: close {run.id}</button>}</td>
          <td className="p-3"><Badge tone={run.workStatus}>{workLabels[run.workStatus]}</Badge></td><td className="p-3">{stale(run, context) ? <Badge tone="stale">Stale</Badge> : '—'}</td>
          <td className="max-w-60 p-3 break-words">{pr ? <><a href={pr.url} target="_blank" rel="noopener noreferrer">#{pr.number} {pr.title}</a>{more > 0 && <button className="mt-2 block underline" onClick={() => reveal(run.id)}>+{more} more</button>}</> : '—'}</td>
          <td className="p-3">{formatTimestamp(run.startedAt)}</td><td className="whitespace-nowrap p-3">{formatElapsed(elapsed(run, now))}</td><td className="p-3">{formatTimestamp(run.finishedAt)}</td><td className="p-3">{formatIdentity(run.harness)}</td><td className="p-3">{formatIdentity(run.model)}</td>
        </tr>{open && <tr className="border-t border-slate-200 bg-slate-50"><td colSpan={visibleColumns.length + 2}><RunDetails run={run} runs={runs} onReveal={reveal} /></td></tr>}</Fragment>;
      })}</tbody></table>
    </div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status">Runs {page.start}–{page.end} of {page.total} · Page {page.page + 1} of {page.pages}</p><div className="flex gap-2"><Button disabled={page.page === 0} onClick={() => setPage({ index: page.page - 1, signature, expandedKey })}>Previous</Button><Button disabled={page.page + 1 === page.pages} onClick={() => setPage({ index: page.page + 1, signature, expandedKey })}>Next</Button></div></div></>}
    {closing && <CloseRunDialog key={closing.id} run={closing} onClose={() => setClosing(null)} />}
  </section>;
}
