import { afterEach, expect, it, vi } from 'vitest';
import { createHttpSources } from './createHttpSources';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('shares one session across 60 minutes of data polls, refreshes on focus/visibility, auth actions and 401, and releases listeners', async () => {
  vi.useFakeTimers();
  let state = 'visible'; const listeners = new Set<() => void>();
  const visibility = { get visibilityState() { return state; }, addEventListener(_type: string, fn: () => void) { listeners.add(fn); }, removeEventListener(_type: string, fn: () => void) { listeners.delete(fn); } };
  let signedIn = true;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async path => {
    if (path === '/api/auth/get-session') return json(signedIn ? { user: { id: 'user' } } : null);
    if (path === '/api/account') { signedIn = false; return json({}, 401); }
    if (path === '/api/auth/sign-out') signedIn = false;
    if (path === '/api/auth/sign-in/email') signedIn = true;
    return json({ items: [], nextCursor: null });
  });
  const { tracker } = createHttpSources({ fetch, visibility });
  const stop = tracker.subscribe(() => {});
  const session = () => tracker.auth!.getSession(); const projects = () => tracker.listProjects();
  const off = tracker.observe!(session); const off2 = tracker.observe!(() => tracker.auth!.getSession()); const off3 = tracker.observe!(projects);
  const count = () => fetch.mock.calls.filter(([path]) => path === '/api/auth/get-session').length;
  await session(); await projects();
  await vi.advanceTimersByTimeAsync(3600_000);
  expect(count()).toBe(1);
  expect(fetch.mock.calls.filter(([path]) => String(path).startsWith('/api/projects')).length).toBe(515);
  window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(0); expect(count()).toBe(2);
  state = 'hidden'; listeners.forEach(fn => fn()); await vi.advanceTimersByTimeAsync(21000); expect(count()).toBe(2);
  state = 'visible'; listeners.forEach(fn => fn()); await vi.advanceTimersByTimeAsync(0); expect(count()).toBe(3);
  // Ordinary writes must not put the session back on the polling path.
  await tracker.createProject({} as never); await session(); expect(count()).toBe(3);
  await expect(tracker.getAccount()).rejects.toThrow('session has expired'); await vi.advanceTimersByTimeAsync(0);
  expect(count()).toBe(4); expect(await session()).toBeNull();
  await tracker.auth!.submit('sign-in/email'); expect(await session()).toMatchObject({ id: 'user' }); expect(count()).toBe(5);
  await tracker.auth!.verify('test'); await session(); expect(count()).toBe(6);
  await tracker.auth!.submit('sign-out'); expect(await session()).toBeNull(); expect(count()).toBe(7);
  off(); off2(); off3(); stop(); expect(vi.getTimerCount()).toBe(0); expect(listeners.size).toBe(0);
  window.dispatchEvent(new Event('focus')); expect(count()).toBe(7);
});

it('keeps two independent visible tabs to one session fetch each over an hour', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async path => json(path === '/api/auth/get-session' ? { user: { id: 'user' } } : { items: [], nextCursor: null }));
  const tabs = [createHttpSources({ fetch }).tracker, createHttpSources({ fetch }).tracker];
  const cleanup = tabs.map(tracker => {
    const stop = tracker.subscribe(() => {});
    const off = tracker.observe!(() => tracker.auth!.getSession());
    const offData = tracker.observe!(() => tracker.listProjects());
    return () => { off(); offData(); stop(); };
  });
  await vi.advanceTimersByTimeAsync(3600_000);
  expect(fetch.mock.calls.filter(([path]) => path === '/api/auth/get-session')).toHaveLength(2);
  expect(fetch.mock.calls.filter(([path]) => String(path).startsWith('/api/projects'))).toHaveLength(1030);
  cleanup.forEach(stop => stop()); expect(vi.getTimerCount()).toBe(0);
});
it('re-reads on a private-note 401 and never recursively retries a session 401', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({}, 401));
  const { tracker, privateNotes } = createHttpSources({ fetch });
  await expect(privateNotes.get('p')).rejects.toThrow('session has expired');
  await Promise.resolve();
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/projects/p/private-note', '/api/auth/get-session']);
  await expect(tracker.auth!.getSession()).rejects.toThrow('session has expired');
  expect(fetch).toHaveBeenCalledTimes(3);
});
