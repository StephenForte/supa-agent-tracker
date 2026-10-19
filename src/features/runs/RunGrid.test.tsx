import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { DataProvider } from '../../data/hooks';
import { systemClock } from '../../domain/clock';
import { RunGrid } from './RunGrid';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { seedTracker } from '../../data/mock/seed';
const seed = seedTracker(Date.now());
const props = { runs: seed.runs, projects: seed.projects, agents: seed.agents };
function show(extra = {}) { return render(<MemoryRouter><RunGrid {...props} {...extra} /></MemoryRouter>); }
const row = (id: string) => document.querySelector<HTMLElement>(`[data-run-id="${id}"]`)!;
afterEach(() => vi.useRealTimers());
it('keeps concurrent rows separate, distinguishes stale/work and exposes complete handoffs', async () => {
  show();
  expect(within(row('run_1')).getByText('Concurrent')).toBeVisible();
  expect(within(row('run_2')).getByText('Concurrent')).toBeVisible();
  expect(within(row('run_4')).getByText('Blocked')).toBeVisible();
  expect(within(row('run_4')).getByText('Stale')).toBeVisible();
  expect(within(row('run_4')).getByText('Unknown')).toBeVisible();
  expect(within(row('run_3')).queryByText('Stale')).toBeNull();
  fireEvent.click(within(row('run_1')).getByRole('button', { expanded: false }));
  expect(screen.getByText('No telemetry reported')).toBeVisible();
  fireEvent.click(within(row('run_2')).getByRole('button', { expanded: false }));
  expect(screen.getByText('0 calls reported')).toBeVisible();
  expect(screen.getByRole('cell', { name: 'shell' })).toBeVisible();
  expect(screen.getByRole('cell', { name: 'Shell' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
  expect(screen.getByText('8 calls reported')).toBeVisible();
  const toolRow = screen.getByRole('cell', { name: 'edit_file' }).closest('tr')!;
  expect(within(toolRow).getByRole('cell', { name: '8' })).toBeVisible();
  expect(within(toolRow).getByRole('cell', { name: '7' })).toBeVisible();
  expect(within(toolRow).getByRole('cell', { name: '1' })).toBeVisible();
  expect(screen.getAllByText('Status timeline')).toHaveLength(3);
});
it('supports keyboard expansion and sort plus no-match clearing without discarding runs', async () => {
  const user = userEvent.setup(); show();
  const expand = within(row('run_3')).getByRole('button', { expanded: false });
  expand.focus(); await user.keyboard('{Enter}'); expect(expand).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Enter}'); expect(expand).toHaveAttribute('aria-expanded', 'false');
  const sort = screen.getByRole('button', { name: 'Title' }); sort.focus(); await user.keyboard('{Enter}');
  expect(sort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
  await user.keyboard('{Enter}'); expect(sort.closest('th')).toHaveAttribute('aria-sort', 'descending');
  await user.type(screen.getByRole('searchbox'), 'no such run'); expect(screen.getByText(/No runs match/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear all filters' })); expect(row('run_3')).toBeInTheDocument();
});
it('honors controlled state and reports changes without changing it internally', () => {
  const onSortChange = vi.fn(), onFiltersChange = vi.fn(), onExpandedRunIdsChange = vi.fn();
  const view = show({ sort: { field: 'title', direction: 'asc' }, filters: {}, expandedRunIds: [], onSortChange, onFiltersChange, onExpandedRunIdsChange });
  fireEvent.click(screen.getByRole('button', { name: 'Title ↑' })); expect(onSortChange).toHaveBeenCalledWith({ field: 'title', direction: 'desc' });
  expect(screen.getByRole('button', { name: 'Title ↑' })).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'abc' } }); expect(onFiltersChange).toHaveBeenCalledWith({ query: 'abc' }); expect(screen.getByRole('searchbox')).toHaveValue('');
  fireEvent.click(within(row('run_3')).getByRole('button', { expanded: false })); expect(onExpandedRunIdsChange).toHaveBeenCalledWith(['run_3']);
  view.rerender(<MemoryRouter><RunGrid {...props} expandedRunIds={['run_3']} /></MemoryRouter>); expect(screen.getByText('Run handoff')).toBeVisible();
});
it('paginates full histories, reveals linked targets off page and renders project links', () => {
  const original = props.runs[0]!;
  const many = Array.from({ length: 63 }, (_, index) => ({ ...original, id: `generated_${String(index).padStart(2, '0')}`, parentRunId: index === 0 ? 'generated_62' : null }));
  show({ runs: many, showProjectColumn: true, defaultExpandedRunIds: ['generated_00'] });
  expect(screen.getByText('Runs 1–25 of 63 · Page 1 of 3')).toBeVisible();
  expect(within(row('generated_00')).getByRole('link', { name: 'Offers workspace' })).toHaveAttribute('href', '/projects/prj_offers');
  fireEvent.click(screen.getAllByTitle('generated_62')[0]!);
  expect(row('generated_62')).toBeInTheDocument();
  expect(within(row('generated_62')).getByRole('button', { expanded: true })).toBeVisible();
  expect(screen.getByText('Runs 51–63 of 63 · Page 3 of 3')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' })); expect(screen.getByText('Runs 26–50 of 63 · Page 2 of 3')).toBeVisible();
});
it('applies activity and nullable identity filters and handles empty data', () => {
  const view = show(); fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'stale' } });
  expect(row('run_4')).toBeInTheDocument(); expect(row('run_1')).toBeNull();
  fireEvent.click(screen.getByText('More filters'));
  const model = screen.getByLabelText('Model') as HTMLSelectElement;
  for (const option of model.options) option.selected = option.value === 'null';
  fireEvent.change(model); expect(row('run_4')).toBeInTheDocument();
  view.rerender(<MemoryRouter><RunGrid runs={[]} /></MemoryRouter>); expect(screen.getByText(/No runs yet/)).toBeVisible();
});
it('advances running and stale elapsed while ended elapsed remains frozen', async () => {
  let now = Date.now();
  let tick = () => {};
  vi.spyOn(systemClock, 'getSnapshot').mockImplementation(() => now);
  vi.spyOn(systemClock, 'subscribe').mockImplementation(listener => { tick = listener; return () => {}; });
  show();
  const elapsedCell = (id: string) => within(row(id)).getAllByRole('cell')[7]!.textContent;
  const live = elapsedCell('run_1'), old = elapsedCell('run_4'), ended = elapsedCell('run_3');
  await act(async () => { now += 3000; tick(); });
  expect(elapsedCell('run_1')).not.toBe(live);
  expect(elapsedCell('run_4')).not.toBe(old); expect(elapsedCell('run_3')).toBe(ended);
});
it('moves to a controlled expansion on another page and distinguishes reported empty telemetry', () => {
  const original = props.runs[0]!;
  const many = Array.from({ length: 63 }, (_, index) => ({ ...original, id: `generated_${String(index).padStart(2, '0')}`, tools: [] }));
  const view = show({ runs: many, expandedRunIds: [] });
  view.rerender(<MemoryRouter><RunGrid {...props} runs={many} expandedRunIds={['generated_62']} /></MemoryRouter>);
  expect(row('generated_62')).toBeInTheDocument(); expect(screen.getByText('0 calls reported')).toBeVisible();
  expect(screen.queryByText('No telemetry reported')).toBeNull();
  expect(screen.getByText('1–5 of 62')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show more history' })); expect(screen.getByText('6–10 of 62')).toBeVisible();
  view.rerender(<MemoryRouter><RunGrid {...props} runs={many} expandedRunIds={[]} /></MemoryRouter>);
  expect(screen.getByText('Runs 51–63 of 63 · Page 3 of 3')).toBeVisible();
});
it('shows Live or Stale with last contact, and a dash once the run has ended', async () => {
  const fixed = Date.parse('2026-10-15T12:00:00.000Z');
  let now = fixed;
  let tick = () => {};
  vi.spyOn(systemClock, 'getSnapshot').mockImplementation(() => now);
  vi.spyOn(systemClock, 'subscribe').mockImplementation(listener => { tick = listener; return () => {}; });
  const project = { ...seed.projects[0]!, reportingPolicy: { ...seed.projects[0]!.reportingPolicy, staleThresholdMinutes: 15 } };
  const contacted = (id: string, minutes: number, executionState: 'running' | 'finished') => ({
    ...seed.runs[0]!, id, projectId: project.id, executionState, lastContactAt: new Date(fixed - minutes * 60_000).toISOString(),
    finishedAt: executionState === 'running' ? null : new Date(fixed).toISOString(),
  });
  try {
    show({ runs: [contacted('live_run', 2, 'running'), contacted('stale_run', 20, 'running'), contacted('done_run', 2, 'finished')], projects: [project], agents: [] });
    const cell = (id: string) => within(row(id)).getAllByRole('cell')[4]!;
    expect(cell('live_run')).toHaveTextContent('Live');
    expect(cell('live_run')).toHaveTextContent('last contact 2 min ago');
    expect(cell('live_run').querySelector('time')).toHaveAttribute('datetime', contacted('live_run', 2, 'running').lastContactAt);
    expect(cell('live_run').querySelector('time')).toHaveAttribute('title');
    expect(cell('stale_run')).toHaveTextContent('Stale');
    expect(cell('stale_run')).toHaveTextContent('last contact 20 min ago');
    expect(cell('done_run')).toHaveTextContent('—');
    expect(cell('done_run')).not.toHaveTextContent('Live');
    expect(cell('done_run')).not.toHaveTextContent('ago');
    await act(async () => { now += 60_000; tick(); });
    expect(cell('live_run')).toHaveTextContent('last contact 3 min ago');
  } finally {
    vi.restoreAllMocks();
  }
});
it('renders every sort control and every filter kind as usable state changes', () => {
  show({ showProjectColumn: true });
  const sort = screen.getByLabelText('Sort by') as HTMLSelectElement;
  for (const option of sort.options) {
    fireEvent.change(sort, { target: { value: option.value } });
    expect(sort).toHaveValue(option.value);
    fireEvent.change(screen.getByLabelText('Sort direction'), { target: { value: 'desc' } });
    expect(screen.getByLabelText('Sort direction')).toHaveValue('desc');
  }
  fireEvent.click(screen.getByText('More filters'));
  const select = (name: string, value: string) => {
    const field = screen.getByLabelText(name) as HTMLSelectElement;
    for (const option of field.options) option.selected = option.value === value;
    fireEvent.change(field);
  };
  select('Projects', 'prj_dashboard'); select('Execution states', 'running'); select('Work statuses', 'blocked'); select('Model', 'null'); select('Harness', JSON.stringify('Example coding harness'));
  fireEvent.change(screen.getByLabelText('Started after'), { target: { value: '2000-01-01T00:00' } });
  fireEvent.change(screen.getByLabelText('Started before'), { target: { value: '2099-01-01T00:00' } });
  expect(document.querySelectorAll('[data-run-id]')).toHaveLength(1); expect(row('run_4')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })); expect(document.querySelectorAll('[data-run-id]')).toHaveLength(10);
});

it('opening additional PRs preserves every active filter and the filtered page', () => {
  const review = props.runs.find(run => run.id === 'run_3')!;
  const many = Array.from({ length: 63 }, (_, index) => ({ ...review, id: `generated_${String(index).padStart(2, '0')}`, title: index < 30 ? 'Other work' : 'Keep me' }));
  const onFiltersChange = vi.fn();
  show({ runs: many, defaultSort: { field: 'agent', direction: 'asc' }, defaultFilters: { query: 'Keep me', activity: 'review', executionStates: ['finished'], workStatuses: ['waiting_for_review'], harnesses: [review.harness], models: [review.model], startedAfter: '2000-01-01T00:00', startedBefore: '2099-01-01T00:00' }, onFiltersChange });
  fireEvent.click(within(row('generated_30')).getByRole('button', { name: '+1 more' }));
  expect(screen.getByRole('searchbox')).toHaveValue('Keep me');
  expect(screen.getByLabelText('Activity')).toHaveValue('review');
  expect(screen.getByLabelText('Execution states')).toHaveValue(['finished']);
  expect(screen.getByLabelText('Work statuses')).toHaveValue(['waiting_for_review']);
  expect(screen.getByLabelText('Harness')).toHaveValue([JSON.stringify(review.harness)]);
  expect(screen.getByLabelText('Model')).toHaveValue([JSON.stringify(review.model)]);
  expect(screen.getByLabelText('Started after')).toHaveValue('2000-01-01T00:00');
  expect(screen.getByLabelText('Started before')).toHaveValue('2099-01-01T00:00');
  expect(screen.getByText('Runs 1–25 of 33 · Page 1 of 2')).toBeVisible();
  expect(within(row('generated_30')).getByRole('button', { expanded: true })).toBeVisible();
  expect(onFiltersChange).not.toHaveBeenCalled();
});
function pullRequests(id = 'run_3') {
  const list = document.getElementById(`pull-requests-${id}`);
  if (!list) throw new Error(`missing pull requests list for ${id}`);
  return list;
}
it('focuses the pull request list after +N more when the row starts collapsed, and again on a second click', () => {
  show();
  const more = () => within(row('run_3')).getByRole('button', { name: '+1 more' });
  fireEvent.click(more());
  expect(within(row('run_3')).getByRole('button', { expanded: true })).toBeVisible();
  expect(pullRequests()).toHaveFocus();
  expect(pullRequests()).toHaveTextContent('#77');
  expect(screen.getByText('Check-in')).toBeVisible();
  expect(screen.getByText('Check-out')).toBeVisible();
  expect(screen.getAllByText(/Actor: T0-11b/)).toHaveLength(2);
  expect(screen.getByRole('cell', { name: 'Native' })).toBeVisible();
  pullRequests().blur();
  fireEvent.click(more());
  expect(pullRequests()).toHaveFocus();
  expect(pullRequests()).toHaveTextContent('#77');
  expect(screen.getByLabelText('Activity')).toHaveValue('all');
});
it('focuses the pull request list after +N more when the row is already expanded', async () => {
  const run = structuredClone(props.runs.find(item => item.id === 'run_3')!);
  run.events = [...run.events, { ...run.events[0]!, id: 'evt_user', kind: 'manual_close', actorId: 'usr_demo', message: 'Closed by the operator.' }, { ...run.events[0]!, id: 'evt_other', kind: 'status', actorId: 'somebody_else', message: 'Unknown actor.' }];
  show({ runs: props.runs.map(item => item.id === 'run_3' ? run : item), defaultExpandedRunIds: ['run_3'] });
  expect(within(row('run_3')).getByRole('button', { expanded: true })).toBeVisible();
  expect(pullRequests()).not.toHaveFocus();
  fireEvent.click(within(row('run_3')).getByRole('button', { name: '+1 more' }));
  expect(pullRequests()).toHaveFocus();
  expect(pullRequests()).toHaveTextContent('#77');
  expect(await screen.findByText(/Actor: Demo operator/)).toBeVisible();
  expect(screen.getByText(/Actor: somebody_else/)).toBeVisible();
  expect(screen.getByText('Manual close')).toBeVisible();
  expect(screen.getByText('Status update')).toBeVisible();
  expect(screen.queryByText('usr_demo')).not.toBeInTheDocument();
  pullRequests().blur();
  fireEvent.click(within(row('run_3')).getByRole('button', { name: '+1 more' }));
  expect(pullRequests()).toHaveFocus();
});
it('expanding extra PRs under controlled filters never requests clearing them', () => {
  const onFiltersChange = vi.fn(), onExpandedRunIdsChange = vi.fn();
  show({ filters: { activity: 'review' }, expandedRunIds: [], onFiltersChange, onExpandedRunIdsChange });
  fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
  expect(onFiltersChange).not.toHaveBeenCalled(); expect(onExpandedRunIdsChange).toHaveBeenCalledWith(['run_3']);
});
function viewport(desktop: boolean) {
  const previous = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 768px') ? desktop : !desktop,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
    addListener() {},
    removeListener() {},
  })) as typeof window.matchMedia;
  return () => { window.matchMedia = previous; };
}
it('keeps the desktop table, shortens ids, and shows one line of status', () => {
  const restore = viewport(true);
  try {
    const id = '58a9a065-e32f-4f28-8696-27aaab8025ac';
    const spoken = { ...seed.runs.find(run => run.id === 'run_3')!, id, message: 'PR #57: all 3 bot comments resolved; CI green' };
    const quiet = { ...spoken, id: 'quiet-run-id-value', message: '   ' };
    show({ runs: [spoken, quiet], projects: seed.projects, agents: seed.agents });
    expect(screen.getByRole('table')).toHaveClass('min-w-[1100px]');
    expect(screen.queryByRole('list', { name: 'Run cards' })).toBeNull();
    const status = within(row(id)).getByText(spoken.message);
    expect(status).toHaveAttribute('title', spoken.message);
    expect(status).toHaveClass('truncate');
    expect(within(row(id)).getByText(`T0-11b · 58a9a065`)).toHaveAttribute('title', id);
    expect(row(quiet.id).querySelector('[data-latest-status]')).toBeNull();
    fireEvent.click(within(row(id)).getByRole('button', { expanded: false }));
    expect(screen.getByRole('link', { name: '← Offers workspace' })).toHaveAttribute('href', '/projects/prj_offers');
  } finally { restore(); }
});
it('renders cards below the md breakpoint with a short id, status and working mark done', async () => {
  const restore = viewport(false);
  const sources = createDemoSources();
  try {
    const id = '58a9a065-e32f-4f28-8696-27aaab8025ac';
    const message = 'PR #57: all 3 bot comments resolved; CI green';
    const run = { ...(await sources.tracker.getRun('run_3'))!, id, message };
    const mark = vi.spyOn(sources.tracker, 'markRunDone').mockResolvedValue({ status: 'saved', value: { ...run, workStatus: 'completed', revision: run.revision + 1 } });
    render(<MemoryRouter><DataProvider sources={sources}><RunGrid runs={[run]} projects={seed.projects} agents={seed.agents} /></DataProvider></MemoryRouter>);
    expect(screen.queryByRole('table', { name: /Run executions/ })).toBeNull();
    expect(document.querySelector('.min-w-\\[1100px\\]')).toBeNull();
    const cards = screen.getByRole('list', { name: 'Run cards' });
    expect(cards.className).not.toMatch(/min-w-/);
    expect(cards.querySelector('.run-card-title')).toHaveTextContent(run.title);
    expect(cards.querySelector('.run-card-status')).toHaveTextContent('Finished · Waiting for review');
    expect(within(cards).queryByText('58a9a065')).toBeNull();
    expect(within(cards).queryByRole('button', { name: 'Demo: mark done 58a9a065' })).toBeNull();
    const status = within(cards).getByText(message);
    expect(status).toHaveClass('truncate');
    expect(status).toHaveAttribute('title', message);
    await userEvent.click(within(cards).getByRole('button', { expanded: false }));
    expect(within(cards).getByText('58a9a065')).toHaveAttribute('title', id);
    await userEvent.click(within(cards).getByRole('button', { name: 'Demo: mark done 58a9a065' }));
    expect(mark).toHaveBeenCalledWith(id);
  } finally { restore(); sources.dispose(); }
});
it('shows the existing conflict path when mark done is rejected', async () => {
  const sources = createDemoSources();
  vi.spyOn(sources.tracker, 'markRunDone').mockResolvedValue({ status: 'conflict', current: (await sources.tracker.getRun('run_3'))! });
  render(<MemoryRouter><DataProvider sources={sources}><RunGrid {...props} /></DataProvider></MemoryRouter>);
  await userEvent.click(within(row('run_3')).getByRole('button', { name: 'Demo: mark done run_3' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This run changed or is no longer available. Please refresh and try again.');
  sources.dispose();
});
