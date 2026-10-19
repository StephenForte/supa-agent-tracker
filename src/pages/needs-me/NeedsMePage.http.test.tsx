import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createHttpSources } from '../../data/http/createHttpSources';
import { seedTracker } from '../../data/mock/seed';
import { systemClock } from '../../domain/clock';
const now = Date.parse('2026-10-19T20:00:00Z');
beforeEach(() => {
  vi.spyOn(systemClock, 'getSnapshot').mockReturnValue(now);
  vi.spyOn(systemClock, 'subscribe').mockImplementation(() => () => {});
});
afterEach(() => { vi.useRealTimers(); });
function setup(signedIn = true) {
  const seed = seedTracker(now);
  const account = { ...seed.account, demo: false };
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
    const path = String(input);
    const value = path === '/api/auth/get-session' ? signedIn ? { user: account } : null
      : path === '/api/projects?include_archived=true' ? { items: seed.projects, nextCursor: null }
      : path === '/api/runs' ? { items: seed.runs, nextCursor: null }
      : path === '/api/agents' ? { items: seed.agents, nextCursor: null }
      : path === '/api/account' ? account : {};
    return new Response(JSON.stringify(value));
  });
  const sources = createHttpSources({ fetch, visibility: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
  const router = createMemoryRouter(routes, { initialEntries: ['/needs-me'] });
  const view = render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { ...view, seed, fetch, router };
}
it('uses exactly the existing seven-second poll and updates the page and badge together without polling sessions', async () => {
  vi.useFakeTimers();
  const { seed, fetch, unmount, router } = setup();
  await act(async () => {});
  expect(screen.getByText('3 items need you')).toBeVisible();
  const calls = (path: string) => fetch.mock.calls.filter(([url]) => url === path).length;
  expect(calls('/api/auth/get-session')).toBe(1);
  expect(calls('/api/runs')).toBe(1);
  seed.runs.find(run => run.id === 'run_3')!.workStatus = 'completed';
  await act(async () => { await vi.advanceTimersByTimeAsync(6999); });
  expect(calls('/api/runs')).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText('2 items need you')).toBeVisible();
  expect(document.querySelector('[data-attention-count]')).toHaveTextContent('2');
  expect(calls('/api/runs')).toBe(2);
  expect(calls('/api/projects?include_archived=true')).toBe(2);
  expect(calls('/api/agents')).toBe(2);
  expect(calls('/api/auth/get-session')).toBe(1);
  unmount(); router.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('guards the route when signed out and does not request private attention records', async () => {
  const { fetch, router, unmount } = setup(false);
  await screen.findByRole('heading', { level: 1, name: 'Log in' });
  expect(router.state.location.pathname).toBe('/login');
  expect(fetch.mock.calls.some(([url]) => ['/api/runs', '/api/projects?include_archived=true', '/api/agents'].includes(String(url)))).toBe(false);
  unmount(); router.dispose();
});
