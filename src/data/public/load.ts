import type { PublicAgentsLoader, PublicProfileLoader } from './types';

/** The demo build does not include the public HTTP client. */
const live = import.meta.env.VITE_DATA_SOURCE === 'http' ? await import('./client') : null;
export const publicAgentsLoader: PublicAgentsLoader | null = live?.fetchPublicAgents ?? null;
export const publicProfileLoader: PublicProfileLoader | null = live?.fetchPublicProfile ?? null;
