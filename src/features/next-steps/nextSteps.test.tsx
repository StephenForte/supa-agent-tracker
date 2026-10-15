import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { DataProvider } from '../../data/hooks';
import type { PrivateNotesSource, TrackerDataSource } from '../../data/contracts';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { formatTimestamp } from '../../domain/format';
import { NextStepsPanel } from './NextStepsPanel';
import { NextStepsPreview } from './NextStepsPreview';

const now = Date.parse('2026-10-14T20:00:00Z');
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

function setup() {
  const clock = createClock(now);
  const sources = createDemoSources({ clock });
  disposers.push(sources.dispose);
  return { clock, sources };
}
function show(projectId: string, sources: ReturnType<typeof createDemoSources>, tracker: TrackerDataSource = sources.tracker) {
  return render(<DataProvider sources={{ tracker, privateNotes: sources.privateNotes }}>
    <MemoryRouter>
      <NextStepsPanel projectId={projectId} />
      <NextStepsPreview projectId={projectId} />
    </MemoryRouter>
  </DataProvider>);
}

describe('agent next steps', () => {
  it('checks and reopens a step in the panel and the preview together, including from the keyboard', async () => {
    const user = userEvent.setup();
    show('prj_offers', setup().sources);
    const preview = () => screen.getByRole('group', { name: 'Next steps preview' });
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark done: Review and merge PR #74 after checking the form.' });
    expect(checkbox).toBeEnabled();
    expect(within(preview()).getByText('1 open')).toBeVisible();
    expect(within(preview()).getByText(/Source agent T0-11b/)).toBeVisible();
    expect(within(preview()).getByRole('link', { name: 'View source run run_3' })).toHaveAttribute('href', '/projects/prj_offers?run=run_3');
    expect(within(preview()).getByText(/T0-11a is still implementing/)).toBeVisible();
    checkbox.focus();
    await user.keyboard('[Space]');
    const completed = await screen.findByRole('checkbox', { name: 'Reopen: Review and merge PR #74 after checking the form.' });
    expect(completed).toBeChecked();
    await waitFor(() => expect(completed).toHaveFocus());
    expect(within(preview()).getByText('No open steps')).toBeVisible();
    expect(within(preview()).queryByText('1 open')).not.toBeInTheDocument();
    expect(within(preview()).getByText(/T0-11a is still implementing/)).toBeVisible();
    await user.keyboard('[Space]');
    expect(await screen.findByRole('checkbox', { name: 'Mark done: Review and merge PR #74 after checking the form.' })).not.toBeChecked();
    expect(within(preview()).getByText('1 open')).toBeVisible();
  });

  it('keeps the checkbox disabled until the refreshed step replaces the pre-write snapshot', async () => {
    const user = userEvent.setup();
    const { sources } = setup();
    const waiting: Array<() => void> = [];
    let holdReads = false;
    const tracker: TrackerDataSource = Object.create(sources.tracker);
    const listNextSteps = sources.tracker.listNextSteps.bind(sources.tracker);
    tracker.listNextSteps = async projectId => {
      const bundle = await listNextSteps(projectId);
      if (holdReads) await new Promise<void>(resolve => { waiting.push(resolve); });
      return bundle;
    };
    show('prj_offers', sources, tracker);
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark done: Review and merge PR #74 after checking the form.' });
    holdReads = true;
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await act(async () => { waiting.splice(0).forEach(resolve => resolve()); });
    const completed = await screen.findByRole('checkbox', { name: 'Reopen: Review and merge PR #74 after checking the form.' });
    expect(completed).toBeChecked();
    await waitFor(() => expect(completed).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const saved = (await sources.tracker.listNextSteps('prj_offers')).steps.find(step => step.id === 'step_1');
    expect(saved).toMatchObject({ done: true, revision: 2 });
  });

  it('keeps the earliest open step as the preview after another step is reopened', async () => {
    const user = userEvent.setup();
    show('prj_offers', setup().sources);
    await screen.findByRole('checkbox', { name: /Mark done: Review and merge/ });
    await user.click(screen.getByRole('checkbox', { name: /Reopen: Confirm the preview opens/ }));
    const preview = screen.getByRole('group', { name: 'Next steps preview' });
    expect(await within(preview).findByText('2 open')).toBeVisible();
    expect(within(preview).getByText('Review and merge PR #74 after checking the form.')).toBeVisible();
    expect(within(preview).queryByText('Confirm the preview opens on a narrow screen.')).not.toBeInTheDocument();
  });

  it('shows who completed a step and lets a failed source run still be completed and reopened', async () => {
    const user = userEvent.setup();
    const offers = setup();
    show('prj_offers', offers.sources);
    const bundle = await offers.sources.tracker.listNextSteps('prj_offers');
    const completed = bundle.steps.find(step => step.id === 'step_2')!;
    expect(await screen.findByText(`Completed by Demo operator · ${formatTimestamp(completed.completionChangedAt)}`)).toBeVisible();
    cleanup();
    const dashboard = setup();
    show('prj_dashboard', dashboard.sources);
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark done: Inspect the failed sorting run and approve a retry in its harness.' });
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(await screen.findByRole('checkbox', { name: /Reopen: Inspect the failed sorting/ })).toBeChecked();
    expect((await dashboard.sources.tracker.getRun('run_5'))?.executionState).toBe('failed');
    await user.click(screen.getByRole('checkbox', { name: /Reopen: Inspect the failed sorting/ }));
    expect(await screen.findByRole('checkbox', { name: /Mark done: Inspect the failed sorting/ })).not.toBeChecked();
    expect((await dashboard.sources.tracker.getRun('run_5'))?.executionState).toBe('failed');
  });

  it('preserves completion when the current revision is rewritten and explains a stale write', async () => {
    const user = userEvent.setup();
    const { sources } = setup();
    show('prj_offers', sources);
    await screen.findByRole('checkbox', { name: /Reopen: Confirm the preview opens/ });
    await user.click(screen.getByRole('button', { name: 'Send a stale revision' }));
    expect(await screen.findByText(/The agent must re-read and reconcile. Nothing was overwritten./)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Reopen: Confirm the preview opens on a narrow screen./ })).toBeChecked();
    const unchanged = await sources.tracker.listNextSteps('prj_offers');
    expect(unchanged.steps.find(step => step.id === 'step_2')?.instruction).toBe('Confirm the preview opens on a narrow screen.');
    await user.click(screen.getByRole('button', { name: 'Rewrite with the current revision' }));
    expect(await screen.findByText(/Completion state was left unchanged./)).toBeVisible();
    const rewritten = await screen.findByRole('checkbox', { name: /Reopen: Confirm the preview opens on a narrow screen. \[demo update/ });
    expect(rewritten).toBeChecked();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps the attempted completion visible when the step changed, then retries with the reread revision', async () => {
    const user = userEvent.setup();
    const { sources } = setup();
    let trapped = true;
    const inner = sources.tracker;
    const tracker: TrackerDataSource = { ...inner, async setNextStepDone(id, done, expected) {
      if (trapped) {
        trapped = false;
        const existing = (await inner.listNextSteps('prj_offers')).steps.find(step => step.id === id)!;
        const updated = await inner.simulateAgentStepUpdate(id, 'Changed before the check was saved', existing.sourceRunId, existing.revision);
        if (updated.status !== 'saved') throw new Error('setup failed');
        return { status: 'conflict', current: updated.value };
      }
      return inner.setNextStepDone(id, done, expected);
    } };
    show('prj_offers', sources, tracker);
    await user.click(await screen.findByRole('checkbox', { name: 'Mark done: Review and merge PR #74 after checking the form.' }));
    expect(await screen.findByText(/You wanted to mark this step done/)).toBeVisible();
    expect(screen.getAllByText('Changed before the check was saved').length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: /Mark done: Changed before the check was saved/ })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('checkbox', { name: /Reopen: Changed before the check was saved/ })).toBeChecked();
    expect((await sources.tracker.listNextSteps('prj_offers')).steps.find(step => step.id === 'step_1')?.done).toBe(true);
  });

  it('renders instruction text instead of raw HTML and does not let a source link activate the surrounding card', async () => {
    const user = userEvent.setup();
    const { sources } = setup();
    show('prj_offers', sources);
    const bundle = await sources.tracker.listNextSteps('prj_offers');
    const step = bundle.steps.find(item => item.id === 'step_1')!;
    await act(async () => { await sources.tracker.simulateAgentStepUpdate(step.id, 'See <img src=x onerror=alert(1)> and `npm test` at https://github.com/example-org/offers/pull/74.', step.sourceRunId, step.revision); });
    expect(await screen.findAllByText(/<img src=x onerror=alert\(1\)>/)).not.toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByText('npm test').every(node => node.tagName === 'CODE')).toBe(true);
    const external = screen.getAllByRole('link', { name: 'https://github.com/example-org/offers/pull/74' });
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    cleanup();
    const onCard = vi.fn();
    render(<div onClick={onCard}><MemoryRouter><DataProvider sources={sources}><NextStepsPreview projectId="prj_offers" /></DataProvider></MemoryRouter></div>);
    await user.click(await screen.findByRole('link', { name: 'View source run run_3' }));
    expect(onCard).not.toHaveBeenCalled();
  });

  it('restores seeded steps after reset and shows an empty project as having no open steps', async () => {
    const user = userEvent.setup();
    const { sources, clock } = setup();
    show('prj_offers', sources);
    await user.click(await screen.findByRole('checkbox', { name: /Mark done: Review and merge/ }));
    await screen.findByRole('checkbox', { name: /Reopen: Review and merge/ });
    clock.advance(60_000);
    await act(async () => { await sources.tracker.resetDemo(); });
    expect(await screen.findByRole('checkbox', { name: 'Mark done: Review and merge PR #74 after checking the form.' })).not.toBeChecked();
    cleanup();
    show('prj_weather', setup().sources);
    expect(await screen.findAllByText('No open steps')).not.toHaveLength(0);
    expect(screen.getAllByText('No steps to update.')).not.toHaveLength(0);
  });
});

describe('data-path boundary', () => {
  it('renders next steps while every private-note method throws', async () => {
    const calls: string[] = [];
    const privateNotes = new Proxy({} as PrivateNotesSource, { get(_target, property) {
      return () => { calls.push(String(property)); throw new Error(String(property)); };
    } });
    const { sources } = setup();
    render(<DataProvider sources={{ tracker: sources.tracker, privateNotes }}>
      <MemoryRouter><NextStepsPanel projectId="prj_offers" /><NextStepsPreview projectId="prj_offers" /></MemoryRouter>
    </DataProvider>);
    expect(await screen.findByRole('region', { name: 'Agent next steps' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Next steps preview' })).toBeVisible();
    expect(calls).toEqual([]);
  });
});
