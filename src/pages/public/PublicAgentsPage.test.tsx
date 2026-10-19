import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { PublicAgentsPage } from './PublicAgentsPage';
import type { PublicAgentsPayload } from '../../data/public/types';

const page: PublicAgentsPayload = {
  owner: { handle: 'ada-bot' },
  projects: [{ name: 'Weather', agents: [{ name: 'worker', runs: [{
    title: 'Status run', executionState: 'running', workStatus: 'in_progress', stale: true, harness: 'cursor',
    startedAt: '2026-10-19T15:00:00.000Z', lastContactAt: '2026-10-19T15:00:00.000Z', finishedAt: null,
  }] }] }],
};

function mount(path: string) {
  const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-19T16:00:00Z')) });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, user: userEvent.setup() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.head.querySelectorAll('meta[name="robots"]').forEach(node => node.remove());
});

describe('public agents page', () => {
  it('stays outside the app shell and tells the demo build to use the live app', async () => {
    mount('/public/ada-bot/agents');
    expect(await screen.findByRole('heading', { level: 1, name: 'Public agents' })).toBeVisible();
    expect(screen.getByText('Public pages need the live app.')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  it('renders the allowlisted grid, the shared 404, and polls only while visible', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const load = vi.fn<(handle: string) => Promise<PublicAgentsPayload | 'missing'>>(async () => page);
    const router = createMemoryRouter([{ path: '/public/:handle/agents', element: <PublicAgentsPage loader={load} /> }], { initialEntries: ['/public/ada-bot/agents'] });
    render(<RouterProvider router={router} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Weather')).toBeVisible();
    expect(screen.getByText('worker')).toBeVisible();
    expect(screen.getByText('Status run')).toBeVisible();
    expect(screen.getByText('Stale')).toBeVisible();
    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByText('In progress')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(load).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(load).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    load.mockResolvedValueOnce('missing');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('No public page here.')).toBeVisible();
  });
});

describe('owner public controls', () => {
  it('saves a public project from the project form', async () => {
    const { sources, user } = mount('/projects/new');
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeVisible();
    expect(screen.getByText('Visitors will see this project\'s name, its agent names, and run status only.')).toBeVisible();
    await user.type(screen.getByLabelText('Name (required)'), 'Public weather');
    await user.click(screen.getByRole('checkbox', { name: 'Public project' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('heading', { name: 'Public weather' })).toBeVisible();
    expect(await sources.tracker.getProject((await sources.tracker.listProjects()).find(project => project.name === 'Public weather')!.id)).toMatchObject({ isPublic: true });
  });

  it('saves a handle and shows the public URL with copy', async () => {
    const { user } = mount('/settings');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    expect(await screen.findByRole('heading', { name: 'Public page handle' })).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Public page handle' }), 'Demo-Ops');
    await user.click(screen.getByRole('button', { name: 'Save handle' }));
    expect(await screen.findByText(/Public URL/)).toHaveTextContent('/public/demo-ops/agents');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/public/demo-ops/agents'));
  });
});
