import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpSources } from './createHttpSources';
import { SessionExpiredError } from './client';
import { createObservable, type Visibility } from './observable';
import type { ProjectInput } from '../../domain/types';
const input: ProjectInput = { name: 'Project', description: '', type: 'automation', lifecycle: 'active', tags: [], repositoryName: null, repositoryUrl: null, prdUrl: null, reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: true, instructions: '' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('HTTP contract adapters', () => {
  it('maps success, validation, not-found, conflict, rate-limit and server failures', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(); const { tracker } = createHttpSources({ fetch });
    fetch.mockResolvedValueOnce(json({ id: 'p', revision: 1 }));
    expect(await tracker.createProject(input)).toEqual({ status: 'saved', value: { id: 'p', revision: 1 } });
    for (const [status, expected] of [[400, { status: 'invalid', message: 'Invalid name' }], [404, { status: 'not_found' }], [409, { status: 'conflict', current: { id: 'p', revision: 2 } }]] as const) {
      fetch.mockResolvedValueOnce(json({ error: { message: 'Invalid name', details: { current: { id: 'p', revision: 2 } } } }, status));
      expect(await tracker.updateProject('p', {}, 1)).toEqual(expected);
    }
    for (const status of [429, 500, 503]) {
      fetch.mockResolvedValueOnce(json({ error: { message: 'unsafe database details' } }, status));
      await expect(tracker.createProject(input)).rejects.toThrow(status === 429 ? 'Too many requests' : 'The server could not complete');
    }
    fetch.mockResolvedValueOnce(json({ error: {} }, 404)); expect(await tracker.getProject('missing')).toBeNull();
  });
  it('signals session expiry on a read and a write without swallowing 401', async () => {
    const onUnauthorized = vi.fn(); const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ error: {} }, 401));
    const { tracker, privateNotes } = createHttpSources({ fetch, onUnauthorized });
    await expect(tracker.listProjects()).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(privateNotes.save('p', 'private', 0)).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
  it('follows every cursor for all lists, includes archived projects, and never loads run details for a list', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async path => {
      const url = String(path); return json({ items: [{ id: url.includes('cursor=') ? 'second' : 'first' }], nextCursor: url.includes('cursor=') ? null : 'opaque/next' });
    });
    const { tracker } = createHttpSources({ fetch });
    expect((await tracker.listProjects()).map(x => x.id)).toEqual(['first', 'second']);
    expect((await tracker.listAgents('p')).map(x => x.id)).toEqual(['first', 'second']);
    expect(await tracker.listRuns()).toEqual([{ id: 'first', events: [] }, { id: 'second', events: [] }]);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls[0]![0]).toBe('/api/projects?include_archived=true');
    expect(fetch.mock.calls[1]![0]).toBe('/api/projects?include_archived=true&cursor=opaque%2Fnext');
    expect(fetch.mock.calls.map(call => call[0]).filter(url => String(url).startsWith('/api/runs/'))).toEqual([]);
  });
  it('reuses the serialized request_id on a transport retry and creates a fresh id for the next action', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError('connection lost')).mockImplementation(async () => json({ id: 'p' }));
    const { tracker } = createHttpSources({ fetch });
    await tracker.createProject(input); await tracker.createProject(input);
    const bodies = fetch.mock.calls.map(call => String(call[1]?.body));
    expect(bodies[0]).toBe(bodies[1]); expect(JSON.parse(bodies[1]!).request_id).not.toBe(JSON.parse(bodies[2]!).request_id);
    for (const [path, init] of fetch.mock.calls) { expect(String(path)).toMatch(/^\/api\//); expect(init?.credentials).toBe('same-origin'); }
  });
  it('indexes step/project routes and reads current revisions for close, rotate and revoke', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (path, init) => {
      if (init?.method === 'POST') return json(String(path).endsWith('/rotate') ? { token: { id: 'new' }, plaintext: 'secret' } : String(path).endsWith('/revoke') ? { token: { id: 't' } } : { id: 'saved' });
      if (String(path).endsWith('/next-steps')) return json({ steps: [{ id: 'step', projectId: 'p' }], waitingNote: null });
      if (path === '/api/tokens') return json([{ id: 't', revision: 9 }]);
      return json({ id: 'run', revision: 7 });
    });
    const { tracker } = createHttpSources({ fetch });
    expect(await tracker.setNextStepDone('unknown', true, 1)).toEqual({ status: 'not_found' }); expect(fetch).not.toHaveBeenCalled();
    await tracker.listNextSteps('p'); await tracker.setNextStepDone('step', true, 3);
    await tracker.closeRun('run', 'cancelled', 'Abandoned'); await tracker.rotateToken('t'); await tracker.revokeToken('t');
    const writes = fetch.mock.calls.filter(call => call[1]?.method === 'POST');
    expect(writes.map(call => [call[0], JSON.parse(String(call[1]?.body)).expected_revision])).toEqual([
      ['/api/projects/p/next-steps/step/completion', 3], ['/api/runs/run/close', 7], ['/api/tokens/t/rotate', 9], ['/api/tokens/t/revoke', 9],
    ]);
    expect(await tracker.simulateAgentStepUpdate('s', '', 'r', 1)).toMatchObject({ status: 'invalid' });
    await expect(tracker.resetDemo()).rejects.toThrow('unavailable');
  });
  it('invalidates cached next steps on conflict so conflict reconciliation reads the current revision', async () => {
    let revision = 1;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_path, init) => {
      if (init?.method === 'POST') { revision = 2; return json({ error: { details: { current: { id: 's', revision } } } }, 409); }
      return json({ steps: [{ id: 's', projectId: 'p', revision }], waitingNote: null });
    });
    const { tracker } = createHttpSources({ fetch }); const stop = tracker.subscribe(() => {});
    expect((await tracker.listNextSteps('p')).steps[0]!.revision).toBe(1);
    expect(await tracker.setNextStepDone('s', true, 1)).toMatchObject({ status: 'conflict', current: { revision: 2 } });
    expect((await tracker.listNextSteps('p')).steps[0]!.revision).toBe(2); stop();
  });
  it('returns token conflicts with the current metadata for rotate and revoke', async () => {
    const current = { id: 't', revision: 3, label: 'Concurrent token' };
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_path, init) => init?.method === 'POST' ? json({ error: { details: { current } } }, 409) : json([{ id: 't', revision: 2 }]));
    const { tracker } = createHttpSources({ fetch });
    expect(await tracker.rotateToken('t')).toEqual({ status: 'conflict', current });
    expect(await tracker.revokeToken('t')).toEqual({ status: 'conflict', current });
  });
  it('returns detached current values for direct reads without a mounted query', async () => {
    let name = 'First'; const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ items: [{ id: 'p', name, tags: [] }], nextCursor: null }));
    const { tracker } = createHttpSources({ fetch });
    const first = await tracker.listProjects(); first[0]!.tags.push('caller-edit'); name = 'Second';
    expect(await tracker.listProjects()).toEqual([{ id: 'p', name: 'Second', tags: [] }]); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps private-note reads, writes and conflicts in their separate endpoint', async () => {
    const note = { projectId: 'p', text: 'private', revision: 2, updatedAt: null };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(note)).mockResolvedValueOnce(json({ error: { details: { current: note } } }, 409));
    const { privateNotes } = createHttpSources({ fetch });
    expect(await privateNotes.get('p')).toEqual(note); expect(await privateNotes.save('p', 'draft', 1)).toEqual({ status: 'conflict', current: note });
    expect(fetch.mock.calls.every(call => call[0] === '/api/projects/p/private-note')).toBe(true);
  });
});
describe('query-aware visible polling', () => {
  function visibility() {
    let state = 'visible'; const listeners = new Set<() => void>();
    return { get visibilityState() { return state; }, addEventListener(_type: string, fn: () => void) { listeners.add(fn); }, removeEventListener(_type: string, fn: () => void) { listeners.delete(fn); }, set(next: string) { state = next; listeners.forEach(fn => fn()); }, listeners } satisfies Visibility & { set(next: string): void; listeners: Set<() => void> };
  }
  it('invalidates only changed data, shares each paged read, pauses hidden, refreshes on return and releases every timer', async () => {
    vi.useFakeTimers(); const document = visibility(); let version = 1;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ items: [{ id: 'p', revision: version }], nextCursor: null }));
    const { tracker } = createHttpSources({ fetch, visibility: document }); const listener = vi.fn();
    const stop = tracker.subscribe(listener); const read = () => tracker.listProjects(); const unwatch = tracker.observe!(read); const unwatch2 = tracker.observe!(() => tracker.listProjects());
    await read(); await vi.advanceTimersByTimeAsync(7000); expect(fetch).toHaveBeenCalledTimes(2); expect(listener).not.toHaveBeenCalled();
    version++; await vi.advanceTimersByTimeAsync(7000); expect(listener).toHaveBeenCalledTimes(1); expect(tracker.getSnapshot()).toBe(1);
    await read(); expect(fetch).toHaveBeenCalledTimes(3); // Re-render consumes the polled value, no second request.
    document.set('hidden'); await vi.advanceTimersByTimeAsync(21000); expect(fetch).toHaveBeenCalledTimes(3);
    document.set('visible'); await vi.advanceTimersByTimeAsync(0); expect(fetch).toHaveBeenCalledTimes(4);
    unwatch(); unwatch2(); await vi.advanceTimersByTimeAsync(7000); expect(fetch).toHaveBeenCalledTimes(4);
    stop(); expect(vi.getTimerCount()).toBe(0); expect(document.listeners.size).toBe(0);
  });
  it('retains a shared callback until its last query registration unmounts', async () => {
    vi.useFakeTimers(); const document = visibility(); const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ items: [], nextCursor: null }));
    const { tracker } = createHttpSources({ fetch, visibility: document }); const stop = tracker.subscribe(() => {}); const read = () => tracker.listProjects();
    const first = tracker.observe!(read); const second = tracker.observe!(read); await read(); first();
    await vi.advanceTimersByTimeAsync(7000); expect(fetch).toHaveBeenCalledTimes(2);
    second(); stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it('never overlaps a slow poll, and immediately invalidates after its own mutation', async () => {
    vi.useFakeTimers(); const visible = visibility(); const observable = createObservable(visible); let release: (() => void) | undefined;
    const read = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve; }); return 1; });
    const stop = observable.subscribe(() => {}); const unwatch = observable.observe(read); release!(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(7000); expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(21000); expect(read).toHaveBeenCalledTimes(2);
    release!(); await vi.advanceTimersByTimeAsync(0); unwatch(); stop(); expect(vi.getTimerCount()).toBe(0);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ id: 'p' })); const { tracker } = createHttpSources({ fetch });
    const listener = vi.fn(); const off = tracker.subscribe(listener); await tracker.createProject(input); expect(listener).toHaveBeenCalledTimes(1); off();
  });
});
