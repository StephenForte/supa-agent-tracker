import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import type { StorageAdapter } from '../../data/mock/persistence';
import { createClock } from '../../domain/clock';

function memoryStorage(): StorageAdapter {
  const items = new Map<string, string>();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: key => { items.delete(key); } };
}

function renderAt(path: string) {
  const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')), storage: memoryStorage() });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, router };
}

function assertPasswordsStayOutOfReach() {
  expect(document.querySelectorAll('form')).toHaveLength(0);
  const passwords = document.querySelectorAll('input[type="password"]');
  expect(passwords.length).toBeGreaterThan(0);
  for (const input of passwords) {
    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute('name');
    expect((input as HTMLInputElement).value).toBe('');
    expect(input).toHaveAccessibleDescription('Disabled in demo');
  }
}

describe('simulated auth flow', () => {
  afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

  it('walks login, register, verification, reset, demo entry, settings, and logout without submitting anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const user = userEvent.setup();
    const { sources } = renderAt('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    expect(screen.getByText(/This screen is simulated/)).toBeVisible();
    assertPasswordsStayOutOfReach();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'person@example.com');
    await user.click(screen.getByRole('link', { name: 'Register' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Register' })).toBeVisible();
    expect(screen.getByText(/This screen is simulated/)).toBeVisible();
    assertPasswordsStayOutOfReach();
    await user.click(screen.getByRole('link', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Verify email' })).toBeVisible();
    expect(screen.getByText(/This screen is simulated/)).toBeVisible();
    expect(screen.getByText(/No message was sent/)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Forgot password' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Forgot password' })).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'missing@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    const response = screen.getByText("If an account exists, we've sent a link");
    expect(response).toBeVisible();
    expect(response).not.toHaveTextContent('missing@example.com');
    await user.click(screen.getByRole('link', { name: 'Reset password' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Reset password' })).toBeVisible();
    expect(screen.getByText(/This screen is simulated/)).toBeVisible();
    assertPasswordsStayOutOfReach();
    await user.click(screen.getByRole('link', { name: 'Log in' }));
    await user.click(await screen.findByRole('link', { name: 'Continue as demo operator' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Account & settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Account settings' })).toBeVisible();
    expect(await screen.findByText('Demo operator')).toBeVisible();
    expect(screen.getByText('demo@example.invalid')).toBeVisible();
    expect(screen.getByText('Verified')).toBeVisible();
    assertPasswordsStayOutOfReach();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revoke other sessions' })).toBeDisabled();
    expect(screen.getByText(/Password changes are disabled in this demo/)).toBeVisible();
    expect(screen.getByText(/no live session to revoke/i)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'MCP tokens' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'MCP tokens' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Integration setup' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Integration setup' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Log out' })).toBeVisible();
    expect(screen.getByText(/This screen is simulated/)).toBeVisible();
    expect(screen.getByText(/no live session to end/i)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Confirm log out' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(document.documentElement.innerHTML).not.toContain('person@example.com');
    expect(document.documentElement.innerHTML).not.toContain('missing@example.com');
    sources.dispose();
    fetchSpy.mockRestore();
    xhrSpy.mockRestore();
  });

  it('reaches the demo projects path from login with the keyboard', async () => {
    const user = userEvent.setup();
    const { sources } = renderAt('/login');
    const continueLink = await screen.findByRole('link', { name: 'Continue as demo operator' });
    continueLink.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    sources.dispose();
  });
});
