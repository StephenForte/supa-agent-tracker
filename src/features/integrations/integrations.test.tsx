import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import type { PrivateNotesSource } from '../../data/contracts';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import type { StorageAdapter } from '../../data/mock/persistence';
import { createClock } from '../../domain/clock';

const PRIVATE_NOTES = ['Remember to inspect the mobile preview before approving.', 'Ask about the stale run before retrying.'];

function memoryStorage(): StorageAdapter {
  const items = new Map<string, string>();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: key => { items.delete(key); } };
}

describe('integration setup', () => {
  afterEach(() => { cleanup(); });

  it('shows unverified placeholder cards and a tracker-only reporting preview', async () => {
    const user = userEvent.setup();
    const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')), storage: memoryStorage() });
    const get = vi.fn(() => Promise.reject(new Error('private notes must not be read')));
    const save = vi.fn(() => Promise.reject(new Error('private notes must not be written')));
    const privateNotes: PrivateNotesSource = { subscribe: sources.privateNotes.subscribe, getSnapshot: sources.privateNotes.getSnapshot, get, save };
    const router = createMemoryRouter(routes, { initialEntries: ['/settings/integrations'] });
    render(<DataProvider sources={{ tracker: sources.tracker, privateNotes }}><RouterProvider router={router} /></DataProvider>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Integration setup' })).toBeVisible();
    expect(screen.getAllByText('Not connected · Not tested')).toHaveLength(3);
    expect(screen.getAllByText('Unverified — not a working configuration')).toHaveLength(3);
    for (const name of ['Cursor', 'Claude Desktop (macOS)', 'Grok Bot']) {
      const card = screen.getByRole('article', { name });
      expect(card).toHaveTextContent('<MCP_SERVER_URL>');
      expect(card).toHaveTextContent('<YOUR_TOKEN>');
      expect(card).toHaveTextContent('<PLACEHOLDER>');
      expect(card.textContent ?? '').not.toMatch(/\b(npm|npx|brew|curl)\b/);
    }
    expect(screen.queryByText(/compatible/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Project'), 'prj_offers');
    expect(await screen.findByText(/Do not include secrets or claim reporting succeeded when it failed/)).toBeVisible();
    expect(screen.getByText('step_1')).toBeVisible();
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
});
