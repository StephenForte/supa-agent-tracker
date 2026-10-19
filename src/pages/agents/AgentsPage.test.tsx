import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import type { StorageAdapter } from '../../data/mock/persistence';
import { systemClock } from '../../domain/clock';
import type { Account } from '../../domain/types';

const disposers: (() => void)[] = [];
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); });

function memoryStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
function setup(path: string) {
  const sources = createDemoSources({ storage: memoryStorage() });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, router };
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-run-id="${id}"]`);
const ids = () => [...document.querySelectorAll('[data-run-id]')].map(item => item.getAttribute('data-run-id'));
function column(id: string, label: string) {
  const current = row(id);
  const table = current?.closest('table');
  if (!current || !table) return '';
  const headers = [...table.querySelectorAll('thead th')].map(header => (header.textContent ?? '').replace(/[↑↓]/g, '').trim());
  const index = headers.findIndex(header => header === label);
  return (current.querySelectorAll(':scope > td')[index]?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
async function shown(path = '/agents') {
  const view = setup(path);
  await screen.findByRole('heading', { level: 1, name: 'All agents' });
  await screen.findByRole('heading', { name: 'Agent runs' });
  return view;
}
function choose(label: string, value: string) {
  const field = screen.getByLabelText(label) as HTMLSelectElement;
  for (const option of field.options) option.selected = option.value === value;
  fireEvent.change(field);
}

it('lists owned runs active-first, hides archived projects, and shows them from the URL', async () => {
  const { router } = await shown();
  expect(ids().slice(0, 3)).toEqual(['run_1', 'run_10', 'run_2']);
  expect(ids()).not.toContain('run_6');
  expect(screen.getByText('1 run from archived projects hidden')).toBeVisible();
  expect(screen.getByText(/Archived projects stay hidden until you show them/)).toBeVisible();
  for (const id of ['run_1', 'run_10', 'run_2']) {
    expect(within(row(id)!).getByRole('link', { name: 'Offers workspace' })).toHaveAttribute('href', '/projects/prj_offers');
  }
  expect(within(row('run_4')!).getByText('Stale')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByText('More filters'));
  const projectOptions = () => [...screen.getByLabelText('Projects').querySelectorAll('option')].map(option => option.getAttribute('value'));
  expect(projectOptions()).not.toContain('prj_archive');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show archived projects' }));
  expect(router.state.location.search).toBe('?archived=1');
  expect(ids()).toContain('run_6');
  expect(screen.queryByText(/from archived projects hidden/)).toBeNull();
  expect(projectOptions()).toContain('prj_archive');
  expect(within(row('run_6')!).getByRole('link', { name: 'Archived prototype' })).toHaveAttribute('href', '/projects/prj_archive');
  await act(() => router.navigate('/agents?view=completed&archived=1'));
  expect(ids()).toEqual(['run_9', 'run_8', 'run_7']);
  expect(screen.getByRole('checkbox', { name: 'Show archived projects' })).toBeChecked();
});

it('requests every run and project with no project argument', async () => {
  const sources = createDemoSources({ storage: memoryStorage() });
  const listRuns = vi.spyOn(sources.tracker, 'listRuns');
  const listProjects = vi.spyOn(sources.tracker, 'listProjects');
  const listAgents = vi.spyOn(sources.tracker, 'listAgents');
  const router = createMemoryRouter(routes, { initialEntries: ['/agents'] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  await screen.findByText(/Runs 1–10 of 10/);
  expect(listRuns).toHaveBeenCalledWith();
  expect(listProjects).toHaveBeenCalledWith();
  expect(listAgents).toHaveBeenCalledWith();
});

it('follows view links and keeps an unknown view on the active preset', async () => {
  const { router } = await shown('/agents?view=live');
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
  expect(row('run_3')).toBeNull();
  expect(row('run_4')).toBeNull();
  await act(() => router.navigate('/agents?view=review'));
  expect(ids()).toEqual(['run_3']);
  await act(() => router.navigate('/agents?view=completed'));
  expect(ids()).toEqual(['run_9', 'run_8', 'run_7']);
  await act(() => router.navigate('/agents?view=nope'));
  expect(ids()).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
  expect(router.state.location.search).toBe('?view=nope');
});

it('lets the grid stale activity leave the presets without falling back to active', async () => {
  const { router } = await shown('/agents?view=live');
  fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'stale' } });
  expect(ids()).toEqual(['run_4', 'run_11']);
  for (const name of ['Active', 'Live', 'Waiting for review', 'Completed']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
  }
  expect(router.state.location.search).not.toContain('view=');
  fireEvent.click(screen.getByRole('button', { name: 'Live' }));
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
  expect(router.state.location.search).toBe('?view=live');
});

it('applies a view again when navigation returns to the value this page last wrote', async () => {
  const { router } = await shown();
  fireEvent.click(screen.getByRole('button', { name: 'Live' }));
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
  await act(() => router.navigate('/agents?view=review'));
  expect(ids()).toEqual(['run_3']);
  await act(() => router.navigate('/agents?view=live'));
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
  expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
});

it('restores the previous preset when history goes back', async () => {
  const { router } = await shown();
  fireEvent.click(screen.getByRole('button', { name: 'Live' }));
  fireEvent.click(screen.getByRole('button', { name: 'Waiting for review' }));
  expect(ids()).toEqual(['run_3']);
  await act(() => router.navigate(-1));
  expect(router.state.location.search).toBe('?view=live');
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
});

it('keeps stale activity under Strict Mode and still follows a later view link', async () => {
  const sources = createDemoSources({ storage: memoryStorage() });
  const router = createMemoryRouter(routes, { initialEntries: ['/agents?view=live'] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<StrictMode><DataProvider sources={sources}><RouterProvider router={router} /></DataProvider></StrictMode>);
  await screen.findByText(/Runs 1–3 of 3/);
  fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'stale' } });
  expect(ids()).toEqual(['run_4', 'run_11']);
  await act(() => router.navigate('/agents?view=review'));
  expect(ids()).toEqual(['run_3']);
  await act(() => router.navigate('/agents?view=live'));
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
});

it('selects a view from the keyboard and writes it into the URL', async () => {
  const { router } = await shown();
  const live = screen.getByRole('button', { name: 'Live' });
  live.focus();
  expect(live).toHaveFocus();
  await userEvent.setup().keyboard('{Enter}');
  expect(live).toHaveAttribute('aria-pressed', 'true');
  expect(ids()).toEqual(['run_1', 'run_10', 'run_2']);
  expect(router.state.location.search).toBe('?view=live');
});

it('filters weather runs to null PR fields and composes that filter with a view until clear', async () => {
  await shown();
  fireEvent.click(screen.getByText('More filters'));
  choose('Projects', 'prj_weather');
  expect(ids()).toEqual(['run_9', 'run_8', 'run_7']);
  for (const id of ids()) {
    expect(column(id!, 'PR')).toBe('—');
    expect(within(row(id!)!).getByText(`— · ${id}`)).toBeVisible();
    expect(row(id!)!.textContent).not.toContain('example-org');
  }
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  choose('Harness', JSON.stringify('Scheduled bot'));
  expect(new Set(ids())).toEqual(new Set(['run_7', 'run_8', 'run_9']));
  choose('Harness', JSON.stringify('Example coding harness'));
  expect(ids()).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  expect(screen.getByText(/No runs match these filters/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(ids()).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
});

it('names an empty view and show all returns every owned run', async () => {
  const sources = createDemoSources({ storage: memoryStorage() });
  const listRuns = sources.tracker.listRuns.bind(sources.tracker);
  vi.spyOn(sources.tracker, 'listRuns').mockImplementation(async projectId => (await listRuns(projectId)).filter(run => run.workStatus !== 'completed'));
  const router = createMemoryRouter(routes, { initialEntries: ['/agents?view=completed'] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  expect(await screen.findByText('No runs in Completed.')).toBeVisible();
  expect(screen.getByText(/No runs match these filters/)).toBeVisible();
  expect(screen.queryByText(/No runs yet/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  await screen.findByText(/Runs 1–/);
  expect(row('run_1')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  expect(router.state.location.search).toBe('?view=active');
});

it('uses the grid empty state when the signed-in account owns nothing', async () => {
  const sources = createDemoSources({ storage: memoryStorage() });
  const account: Account = { id: 'usr_other', name: 'Someone else', email: 'other@example.invalid', emailVerified: true, demo: true };
  vi.spyOn(sources.tracker, 'getAccount').mockResolvedValue(account);
  const router = createMemoryRouter(routes, { initialEntries: ['/agents'] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  expect(await screen.findByText(/No runs yet/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  expect(row('run_1')).toBeNull();
});

it('hides another account’s project even when it is mixed into the list', async () => {
  const sources = createDemoSources({ storage: memoryStorage() });
  const [projects, runs] = await Promise.all([sources.tracker.listProjects(), sources.tracker.listRuns()]);
  vi.spyOn(sources.tracker, 'listProjects').mockResolvedValue([...projects, { ...projects[0]!, id: 'prj_foreign', ownerId: 'usr_other', name: 'Foreign private workspace' }]);
  vi.spyOn(sources.tracker, 'listRuns').mockResolvedValue([...runs, { ...runs[0]!, id: 'run_foreign', projectId: 'prj_foreign', title: 'Foreign only title' }]);
  const router = createMemoryRouter(routes, { initialEntries: ['/agents'] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  await screen.findByText(/Runs 1–10 of 10/);
  expect(row('run_foreign')).toBeNull();
  expect(screen.queryByText('Foreign only title')).toBeNull();
  fireEvent.click(screen.getByText('More filters'));
  expect(screen.getByLabelText('Projects').textContent).not.toContain('Foreign private workspace');
});

it('opens an archived run from a run link while the other archived runs stay hidden', async () => {
  const { router } = await shown('/agents?run=run_6');
  expect(router.state.location.search).toBe('?run=run_6');
  expect(screen.getByRole('checkbox', { name: 'Show archived projects' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: /run_6$/, expanded: true })).toBeVisible();
  expect(screen.getByText('Showing run_6 from archived project Archived prototype.')).toBeVisible();
  expect(ids()).toContain('run_1');
  expect(screen.queryByText(/from archived projects hidden/)).toBeNull();
  await act(() => router.navigate('/agents?archived=1&run=run_6'));
  expect(screen.getByRole('button', { name: /run_6$/, expanded: true })).toBeVisible();
  expect(screen.queryByText('Showing run_6 from archived project Archived prototype.')).toBeNull();
});

it('expands a run link and shows its parent', async () => {
  const { router } = await shown('/agents?run=run_10');
  expect(screen.getByRole('button', { name: /run_10$/, expanded: true })).toBeVisible();
  const details = document.getElementById('details-run_10')!;
  expect(within(details).getAllByRole('link', { name: 'run_1' }).length).toBeGreaterThan(0);
  await act(() => router.navigate('/agents?run=run_3'));
  expect(screen.getByRole('button', { name: /run_3$/, expanded: true })).toBeVisible();
});

it('closing a stale run on this page updates the project counts and leaves its next step open', async () => {
  const { sources, router } = await shown();
  const stepsBefore = await sources.tracker.listNextSteps('prj_dashboard');
  fireEvent.click(screen.getByRole('button', { name: 'Demo: close run run_4' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Reason (required)'), { target: { value: 'Abandoned from all agents' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm demo close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByRole('button', { name: 'Demo: close run run_4' })).toBeNull();
  expect(await sources.tracker.listNextSteps('prj_dashboard')).toEqual(stepsBefore);
  expect(stepsBefore.steps.find(step => step.id === 'step_3')!.done).toBe(false);
  await act(() => router.navigate('/projects/prj_dashboard'));
  await screen.findByRole('heading', { level: 1, name: /Supa dashboard/ });
  const count = screen.getByText('Stale running').closest('div')!;
  expect(within(count).getByText('1')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Mark done: Inspect the failed sorting run and approve a retry in its harness.' })).not.toBeChecked();
});

it('matches execution, work, stale and PR for every seeded run on its project page', async () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  vi.spyOn(systemClock, 'now').mockReturnValue(now);
  vi.spyOn(systemClock, 'getSnapshot').mockReturnValue(now);
  vi.spyOn(systemClock, 'subscribe').mockImplementation(() => () => {});
  const { router } = await shown('/agents?archived=1');
  const fields = ['Execution state', 'Work status', 'Liveness', 'PR', 'Elapsed'] as const;
  const expected = Object.fromEntries(ids().map(id => [id, Object.fromEntries(fields.map(field => [field, column(id!, field)]))]));
  expect(Object.keys(expected)).toEqual(['run_1', 'run_10', 'run_2', 'run_4', 'run_11', 'run_3', 'run_5', 'run_9', 'run_6', 'run_8', 'run_7']);
  expect(expected.run_4?.Liveness).toMatch(/^Stale last contact 40 min ago, .+/);
  expect(expected.run_1?.Liveness).toMatch(/^Live last contact just now, .+/);
  expect(expected.run_3?.Liveness).toBe('—');
  const seen = new Set<string>();
  for (const projectId of ['prj_offers', 'prj_dashboard', 'prj_weather', 'prj_archive']) {
    await act(() => router.navigate(`/projects/${projectId}`));
    await screen.findByRole('heading', { level: 1 });
    for (const id of Object.keys(expected)) {
      if (!row(id)) continue;
      expect(Object.fromEntries(fields.map(field => [field, column(id, field)]))).toEqual(expected[id]);
      seen.add(id);
    }
  }
  expect([...seen].sort()).toEqual(Object.keys(expected).sort());
});

it('advances live elapsed and keeps finished elapsed frozen', async () => {
  await shown();
  const live = column('run_1', 'Elapsed');
  const ended = column('run_3', 'Elapsed');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2500)); });
  expect(column('run_1', 'Elapsed')).not.toBe(live);
  expect(column('run_3', 'Elapsed')).toBe(ended);
}, 10000);

it('reports a read failure and retries', async () => {
  const sources = createDemoSources({ storage: memoryStorage() });
  const listRuns = sources.tracker.listRuns.bind(sources.tracker);
  vi.spyOn(sources.tracker, 'listRuns').mockRejectedValueOnce(new Error('Read failed')).mockImplementation(listRuns);
  const router = createMemoryRouter(routes, { initialEntries: ['/agents'] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Read failed');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText(/Runs 1–10 of 10/);
});
