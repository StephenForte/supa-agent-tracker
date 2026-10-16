import { useCallback } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSourceQuery } from '../hooks';
import type { TrackerDataSource } from '../contracts';
import { createHttpSources } from './createHttpSources';
function Projects({ source }: { source: TrackerDataSource }) {
  const query = useSourceQuery(source, useCallback(() => source.listProjects(), [source]));
  return <p>{query.status === 'ready' ? query.data.map(project => project.name).join(',') : query.status}</p>;
}
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('reuses polled data for React refresh and releases query registration on unmount', async () => {
  vi.useFakeTimers(); let name = 'Initial';
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify({ items: [{ id: 'p', name }], nextCursor: null })));
  const source = createHttpSources({ fetch, visibility: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } }).tracker;
  const view = render(<Projects source={source} />);
  await act(async () => {}); expect(screen.getByText('Initial')).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(1);
  name = 'Updated'; await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  expect(screen.getByText('Updated')).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount(); expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(14000); expect(fetch).toHaveBeenCalledTimes(2);
});
