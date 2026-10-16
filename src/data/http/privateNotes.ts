import type { PrivateNotesSource } from '../contracts.js';
import type { PrivateNote } from '../../domain/privateNotes.js';
import { actionFields, segment, write, type HttpClient } from './client.js';
import { createObservable, type Visibility } from './observable.js';
/** Browser-session endpoint only; this module is deliberately separate from tracker data. */
export function createHttpPrivateNotes(client: HttpClient, visibility?: Visibility): PrivateNotesSource & { invalidate(): void } {
  const observable = createObservable(visibility);
  return {
    invalidate: observable.changed, subscribe: observable.subscribe, getSnapshot: observable.getSnapshot, observe: observable.observe,
    get: id => observable.read(id, () => client.request<PrivateNote>(`/api/projects/${segment(id)}/private-note`)),
    async save(id, text, revision) {
      const result = await write<PrivateNote>(client, `/api/projects/${segment(id)}/private-note`, 'PUT', { text, expected_revision: revision, ...actionFields() });
      if (result.status === 'saved') observable.changed();
      return result;
    },
  };
}
