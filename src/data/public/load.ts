import type { PublicAgentsLoader } from './types';

/** The demo build does not include the public HTTP client. */
export const publicAgentsLoader: PublicAgentsLoader | null = import.meta.env.VITE_DATA_SOURCE === 'http'
  ? (await import('./client')).fetchPublicAgents
  : null;
