import type { Clock } from '../../domain/clock';
import { systemClock } from '../../domain/clock';
import { seedTracker } from './seed';
import { createTrackerStore } from './trackerStore';
import { createPrivateNotesStore, seedPrivateNotes } from './privateNotesStore';
import { createPersistence, type DemoEnvelope, type StorageAdapter } from './persistence';
export function createDemoSources(options: { clock?: Clock; storage?: StorageAdapter } = {}) {
  const clock = options.clock ?? systemClock;
  const persistence = createPersistence(options.storage);
  const now = clock.now();
  let envelope: DemoEnvelope = persistence.load() ?? { version: 1, tracker: seedTracker(now), privateNotes: seedPrivateNotes(now) };
  const trackerStore = createTrackerStore({ clock, initial: envelope.tracker,
    persist(state) { envelope.tracker = state; persistence.save(envelope); },
    onReset(resetAt) {
      envelope = { version: 1, tracker: seedTracker(resetAt), privateNotes: seedPrivateNotes(resetAt) };
      notes.reset(resetAt); persistence.clear();
    },
  });
  const tracker = trackerStore.source;
  const notes = createPrivateNotesStore(clock, envelope.privateNotes, value => { envelope.privateNotes = value; persistence.save(envelope); }, async id => (await tracker.getProject(id)) !== null);
  return { tracker, privateNotes: notes.source, dispose: trackerStore.dispose };
}
