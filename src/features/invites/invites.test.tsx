import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { createHttpSources } from '../../data/http/createHttpSources';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { DataProvider } from '../../data/hooks';

const link = 'https://tracker.example.test/register?invite=inv_one_time_secret';
const invite = { id: 'invite-1', email: 'new@example.test', status: 'pending', createdAt: '2026-10-16T00:00:00Z', expiresAt: '2026-10-23T00:00:00Z', usedAt: null, revokedAt: null };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });
async function setup({ admin = true, demo = false, path = '/settings/invites', accountResponse }: { admin?: boolean; demo?: boolean; path?: string; accountResponse?: Promise<Response> } = {}) {
  const account = { id: 'user', name: 'User', email: 'admin@example.test', emailVerified: true, isAdmin: admin, demo: false };
  let invites: typeof invite[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
    const path = String(input); let value: unknown = {};
    if (path === '/api/auth/get-session') value = { user: account };
    if (path === '/api/account') { if (accountResponse) return accountResponse; value = account; }
    if (path === '/api/invites') {
      if (init?.method === 'POST') { invites = [invite]; value = { invite, link, emailSent: false }; }
      else value = invites;
    }
    if (path.endsWith('/revoke')) { invites = [{ ...invite, status: 'revoked' }]; value = { invite: invites[0] }; }
    return new Response(JSON.stringify(value));
  });
  vi.stubGlobal('fetch', fetch);
  const sources = demo ? createDemoSources() : createHttpSources({ fetch });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { fetch, router };
}
it('shows Invites only to the live administrator, hiding the form from non-admins and demo users', async () => {
  await setup({ admin: false });
  await screen.findByText('Invites are available to the verified administrator.');
  expect(screen.queryByRole('link', { name: 'Invites' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create invite' })).not.toBeInTheDocument();
  cleanup();
  const { fetch } = await setup({ demo: true });
  await screen.findByText('Invites are available to the verified administrator.');
  expect(screen.queryByRole('link', { name: 'Invites' })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it('creates, copies, dismisses and revokes; the secret never enters storage and disappears on navigation', async () => {
  const user = userEvent.setup(); const { router, fetch } = await setup();
  expect(await screen.findByRole('link', { name: 'Invites' })).toBeVisible();
  await user.type(await screen.findByLabelText('Email'), 'new@example.test');
  await user.click(screen.getByRole('button', { name: 'Create invite' }));
  expect(await screen.findByLabelText('Invite link')).toHaveValue(link);
  expect(screen.getByText('Email could not be delivered. Copy and share the link below.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await navigator.clipboard.readText()).toBe(link);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(link);
  expect(router.state.location.search).not.toContain(link);
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(document.documentElement.innerHTML).not.toContain(link);
  await user.click(screen.getByRole('button', { name: 'Revoke new@example.test' }));
  expect(await screen.findByText('revoked')).toBeVisible();
  expect(fetch.mock.calls.some(([path, init]) => path === '/api/invites/invite-1/revoke' && JSON.parse(String(init?.body)).request_id)).toBe(true);
  await user.type(screen.getByLabelText('Email'), 'new@example.test'); await user.click(screen.getByRole('button', { name: 'Create invite' }));
  await screen.findByLabelText('Invite link');
  await act(async () => { await router.navigate('/settings'); });
  expect(document.documentElement.innerHTML).not.toContain(link);
});
it('strips only invite from the register URL before submit, retains it only in memory, and passes it in the signup body', async () => {
  const user = userEvent.setup(); const { router, fetch } = await setup({ path: '/register?invite=inv_ephemeral&keep=yes#section' });
  await waitFor(() => expect(router.state.location.search).toBe('?keep=yes'));
  expect(router.state.location.hash).toBe('#section');
  await user.type(screen.getByLabelText('Name'), 'New User'); await user.type(screen.getByLabelText('Email'), 'new@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'strong-password'); await user.type(screen.getByLabelText('Confirm password'), 'strong-password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText('Check your email for a verification link.');
  expect(fetch.mock.calls.some(([path, init]) => path === '/api/auth/sign-up/email' && JSON.parse(String(init?.body)).invite === 'inv_ephemeral')).toBe(true);
  expect(document.documentElement.innerHTML).not.toContain('inv_ephemeral');
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('inv_ephemeral');
});

it('shows loading instead of denial while the administrator account lookup is pending', async () => {
  let resolve!: (response: Response) => void;
  const accountResponse = new Promise<Response>(done => { resolve = done; });
  await setup({ accountResponse });
  expect(await screen.findByText('Checking invite access…')).toBeVisible();
  expect(screen.queryByText('Invites are available to the verified administrator.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create invite' })).not.toBeInTheDocument();
  await act(async () => { resolve(new Response(JSON.stringify({ id: 'admin', name: 'Admin', email: 'admin@example.test', emailVerified: true, isAdmin: true }))); });
  expect(await screen.findByRole('link', { name: 'Invites' })).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Create invite' })).toBeVisible();
  expect(screen.queryByText('Invites are available to the verified administrator.')).not.toBeInTheDocument();
});
it('reports an account lookup failure as an error instead of denying admin access', async () => {
  await setup({ accountResponse: Promise.resolve(new Response(JSON.stringify({ error: { message: 'lookup failed' } }), { status: 500 })) });
  expect(await screen.findByText('The server could not complete the request. Please try again.')).toBeVisible();
  expect(screen.queryByText('Invites are available to the verified administrator.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
});
