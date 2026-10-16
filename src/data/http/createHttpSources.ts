import { createHttpClient, type Fetcher } from './client.js';
import { createHttpTracker } from './tracker.js';
import { createHttpPrivateNotes } from './privateNotes.js';
import type { Visibility } from './observable.js';
export function createHttpSources(options: { fetch?: Fetcher; onUnauthorized?: () => void; visibility?: Visibility } = {}) {
  const client = createHttpClient(options.fetch, options.onUnauthorized);
  const privateNotes = createHttpPrivateNotes(client, options.visibility);
  return { tracker: createHttpTracker(client, options.visibility, privateNotes.invalidate), privateNotes };
}
