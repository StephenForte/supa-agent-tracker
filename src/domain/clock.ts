import { useSyncExternalStore } from 'react';
export interface Clock { now(): number; getSnapshot(): number; subscribe(listener: () => void): () => void }
export function createClock(initial?: number): Clock & { advance(milliseconds: number): void } {
  let fixed = initial;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let snapshot = fixed ?? Date.now();
  return {
    now: () => fixed ?? Date.now(),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      snapshot = fixed ?? Date.now();
      if (fixed === undefined && !timer) timer = setInterval(() => { snapshot = Date.now(); listeners.forEach(fn => fn()); }, 1000);
      return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
    },
    advance(milliseconds) { if (fixed === undefined) throw new Error('Only an injected clock can advance'); fixed += milliseconds; snapshot = fixed; listeners.forEach(fn => fn()); },
  };
}
export const systemClock = createClock();
export function useNow(clock: Clock = systemClock) { return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot); }
