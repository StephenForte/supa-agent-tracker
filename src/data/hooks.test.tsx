import { useCallback } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DataProvider, usePrivateNotes, useSourceQuery, useTrackerData } from './hooks';
import { createDemoSources } from './mock/createDemoSources';
import { createClock, useNow } from '../domain/clock';
it('refreshes asynchronous hook reads after external mutations and reset in both stores', async () => {
  const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')) });
  function Consumer() {
    const tracker = useTrackerData(), notes = usePrivateNotes();
    const project = useSourceQuery(tracker, useCallback(() => tracker.getProject('prj_offers'), [tracker]));
    const note = useSourceQuery(notes, useCallback(() => notes.get('prj_offers'), [notes]));
    return <><p>{project.status === 'ready' ? project.data?.name : project.status}</p><p>{note.status === 'ready' ? note.data.text : note.status}</p></>;
  }
  render(<DataProvider sources={sources}><Consumer /></DataProvider>);
  await screen.findByText('Offers workspace');
  const project = (await sources.tracker.getProject('prj_offers'))!;
  const note = await sources.privateNotes.get(project.id);
  await act(async () => { await sources.tracker.updateProject(project.id, { name: 'Updated from another view' }, project.revision); await sources.privateNotes.save(project.id, 'Updated private note', note.revision); });
  await screen.findByText('Updated from another view'); await screen.findByText('Updated private note');
  await act(() => sources.tracker.resetDemo());
  await screen.findByText('Offers workspace');
  await waitFor(() => expect(screen.queryByText('Updated private note')).not.toBeInTheDocument());
});
it('updates subscribers on injected clock advances', async () => {
  const clock = createClock(1000);
  function Consumer() { return <p>{useNow(clock)}</p>; }
  render(<Consumer />);
  expect(screen.getByText('1000')).toBeVisible();
  await act(async () => clock.advance(1000));
  expect(screen.getByText('2000')).toBeVisible();
});
