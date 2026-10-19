import type { PublicAgentsLoader, PublicAgentsPayload } from './types';

/** Dedicated public fetch. Cookies are omitted so a signed-in browser still reads the anonymous page. */
export const fetchPublicAgents: PublicAgentsLoader = async (handle) => {
  const response = await fetch(`/api/public/${encodeURIComponent(handle)}/agents`, {
    method: 'GET', credentials: 'omit', cache: 'no-store', headers: { accept: 'application/json' },
  });
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error('The public page could not be loaded.');
  return response.json() as Promise<PublicAgentsPayload>;
};
