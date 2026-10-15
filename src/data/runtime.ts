import { createDemoSources } from './mock/createDemoSources';
function browserStorage() { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
export const demoSources = createDemoSources({ storage: browserStorage() });
