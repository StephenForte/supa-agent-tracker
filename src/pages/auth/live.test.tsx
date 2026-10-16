import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createHttpSources } from '../../data/http/createHttpSources';
import { createDemoSources } from '../../data/mock/createDemoSources';

HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
const secret = 'sat_one_time_private_plaintext';
async function setup(path: string, signedIn = true) {
  const demo = createDemoSources();
  const projects = await demo.tracker.listProjects(); const runs = await demo.tracker.listRuns(); const agents = await demo.tracker.listAgents();
  const account = { ...await demo.tracker.getAccount(), demo: false }; const steps = await demo.tracker.listNextSteps('prj_offers'); const note = await demo.privateNotes.get('prj_offers'); demo.dispose();
  let tokens: unknown[] = []; let authenticated = signedIn;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
    const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : {};
    let value: unknown = {};
    if (path === '/api/auth/get-session') value = authenticated ? { user: account } : null;
    else if (path === '/api/auth/sign-in/email') authenticated = true;
    else if (path === '/api/auth/sign-out') authenticated = false;
    else if (path === '/api/account') value = account;
    else if (path === '/api/projects?include_archived=true') value = { items: projects, nextCursor: null };
    else if (path.startsWith('/api/agents')) value = { items: agents, nextCursor: null };
    else if (path.startsWith('/api/runs?') || path === '/api/runs') value = { items: runs.map(run => ({ ...run, events: undefined })), nextCursor: null };
    else if (path.startsWith('/api/runs/')) value = runs.find(run => run.id === path.split('/')[3]);
    else if (path.endsWith('/next-steps')) value = steps;
    else if (path.endsWith('/private-note')) value = note;
    else if (path === '/api/tokens' && init?.method === 'POST') {
      const token = { id: 'live-token', label: body.label, projectIds: body.project_ids, display: 'sat_…text', createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null, revision: 1 }; tokens = [token]; value = { token, plaintext: secret };
    } else if (path === '/api/tokens') value = tokens;
    else if (path.startsWith('/api/projects/')) value = projects.find(project => project.id === path.split('/')[3]);
    return new Response(JSON.stringify(value));
  });
  const sources = createHttpSources({ fetch, onUnauthorized: () => window.dispatchEvent(new Event('session-expired')) });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { fetch, router };
}
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
it('hides every demo surface on project detail while fetching the expanded timeline only', async () => {
  const { fetch } = await setup('/projects/prj_offers?run=run_3');
  expect(await screen.findByRole('heading', { name: 'Offers workspace', level: 1 })).toBeVisible();
  await screen.findByRole('textbox', { name: 'Private note' });
  expect(screen.queryByText(/Demo only — Simulate agent update/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset demo' })).not.toBeInTheDocument();
  expect(screen.queryByText(/In this demo it is browser-only/)).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([path]) => String(path).startsWith('/api/runs/')).map(([path]) => path)).toEqual(['/api/runs/run_3']);
  await userEvent.click(screen.getByRole('button', { name: /Close run_4/ }));
  expect(await screen.findByRole('dialog', { name: 'Manually close run_4' })).toBeVisible();
  expect(screen.queryByText(/Simulated data only/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm close' })).toBeVisible();
});
it('ignores demo query overrides in live mode and hides project form demo wording', async () => {
  const { router } = await setup('/projects?demo=error');
  expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await screen.findByText('Offers workspace');
  expect(screen.queryByText(/Demo: projects could not/)).not.toBeInTheDocument();
  await act(async () => { await router.navigate('/projects/new'); });
  await screen.findByRole('heading', { name: 'New project' });
  expect(screen.queryByText(/Changes are saved in demo data/)).not.toBeInTheDocument();
});
it('redirects to login, submits real credentials and returns to the original route', async () => {
  const user = userEvent.setup(); const { router, fetch } = await setup('/agents?view=review', false);
  await screen.findByRole('heading', { level: 1, name: 'Log in' });
  expect(screen.queryByText(/This screen is simulated/)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Email'), 'live@example.test'); await user.type(screen.getByLabelText('Password'), 'password-for-live-test');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByRole('heading', { level: 1, name: 'All agents' });
  expect(router.state.location.pathname + router.state.location.search).toBe('/agents?view=review');
  expect(fetch.mock.calls.some(([path, init]) => path === '/api/auth/sign-in/email' && JSON.parse(String(init?.body)).email === 'live@example.test')).toBe(true);
  act(() => window.dispatchEvent(new Event('session-expired')));
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
});
it('owns live plaintext only in the open dialog and discards it on dismiss and navigation', async () => {
  const user = userEvent.setup(); const { router } = await setup('/settings/tokens');
  const create = await screen.findByRole('button', { name: 'Create token' }); await user.click(create);
  const dialog = await screen.findByRole('dialog', { name: 'Create token' });
  await user.type(within(dialog).getByLabelText('Label'), 'Live token'); await user.click(within(dialog).getByRole('checkbox', { name: 'Offers workspace' }));
  await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
  expect(await screen.findByRole('textbox', { name: 'Access token' })).toHaveValue(secret);
  expect(screen.queryByText(/Fake demo token/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.documentElement.innerHTML).not.toContain(secret);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(secret);
  expect(router.state.location.search).not.toContain(secret);
  await act(async () => { await router.navigate('/settings'); await router.navigate('/settings/tokens'); });
  expect(screen.queryByRole('textbox', { name: 'Access token' })).not.toBeInTheDocument();
});
it('shows invitation-only registration errors without simulated copy', async () => {
  const user = userEvent.setup(); const { fetch } = await setup('/register', false);
  await screen.findByRole('button', { name: 'Create account' });
  await user.type(screen.getByLabelText('Name'), 'New user'); await user.type(screen.getByLabelText('Email'), 'new@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'password-for-live-test'); await user.type(screen.getByLabelText('Confirm password'), 'password-for-live-test');
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'This invitation is invalid or has expired' } }), { status: 403 }));
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByText('This invitation is invalid or has expired')).toBeVisible();
  expect(screen.queryByText(/Registration does not create/)).not.toBeInTheDocument();
});
it('verifies the emailed token and removes it from the route after success', async () => {
  const { fetch, router } = await setup('/verify-email?token=synthetic-verification', false);
  expect(await screen.findByText('Email verified. You can log in.')).toBeVisible();
  expect(fetch.mock.calls.some(([path]) => path === '/api/auth/verify-email?token=synthetic-verification')).toBe(true);
  expect(router.state.location.search).toBe('');
});
it('submits password reset, account password change, and generic forgot-password confirmation', async () => {
  const user = userEvent.setup(); const { fetch, router } = await setup('/forgot-password', false);
  await user.type(await screen.findByLabelText('Email'), 'unknown@example.test'); await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByText("If an account exists, we've sent a link")).toBeVisible();
  await act(async () => { await router.navigate('/reset-password?token=synthetic-reset'); });
  await user.type(screen.getByLabelText('New password'), 'replacement-password'); await user.type(screen.getByLabelText('Confirm password'), 'replacement-password');
  await user.click(screen.getByRole('button', { name: 'Reset password' }));
  await screen.findByRole('heading', { level: 1, name: 'Log in' });
  expect(fetch.mock.calls.some(([path, init]) => path === '/api/auth/reset-password' && JSON.parse(String(init?.body)).token === 'synthetic-reset')).toBe(true);
  await user.type(screen.getByLabelText('Email'), 'live@example.test'); await user.type(screen.getByLabelText('Password'), 'replacement-password'); await user.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByRole('heading', { name: 'Projects', level: 1 }); await act(async () => { await router.navigate('/settings'); });
  await user.type(await screen.findByLabelText('Current password'), 'replacement-password'); await user.type(screen.getByLabelText('New password'), 'another-password'); await user.type(screen.getByLabelText('Confirm new password'), 'another-password');
  await user.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('Password changed. Other sessions have been revoked.')).toBeVisible();
  expect(screen.queryByText(/Password changes are disabled/)).not.toBeInTheDocument();
  expect(fetch.mock.calls.some(([path, init]) => path === '/api/auth/change-password' && JSON.parse(String(init?.body)).currentPassword === 'replacement-password')).toBe(true);
  await act(async () => { await router.navigate('/logout'); }); await user.click(screen.getByRole('button', { name: 'Confirm log out' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
});
