import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { PublicAgentsPage } from './PublicAgentsPage';
import type { PublicAgentsPayload, PublicRun } from '../../data/public/types';

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
    expect(await screen.findByRole('heading', { level: 1, name: 'ada-bot' })).toBeVisible();
    expect(document.title).toBe('ada-bot (@ada-bot)');
    expect(screen.getByText('Public pages need the live app.')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  it('renders the allowlisted table by default, the shared 404, and polls only while visible', async () => {
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


describe('public agents recency ordering', () => {
  function run(title: string, lastContactAt: string, startedAt = lastContactAt): PublicRun {
    return { ...page.projects[0]!.agents[0]!.runs[0]!, title, lastContactAt, startedAt };
  }

  async function show(projects: PublicAgentsPayload['projects']) {
    const payload: PublicAgentsPayload = { owner: page.owner, projects };
    const original = structuredClone(payload);
    const load = vi.fn(async () => payload);
    const router = createMemoryRouter([
      { path: '/public/:handle/agents', element: <PublicAgentsPage loader={load} /> },
    ], { initialEntries: ['/public/ada-bot/agents?view=table'] });
    render(<RouterProvider router={router} />);
    await act(async () => { await Promise.resolve(); });
    expect(payload).toEqual(original);
    return load;
  }

  function rowValues() {
    return screen.getAllByRole('row').slice(1).map(row =>
      within(row).getAllByRole('cell').slice(0, 3).map(cell => cell.textContent));
  }

  it('puts the later-named agent first when its run has the newest contact', async () => {
    await show([{ name: 'Project', agents: [
      { name: 'Alpha', runs: [run('Older', '2026-10-19T10:00:00Z')] },
      { name: 'Zulu', runs: [run('Newer', '2026-10-19T11:00:00Z')] },
    ] }]);
    expect(rowValues()).toEqual([
      ['Project', 'Zulu', 'Newer'], ['Project', 'Alpha', 'Older'],
    ]);
  });

  it('interleaves runs from different projects without mutating the payload', async () => {
    await show([
      { name: 'Alpha', agents: [{ name: 'Worker A', runs: [
        run('Middle', '2026-10-19T11:00:00Z'), run('Oldest', '2026-10-19T09:00:00Z'),
      ] }] },
      { name: 'Zulu', agents: [{ name: 'Worker Z', runs: [
        run('Newest', '2026-10-19T12:00:00Z'), run('Earlier', '2026-10-19T10:00:00Z'),
      ] }] },
    ]);
    expect(rowValues()).toEqual([
      ['Zulu', 'Worker Z', 'Newest'], ['Alpha', 'Worker A', 'Middle'],
      ['Zulu', 'Worker Z', 'Earlier'], ['Alpha', 'Worker A', 'Oldest'],
    ]);
  });

  it('keeps agents without runs and projects without agents last in server order', async () => {
    await show([
      { name: 'Empty project', agents: [] },
      { name: 'Mixed', agents: [
        { name: 'Idle first', runs: [] },
        { name: 'Worker', runs: [run('Active', '2026-10-19T10:00:00Z')] },
        { name: 'Idle last', runs: [] },
      ] },
    ]);
    expect(rowValues()).toEqual([
      ['Mixed', 'Worker', 'Active'], ['Empty project', '—', '—'],
      ['Mixed', 'Idle first', '—'], ['Mixed', 'Idle last', '—'],
    ]);
  });

  it('breaks equal contact times by newest start time', async () => {
    await show([{ name: 'Project', agents: [{ name: 'Worker', runs: [
      run('Earlier start', '2026-10-19T12:00:00Z', '2026-10-19T09:00:00Z'),
      run('Later start', '2026-10-19T12:00:00Z', '2026-10-19T11:00:00Z'),
    ] }] }]);
    expect(rowValues().map(row => row[2])).toEqual(['Later start', 'Earlier start']);
  });

  it('preserves server order when both timestamps tie', async () => {
    await show([
      { name: 'First', agents: [{ name: 'Zulu', runs: [
        run('First run', '2026-10-19T12:00:00Z'), run('Second run', '2026-10-19T12:00:00Z'),
      ] }] },
      { name: 'Second', agents: [{ name: 'Alpha', runs: [run('Third run', '2026-10-19T12:00:00Z')] }] },
    ]);
    expect(rowValues().map(row => row[2])).toEqual(['First run', 'Second run', 'Third run']);
  });

  it('compares timestamp instants across offsets and fractional formats', async () => {
    await show([{ name: 'Project', agents: [{ name: 'Worker', runs: [
      run('Offset older', '2026-10-19T13:00:00+02:00'),
      run('Fraction older', '2026-10-19T12:00:00.001Z'),
      run('Newest', '2026-10-19T12:00:00.01Z'),
    ] }] }]);
    expect(rowValues().map(row => row[2])).toEqual(['Newest', 'Fraction older', 'Offset older']);
  });

  it('moves a newly contacted run to the top on the next poll', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const projects = [{ name: 'Project', agents: [{ name: 'Worker', runs: [
      run('Initially newest', '2026-10-19T12:00:00Z'), run('Updated later', '2026-10-19T11:00:00Z'),
    ] }] }];
    const load = await show(projects);
    expect(rowValues().map(row => row[2])).toEqual(['Initially newest', 'Updated later']);
    const refreshed = structuredClone(projects);
    refreshed[0]!.agents[0]!.runs[1]!.lastContactAt = '2026-10-19T13:00:00Z';
    load.mockResolvedValueOnce({ owner: page.owner, projects: refreshed });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(rowValues().map(row => row[2])).toEqual(['Updated later', 'Initially newest']);
  });
});
