/** Query lifetimes are separate from the external-store subscription. Never retain a screen's read after it unmounts. */
export interface Visibility { readonly visibilityState: string; addEventListener(type: 'visibilitychange', listener: () => void): void; removeEventListener(type: 'visibilitychange', listener: () => void): void }
export function createObservable(visibility: Visibility | undefined = (globalThis as { document?: Visibility }).document) {
  const focus = (globalThis as { window?: { addEventListener(type: 'focus', listener: () => void): void; removeEventListener(type: 'focus', listener: () => void): void } }).window;
  let revision = 0; let timer: ReturnType<typeof setTimeout> | undefined; let polling = false; let generation = 0;
  const listeners = new Set<() => void>();
  const queries = new Map<() => Promise<unknown>, { value?: string; references: number }>();
  // Event-driven reads survive ordinary data polling and writes.
  const unpolled = new Set<string>();
  const cache = new Map<string, Promise<unknown>>();
  const visible = () => !visibility || visibility.visibilityState === 'visible';
  const notify = () => { revision++; listeners.forEach(listener => listener()); };
  const clearPolled = () => { for (const key of cache.keys()) if (!unpolled.has(key)) cache.delete(key); };
  function schedule() { if (listeners.size && visible() && timer === undefined) timer = setTimeout(() => { timer = undefined; void poll(); }, 7000); }
  async function poll() {
    if (polling || !listeners.size || !visible()) return;
    polling = true; const epoch = generation; clearPolled(); let changed = false;
    await Promise.all([...queries].map(async ([read, state]) => {
      let value: string;
      try { value = JSON.stringify(await read()); } catch (error) { value = `error:${error instanceof Error ? error.message : 'Request failed'}`; }
      if (queries.get(read) !== state || epoch !== generation) return;
      if (value !== state.value) changed = true;
      state.value = value;
    }));
    polling = false;
    if (epoch === generation && listeners.size && visible() && changed) notify();
    schedule();
  }
  function visibilityChanged() {
    clearTimeout(timer); timer = undefined;
    if (visible()) { cache.clear(); void poll(); }
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) { visibility?.addEventListener('visibilitychange', visibilityChanged); focus?.addEventListener('focus', visibilityChanged); schedule(); }
      return () => { listeners.delete(listener); if (!listeners.size) { generation++; clearTimeout(timer); timer = undefined; visibility?.removeEventListener('visibilitychange', visibilityChanged); focus?.removeEventListener('focus', visibilityChanged); cache.clear(); } };
    },
    getSnapshot: () => revision,
    observe(read: () => Promise<unknown>) {
      const existing = queries.get(read);
      const state = existing ?? { references: 0, value: undefined as string | undefined };
      state.references++; queries.set(read, state);
      if (!existing) void read().then(value => { if (queries.get(read) === state && state.value === undefined) state.value = JSON.stringify(value); }, () => {});
      return () => { if (--state.references === 0 && queries.get(read) === state) queries.delete(read); };
    },
    read<T>(key: string, load: () => Promise<T>, poll = true): Promise<T> {
      if (!poll) unpolled.add(key);
      if (!listeners.size) return load().then(value => structuredClone(value));
      let result = cache.get(key);
      if (!result) { result = load(); cache.set(key, result); }
      return result.then(value => structuredClone(value as T), error => { if (cache.get(key) === result) cache.delete(key); throw error; });
    },
    invalidate(key: string) { cache.delete(key); },
    changed() {
      generation++; const epoch = generation; clearPolled(); notify();
      // The same refetch is shared with React; establish the new comparison baseline after our own write.
      for (const [read, state] of queries) void read().then(value => {
        if (generation === epoch && queries.get(read) === state) state.value = JSON.stringify(value);
      }, () => {});
    },
  };
}
