import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import type { PrivateNotesSource } from '../../data/contracts';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import type { StorageAdapter } from '../../data/mock/persistence';
import { DemoAccountContext } from '../../app/useDemoAccount';
import { IntegrationsPanel } from './IntegrationsPanel';
import { BASE_INSTRUCTION_DRAFT } from '../../domain/integrations/agentContext';
import { createClock } from '../../domain/clock';

const PRIVATE_NOTES = ['Remember to inspect the mobile preview before approving.', 'Ask about the stale run before retrying.'];

function memoryStorage(): StorageAdapter {
  const items = new Map<string, string>();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: key => { items.delete(key); } };
}

describe('integration setup', () => {
  afterEach(() => { cleanup(); });

  it('shows probe-verified setup, demo status and a tracker-only reporting preview', async () => {
    const user = userEvent.setup();
    const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')), storage: memoryStorage() });
    const get = vi.fn(() => Promise.reject(new Error('private notes must not be read')));
    const save = vi.fn(() => Promise.reject(new Error('private notes must not be written')));
    const privateNotes: PrivateNotesSource = { subscribe: sources.privateNotes.subscribe, getSnapshot: sources.privateNotes.getSnapshot, get, save };
    const router = createMemoryRouter(routes, { initialEntries: ['/settings/integrations'] });
    render(<DataProvider sources={{ tracker: sources.tracker, privateNotes }}><RouterProvider router={router} /></DataProvider>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Integration setup' })).toBeVisible();
    expect(screen.getAllByText('Not connected · Not tested')).toHaveLength(3);
    expect(screen.getByText('Production-verified 2026-10-16 (P1-G2, Cursor 3.25.6)')).toBeVisible();
    expect(screen.getAllByText('Production-verified 2026-10-16 (P1-G2)')).toHaveLength(2);
    for (const name of ['Cursor', 'Claude Desktop (macOS)', 'Grok Bot']) {
      const card = screen.getByRole('article', { name });
      expect(card).toHaveTextContent('https://<your tracker host>/mcp');
      expect(card).toHaveTextContent('<YOUR_TOKEN>');
      expect(card).not.toHaveTextContent('sat_');
    }
    for (const link of screen.getAllByRole('link', { name: 'MCP tokens' })) expect(link).toHaveAttribute('href', '/settings/tokens');

    await user.selectOptions(screen.getByLabelText('Project'), 'prj_offers');
    expect(screen.getByText(BASE_INSTRUCTION_DRAFT, { normalizer: text => text })).toBeVisible();
    expect(await screen.findByText('step_1')).toBeVisible();
    expect(screen.getByText(/Review and merge PR #74 after checking the form/)).toBeVisible();
    expect(screen.getByText('T0-11a is still implementing the second form variant.')).toBeVisible();
    expect(screen.queryByText('Confirm the preview opens on a narrow screen.')).not.toBeInTheDocument();
    for (const note of PRIVATE_NOTES) expect(screen.queryByText(note)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Project'), 'prj_dashboard');
    expect(await screen.findByText('step_3')).toBeVisible();
    expect(screen.getByText(/Inspect the failed sorting run/)).toBeVisible();
    expect(screen.queryByText('T0-11a is still implementing the second form variant.')).not.toBeInTheDocument();
    expect(screen.queryByText('step_1')).not.toBeInTheDocument();
    for (const note of PRIVATE_NOTES) expect(screen.queryByText(note)).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    sources.dispose();
  });
  it('shows origin-based setup in http mode, copies URL/prompt and handles copy failure', async () => {
    const user = userEvent.setup();
    const sources = createDemoSources({ storage: memoryStorage() });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const router = createMemoryRouter([{ path: '/', element: <DemoAccountContext value={false}><IntegrationsPanel /></DemoAccountContext> }]);
    render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
    await screen.findByRole('heading', { name: 'Server and instructions' });
    for (const link of screen.getAllByRole('link', { name: 'MCP tokens' })) expect(link).toHaveAttribute('href', '/settings/tokens');
    expect(document.body).toHaveTextContent(`${window.location.origin}/mcp`);
    expect(document.body).not.toHaveTextContent('https://<your tracker host>/mcp');
    expect(document.body).not.toHaveTextContent('sat_');
    expect(screen.queryByText('Not connected · Not tested')).not.toBeInTheDocument();
    expect(screen.getByText('Production-verified 2026-10-16 (P1-G2, Cursor 3.25.6)')).toBeVisible();
    expect(screen.getAllByText('Production-verified 2026-10-16 (P1-G2)')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Copy MCP URL' }));
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/mcp`);
    await user.click(screen.getByRole('button', { name: 'Copy base prompt' }));
    expect(writeText).toHaveBeenLastCalledWith(BASE_INSTRUCTION_DRAFT);
    writeText.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy MCP URL' }));
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
    sources.dispose();
  });

});
