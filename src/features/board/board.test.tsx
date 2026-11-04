import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createHttpTracker } from '../../data/http/tracker';
import { createHttpClient } from '../../data/http/client';
import { BoardPanel } from './BoardPanel';
import { BoardPreview } from './BoardPreview';
import { boardCounts } from '../../domain/board/board';
const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
function setup() {
  const sources = createDemoSources(); dispose.push(sources.dispose);
  render(<MemoryRouter><DataProvider sources={sources}><BoardPreview projectId="prj_offers" /><BoardPanel projectId="prj_offers" /></DataProvider></MemoryRouter>);
  return sources;
}
it('previews omit zero counts, show empty state and link to the board', async () => {
  const sources = createDemoSources(); dispose.push(sources.dispose);
  render(<MemoryRouter><DataProvider sources={sources}><BoardPreview projectId="prj_offers" /><BoardPreview projectId="prj_archive" /></DataProvider></MemoryRouter>);
  expect(await screen.findByText('3 open · 1 question · 1 hazard')).toBeVisible();
  expect(screen.getByText('No open messages')).toBeVisible();
  expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/projects/prj_offers#project-board');
  expect(boardCounts({ projectId: 'p', openCount: 1, questionCount: 0, hazardCount: 0, latest: { id: 'e', kind: 'note', title: '', updatedAt: '' } })).toBe('1 open');
});
it('filters, resolves and reopens while keeping the preview current', async () => {
  setup();
  const panel = screen.getByRole('region', { name: 'Message board' });
  await within(panel).findByText('Which offer flow should ship first?');
  expect(within(panel).queryByText('Accessible labels agreed')).toBeNull();
  fireEvent.change(within(panel).getByLabelText('Kind'), { target: { value: 'question' } });
  await waitFor(() => expect(within(panel).queryByText('Preview environment')).toBeNull());
  fireEvent.change(within(panel).getByLabelText('Optional resolution note'), { target: { value: 'Ship the primary flow.' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Demo: resolve' }));
  await screen.findByText('2 open · 1 hazard');
  await within(panel).findByText('No open messages');
  fireEvent.click(within(panel).getByLabelText('Show resolved'));
  await within(panel).findByText('Ship the primary flow.');
  expect(within(panel).getByText(/Resolved by you/)).toBeVisible();
  fireEvent.click(within(panel).getByRole('button', { name: 'Demo: reopen' }));
  await screen.findByText('3 open · 1 question · 1 hazard');
});
it('shows conflict feedback even when the refreshed entry leaves the open list', async () => {
  const sources = setup();
  const original = sources.tracker.resolveBoardEntry;
  vi.spyOn(sources.tracker, 'resolveBoardEntry').mockImplementationOnce(async (...args) => {
    const saved = await original(...args);
    if (saved.status !== 'saved') throw new Error('fixture');
    return { status: 'conflict', current: saved.value };
  });
  await screen.findByText('3 open · 1 question · 1 hazard');
  fireEvent.click(screen.getAllByRole('button', { name: 'Demo: resolve' })[0]!);
  expect(await screen.findByRole('alert')).toHaveTextContent('board has been refreshed');
  await screen.findByText('2 open · 1 hazard');
});
it('renders agent markup as literal text with no injected image', async () => {
  const sources = createDemoSources(); dispose.push(sources.dispose);
  const entry = (await sources.tracker.listBoard('prj_offers')).items[0]!;
  vi.spyOn(sources.tracker, 'listBoard').mockResolvedValue({ items: [{ ...entry, body: '<img src=x onerror=alert(1)> https://example.com `safe`' }], nextCursor: null });
  const view = render(<DataProvider sources={sources}><BoardPanel projectId="prj_offers" /></DataProvider>);
  expect(await screen.findByText(/<img src=x onerror=alert/)).toBeVisible();
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com');
  expect(view.container.querySelector('code')).toHaveTextContent('safe');
});
it('twelve previews cost exactly one summary fetch on mount and each poll', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
  const tracker = createHttpTracker(createHttpClient(fetcher), { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
  const sources = createDemoSources(); dispose.push(sources.dispose);
  const view = render(<MemoryRouter><DataProvider sources={{ ...sources, tracker }}>{Array.from({ length: 12 }, (_, i) => <BoardPreview key={i} projectId={`p${i}`} />)}</DataProvider></MemoryRouter>);
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.every(args => String(args[0]) === '/api/board/summary')).toBe(true);
  view.unmount();
});
