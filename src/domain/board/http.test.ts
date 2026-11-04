import { expect, it, vi } from 'vitest';
import { createHttpClient } from '../../data/http/client';
import { createHttpTracker } from '../../data/http/tracker';
import { seedTracker } from '../../data/mock/seed';
it('uses the fixed list and mutation routes, encodes IDs and sends revision/idempotency fields', async () => {
  const entry = seedTracker(Date.now()).board![0]!;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Response(JSON.stringify(init?.method === 'POST' ? entry : { items: [entry], nextCursor: 'next' }), { status: 200 }));
  const tracker = createHttpTracker(createHttpClient(fetcher));
  const page = await tracker.listBoard('project/a', { status: 'all', kind: 'state', cursor: 'a/b', limit: 100 });
  expect(page.nextCursor).toBe('next');
  expect(fetcher.mock.calls[0]![0]).toBe('/api/projects/project%2Fa/board?status=all&kind=state&cursor=a%2Fb&limit=100');
  expect((await tracker.resolveBoardEntry('project/a', 'entry/b', 7, 'Done')).status).toBe('saved');
  expect(fetcher.mock.calls[1]![0]).toBe('/api/projects/project%2Fa/board/entry%2Fb/resolve');
  const body = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
  expect(body).toEqual({ resolution: 'Done', expected_revision: 7, request_id: expect.any(String) });
  expect((await tracker.reopenBoardEntry('project/a', 'entry/b', 8)).status).toBe('saved');
  expect(fetcher.mock.calls[2]![0]).toBe('/api/projects/project%2Fa/board/entry%2Fb/reopen');
  const reopened = JSON.parse(fetcher.mock.calls[2]![1]!.body as string);
  expect(reopened.expected_revision).toBe(8); expect(reopened.request_id).not.toBe(body.request_id);
});
it('invalidates board lists and summary cache on a real HTTP 409 with details.current', async () => {
  const entry = seedTracker(Date.now()).board![0]!;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST'
    ? new Response(JSON.stringify({ error: { message: 'Stale revision', details: { current: entry } } }), { status: 409 })
    : new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
  const tracker = createHttpTracker(createHttpClient(fetcher));
  const unsubscribe = tracker.subscribe(() => {});
  try {
    await tracker.listBoard('p'); await tracker.listBoardSummaries();
    await tracker.listBoard('p'); await tracker.listBoardSummaries();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await tracker.resolveBoardEntry('p', entry.id, 0)).toEqual({ status: 'conflict', current: entry });
    await tracker.listBoard('p'); await tracker.listBoardSummaries();
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(tracker.getSnapshot()).toBe(1);
  } finally { unsubscribe(); }
});

it('reports a malformed summary payload as a query error', async () => {
  const tracker = createHttpTracker(createHttpClient(async () => new Response('{}', { status: 200 })));
  await expect(tracker.listBoardSummaries()).rejects.toThrow('Unable to load message board summaries.');
});
