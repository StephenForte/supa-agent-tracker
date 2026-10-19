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
import { useDemoAccount } from '../../app/useDemoAccount';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useNow } from '../../domain/clock';
import { elapsed } from '../../domain/derive';
import { formatElapsed, formatIdentity, formatTimestamp, shortId } from '../../domain/format';
import { additionalPrCount, agentName, dateTimeInput, executionLabels, identityOptions, isConcurrent, filterRuns, liveContact, pageForRun, paginate, primaryPr, projectName, sortRuns, workLabels, type GridContext } from '../../domain/runs/grid';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CloseRunDialog } from './CloseRunDialog';
import { MarkDoneButton } from './MarkDoneButton';
import { RunDetails } from './RunDetails';
const DESKTOP_QUERY = '(min-width: 768px)';
function desktopNow() {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY).matches : window.innerWidth >= 768;
}
function useDesktopLayout() {
  const [desktop, setDesktop] = useState(desktopNow);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return desktop;
}
function StatusMessage({ message, lines }: { message: string; lines: 1 | 2 }) {
  const text = message.trim();
  if (!text) return null;
  return <p data-latest-status className={lines === 1 ? 'mt-1 truncate text-xs text-slate-600' : 'mt-2 line-clamp-2 text-xs text-slate-600'} title={text}>{text}</p>;
}
function CloseRunButton({ run, onClose }: { run: Run; onClose: () => void }) {
  const demo = useDemoAccount();
  if (run.executionState !== 'running') return null;
  const label = demo ? 'Demo: close run' : 'Close run';
  return <button type="button" className="mt-3 block text-left text-xs underline" title={run.id} aria-label={`${label} ${shortId(run.id)}`} onClick={onClose}>{label}</button>;
}
const columns: { field: RunGridSort['field']; label: string }[] = [
  { field: 'agent', label: 'Agent / task' }, { field: 'title', label: 'Title' }, { field: 'project', label: 'Project' },
  { field: 'executionState', label: 'Execution state' }, { field: 'workStatus', label: 'Work status' },
  { field: 'startedAt', label: 'Started' }, { field: 'elapsed', label: 'Elapsed' }, { field: 'finishedAt', label: 'Finished' },
  { field: 'harness', label: 'Harness' }, { field: 'model', label: 'Model' },
];
function Liveness({ run, context }: { run: Run; context: GridContext }) {
  const contact = liveContact(run, context);
  if (!contact) return '—';
  const exact = formatTimestamp(run.lastContactAt);
  return <>
    <Badge tone={contact.state === 'stale' ? 'stale' : 'running'}>{contact.state === 'stale' ? 'Stale' : 'Live'}</Badge>
    {' '}
    <time className="whitespace-nowrap" dateTime={run.lastContactAt} title={exact}>last contact {contact.relative}<span className="sr-only">, {exact}</span></time>
  </>;
}
function MultiFilter({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (values: string[]) => void }) {
  return <label className="grid gap-1 text-sm">{label}<select multiple className="max-w-full rounded border border-slate-300 bg-white p-2" value={value} onChange={event => onChange(Array.from(event.target.selectedOptions, option => option.value))}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
export function RunGrid(props: RunGridProps) {
  const desktop = useDesktopLayout();
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
  let requestedPage = signature === pageState.signature ? pageState.index : 0;
  // Reconcile external expansion during render so collapsing never sends a later page back to page one.
  // The guard settles after one render, and also handles controlled updates without an effect waterfall.
  if (expandedKey !== pageState.expandedKey) {
    const previousIds = pageState.expandedKey.split(',');
    const addedId = expanded.filter(id => !previousIds.includes(id)).at(-1);
    if (addedId) requestedPage = pageForRun(ordered, addedId);
    setPage({ index: requestedPage, signature, expandedKey });
  }
  const page = paginate(ordered, requestedPage);
  const [closing, setClosing] = useState<Run | null>(null);
  const prFocusId = useRef<string | null>(null);
  const [prFocusRequest, setPrFocusRequest] = useState(0);
  const region = useRef<HTMLDivElement>(null);
  const filterId = useId();
  useEffect(() => {
    const id = expandedKey.split(',').at(-1);
    if (id) Array.from(region.current?.querySelectorAll<HTMLElement>('[data-run-id]') ?? []).find(row => row.dataset.runId === id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [expandedKey, page.page]);
  // +N more must land on the pull-request list. Scrolling the row leaves that list below the fold, and a second click on an already expanded row does not change expandedKey.
  useEffect(() => {
    if (!prFocusRequest || !prFocusId.current) return;
    const list = region.current?.querySelector<HTMLElement>(`#pull-requests-${CSS.escape(prFocusId.current)}`);
    if (!list) return;
    list.scrollIntoView?.({ block: 'start', inline: 'nearest' });
    list.focus({ preventScroll: true });
  }, [prFocusRequest]);
  function changeFilters(next: RunGridFilters) { if (props.filters === undefined) setLocalFilters(next); props.onFiltersChange?.(next); }
  function changeSort(next: RunGridSort) { if (props.sort === undefined) setLocalSort(next); props.onSortChange?.(next); }
  function changeExpanded(next: string[]) { if (props.expandedRunIds === undefined) setLocalExpanded(next); props.onExpandedRunIdsChange?.(next); }
  function toggle(id: string) { changeExpanded(expanded.includes(id) ? expanded.filter(value => value !== id) : [...expanded, id]); }
  function reveal(id: string, focusPullRequests = false) {
    const matchesFilters = ordered.some(run => run.id === id);
    const nextFilters = matchesFilters ? filters : {};
    if (!matchesFilters) changeFilters(nextFilters);
    const targetList = matchesFilters ? ordered : sortRuns(runs, sort, context);
    setPage({ index: pageForRun(targetList, id), signature: JSON.stringify([nextFilters, sort]), expandedKey: [...expanded.filter(value => value !== id), id].join(',') });
    changeExpanded([...expanded.filter(value => value !== id), id]);
    if (focusPullRequests) { prFocusId.current = id; setPrFocusRequest(request => request + 1); }
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
    <div ref={region}>
    {desktop ? <div className="max-w-full overflow-x-auto rounded border border-slate-200" role="region" aria-label="Run grid, scroll horizontally for all columns" tabIndex={0}>
      <table className="w-full min-w-[1100px] text-left text-sm"><caption className="sr-only">Run executions with separate execution state, work status and liveness</caption><thead className="bg-slate-50"><tr>
        {visibleColumns.map(column => <Fragment key={column.field}><th className="p-3" aria-sort={sort.field === column.field ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="rounded text-left font-semibold" onClick={() => changeSort({ field: column.field, direction: sort.field === column.field && sort.direction === 'asc' ? 'desc' : 'asc' })}>{column.label}{sort.field === column.field ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>{column.field === 'workStatus' && <><th className="p-3">Liveness</th><th className="p-3">PR</th></>}</Fragment>)}
      </tr></thead><tbody>{page.items.map(run => {
        const pr = primaryPr(run), more = additionalPrCount(run), open = expanded.includes(run.id);
        return <Fragment key={run.id}><tr data-run-id={run.id} className="border-t border-slate-200 align-top">
          <td className="p-3"><button className="text-left font-semibold underline" title={run.id} aria-expanded={open} aria-controls={`details-${run.id}`} onClick={() => toggle(run.id)}>{open ? '−' : '+'} {agentName(run, agents)}<span className="sr-only"> {shortId(run.id)}</span></button><div className="mt-1 text-xs text-slate-600" title={run.id}>{`${run.taskId ?? '—'} · ${shortId(run.id)}`}</div>{isConcurrent(run, runs) && <Badge>Concurrent</Badge>}</td>
          <td className="max-w-64 p-3 break-words">{run.title}<StatusMessage message={run.message} lines={1} /></td>
          {showProjectColumn && <td className="max-w-48 p-3 break-words"><Link to={`/projects/${run.projectId}`}>{projectName(run, projects)}</Link></td>}
          <td className="p-3"><Badge tone={run.executionState}>{executionLabels[run.executionState]}</Badge><CloseRunButton run={run} onClose={() => setClosing(run)} /></td>
          <td className="p-3"><Badge tone={run.workStatus}>{workLabels[run.workStatus]}</Badge><MarkDoneButton run={run} /></td><td className="p-3"><Liveness run={run} context={context} /></td>
          <td className="max-w-60 p-3 break-words">{pr ? <><a href={pr.url} target="_blank" rel="noopener noreferrer">#{pr.number} {pr.title}</a>{more > 0 && <button className="mt-2 block underline" onClick={() => reveal(run.id, true)}>+{more} more</button>}</> : '—'}</td>
          <td className="p-3">{formatTimestamp(run.startedAt)}</td><td className="whitespace-nowrap p-3">{formatElapsed(elapsed(run, now))}</td><td className="p-3">{formatTimestamp(run.finishedAt)}</td><td className="p-3">{formatIdentity(run.harness)}</td><td className="p-3">{formatIdentity(run.model)}</td>
        </tr>{open && <tr className="border-t border-slate-200 bg-slate-50"><td colSpan={visibleColumns.length + 2}><RunDetails run={run} runs={runs} agents={agents} projects={projects} onReveal={reveal} onBack={() => changeExpanded(expanded.filter(id => id !== run.id))} /></td></tr>}</Fragment>;
      })}</tbody></table>
    </div> : <ul className="grid max-w-full gap-3" aria-label="Run cards">{page.items.map(run => {
      const pr = primaryPr(run), more = additionalPrCount(run), open = expanded.includes(run.id);
      return <li key={run.id} data-run-id={run.id} className="max-w-full rounded border border-slate-200 p-3 text-sm">
        <button className="text-left font-semibold underline" title={run.id} aria-expanded={open} aria-controls={`details-${run.id}`} onClick={() => toggle(run.id)}>{open ? '−' : '+'} {agentName(run, agents)}<span className="sr-only"> {shortId(run.id)}</span></button>
        <p className="mt-1 break-words font-semibold">{run.title}</p>
        <p className="mt-1 text-xs text-slate-600" title={run.id}>{`${run.taskId ?? '—'} · ${shortId(run.id)}`}</p>
        {isConcurrent(run, runs) && <Badge>Concurrent</Badge>}
        <div className="mt-2 flex flex-wrap items-center gap-2"><Badge>{projectName(run, projects)}</Badge><Badge tone={run.executionState}>{executionLabels[run.executionState]}</Badge><Badge tone={run.workStatus}>{workLabels[run.workStatus]}</Badge><Liveness run={run} context={context} /></div>
        {pr && <p className="mt-2 break-words"><a href={pr.url} target="_blank" rel="noopener noreferrer">#{pr.number} {pr.title}</a>{more > 0 && <button className="mt-2 block underline" onClick={() => reveal(run.id, true)}>+{more} more</button>}</p>}
        <StatusMessage message={run.message} lines={2} />
        <CloseRunButton run={run} onClose={() => setClosing(run)} />
        <MarkDoneButton run={run} />
        {open && <RunDetails run={run} runs={runs} agents={agents} projects={projects} onReveal={reveal} onBack={() => changeExpanded(expanded.filter(id => id !== run.id))} />}
      </li>;
    })}</ul>}
    </div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status">Runs {page.start}–{page.end} of {page.total} · Page {page.page + 1} of {page.pages}</p><div className="flex gap-2"><Button disabled={page.page === 0} onClick={() => setPage({ index: page.page - 1, signature, expandedKey })}>Previous</Button><Button disabled={page.page + 1 === page.pages} onClick={() => setPage({ index: page.page + 1, signature, expandedKey })}>Next</Button></div></div></>}
    {closing && <CloseRunDialog key={closing.id} run={closing} onClose={() => setClosing(null)} />}
  </section>;
}
