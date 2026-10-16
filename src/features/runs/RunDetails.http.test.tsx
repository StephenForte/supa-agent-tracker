import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { DemoAccountContext } from '../../app/useDemoAccount';
import { RunDetails } from './RunDetails';
const disposers: (() => void)[] = [];
afterEach(() => { cleanup(); disposers.splice(0).forEach(dispose => dispose()); });
it('keeps the expanded HTTP timeline when a refreshed list replaces the run object', async () => {
  const sources = createDemoSources(); disposers.push(sources.dispose);
  const detail = (await sources.tracker.getRun('run_1'))!;
  detail.events[0] = { ...detail.events[0]!, message: 'Persistent timeline event' };
  const getRun = vi.fn().mockResolvedValueOnce(detail).mockImplementation(() => new Promise(() => {}));
  const tracker = { ...sources.tracker, getRun };
  const listRun = { ...detail, events: [] };
  function View({ revision }: { revision: number }) {
    return <DataProvider sources={{ ...sources, tracker }}><DemoAccountContext.Provider value={false}>
      <RunDetails run={{ ...listRun, revision }} runs={[listRun]} onReveal={() => {}} />
    </DemoAccountContext.Provider></DataProvider>;
  }
  const view = render(<View revision={1} />);
  expect(await screen.findByText('Persistent timeline event')).toBeVisible();
  view.rerender(<View revision={2} />);
  expect(screen.getByText('Persistent timeline event')).toBeVisible();
  expect(screen.queryByText('Loading timeline…')).not.toBeInTheDocument(); expect(getRun).toHaveBeenCalledTimes(1);
});
