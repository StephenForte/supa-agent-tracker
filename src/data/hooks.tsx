import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ObservableSource, PrivateNotesSource, TrackerDataSource } from './contracts';
import { demoSources } from './runtime';
interface Sources { tracker: TrackerDataSource; privateNotes: PrivateNotesSource }
const SourcesContext = createContext<Sources>(demoSources);
export function DataProvider({ sources, children }: { sources: Sources; children: ReactNode }) { return <SourcesContext.Provider value={sources}>{children}</SourcesContext.Provider>; }
/** Subscribe before issuing asynchronous reads. Mutation methods are returned unchanged. */
export function useTrackerData(): TrackerDataSource { const { tracker } = useContext(SourcesContext); useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot); return tracker; }
export function usePrivateNotes(): PrivateNotesSource { const { privateNotes } = useContext(SourcesContext); useSyncExternalStore(privateNotes.subscribe, privateNotes.getSnapshot, privateNotes.getSnapshot); return privateNotes; }
export type QueryState<T> = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: T };
/** Pass a memoized read callback (useCallback); reruns on store revision, cancels outdated results. */
export function useSourceQuery<T>(source: ObservableSource, read: () => Promise<T>): QueryState<T> {
  const revision = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const [result, setResult] = useState<{ read: typeof read; revision: number; state: QueryState<T> } | null>(null);
  useEffect(() => {
    let active = true;
    void read().then(data => { if (active) setResult({ read, revision, state: { status: 'ready', data } }); }, error => { if (active) setResult({ read, revision, state: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } }); });
    return () => { active = false; };
  }, [source, read, revision]);
  return result?.read === read && result.revision === revision ? result.state : { status: 'loading' };
}
