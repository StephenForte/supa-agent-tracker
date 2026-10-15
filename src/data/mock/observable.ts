export function observable() {
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => revision,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    notify() { revision++; listeners.forEach(listener => listener()); },
  };
}
