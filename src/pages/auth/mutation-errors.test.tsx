import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { DemoAccountContext } from '../../app/useDemoAccount';
import { NextStepsPanel } from '../../features/next-steps/NextStepsPanel';
import { PrivateNotePanel } from '../../features/private-notes/PrivateNotePanel';
import { CloseRunDialog } from '../../features/runs/CloseRunDialog';
const disposers: (() => void)[] = [];
afterEach(() => { cleanup(); disposers.splice(0).forEach(dispose => dispose()); });
function setup() {
  const sources = createDemoSources(); disposers.push(sources.dispose);
  const account = sources.tracker.getAccount;
  sources.tracker.getAccount = async () => ({ ...await account(), demo: false });
  return sources;
}
const internal = 'raw-database-error-token-marker';
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
it('re-enables next-step completion after a rejected write and preserves its instruction for retry', async () => {
  const user = userEvent.setup(); const sources = setup(); const original = sources.tracker.setNextStepDone;
  const write = vi.fn(original).mockRejectedValueOnce(new Error(internal)); sources.tracker.setNextStepDone = write;
  render(<DataProvider sources={sources}><DemoAccountContext.Provider value={false}><MemoryRouter><NextStepsPanel projectId="prj_offers" /></MemoryRouter></DemoAccountContext.Provider></DataProvider>);
  const checkbox = await screen.findByRole('checkbox', { name: 'Mark done: Review and merge PR #74 after checking the form.' });
  await user.click(checkbox);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to update this step. Please try again.');
  expect(checkbox).toBeEnabled(); expect(checkbox).not.toBeChecked(); expect(document.body.textContent).not.toContain(internal);
  await user.click(checkbox);
  expect(await screen.findByRole('checkbox', { name: 'Reopen: Review and merge PR #74 after checking the form.' })).toBeChecked();
  expect(write).toHaveBeenCalledTimes(2);
});
it('re-enables private-note saving after rejection and keeps the complete unsaved draft', async () => {
  const user = userEvent.setup(); const sources = setup(); const original = sources.privateNotes.save;
  sources.privateNotes.save = vi.fn(original).mockRejectedValueOnce(new Error(internal));
  render(<DataProvider sources={sources}><DemoAccountContext.Provider value={false}><PrivateNotePanel projectId="prj_offers" /></DemoAccountContext.Provider></DataProvider>);
  const field = await screen.findByRole('textbox', { name: 'Private note' }); await user.clear(field); await user.type(field, 'My unsaved private reminder');
  const save = screen.getByRole('button', { name: 'Save' }); await user.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save your note. Your draft is still here. Please try again.');
  expect(save).toBeEnabled(); expect(field).toBeEnabled(); expect(field).toHaveValue('My unsaved private reminder'); expect(document.body.textContent).not.toContain(internal);
  await user.click(save); expect(await sources.privateNotes.get('prj_offers')).toMatchObject({ text: 'My unsaved private reminder' });
});
it('re-enables close-run submission after rejection and retains the reason and outcome', async () => {
  const user = userEvent.setup(); const sources = setup(); const run = (await sources.tracker.getRun('run_4'))!;
  sources.tracker.closeRun = vi.fn().mockRejectedValue(new Error(internal));
  render(<DataProvider sources={sources}><DemoAccountContext.Provider value={false}><CloseRunDialog run={run} onClose={() => {}} /></DemoAccountContext.Provider></DataProvider>);
  await user.selectOptions(screen.getByLabelText('Outcome'), 'failed'); await user.type(screen.getByLabelText('Reason (required)'), 'Keep this close reason');
  const confirm = screen.getByRole('button', { name: 'Confirm close' }); await user.click(confirm);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to close this run. Please try again.');
  expect(confirm).toBeEnabled(); expect(screen.getByLabelText('Reason (required)')).toHaveValue('Keep this close reason'); expect(screen.getByLabelText('Outcome')).toHaveValue('failed'); expect(document.body.textContent).not.toContain(internal);
});
