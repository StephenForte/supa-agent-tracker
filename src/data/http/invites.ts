import { actionFields, createHttpClient, segment } from './client';
export interface Invite {
  id: string; email: string; createdAt: string; expiresAt: string; usedAt: string | null; revokedAt: string | null;
  status: 'pending' | 'used' | 'expired' | 'revoked';
}
export function createInvitesClient() {
  const client = createHttpClient(undefined, () => window.dispatchEvent(new Event('session-expired')));
  return {
    list: () => client.request<Invite[]>('/api/invites'),
    create: (email: string) => client.request<{ invite: Invite; link: string | null; emailSent: boolean }>('/api/invites', 'POST', { email, ...actionFields() }),
    revoke: (id: string) => client.request(`/api/invites/${segment(id)}/revoke`, 'POST', actionFields()),
  };
}
