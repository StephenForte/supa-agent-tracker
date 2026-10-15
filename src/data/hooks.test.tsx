import { useCallback } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
it('keeps an editor mounted during same-query refresh, but clears old data when the query changes', async () => {
  const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')) });
  const initial = (await sources.tracker.getProject('prj_offers'))!;
  let delay = false;
  let finishRefresh!: (project: typeof initial) => void;
  const pending = new Promise<typeof initial>(resolve => { finishRefresh = resolve; });
  const read = () => delay ? pending : sources.tracker.getProject('prj_offers');
  function Editor({ projectId }: { projectId: string }) {
    const source = useTrackerData();
    const result = useSourceQuery(source, useCallback(() => projectId === 'prj_offers' ? read() : source.getProject(projectId), [source, projectId]));
    if (result.status !== 'ready') return <p>{result.status}</p>;
    return <><p>{result.data?.name}</p><input aria-label="Draft" defaultValue="Unsaved draft" /><p>{result.refreshing ? 'Refreshing' : 'Current'}</p></>;
  }
  const view = render(<DataProvider sources={sources}><Editor projectId="prj_offers" /></DataProvider>);
  const editor = await screen.findByRole('textbox', { name: 'Draft' });
  fireEvent.change(editor, { target: { value: 'Typed draft still being edited' } });
  delay = true;
  await act(async () => { await sources.tracker.updateProject(initial.id, { name: 'Refreshed project' }, initial.revision); });
  expect(screen.getByText('Refreshing')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(editor);
  expect(editor).toHaveValue('Typed draft still being edited');
  expect(screen.getByText('Offers workspace')).toBeVisible();
  await act(async () => { finishRefresh({ ...initial, name: 'Refreshed project' }); });
  await screen.findByText('Refreshed project');
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(editor);
  expect(editor).toHaveValue('Typed draft still being edited');
  expect(screen.getByText('Current')).toBeVisible();
  view.rerender(<DataProvider sources={sources}><Editor projectId="prj_weather" /></DataProvider>);
  expect(screen.queryByText('Refreshed project')).not.toBeInTheDocument();
  await screen.findByText('Daily weather briefing');
});
