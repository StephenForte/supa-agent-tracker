import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import type { PrivateNotesSource, TrackerDataSource } from '../../data/contracts';
import { createDemoSources } from '../../data/mock/createDemoSources';
import type { StorageAdapter } from '../../data/mock/persistence';
import { createClock } from '../../domain/clock';
import { museSetupMessage } from '../../domain/integrations/clientConfig';
import { MCP_PLACEHOLDER_URL } from '../../domain/integrations/examples';
import type { McpToken } from '../../domain/types';
import { LiveTokensPanel } from './LiveTokensPanel';

const NEEDLE = 'sat_demo_NOT_A_REAL_TOKEN';

function memoryStorage(): StorageAdapter & { dump(): string } {
  const items = new Map<string, string>();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: key => { items.delete(key); },
    dump: () => [...items.entries()].map(([key, value]) => `${key}=${value}`).join('\n'),
  };
}

function browserStorageDump(): string {
  const parts: string[] = [];
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? '';
      parts.push(`${key}=${storage.getItem(key) ?? ''}`);
    }
  }
  return parts.join('\n');
}

function assertSecretGone(secret: string, storage: { dump(): string }) {
  expect(document.documentElement.innerHTML).not.toContain(secret);
  expect(document.documentElement.innerHTML).not.toContain(NEEDLE);
  expect(storage.dump()).not.toContain(NEEDLE);
  expect(browserStorageDump()).not.toContain(NEEDLE);
}

function renderTokens() {
  const storage = memoryStorage();
  const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')), storage });
  const router = createMemoryRouter(routes, { initialEntries: ['/settings/tokens'] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, storage, router };
}

function quietConsole() {
  return (['log', 'info', 'debug', 'warn', 'error'] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
}

function installDialogPolyfill() {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') proto.showModal = function showModal() { this.open = true; };
  if (typeof proto.close !== 'function') proto.close = function close() { this.open = false; };
}

describe('MCP tokens', () => {
  afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });
  installDialogPolyfill();

  it('shows last used for tok_1, Never for tok_2, and masked values', async () => {
    const { sources } = renderTokens();
    expect(await screen.findByRole('heading', { level: 1, name: 'MCP tokens' })).toBeVisible();
    const first = screen.getByRole('article', { name: 'Demo coding client tok_1' });
    const second = screen.getByRole('article', { name: 'Demo weather bot tok_2' });
    expect(within(first).getByText('Active')).toBeVisible();
    expect(within(first).getByText('Offers workspace')).toBeVisible();
    expect(within(first).getByText('sat_demo_…FAKE_1')).toBeVisible();
    expect(within(first).queryByText('Never')).not.toBeInTheDocument();
    expect(within(second).getByText('Never')).toBeVisible();
    expect(within(second).getByText('Daily weather briefing')).toBeVisible();
    expect(within(second).getByText('sat_demo_…FAKE_2')).toBeVisible();
    sources.dispose();
  });

  it('creates a scoped token, copies it once, and drops the plaintext on dismiss', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const logs = quietConsole();
    const user = userEvent.setup();
    const { sources, storage } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a fake token' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Preview client');
    await user.click(within(dialog).getByRole('radio', { name: 'Specific projects' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Offers workspace' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Daily weather briefing' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const revealed = await screen.findByRole('textbox', { name: 'Fake demo token' });
    const secret = (revealed as HTMLInputElement).value;
    expect(secret).toMatch(/^sat_demo_NOT_A_REAL_TOKEN_/);
    expect(screen.getByText('Fake demo token — cannot authenticate anything')).toBeVisible();
    const created = screen.getByRole('article', { name: /Preview client/ });
    expect(within(created).getByText('Offers workspace, Daily weather briefing')).toBeVisible();
    expect(within(created).getByText('Never')).toBeVisible();
    expect(created).not.toHaveTextContent(NEEDLE);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(secret);
    const cursorConfig = (screen.getByRole('textbox', { name: 'Cursor config' }) as HTMLTextAreaElement).value;
    expect(JSON.parse(cursorConfig).mcpServers['supa-agent-tracker'].headers.Authorization).toBe(`Bearer ${secret}`);
    expect((screen.getByRole('textbox', { name: 'Claude Desktop config' }) as HTMLTextAreaElement).value).toContain(`Bearer ${secret}`);
    expect((screen.getByRole('textbox', { name: 'Grok Bot config' }) as HTMLTextAreaElement).value).toContain(`Masked secret: ${secret}`);
    const museMessage = (screen.getByRole('textbox', { name: 'Muse setup message' }) as HTMLTextAreaElement).value;
    expect(museMessage).toBe(museSetupMessage(MCP_PLACEHOLDER_URL));
    expect(museMessage).toContain(MCP_PLACEHOLDER_URL);
    expect(museMessage).not.toContain(secret);
    await user.click(screen.getByRole('button', { name: 'Copy Cursor config' }));
    await user.click(screen.getByRole('button', { name: 'Copy Claude Desktop config' }));
    await user.click(screen.getByRole('button', { name: 'Copy Grok Bot config' }));
    await user.click(screen.getByRole('button', { name: 'Copy Muse setup message' }));
    expect(writeText).toHaveBeenCalledWith(museMessage);
    expect(writeText.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([secret, cursorConfig]));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('textbox', { name: 'Fake demo token' })).not.toBeInTheDocument();
    expect(screen.queryByText('Fake demo token — cannot authenticate anything')).not.toBeInTheDocument();
    assertSecretGone(secret, storage);
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(NEEDLE);
    sources.dispose();
  });

  it('discards a revealed token when navigating away and does not restore it', async () => {
    const user = userEvent.setup();
    const { sources, storage } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a fake token' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Ephemeral');
    await user.click(within(dialog).getByRole('radio', { name: 'Specific projects' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Offers workspace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    const secret = (await screen.findByRole('textbox', { name: 'Fake demo token' }) as HTMLInputElement).value;
    await user.click(screen.getByRole('link', { name: 'Account settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Account settings' })).toBeVisible();
    assertSecretGone(secret, storage);
    await user.click(screen.getByRole('link', { name: 'MCP tokens' }));
    expect(await screen.findByRole('article', { name: /Ephemeral/ })).toBeVisible();
    assertSecretGone(secret, storage);
    sources.dispose();
  });

  it('clears a previous copy status when rotation replaces the revealed plaintext', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { sources, storage } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a fake token' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Copied once');
    await user.click(within(dialog).getByRole('radio', { name: 'Specific projects' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Offers workspace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    const first = (await screen.findByRole('textbox', { name: 'Fake demo token' }) as HTMLInputElement).value;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Rotate Demo coding client' }));
    const rotateDialog = await screen.findByRole('dialog', { name: 'Rotate token?' });
    await user.click(within(rotateDialog).getByRole('button', { name: 'Rotate token' }));
    const second = (await screen.findByRole('textbox', { name: 'Fake demo token' }) as HTMLInputElement).value;
    expect(second).not.toBe(first);
    expect(screen.queryByText('Copied.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    assertSecretGone(first, storage);
    assertSecretGone(second, storage);
    sources.dispose();
  });

  it('rotates tok_1 into a new one-time reveal and revokes tok_2', async () => {
    const user = userEvent.setup();
    const { sources, storage } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Rotate Demo coding client' }));
    const rotateDialog = await screen.findByRole('dialog', { name: 'Rotate token?' });
    await user.click(within(rotateDialog).getByRole('button', { name: 'Rotate token' }));
    const secret = (await screen.findByRole('textbox', { name: 'Fake demo token' }) as HTMLInputElement).value;
    expect(secret).toMatch(/^sat_demo_NOT_A_REAL_TOKEN_/);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    assertSecretGone(secret, storage);
    expect(screen.queryByRole('article', { name: 'Demo coding client tok_1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show revoked (1)' }));
    expect(within(screen.getByRole('article', { name: 'Demo coding client tok_1' })).getByText('Revoked')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Revoke Demo weather bot' }));
    const revokeDialog = await screen.findByRole('dialog', { name: 'Revoke token?' });
    await user.click(within(revokeDialog).getByRole('button', { name: 'Revoke token' }));
    expect(await within(screen.getByRole('article', { name: 'Demo weather bot tok_2' })).findByText('Revoked')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show revoked (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('article', { name: 'Demo weather bot tok_2' })).getByText('Never')).toBeVisible();
    sources.dispose();
  });

  it('shows an error and selects the token when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const user = userEvent.setup();
    const { sources, storage } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a fake token' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Clipboard');
    await user.click(within(dialog).getByRole('radio', { name: 'Specific projects' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Offers workspace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    const revealed = await screen.findByRole('textbox', { name: 'Fake demo token' });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard copy failed. The token is selected so you can copy it manually.');
    expect(revealed).toHaveFocus();
    expect((revealed as HTMLInputElement).selectionStart).toBe(0);
    expect((revealed as HTMLInputElement).selectionEnd).toBe((revealed as HTMLInputElement).value.length);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    assertSecretGone((revealed as HTMLInputElement).value, storage);
    sources.dispose();
  });

  it('shows the data-layer message when creation is invalid', async () => {
    const user = userEvent.setup();
    const { sources } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a fake token' });
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Provide a label and at least one existing project scope.');
    expect(screen.queryByRole('textbox', { name: 'Fake demo token' })).not.toBeInTheDocument();
    sources.dispose();
  });

  it('defaults to all projects, then an edit to specific projects replaces that mode', async () => {
    const user = userEvent.setup();
    const { sources, storage } = renderTokens();
    await screen.findByRole('article', { name: 'Demo coding client tok_1' });
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a fake token' });
    expect(within(dialog).getByRole('radio', { name: 'All my projects (including future ones)' })).toBeChecked();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Future projects');
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    const secret = (await screen.findByRole('textbox', { name: 'Fake demo token' }) as HTMLInputElement).value;
    const created = screen.getByRole('article', { name: /Future projects/ });
    expect(within(created).getByText('All my projects')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    assertSecretGone(secret, storage);
    await user.click(within(created).getByRole('button', { name: 'Edit scope' }));
    const scope = await screen.findByRole('dialog', { name: 'Edit scope' });
    expect(within(scope).getByRole('radio', { name: 'All my projects (including future ones)' })).toBeChecked();
    await user.click(within(scope).getByRole('radio', { name: 'Specific projects' }));
    await user.click(within(scope).getByRole('checkbox', { name: 'Offers workspace' }));
    await user.click(within(scope).getByRole('button', { name: 'Save scope' }));
    expect(within(await screen.findByRole('article', { name: /Future projects/ })).getByText('Offers workspace')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Cursor config' })).not.toBeInTheDocument();
    sources.dispose();
  });

  it('lists active tokens by last use and hides revoked tokens until the toggle', async () => {
    const tokens: McpToken[] = [
      { id: 'old', label: 'Older active', allProjects: true, projectIds: [], display: 'sat_…old', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: '2026-10-01T00:00:00.000Z', revokedAt: null },
      { id: 'new', label: 'Recent active', allProjects: true, projectIds: [], display: 'sat_…new', createdAt: '2026-08-01T00:00:00.000Z', lastUsedAt: '2026-10-18T00:00:00.000Z', revokedAt: null },
      { id: 'rev-a', label: 'Revoked one', allProjects: true, projectIds: [], display: 'sat_…a', createdAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2026-10-19T00:00:00.000Z', revokedAt: '2026-10-19T01:00:00.000Z' },
      { id: 'rev-b', label: 'Revoked two', allProjects: true, projectIds: [], display: 'sat_…b', createdAt: '2026-01-02T00:00:00.000Z', lastUsedAt: null, revokedAt: '2026-10-03T00:00:00.000Z' },
    ];
    const tracker = { subscribe: () => () => {}, getSnapshot: () => 1, async listTokens() { return tokens; }, async listProjects() { return []; } } as unknown as TrackerDataSource;
    const privateNotes = { subscribe: () => () => {}, getSnapshot: () => 0, get: () => Promise.reject(new Error('unused')), save: () => Promise.reject(new Error('unused')) } as PrivateNotesSource;
    const user = userEvent.setup();
    render(<DataProvider sources={{ tracker, privateNotes }}><LiveTokensPanel /></DataProvider>);
    const labels = () => screen.getAllByRole('article').map(article => article.getAttribute('aria-label'));
    expect(await screen.findByRole('article', { name: 'Recent active new' })).toBeVisible();
    expect(labels()).toEqual(['Recent active new', 'Older active old']);
    expect(screen.queryByText('Revoked')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show revoked (2)' }));
    expect(labels()).toEqual(['Recent active new', 'Older active old', 'Revoked one rev-a', 'Revoked two rev-b']);
    expect(screen.getByRole('button', { name: 'Show revoked (2)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty state when the demo has no tokens', async () => {
    const tracker = {
      subscribe() { return () => {}; },
      getSnapshot: () => 1,
      async listTokens() { return [] as McpToken[]; },
      async listProjects() { return []; },
    } as unknown as TrackerDataSource;
    const privateNotes = { subscribe: () => () => {}, getSnapshot: () => 0, get: () => Promise.reject(new Error('unused')), save: () => Promise.reject(new Error('unused')) } as PrivateNotesSource;
    render(<DataProvider sources={{ tracker, privateNotes }}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/settings/tokens'] })} /></DataProvider>);
    expect(await screen.findByRole('heading', { name: 'No MCP tokens' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create token' })).toBeVisible();
  });
});
