import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '../../data/hooks';
import type { PrivateNotesSource, TrackerDataSource } from '../../data/contracts';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { formatTimestamp } from '../../domain/format';
import type { PrivateNote } from '../../domain/privateNotes';
import { PrivateNotePanel } from './PrivateNotePanel';
import { PrivateNotePreview } from './PrivateNotePreview';

const now = Date.parse('2026-10-14T20:00:00Z');
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

function setup() {
  const clock = createClock(now);
  const sources = createDemoSources({ clock });
  disposers.push(sources.dispose);
  return { clock, sources };
}
function show(projectId: string, sources: { tracker: TrackerDataSource; privateNotes: PrivateNotesSource }) {
  return render(<DataProvider sources={sources}><PrivateNotePanel projectId={projectId} /><PrivateNotePreview projectId={projectId} /></DataProvider>);
}

describe('private notes', () => {
  it('edits and saves with visible status, and saves an empty note', async () => {
    const user = userEvent.setup();
    const { sources } = setup();
    show('prj_offers', sources);
    const field = await screen.findByRole('textbox', { name: 'Private note' });
    expect(field).toHaveValue('Remember to inspect the mobile preview before approving.');
    expect(screen.getByText(/Only you can see this/)).toBeVisible();
    expect(screen.getByText(/Agents never receive it/)).toBeVisible();
    expect(screen.getByText(/browser-only/)).toBeVisible();
    expect(screen.getByText(/Phase 1/)).toBeVisible();
    expect(screen.getByRole('group', { name: 'Private note preview' })).toHaveTextContent('Remember to inspect the mobile preview before approving.');
    await user.type(field, ' Extra');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const saved = await sources.privateNotes.get('prj_offers');
    expect(await screen.findByText(`Saved ${formatTimestamp(saved.updatedAt)}`)).toBeVisible();
    expect(saved.text).toBe('Remember to inspect the mobile preview before approving. Extra');
    expect(JSON.stringify(await sources.tracker.listNextSteps('prj_offers'))).not.toContain('Extra');
    cleanup();
    show('prj_weather', setup().sources);
    expect(await screen.findByRole('textbox', { name: 'Private note' })).toHaveValue('');
    expect(screen.getByText('No saved note yet')).toBeVisible();
    expect(screen.getByText('No private note')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Saved /)).toBeVisible();
    expect(await screen.findByText('No private note')).toBeVisible();
  });

  it('shows Saving while the write is in flight', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { sources } = setup();
    const notes = sources.privateNotes;
    const privateNotes: PrivateNotesSource = { ...notes, async save(projectId, text, revision) { await gate; return notes.save(projectId, text, revision); } };
    show('prj_offers', { tracker: sources.tracker, privateNotes });
    const field = await screen.findByRole('textbox', { name: 'Private note' });
    await user.type(field, ' Wait');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saving…')).toBeVisible();
    release!();
    expect(await screen.findByText(/Saved /)).toBeVisible();
  });

  it('keeps the draft on a stale revision and saves it with the fresh revision', async () => {
    const user = userEvent.setup();
    let note: PrivateNote = { projectId: 'prj_offers', text: 'Saved on the server', updatedAt: '2026-10-14T19:00:00.000Z', revision: 1 };
    let stale = true;
    const listeners = new Set<() => void>();
    let snapshot = 0;
    const privateNotes: PrivateNotesSource = {
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      getSnapshot: () => snapshot,
      async get() { return { ...note }; },
      async save(projectId, text, expectedRevision) {
        if (stale) {
          stale = false;
          note = { projectId, text: 'Saved elsewhere', updatedAt: '2026-10-14T20:06:00.000Z', revision: note.revision + 1 };
          return { status: 'conflict', current: { ...note } };
        }
        if (expectedRevision !== note.revision) return { status: 'conflict', current: { ...note } };
        note = { projectId, text, updatedAt: '2026-10-14T20:07:00.000Z', revision: note.revision + 1 };
        snapshot += 1;
        listeners.forEach(listener => listener());
        return { status: 'saved', value: { ...note } };
      },
    };
    const tracker = new Proxy({} as TrackerDataSource, { get: () => () => { throw new Error('tracker'); } });
    show('prj_offers', { tracker, privateNotes });
    const field = await screen.findByRole('textbox', { name: 'Private note' });
    await user.clear(field);
    await user.type(field, 'My draft');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved elsewhere')).toBeVisible();
    expect(field).toHaveValue('My draft');
    await user.click(screen.getByRole('button', { name: 'Keep my draft' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(`Saved ${formatTimestamp('2026-10-14T20:07:00.000Z')}`)).toBeVisible();
    expect(field).toHaveValue('My draft');
    expect(note).toMatchObject({ text: 'My draft', revision: 3 });
  });

  it('can replace the draft with the saved text after a conflict', async () => {
    const user = userEvent.setup();
    let note: PrivateNote = { projectId: 'prj_offers', text: 'Saved on the server', updatedAt: '2026-10-14T19:00:00.000Z', revision: 1 };
    const privateNotes: PrivateNotesSource = {
      subscribe: () => () => {}, getSnapshot: () => 0,
      async get() { return { ...note }; },
      async save(projectId) {
        note = { projectId, text: 'Saved elsewhere', updatedAt: '2026-10-14T20:06:00.000Z', revision: 2 };
        return { status: 'conflict', current: { ...note } };
      },
    };
    show('prj_offers', { tracker: {} as TrackerDataSource, privateNotes });
    const field = await screen.findByRole('textbox', { name: 'Private note' });
    await user.clear(field);
    await user.type(field, 'My draft');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved elsewhere')).toBeVisible();
    expect(field).toHaveValue('My draft');
    await user.click(screen.getByRole('button', { name: 'Use the saved text' }));
    expect(field).toHaveValue('Saved elsewhere');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('does not leak a draft across projects or across reset', async () => {
    const user = userEvent.setup();
    const { sources, clock } = setup();
    const view = show('prj_offers', sources);
    const field = await screen.findByRole('textbox', { name: 'Private note' });
    await user.type(field, ' LEAK');
    const dashboard = await sources.privateNotes.get('prj_dashboard');
    await act(async () => { await sources.privateNotes.save(dashboard.projectId, 'Other project note', dashboard.revision); });
    expect(screen.getByRole('textbox', { name: 'Private note' })).toHaveValue('Remember to inspect the mobile preview before approving. LEAK');
    view.rerender(<DataProvider sources={sources}><PrivateNotePanel projectId="prj_dashboard" /><PrivateNotePreview projectId="prj_dashboard" /></DataProvider>);
    expect(await screen.findByRole('textbox', { name: 'Private note' })).toHaveValue('Other project note');
    expect(screen.queryByDisplayValue(/LEAK/)).not.toBeInTheDocument();
    view.rerender(<DataProvider sources={sources}><PrivateNotePanel projectId="prj_offers" /><PrivateNotePreview projectId="prj_offers" /></DataProvider>);
    const offers = await screen.findByRole('textbox', { name: 'Private note' });
    expect(offers).toHaveValue('Remember to inspect the mobile preview before approving.');
    await user.type(offers, ' LEAK');
    clock.advance(60_000);
    await act(async () => { await sources.tracker.resetDemo(); });
    expect(await screen.findByDisplayValue('Remember to inspect the mobile preview before approving.')).toBeVisible();
    expect(screen.queryByDisplayValue(/LEAK/)).not.toBeInTheDocument();
  });

  it('truncates the card preview without shortening the editor', async () => {
    const text = `${'Remember this private detail '.repeat(8)}end`;
    const note: PrivateNote = { projectId: 'prj_weather', text, updatedAt: '2026-10-14T19:00:00.000Z', revision: 1 };
    const privateNotes: PrivateNotesSource = {
      subscribe: () => () => {}, getSnapshot: () => 0, async get() { return { ...note }; },
      async save() { return { status: 'saved', value: note }; },
    };
    show('prj_weather', { tracker: {} as TrackerDataSource, privateNotes });
    expect(await screen.findByRole('textbox', { name: 'Private note' })).toHaveValue(text);
    const preview = screen.getByRole('group', { name: 'Private note preview' }).textContent ?? '';
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThan(text.length);
    expect(preview).not.toContain('end');
  });
});

describe('data-path boundary', () => {
  it('renders private notes while every tracker method throws', async () => {
    const calls: string[] = [];
    const tracker = new Proxy({} as TrackerDataSource, { get(_target, property) {
      return () => { calls.push(String(property)); throw new Error(String(property)); };
    } });
    const { sources } = setup();
    show('prj_offers', { tracker, privateNotes: sources.privateNotes });
    expect(await screen.findByDisplayValue('Remember to inspect the mobile preview before approving.')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Private note preview' })).toHaveTextContent('Remember to inspect the mobile preview before approving.');
    expect(calls).toEqual([]);
  });
});
