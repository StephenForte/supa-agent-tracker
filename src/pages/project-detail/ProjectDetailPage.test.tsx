import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { ProjectDetailPage } from './ProjectDetailPage';
const disposers: (() => void)[] = [];
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); });
function setup(path: string) {
  const clock = createClock(Date.now());
  const sources = createDemoSources({ clock });
  const router = createMemoryRouter([{ path: '/projects/:projectId', Component: ProjectDetailPage }], { initialEntries: [path] });
  disposers.push(sources.dispose, () => router.dispose());
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, clock, router };
}
it('shows a Public badge and the public page only when a handle is set', async () => {
  const { sources } = setup('/projects/prj_weather');
  await screen.findByRole('heading', { level: 1, name: 'Daily weather briefing' });
  expect(screen.queryByText('Public')).toBeNull();
  expect(screen.queryByRole('link', { name: 'View public page' })).toBeNull();
  expect(screen.queryByText(/Set a public handle/)).toBeNull();
  const project = (await sources.tracker.getProject('prj_weather'))!;
  expect(await sources.tracker.updateProject(project.id, { isPublic: true }, project.revision)).toMatchObject({ status: 'saved' });
  const prompt = await screen.findByText(/Set a public handle/);
  expect(prompt).toHaveTextContent('Set a public handle in Account settings to publish it');
  expect(screen.getByText('Public')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Account settings' })).toHaveAttribute('href', '/settings');
  expect(screen.queryByRole('link', { name: 'View public page' })).toBeNull();
  expect(await sources.tracker.updateAccount({ publicHandle: 'ada-bot' })).toMatchObject({ status: 'saved' });
  expect(await screen.findByRole('link', { name: 'View public page' })).toHaveAttribute('href', '/public/ada-bot/agents');
  expect(screen.queryByText(/Set a public handle/)).toBeNull();
  const current = (await sources.tracker.getProject('prj_weather'))!;
  expect(await sources.tracker.updateProject(current.id, { isPublic: false }, current.revision)).toMatchObject({ status: 'saved' });
  await waitFor(() => expect(screen.queryByText('Public')).toBeNull());
  expect(screen.queryByRole('link', { name: 'View public page' })).toBeNull();
});
it('closes a stale run, updates counts, freezes finish, audits reason and preserves next steps', async () => {
  const { sources, clock } = setup('/projects/prj_dashboard?run=run_4');
  await screen.findByRole('heading', { level: 1 });
  const stepsBefore = await sources.tracker.listNextSteps('prj_dashboard');
  const trigger = screen.getByRole('button', { name: 'Demo: close run run_4' });
  trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Confirm demo close' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Reason (required)'), { target: { value: 'Abandoned demo session' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm demo close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByRole('button', { name: 'Demo: close run run_4' })).toBeNull();
  expect(screen.getAllByText('Abandoned demo session')).toHaveLength(3);
  const count = screen.getByText('Stale running').closest('div')!;
  expect(within(count).getByText('0')).toBeVisible();
  expect(screen.getByText('Manual close')).toBeVisible();
  const closed = (await sources.tracker.getRun('run_4'))!;
  expect(closed.executionState).toBe('cancelled'); expect(closed.finishedAt).not.toBeNull();
  await act(async () => clock.advance(60000));
  expect((await sources.tracker.getRun('run_4'))!.finishedAt).toBe(closed.finishedAt);
  expect(await sources.tracker.listNextSteps('prj_dashboard')).toEqual(stepsBefore);
  expect(stepsBefore.steps.find(step => step.id === 'step_3')!.done).toBe(false);
});
it('supports Failed outcome, surfaces write errors and keeps the reason for retry', async () => {
  const { sources } = setup('/projects/prj_dashboard'); await screen.findByRole('heading', { level: 1 });
  const close = vi.spyOn(sources.tracker, 'closeRun').mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Demo: close run run_4' }));
  fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failed' } });
  fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Unrecoverable error' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm demo close' }));
  await screen.findByRole('alert'); expect(screen.getByLabelText('Reason (required)')).toHaveValue('Unrecoverable error');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm demo close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(close).toHaveBeenLastCalledWith('run_4', 'failed', 'Unrecoverable error');
  expect((await sources.tracker.getRun('run_4'))!.executionState).toBe('failed');
});
it('Escape cancellation restores focus without mutation', async () => {
  const { sources } = setup('/projects/prj_dashboard'); await screen.findByRole('heading', { level: 1 });
  const close = vi.spyOn(sources.tracker, 'closeRun');
  const trigger = screen.getByRole('button', { name: 'Demo: close run run_4' }); trigger.focus();
  const user = userEvent.setup(); await user.keyboard('{Enter}');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger).toHaveFocus(); expect(close).not.toHaveBeenCalled();
});
it('expands a deep link on first render and subsequent same-project URL changes', async () => {
  const { router } = setup('/projects/prj_offers?run=run_3'); await screen.findByRole('heading', { level: 1 });
  expect(screen.getByRole('button', { name: /run_3/, expanded: true })).toBeVisible();
  await act(() => router.navigate('/projects/prj_offers?run=run_1'));
  expect(screen.getByRole('button', { name: /run_1$/, expanded: true })).toBeVisible();
  expect(screen.getByText('No telemetry reported')).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'run_10' }));
  expect(screen.getByRole('button', { name: /run_10$/, expanded: true })).toBeVisible();
  const child = document.getElementById('details-run_10')!;
  expect(within(child).getAllByRole('link', { name: 'run_1' }).length).toBeGreaterThan(0);
});
it('archives and unarchives from the project page, bumping the revision each time', async () => {
  const { sources } = setup('/projects/prj_weather');
  await screen.findByRole('heading', { level: 1, name: 'Daily weather briefing' });
  const before = (await sources.tracker.getProject('prj_weather'))!;
  fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));
  await waitFor(async () => expect(await sources.tracker.getProject('prj_weather')).toMatchObject({ lifecycle: 'archived', name: before.name, revision: before.revision + 1 }));
  expect(screen.getByText('Archived')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Unarchive' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
  await waitFor(async () => expect(await sources.tracker.getProject('prj_weather')).toMatchObject({ lifecycle: 'active', revision: before.revision + 2 }));
  expect(screen.getByRole('button', { name: 'Archive project' })).toBeVisible();
  expect(screen.getByText('Active')).toBeVisible();
});
it('does not resubmit the previous revision while the page still shows the project from before the save', async () => {
  const { sources } = setup('/projects/prj_weather');
  await screen.findByRole('heading', { level: 1, name: 'Daily weather briefing' });
  const before = (await sources.tracker.getProject('prj_weather'))!;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve; });
  const readProject = sources.tracker.getProject.bind(sources.tracker);
  vi.spyOn(sources.tracker, 'getProject').mockImplementation(id => refreshGate.then(() => readProject(id)));
  const update = vi.spyOn(sources.tracker, 'updateProject');
  fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));
  await waitFor(async () => expect(await readProject('prj_weather')).toMatchObject({ lifecycle: 'archived', revision: before.revision + 1 }));
  const saving = screen.getByRole('button', { name: 'Saving…' });
  expect(saving).toBeDisabled();
  fireEvent.click(saving);
  expect(update).toHaveBeenCalledTimes(1);
  releaseRefresh();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Unarchive' })).toBeEnabled());
});
it('shows the conflict path for a stale archive and does not overwrite the other edit', async () => {
  const { sources } = setup('/projects/prj_offers');
  await screen.findByRole('heading', { level: 1, name: 'Offers workspace' });
  const original = sources.tracker.updateProject.bind(sources.tracker);
  let raced = false;
  vi.spyOn(sources.tracker, 'updateProject').mockImplementation(async (id, patch, revision) => {
    if (!raced) {
      raced = true;
      await original(id, { description: 'Changed elsewhere' }, revision);
      return original(id, patch, revision);
    }
    return original(id, patch, revision);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));
  expect(await screen.findByRole('heading', { name: 'Project changed elsewhere' })).toBeVisible();
  expect(await screen.findByText('Changed elsewhere')).toBeVisible();
  expect(await sources.tracker.getProject('prj_offers')).toMatchObject({ lifecycle: 'active', description: 'Changed elsewhere' });
  fireEvent.click(screen.getByRole('button', { name: /Archive project on revision/ }));
  await waitFor(async () => expect(await sources.tracker.getProject('prj_offers')).toMatchObject({ lifecycle: 'archived', description: 'Changed elsewhere' }));
  expect(screen.getByText('Archived')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Unarchive' })).toBeVisible();
});
it('links back to the project and closes the open run', async () => {
  const { router } = setup('/projects/prj_offers?run=run_3');
  await screen.findByRole('heading', { level: 1, name: 'Offers workspace' });
  const back = await screen.findByRole('link', { name: '← Offers workspace' });
  expect(back).toHaveAttribute('href', '/projects/prj_offers');
  fireEvent.click(back);
  await waitFor(() => expect(router.state.location.pathname).toBe('/projects/prj_offers'));
  expect(router.state.location.search).toBe('');
  await waitFor(() => expect(screen.queryByText('Run handoff')).toBeNull());
});
it('marks a finished run done from mobile cards', async () => {
  const previous = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
    addListener() {},
    removeListener() {},
  })) as typeof window.matchMedia;
  try {
    const { sources } = setup('/projects/prj_offers?run=run_3');
    const before = (await sources.tracker.getRun('run_3'))!;
    await screen.findByRole('heading', { level: 1, name: 'Offers workspace' });
    expect(screen.queryByRole('table', { name: /Run executions/ })).toBeNull();
    expect(document.querySelector('.min-w-\\[1100px\\]')).toBeNull();
    const cards = screen.getByRole('list', { name: 'Run cards' });
    expect(cards.className).not.toMatch(/min-w-/);
    const card = cards.querySelector<HTMLElement>('[data-run-id="run_3"]')!;
    expect(card.textContent).toContain('run_3');
    const status = card.querySelector('[data-latest-status]');
    expect(status).toHaveClass('line-clamp-2');
    expect(status).toHaveTextContent(before.message);
    fireEvent.click(within(card).getAllByRole('button', { name: 'Demo: mark done run_3' })[0]!);
    await waitFor(async () => expect(await sources.tracker.getRun('run_3')).toMatchObject({ workStatus: 'completed', executionState: 'finished', revision: before.revision + 1, events: before.events }));
    await waitFor(() => expect(document.querySelector('[data-run-id="run_3"]')?.textContent).not.toMatch(/mark done/i));
  } finally { window.matchMedia = previous; }
});
it('shows automation null links, all three historical runs and zero live runs', async () => {
  setup('/projects/prj_weather'); await screen.findByRole('heading', { level: 1, name: 'Daily weather briefing' });
  expect(screen.getByText('Repository: —')).toBeVisible();
  expect(screen.getByText('PRD: —')).toBeVisible();
  expect(screen.getByText('Automation')).toBeVisible();
  expect(screen.getByText('Live logical agents')).toBeVisible();
  expect(document.querySelectorAll('[data-run-id]')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /Demo: close/ })).toBeNull();
});
