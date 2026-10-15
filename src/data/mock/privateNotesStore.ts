import type { PrivateNotesSource } from '../contracts';
import type { PrivateNote } from '../../domain/privateNotes';
import type { Clock } from '../../domain/clock';
import { observable } from './observable';
export function seedPrivateNotes(now: number): PrivateNote[] {
  return ['prj_offers', 'prj_dashboard'].map((projectId, i) => ({ projectId, text: i ? 'Ask about the stale run before retrying.' : 'Remember to inspect the mobile preview before approving.', updatedAt: new Date(now - 600_000).toISOString(), revision: 1 }));
}
export function createPrivateNotesStore(clock: Clock, initial: PrivateNote[], persist: (notes: PrivateNote[]) => void, projectExists: (id: string) => Promise<boolean>) {
  let notes = structuredClone(initial);
  const changes = observable();
  const get = (id: string): PrivateNote => structuredClone(notes.find(note => note.projectId === id) ?? { projectId: id, text: '', updatedAt: null, revision: 0 });
  const source: PrivateNotesSource = {
    subscribe: changes.subscribe, getSnapshot: changes.getSnapshot,
    async get(id) { return get(id); },
    async save(id, text, expectedRevision) {
      if (!await projectExists(id)) return { status: 'not_found' };
      // Read AFTER the await, so concurrent writes cannot both use the same revision.
      const current = get(id);
      if (current.revision !== expectedRevision) return { status: 'conflict', current };
      const note: PrivateNote = { projectId: id, text, updatedAt: new Date(clock.now()).toISOString(), revision: current.revision + 1 };
      notes = [...notes.filter(item => item.projectId !== id), note];
      persist(structuredClone(notes)); changes.notify(); return { status: 'saved', value: structuredClone(note) };
    },
  };
  return { source, reset(now: number) { notes = seedPrivateNotes(now); changes.notify(); } };
}
