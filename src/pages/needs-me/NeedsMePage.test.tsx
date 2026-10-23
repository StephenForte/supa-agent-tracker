import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { seedTracker } from '../../data/mock/seed';
import { seedPrivateNotes } from '../../data/mock/privateNotesStore';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock, systemClock } from '../../domain/clock';
import { expectMobileTapTargets } from '../../test/mobileTargets';
const now = Date.parse('2026-10-19T20:00:00Z');
const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.spyOn(systemClock, 'getSnapshot').mockReturnValue(now);
  vi.spyOn(systemClock, 'subscribe').mockImplementation(() => () => {});
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); });
function setup(prepare?: (sources: ReturnType<typeof createDemoSources>) => void, path = '/needs-me') {
  const sources = createDemoSources({ clock: createClock(now), storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
  prepare?.(sources);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  disposers.push(sources.dispose, () => router.dispose());
  const view = render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { ...view, sources, router };
}
const card = (id: string) => document.querySelector<HTMLElement>(`[data-run-id="${id}"]`)!;
const badge = () => document.querySelector('[data-attention-count]');

it('renders the three groups, details, links, first nav item and shared count', async () => {
  const { container } = setup();
  await screen.findByText('3 items need you');
  expect([...document.querySelectorAll('main h2')].map(node => node.textContent)).toEqual(['Blocked (1)', 'Stale (1)', 'Waiting for review (1)']);
  expect(screen.getByText('Blocked: 1 · Stale: 1 · Waiting for review: 1')).toBeVisible();
  expect(badge()).toHaveTextContent('3');
  expect(screen.getByRole('navigation').querySelector('a')).toHaveAttribute('href', '/needs-me');
  expect(within(card('run_4')).getByText('Waiting for repository access confirmation.')).toBeVisible();
  expect(within(card('run_4')).getByRole('link', { name: 'Open run' })).toHaveAttribute('href', '/projects/prj_dashboard?run=run_4');
  expect(within(card('run_11')).getByText('last contact 1 hour ago')).toBeVisible();
  expect(within(card('run_3')).getByRole('list', { name: 'Pull requests' }).children).toHaveLength(2);
  expect(within(card('run_3')).getByRole('link', { name: 'Open PR' })).toHaveAttribute('href', 'https://github.com/example-org/offers/pull/74');
  expect(container.querySelector('.brand-mark')).toHaveAttribute('alt', '');
  expectMobileTapTargets(container);
});
it('marks done once through the existing path, removes the card and updates the badge', async () => {
  const { sources } = setup();
  const mark = vi.spyOn(sources.tracker, 'markRunDone');
  await screen.findByText('3 items need you');
  fireEvent.click(within(card('run_3')).getByRole('button', { name: /mark done/i }));
  await screen.findByText('2 items need you');
  expect(card('run_3')).toBeNull();
  expect(mark).toHaveBeenCalledExactlyOnceWith('run_3');
  expect(badge()).toHaveTextContent('2');
});
it('closes a stale run with the existing dialog and removes it without completing steps', async () => {
  const { sources } = setup();
  const close = vi.spyOn(sources.tracker, 'closeRun');
  await screen.findByText('3 items need you');
  fireEvent.click(within(card('run_11')).getByRole('button', { name: 'Demo: close run' }));
  const dialog = screen.getByRole('dialog', { name: 'Demo: manually close run_11' });
  fireEvent.change(within(dialog).getByLabelText('Reason (required)'), { target: { value: 'Abandoned' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm demo close' }));
  await screen.findByText('2 items need you');
  expect(card('run_11')).toBeNull();
  expect(close).toHaveBeenCalledExactlyOnceWith('run_11', 'cancelled', 'Abandoned');
});
it('shows the existing mark-done conflict path and keeps the item', async () => {
  setup(sources => { vi.spyOn(sources.tracker, 'markRunDone').mockImplementation(async () => ({ status: 'conflict', current: (await sources.tracker.getRun('run_3'))! })); });
  await screen.findByText('3 items need you');
  fireEvent.click(within(card('run_3')).getByRole('button', { name: /mark done/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This run changed or is no longer available. Please refresh and try again.');
  expect(card('run_3')).toBeInTheDocument();
  expect(badge()).toHaveTextContent('3');
});
it('shows the existing close conflict and leaves the dialog open', async () => {
  setup(sources => { vi.spyOn(sources.tracker, 'closeRun').mockImplementation(async () => ({ status: 'conflict', current: (await sources.tracker.getRun('run_11'))! })); });
  await screen.findByText('3 items need you');
  fireEvent.click(within(card('run_11')).getByRole('button', { name: 'Demo: close run' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Reason (required)'), { target: { value: 'Abandoned' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm demo close' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This run changed or is no longer available. Please refresh and try again.');
  expect(dialog).toBeVisible();
});
it('renders the empty state and hides the count when the owner has no items', async () => {
  setup(sources => { vi.spyOn(sources.tracker, 'getAccount').mockResolvedValue({ id: 'other', name: 'Other', email: 'other@example.invalid', emailVerified: true, demo: true }); });
  await screen.findByText('Nothing needs you right now');
  expect(badge()).toBeNull();
  expect(screen.getByText('0 items need you')).toBeVisible();
  const empty = screen.getByText('Nothing needs you right now').closest('section')!;
  expect(within(empty).getByRole('link', { name: 'All agents' })).toHaveAttribute('href', '/agents');
  expect(within(empty).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
});
it('uses a truncated completion summary without a PR and retains the latest message', async () => {
  setup(sources => {
    const list = sources.tracker.listRuns.bind(sources.tracker);
    vi.spyOn(sources.tracker, 'listRuns').mockImplementation(async () => (await list()).map(run => run.id === 'run_3' ? { ...run, prReferences: [], completionSummary: 'Ready for acceptance', message: 'Latest handoff message' } : run));
  });
  await screen.findByText('3 items need you');
  expect(within(card('run_3')).getByText('Ready for acceptance')).toHaveClass('line-clamp-2');
  expect(within(card('run_3')).getByText('Latest handoff message')).toHaveClass('truncate');
  expect(within(card('run_3')).queryByRole('link', { name: 'Open PR' })).toBeNull();
});
it('retries an attention read error', async () => {
  setup(sources => { vi.spyOn(sources.tracker, 'listRuns').mockRejectedValueOnce(new Error('Read failed')); });
  expect(await screen.findByRole('alert')).toHaveTextContent('Read failed');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('3 items need you');
});
it('keeps the browser root redirect at projects', async () => {
  const { router } = setup(undefined, '/');
  await screen.findByRole('heading', { level: 1, name: 'Projects' });
  expect(router.state.location.pathname).toBe('/projects');
});
it('removes all successful actions, hides the badge at zero and renders empty state', async () => {
  const { sources } = setup();
  await screen.findByText('3 items need you');
  await act(async () => {
    await sources.tracker.markRunDone('run_3');
    await sources.tracker.closeRun('run_4', 'cancelled', 'Resolved blocker');
    await sources.tracker.closeRun('run_11', 'cancelled', 'No longer needed');
  });
  await waitFor(() => expect(screen.getByText('Nothing needs you right now')).toBeVisible());
  expect(badge()).toBeNull();
});

function endedBlocked(executionState: 'failed' | 'cancelled' | 'finished', path = '/needs-me') {
  const initial = seedTracker(now);
  const run = initial.runs.find(run => run.id === 'run_4')!;
  Object.assign(run, { executionState, finishedAt: new Date(now - 180 * 60_000).toISOString() });
  const envelope = JSON.stringify({ version: 1, tracker: initial, privateNotes: seedPrivateNotes(now) });
  const sources = createDemoSources({ clock: createClock(now), storage: { getItem: () => envelope, setItem: () => {}, removeItem: () => {} } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  disposers.push(sources.dispose, () => router.dispose());
  const view = render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { ...view, sources };
}
it.each(['failed', 'cancelled'] as const)('dismisses an ended %s blocked card and updates the badge without reload', async state => {
  const { sources, container } = endedBlocked(state);
  const dismiss = vi.spyOn(sources.tracker, 'dismissRun');
  await screen.findByText('3 items need you');
  expect(within(card('run_4')).getByText(`${state === 'failed' ? 'Failed' : 'Cancelled'} · ended 3 hours ago`)).toBeVisible();
  expect(within(card('run_4')).getByRole('link', { name: 'Open run' })).toBeVisible();
  expectMobileTapTargets(container);
  fireEvent.click(within(card('run_4')).getByRole('button', { name: 'Demo: dismiss run_4' }));
  await screen.findByText('2 items need you');
  expect(card('run_4')).toBeNull();
  expect(badge()).toHaveTextContent('2');
  expect(dismiss).toHaveBeenCalledExactlyOnceWith('run_4');
});
it('offers mark done on finished blocked cards and only Open run on live blocked cards', async () => {
  const { unmount } = endedBlocked('finished');
  await screen.findByText('3 items need you');
  expect(within(card('run_4')).queryByRole('button', { name: /dismiss/i })).toBeNull();
  fireEvent.click(within(card('run_4')).getByRole('button', { name: /mark done/i }));
  await screen.findByText('2 items need you');
  expect(card('run_4')).toBeNull();
  unmount();
  setup();
  await screen.findByText('3 items need you');
  expect(within(card('run_4')).queryByRole('button')).toBeNull();
  expect(within(card('run_4')).getByRole('link', { name: 'Open run' })).toBeVisible();
});
it('offers dismiss from project RunDetails and keeps the failed execution after success', async () => {
  const { sources } = endedBlocked('failed', '/projects/prj_dashboard?run=run_4');
  const button = await screen.findByRole('button', { name: 'Demo: dismiss run_4' });
  expect(button.closest('section')).toHaveTextContent('Run handoff');
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Demo: dismiss run_4' })).toBeNull());
  expect(await sources.tracker.getRun('run_4')).toMatchObject({ executionState: 'failed', workStatus: 'failed' });
});
