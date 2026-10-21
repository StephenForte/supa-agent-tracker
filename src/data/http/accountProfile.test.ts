import { describe, expect, it, vi } from 'vitest';
import { createHttpSources } from './createHttpSources';
import { emptyPublicProfile } from '../../domain/public/profile';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const profile = { name: 'Ada', bio: null, github: 'ada', x: null, linkedin: null, timezone: 'Europe/Paris', avatarUpdatedAt: null };

describe('account public profile adapter', () => {
  it('defaults a missing profile and keeps one the server sends', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ id: 'u', name: 'Ada', email: 'a@example.com', emailVerified: true }))
      .mockResolvedValueOnce(json({ id: 'u', name: 'Ada', email: 'a@example.com', emailVerified: true, publicProfile: profile }));
    const { tracker } = createHttpSources({ fetch });
    expect((await tracker.getAccount()).publicProfile).toEqual(emptyPublicProfile());
    expect((await tracker.getAccount()).publicProfile).toEqual(profile);
  });

  it('sends publicProfile with a fresh request id', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ id: 'u', name: 'Ada', email: 'a@example.com', emailVerified: true, publicProfile: profile }));
    const { tracker } = createHttpSources({ fetch });
    const input = { name: 'Ada', bio: null, github: 'ada', x: null, linkedin: null, timezone: 'Europe/Paris' };
    await tracker.updateAccount({ publicProfile: input });
    await tracker.updateAccount({ publicProfile: { ...input, name: 'Bea' } });
    const bodies = fetch.mock.calls.map(call => JSON.parse(String(call[1]?.body)) as { publicProfile: typeof input; request_id: string });
    expect(bodies[0]?.publicProfile).toEqual(input);
    expect(bodies[0]?.request_id).toEqual(expect.any(String));
    expect(bodies[1]?.request_id).not.toBe(bodies[0]?.request_id);
    expect(Object.keys(bodies[0]?.publicProfile ?? {}).sort()).toEqual(['bio', 'github', 'linkedin', 'name', 'timezone', 'x']);
  });
});
