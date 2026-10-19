import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
const sourcesForTest = () => createDemoSources({ clock: createClock(Date.now()) });
function mount(path = '/projects', sources = sourcesForTest()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, router, user: userEvent.setup() };
}
async function cards() { await screen.findByRole('article', { name: 'Offers workspace' }); return screen.getAllByRole('article'); }
describe('dashboard interactions', () => {
  it('renders correct live/stale/review counts, order, slots and independent links', async () => {
    const { router, user } = mount();
    const list = await cards();
    expect(list).toHaveLength(3);
    expect(list[0]).toHaveAccessibleName('Offers workspace');
    const offers = within(list[0]!);
    expect(offers.getByText('Live running').nextElementSibling).toHaveTextContent('3');
    expect(offers.getByText('Waiting for review').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('3 projects shown · 1 archived hidden')).toBeVisible();
    expect(screen.queryByText(/of \d+ projects shown/)).not.toBeInTheDocument();
    expect(offers.getByText('Live logical agents').nextElementSibling).toHaveTextContent('2');
    expect(offers.getByText('Logical agents').nextElementSibling).toHaveTextContent('2');
    expect(offers.getByText('Runs').nextElementSibling).toHaveTextContent('4');
    expect(offers.getByText('Active')).toBeVisible();
    expect(offers.getByText('Coding')).toBeVisible();
    expect(offers.getByRole('link', { name: 'Project PRD' })).toBeVisible();
    const dashboard = within(list[1]!);
    expect(dashboard.getByText('Live running').nextElementSibling).toHaveTextContent('0');
    expect(dashboard.getByText('Stale running').nextElementSibling).toHaveTextContent('2');
    expect(offers.getByText(/Next steps preview/)).toBeVisible();
    expect(offers.getByText(/Private note preview/)).toBeVisible();
    const external = offers.getAllByRole('link').filter(link => link.getAttribute('target') === '_blank');
    expect(external).toHaveLength(2);
    for (const link of external) { expect(link).toHaveAttribute('rel', 'noopener noreferrer'); await user.click(link); expect(router.state.location.pathname).toBe('/projects'); }
    expect(within(list[2]!).queryByRole('link', { name: 'Project PRD' })).not.toBeInTheDocument();
    expect(within(list[2]!).getByText('Repository: —')).toBeVisible();
    expect(within(list[2]!).getByText('PRD: —')).toBeVisible();
    const latest = offers.getByRole('region', { name: 'Latest update' });
    await user.click(within(latest).getByRole('link'));
    expect(router.state.location.pathname).toBe('/projects/prj_offers');
    expect(router.state.location.search).toMatch(/run=run_/);
  });
  it('composes filters, exposes active filters in no-match and clears them together', async () => {
    const { user } = mount(); await cards();
    await user.selectOptions(screen.getByLabelText('Activity'), 'stale');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('1 project shown · 2 hidden by filters · 1 archived hidden')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Project type'), 'automation');
    expect(screen.getByRole('heading', { name: 'No matching projects' })).toBeVisible();
    expect(screen.getAllByText(/Activity: Stale running/).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByLabelText('Activity')).toHaveValue('');
    expect(screen.getByLabelText('Project type')).toHaveValue('');
    expect(screen.getByText('3 projects shown · 1 archived hidden')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Lifecycle'), '');
    expect(screen.getByText('4 projects shown')).toBeVisible();
  });
  it('exercises text, lifecycle, type, activity, harness and tags individually, plus alternate sorts', async () => {
    const { user, sources } = mount(); await cards();
    const project = (await sources.tracker.getProject('prj_dashboard'))!;
    const cases = [['Lifecycle', 'archived'], ['Project type', 'automation'], ['Activity', 'live'], ['Activity', 'review-needed'], ['Activity', 'blocked'], ['Harness', 'Unknown'], ['Tag', project.tags[0]!]];
    for (const [label, value] of cases) {
      await user.selectOptions(screen.getByLabelText(label!), value!);
      expect(screen.getAllByRole('article')).toHaveLength(label === 'Tag' ? 2 : 1);
      await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    }
    await user.type(screen.getByLabelText('Search projects'), 'weather');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    for (const value of ['name', 'created', 'latest', 'active']) { await user.selectOptions(screen.getByLabelText('Sort projects'), value); expect(screen.getAllByRole('article')).toHaveLength(3); }
    await user.click(screen.getByRole('link', { name: 'Daily weather briefing' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Daily weather briefing' })).toBeVisible();
  });
  it.each(['loading', 'error', 'empty'])('shows demo=%s without changing store data', async demo => {
    const { sources } = mount(`/projects?demo=${demo}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    if (demo === 'loading') expect(screen.getByText('Loading projects…')).toBeVisible();
    if (demo === 'error') expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    if (demo === 'empty') expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
    expect(await sources.tracker.listProjects()).toHaveLength(4);
  });
  it('handles actual query errors and retries', async () => {
    const sources = sourcesForTest();
    vi.spyOn(sources.tracker, 'listProjects').mockRejectedValueOnce(new Error('Read failed'));
    const { user } = mount('/projects', sources);
    expect(await screen.findByRole('alert')).toHaveTextContent('Read failed');
    await user.click(screen.getByRole('button', { name: 'Try again' })); await cards();
  });
  it('keeps a non-default sort in the URL across reload and back, and shows Archived on an archived card', async () => {
    const { user, router } = mount();
    await cards();
    expect(router.state.location.search).toBe('');
    await user.selectOptions(screen.getByLabelText('Sort projects'), 'name');
    expect(router.state.location.search).toBe('?sort=name');
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName('Daily weather briefing');
    await user.click(screen.getByRole('link', { name: 'Daily weather briefing' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Daily weather briefing' })).toBeVisible();
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/projects');
    expect(router.state.location.search).toBe('?sort=name');
    expect(await screen.findByLabelText('Sort projects')).toHaveValue('name');
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName('Daily weather briefing');
    await user.selectOptions(screen.getByLabelText('Lifecycle'), 'archived');
    const archived = await screen.findByRole('article', { name: 'Archived prototype' });
    expect(within(archived).getByText('Archived')).toBeVisible();
    expect(router.state.location.search).toBe('?sort=name&lifecycle=archived');
    await user.selectOptions(screen.getByLabelText('Sort projects'), 'active');
    expect(router.state.location.search).toBe('?lifecycle=archived');
  });
  it('shows a true empty state for an empty source', async () => {
    const sources = sourcesForTest(); vi.spyOn(sources.tracker, 'listProjects').mockResolvedValue([]);
    mount('/projects', sources);
    expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Create a project' })[0]).toHaveAttribute('href', '/projects/new');
  });
});
describe('project mutations', () => {
  it('validates fields, creates through the shared source, opens detail, and lists the new project', async () => {
    const { user, sources, router } = mount('/projects/new');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByLabelText('Name (required)')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Name (required)'), 'My automation');
    await user.selectOptions(screen.getByLabelText('Project type'), 'automation');
    await user.type(screen.getByLabelText('Tags (comma separated)'), 'daily, demo');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'My automation' })).toBeVisible();
    const project = (await sources.tracker.listProjects()).find(project => project.name === 'My automation')!;
    expect(router.state.location.pathname).toBe(`/projects/${project.id}`);
    await act(() => router.navigate('/projects'));
    expect(await screen.findByRole('article', { name: 'My automation' })).toBeVisible();
  });
  it('edits every field and updates the shared card immediately', async () => {
    const { user, router, sources } = mount('/projects/prj_weather/edit');
    await screen.findByLabelText('Name (required)');
    const values = { 'Name (required)': 'Changed weather', Description: 'Daily summary', 'Repository name': 'weather', 'Repository URL': 'https://github.com/example-org/weather', 'PRD URL': 'https://example.com/prd', 'Tags (comma separated)': 'new, daily', 'Stale threshold minutes (required)': '30', 'Reporting instructions': 'Report daily' };
    for (const [label, value] of Object.entries(values)) { await user.clear(screen.getByLabelText(label)); await user.type(screen.getByLabelText(label), value); }
    await user.selectOptions(screen.getByLabelText('Lifecycle'), 'paused');
    await user.click(screen.getByLabelText('Heartbeat expected'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { level: 1, name: 'Changed weather' });
    expect(await sources.tracker.getProject('prj_weather')).toMatchObject({ name: 'Changed weather', lifecycle: 'paused', tags: ['new', 'daily'], reportingPolicy: { staleThresholdMinutes: 30, instructions: 'Report daily' } });
    await act(() => router.navigate('/projects'));
    expect(await screen.findByRole('article', { name: 'Changed weather' })).toBeVisible();
  });
  it('keeps drafts on stale revisions and requires explicit reapply, including repeated conflicts', async () => {
    const { user, sources } = mount('/projects/prj_offers/edit');
    const name = await screen.findByLabelText('Name (required)');
    await user.clear(name); await user.type(name, 'My draft');
    const original = (await sources.tracker.getProject('prj_offers'))!;
    await act(() => sources.tracker.updateProject(original.id, { name: 'Someone else', description: 'Their description' }, original.revision));
    expect(name).toHaveValue('My draft');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: 'Project changed elsewhere' })).toBeVisible();
    expect(screen.getByText('Someone else')).toBeVisible(); expect(screen.getByText('Their description')).toBeVisible();
    expect(name).toHaveValue('My draft');
    expect(await sources.tracker.getProject(original.id)).toMatchObject({ name: 'Someone else' });
    await act(() => sources.tracker.updateProject(original.id, { name: 'Another edit' }, original.revision + 1));
    await user.click(screen.getByRole('button', { name: `Apply my draft on revision ${original.revision + 1}` }));
    expect(await screen.findByText('Another edit')).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Apply my draft on revision ${original.revision + 2}` }));
    expect(await screen.findByRole('heading', { level: 1, name: 'My draft' })).toBeVisible();
  });
  it('cancels without mutations and preserves the saved project', async () => {
    const { user, sources } = mount('/projects/prj_weather/edit');
    const original = await sources.tracker.getProject('prj_weather');
    const name = await screen.findByLabelText('Name (required)'); await user.type(name, 'draft');
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await screen.findByRole('heading', { level: 1, name: original!.name });
    expect(await sources.tracker.getProject('prj_weather')).toEqual(original);
  });
  it('surfaces typed invalid results and thrown saves without losing the draft', async () => {
    const sources = sourcesForTest();
    vi.spyOn(sources.tracker, 'createProject').mockResolvedValueOnce({ status: 'invalid', message: 'Rejected by source' }).mockRejectedValueOnce(new Error('Offline'));
    const { user } = mount('/projects/new', sources);
    await user.type(screen.getByLabelText('Name (required)'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rejected by source');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be saved'));
    expect(screen.getByLabelText('Name (required)')).toHaveValue('Draft');
  });
});
