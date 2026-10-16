function browserStorage() { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
// Preserve the existing export name consumed by hooks; selection is compile-time.
export const demoSources = import.meta.env.VITE_DATA_SOURCE === 'http'
  ? (await import('./http/createHttpSources')).createHttpSources({ onUnauthorized: () => window.dispatchEvent(new Event('session-expired')) })
  : (await import('./mock/createDemoSources')).createDemoSources({ storage: browserStorage() });
