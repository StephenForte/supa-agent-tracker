import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { mobileCss } from '../../test/mobileTargets';
import { PublicAgentsPage } from './PublicAgentsPage';
import type { PublicAgentsPayload, PublicProfilePayload } from '../../data/public/types';

const agentsPage: PublicAgentsPayload = {
  owner: { handle: 'ada-bot' },
  projects: [{ name: 'Weather', agents: [{ name: 'worker', runs: [{
    title: 'Status run', executionState: 'running', workStatus: 'in_progress', stale: false, harness: 'cursor',
    startedAt: '2026-10-19T15:00:00.000Z', lastContactAt: '2026-10-19T15:00:00.000Z', finishedAt: null,
  }] }] }],
};

function yearCounts(): number[] {
  const counts = Array.from({ length: 365 }, () => 0);
  counts[364] = 4;
  return counts;
}

const profilePage: PublicProfilePayload = {
  owner: {
    handle: 'ada-bot', name: 'Ada Lovelace', bio: 'Computing',
    links: { github: 'ada', x: 'ada_l', linkedin: 'javascript:alert(1)' },
    joinedAt: new Date(Date.now() - (10 * 86_400_000 + 3_600_000)).toISOString(),
    avatarUrl: '/api/public/ada-bot/avatar?v=abc123',
  },
  stats: { agentRuns: 218, longestRunSeconds: 4 * 3600, currentStreakDays: 102, longestStreakDays: 102 },
  activity: { start: '2025-10-22', end: '2026-10-21', counts: yearCounts() },
  harnesses: {
    start: '2026-09-22', end: '2026-10-21',
    series: [
      { harness: 'Cursor', counts: [175, ...Array(29).fill(0)] },
      { harness: 'Other', counts: [43, ...Array(29).fill(0)] },
    ],
  },
};

function show(path: string, profile: PublicProfilePayload | 'missing' = profilePage, agents: PublicAgentsPayload | 'missing' = agentsPage) {
  const profileLoader = vi.fn(async () => profile);
  const loader = vi.fn(async () => agents);
  const router = createMemoryRouter([
    { path: '/public/:handle', element: <PublicAgentsPage loader={loader} profileLoader={profileLoader} /> },
    { path: '/public/:handle/agents', element: <PublicAgentsPage loader={loader} profileLoader={profileLoader} /> },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { router, loader, profileLoader };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.head.querySelectorAll('meta[name="robots"]').forEach(node => node.remove());
});

describe('public profile page', () => {
  it('renders the handle route outside the shell in demo mode', async () => {
    const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-19T16:00:00Z')) });
    const router = createMemoryRouter(routes, { initialEntries: ['/public/ada-bot'] });
    render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'ada-bot' })).toBeVisible();
    expect(screen.getByText('Public pages need the live app.')).toBeVisible();
    expect(document.title).toBe('ada-bot (@ada-bot)');
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('shows the profile, safe links, heatmap and chart', async () => {
    show('/public/ada-bot');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible();
    expect(document.title).toBe('Ada Lovelace (@ada-bot)');
    expect(screen.getByText('@ada-bot')).toBeVisible();
    expect(screen.getByText('Computing')).toBeVisible();
    expect(screen.getByText('Joined 10 days ago')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Ada Lovelace avatar' })).toHaveAttribute('src', profilePage.owner.avatarUrl);
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/ada');
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute('href', 'https://x.com/ada_l');
    const linkedin = screen.getByRole('link', { name: 'LinkedIn' });
    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/javascript%3Aalert(1)');
    expect(linkedin).toHaveAttribute('target', '_blank');
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('4h')).toBeVisible();
    expect(screen.getByText('218')).toBeVisible();
    expect(screen.getAllByText('102d')).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: /: \d+ run/ })).toHaveLength(365);
    expect(screen.getByRole('img', { name: 'Oct 21, 2026: 4 runs' })).toBeVisible();
    expect(document.querySelector('[data-date="2026-10-19"]')).toHaveAttribute('data-row', '0');
    expect(document.querySelector('[data-date="2026-10-21"]')).toHaveAttribute('data-row', '2');
    expect(screen.getByRole('img', { name: 'Oct 21, 2026: 4 runs' }).closest('.public-scroll')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '218 agent runs' })).toBeVisible();
    const chart = screen.getByRole('heading', { name: '218 agent runs' }).closest('section');
    expect(chart).not.toBeNull();
    expect(within(chart!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Cursor (175)', 'Other (43)']);
    expect(mobileCss).toContain('.public-page { max-width: 100%; overflow-x: hidden; }');
    expect(mobileCss).toContain('.public-scroll { max-width: 100%; min-width: 0; overflow-x: auto; }');
    expect(mobileCss).toContain('.public-page :is(a, button, input, select, textarea, summary) { min-height: var(--mobile-tap-target); }');
    expect(screen.getByRole('button', { name: 'Table' }).closest('.public-page')).not.toBeNull();
    expect(screen.getByText('M').closest('.public-heat-days')).not.toBeNull();
    expect(screen.getByText('W').closest('.public-heat-days')).not.toBeNull();
    expect(screen.getByText('F').closest('.public-heat-days')).not.toBeNull();
  });

  it('defaults invalid views to table, preserves other params, and keeps explicit grid/table links', async () => {
    const user = userEvent.setup();
    const { router } = show('/public/ada-bot?view=nope&keep=yes');
    expect(await screen.findByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'Agents layout' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Table', 'Grid']);
    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(router.state.location.search).toBe('?view=grid&keep=yes');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'worker' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(router.state.location.search).toBe('?view=table&keep=yes');
    expect(screen.getByRole('table')).toBeVisible();
  });

  it.each(['/public/ada-bot', '/public/ada-bot/agents', '/public/ada-bot?view=table'])(
    'shows the table at %s', async path => {
      show(path);
      expect(await screen.findByRole('table')).toBeVisible();
      expect(screen.getByRole('cell', { name: 'Status run' })).toBeVisible();
    },
  );

  it('keeps identity, joined date and links together in the compact header', async () => {
    show('/public/ada-bot');
    const name = await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
    const header = name.closest('header')!;
    expect(within(header).getByText('Joined 10 days ago')).toBeVisible();
    expect(within(header).getByRole('link', { name: 'GitHub' })).toBeVisible();
    expect(document.querySelector('aside')).toBeNull();
  });

  it('shows the shared missing page when the profile is a 404', async () => {
    show('/public/ada-bot', 'missing', agentsPage);
    expect(await screen.findByText('No public page here.')).toBeVisible();
    expect(screen.queryByText('Weather')).not.toBeInTheDocument();
  });

  it('shows the shared missing page when the agents request is a 404', async () => {
    show('/public/ada-bot/agents', profilePage, 'missing');
    expect(await screen.findByText('No public page here.')).toBeVisible();
    expect(screen.queryByText('4h')).not.toBeInTheDocument();
    expect(screen.queryByText('Weather')).not.toBeInTheDocument();
  });

  it('loads the profile on mount and when the tab becomes visible, not on the agents poll', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { loader, profileLoader } = show('/public/ada-bot');
    await act(async () => { await Promise.resolve(); });
    expect(profileLoader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(profileLoader).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(loader).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(profileLoader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
