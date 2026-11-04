import { expect, it } from 'vitest';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createPersistence, STORAGE_KEY, type StorageAdapter } from '../../data/mock/persistence';
import { seedTracker } from '../../data/mock/seed';
import { seedPrivateNotes } from '../../data/mock/privateNotesStore';
import { trackerSchema } from '../../data/mock/schema';
function storage(): StorageAdapter {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}
it('loads a saved v1 envelope without board, preserving existing projects, steps and private notes', async () => {
  const adapter = storage(); const now = Date.now();
  const seed = seedTracker(now);
  seed.projects[0]!.description = 'Keep the operator edit'; seed.steps[0]!.done = true;
  const oldTracker: Record<string, unknown> = { ...seed }; delete oldTracker.board;
  const notes = seedPrivateNotes(now); notes[0]!.text = 'Keep this private reminder';
  adapter.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tracker: oldTracker, privateNotes: notes }));
  const loaded = createPersistence(adapter).load()!;
  expect(loaded).not.toBeNull(); expect(loaded.version).toBe(1); expect(loaded.tracker.board).toEqual([]);
  expect(loaded.tracker.projects[0]!.description).toBe('Keep the operator edit'); expect(loaded.tracker.steps[0]!.done).toBe(true);
  expect(loaded.privateNotes[0]!.text).toBe('Keep this private reminder');
  const sources = createDemoSources({ storage: adapter });
  try {
    expect((await sources.tracker.listBoard('prj_offers')).items).toEqual([]);
    expect((await sources.tracker.getProject('prj_offers'))!.description).toBe('Keep the operator edit');
  } finally { sources.dispose(); }
});
it('preserves a resolved entry and its resolution audit fields across a reload', async () => {
  const adapter = storage(); const sources = createDemoSources({ storage: adapter });
  const entry = (await sources.tracker.listBoard('prj_offers')).items[0]!;
  await sources.tracker.resolveBoardEntry(entry.projectId, entry.id, entry.revision, 'Reviewed and accepted.');
  sources.dispose();
  const reloaded = createDemoSources({ storage: adapter });
  try {
    expect((await reloaded.tracker.listBoard(entry.projectId)).items.some(item => item.id === entry.id)).toBe(false);
    const resolved = (await reloaded.tracker.listBoard(entry.projectId, { status: 'resolved' })).items.find(item => item.id === entry.id)!;
    expect(resolved.resolution).toBe('Reviewed and accepted.'); expect(resolved.resolvedByUserId).toBe('usr_demo');
    expect(resolved.resolvedAt).not.toBeNull(); expect(resolved.revision).toBe(entry.revision + 1);
  } finally { reloaded.dispose(); }
});
it('rejects nonexistent board projects and missing or cross-project source runs', () => {
  for (const patch of [{ projectId: 'missing' }, { sourceRunId: 'missing' }, { sourceRunId: 'run_4' }]) {
    const seed = seedTracker(Date.now()); Object.assign(seed.board[0]!, patch);
    expect(trackerSchema.safeParse(seed).success).toBe(false);
  }
});
