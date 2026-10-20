import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createHttpSources } from '../../data/http/createHttpSources';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { seedTracker } from '../../data/mock/seed';
import { createClock, systemClock } from '../../domain/clock';
import { BASE_INSTRUCTION_DRAFT } from '../../domain/integrations/agentContext';
import type { McpToken, Project, Run } from '../../domain/types';
import { expectMobileTapTargets } from '../../test/mobileTargets';

const now = Date.parse('2026-10-19T20:00:00Z');
beforeEach(() => {
  vi.spyOn(systemClock, 'getSnapshot').mockReturnValue(now);
  vi.spyOn(systemClock, 'subscribe').mockImplementation(() => () => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function project(id: string, name: string, createdAt: string, lifecycle: Project['lifecycle'] = 'active'): Project {
  const seed = seedTracker(now).projects[0]!;
  return { ...seed, id, name, createdAt, updatedAt: createdAt, lifecycle };
}
function token(revokedAt: string | null): McpToken {
  return { id: `tok-${revokedAt ?? 'active'}`, label: 'Laptop', allProjects: true, projectIds: [], display: 'sat_…abcd', createdAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null, revokedAt };
}

function renderLive(options: { projects: Project[]; runs: Run[]; tokens: McpToken[] }) {
  const account = { ...seedTracker(now).account, demo: false };
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
    const path = String(input);
    const value = path === '/api/auth/get-session' ? { user: account }
      : path === '/api/projects?include_archived=true' ? { items: options.projects, nextCursor: null }
      : path === '/api/runs' ? { items: options.runs, nextCursor: null }
      : path === '/api/agents' ? { items: [], nextCursor: null }
      : path === '/api/account' ? account
      : path === '/api/tokens' ? options.tokens
      : null;
    return new Response(JSON.stringify(value));
  });
  const sources = createHttpSources({ fetch, visibility: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
  const router = createMemoryRouter(routes, { initialEntries: ['/needs-me'] });
  const view = render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { ...view, fetch, router };
}

const started = () => screen.getByRole('region', { name: 'Get started' });
const step = (id: string) => started().querySelector<HTMLElement>(`[data-step="${id}"]`)!;

it('shows 0/3 with a disabled prompt until a project exists', async () => {
  const { fetch, router, unmount } = renderLive({ projects: [], runs: [], tokens: [] });
  expect(await screen.findByText('0/3')).toBeVisible();
  expect(step('project')).toHaveAttribute('data-done', 'no');
  expect(step('token')).toHaveAttribute('data-done', 'no');
  expect(step('connect')).toHaveAttribute('data-done', 'no');
  expect(started().querySelector('a[href="/projects/new"]')).toHaveTextContent('Create a project');
  expect(started().querySelector('a[href="/settings/tokens"]')).toHaveTextContent('Create an MCP token');
  expect(started().querySelector('a[href="/settings/integrations"]')).toHaveTextContent('Connect your agent and give it the prompt');
  expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeDisabled();
  expect(screen.getByText('Create a project first.')).toBeVisible();
  expect(screen.getByText('Nothing needs you right now')).toBeVisible();
  expect(fetch.mock.calls.some(([url]) => url === '/api/tokens')).toBe(true);
  expectMobileTapTargets(document.querySelector('main')!);
  unmount(); router.dispose();
});

it('marks only the project done, then only the token, then both, and copies that project prompt', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const older = project('prj_old', 'Old', '2026-10-01T00:00:00.000Z');
  const newer = project('prj_new', 'Newest', '2026-10-18T00:00:00.000Z');
  const archived = project('prj_old_archive', 'Shelved', '2026-10-19T00:00:00.000Z', 'archived');
  const { unmount, router } = renderLive({ projects: [older], runs: [], tokens: [] });
  expect(await screen.findByText('1/3')).toBeVisible();
  expect(step('project')).toHaveAttribute('data-done', 'yes');
  expect(step('token')).toHaveAttribute('data-done', 'no');
  unmount(); router.dispose();

  const tokenOnly = renderLive({ projects: [], runs: [], tokens: [token(null)] });
  expect(await screen.findByText('1/3')).toBeVisible();
  expect(step('project')).toHaveAttribute('data-done', 'no');
  expect(step('token')).toHaveAttribute('data-done', 'yes');
  expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeDisabled();
  tokenOnly.unmount(); tokenOnly.router.dispose();

  const revoked = renderLive({ projects: [older], runs: [], tokens: [token('2026-10-02T00:00:00.000Z')] });
  expect(await screen.findByText('1/3')).toBeVisible();
  expect(step('token')).toHaveAttribute('data-done', 'no');
  revoked.unmount(); revoked.router.dispose();

  const ready = renderLive({ projects: [archived, older, newer], runs: [], tokens: [token('2026-10-02T00:00:00.000Z'), token(null)] });
  expect(await screen.findByText('2/3')).toBeVisible();
  expect(step('project')).toHaveAttribute('data-done', 'yes');
  expect(step('token')).toHaveAttribute('data-done', 'yes');
  expect(step('connect')).toHaveAttribute('data-done', 'no');
  await user.click(screen.getByRole('button', { name: 'Copy prompt for Newest' }));
  const copied = String(writeText.mock.calls.at(-1)?.[0]);
  expect(copied.startsWith('Report to Supa Agent Tracker project "Newest" (project_id prj_new); use that id instead of matching by repository.\n')).toBe(true);
  expect(copied.slice(copied.indexOf('\n') + 1)).toBe(BASE_INSTRUCTION_DRAFT);
  expect(copied).not.toContain('sat_');
  ready.unmount(); ready.router.dispose();
});

it('disables the prompt when every project is archived', async () => {
  const { unmount, router } = renderLive({ projects: [project('prj_box', 'Box', '2026-10-01T00:00:00.000Z', 'archived')], runs: [], tokens: [token(null)] });
  expect(await screen.findByText('2/3')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeDisabled();
  expect(screen.getByText('Create a project that is not archived first.')).toBeVisible();
  unmount(); router.dispose();
});

it('hides getting started once any run exists, including when nothing needs attention', async () => {
  const seed = seedTracker(now);
  const quiet = renderLive({ projects: seed.projects, runs: seed.runs.filter(run => run.id === 'run_7'), tokens: [] });
  await screen.findByText('Nothing needs you right now');
  expect(screen.queryByRole('region', { name: 'Get started' })).not.toBeInTheDocument();
  expect(quiet.fetch.mock.calls.some(([url]) => url === '/api/tokens')).toBe(false);
  quiet.unmount(); quiet.router.dispose();

  const busy = renderLive({ projects: seed.projects, runs: seed.runs.filter(run => run.id === 'run_4'), tokens: [] });
  await screen.findByText('1 item needs you');
  expect(screen.queryByRole('region', { name: 'Get started' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Blocked (1)' })).toBeVisible();
  busy.unmount(); busy.router.dispose();
});

it('leaves demo mode unchanged when the demo user has no runs', async () => {
  const sources = createDemoSources({ clock: createClock(now), storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
  vi.spyOn(sources.tracker, 'listRuns').mockResolvedValue([]);
  vi.spyOn(sources.tracker, 'listProjects').mockResolvedValue([]);
  const router = createMemoryRouter(routes, { initialEntries: ['/needs-me'] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  await screen.findByText('Nothing needs you right now');
  expect(screen.queryByRole('region', { name: 'Get started' })).not.toBeInTheDocument();
  expect(screen.queryByText('0/3')).not.toBeInTheDocument();
  sources.dispose(); router.dispose();
});
