import { expect, it } from 'vitest';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { newestBoardEntries } from './board';
it('enforces revisions, wrong-state conflicts, note length, project binding and detached snapshots', async () => {
  const sources = createDemoSources();
  try {
    const source = sources.tracker;
    const entry = (await source.listBoard('prj_offers')).items[0]!;
    expect((await source.resolveBoardEntry('wrong', entry.id, entry.revision)).status).toBe('not_found');
    expect((await source.resolveBoardEntry(entry.projectId, entry.id, 0)).status).toBe('conflict');
    expect((await source.resolveBoardEntry(entry.projectId, entry.id, entry.revision, 'x'.repeat(2001))).status).toBe('invalid');
    expect((await source.resolveBoardEntry(entry.projectId, entry.id, entry.revision, 'Done')).status).toBe('saved');
    expect((await source.resolveBoardEntry(entry.projectId, entry.id, entry.revision + 1)).status).toBe('conflict');
    const resolved = (await source.listBoard(entry.projectId, { status: 'resolved' })).items.find(item => item.id === entry.id)!;
    expect(resolved.resolvedByUserId).toBe('usr_demo');
    expect(resolved.resolution).toBe('Done');
    expect((await source.reopenBoardEntry(entry.projectId, entry.id, resolved.revision)).status).toBe('saved');
    const reopened = (await source.listBoard(entry.projectId)).items.find(item => item.id === entry.id)!;
    expect(reopened.resolution).toBeNull(); expect(reopened.resolvedAt).toBeNull();
    reopened.body = 'mutated';
    expect((await source.listBoard(entry.projectId)).items.find(item => item.id === entry.id)!.body).not.toBe('mutated');
  } finally { sources.dispose(); }
});
it('pages filtered entries and sorts newest first without mutating input', async () => {
  const sources = createDemoSources();
  try {
    const source = sources.tracker;
    const first = await source.listBoard('prj_offers', { limit: 1 });
    const second = await source.listBoard('prj_offers', { cursor: first.nextCursor!, limit: 1 });
    expect(first.nextCursor).not.toBeNull(); expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    const all = (await source.listBoard('prj_offers', { status: 'all' })).items;
    expect(all).toHaveLength(4);
    expect((await source.listBoard('prj_offers', { kind: 'state' })).items).toHaveLength(1);
    expect(newestBoardEntries([...all].reverse()).map(e => e.id)).toEqual(all.map(e => e.id));
  } finally { sources.dispose(); }
});
