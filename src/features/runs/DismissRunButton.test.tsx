import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DemoAccountContext } from '../../app/useDemoAccount';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { seedTracker } from '../../data/mock/seed';
import type { Run } from '../../domain/types';
import { canDismissRun, DismissRunButton } from './DismissRunButton';
const run: Run = { ...seedTracker(Date.now()).runs[0]!, id: '12345678-abcdef', executionState: 'failed', workStatus: 'blocked' };
const disposers: (() => void)[] = [];
afterEach(() => disposers.splice(0).forEach(dispose => dispose()));
function show(demo = true, target = run) {
  const sources = createDemoSources();
  disposers.push(sources.dispose);
  const dismiss = vi.spyOn(sources.tracker, 'dismissRun');
  render(<DataProvider sources={sources}><DemoAccountContext value={demo}><DismissRunButton run={target} /></DemoAccountContext></DataProvider>);
  return dismiss;
}
it.each(['running', 'finished'] as const)('hides dismiss on %s executions', executionState => {
  expect(canDismissRun({ ...run, executionState })).toBe(false);
  show(true, { ...run, executionState });
  expect(screen.queryByRole('button')).toBeNull();
});
it.each(['failed', 'cancelled'] as const)('only dismisses %s executions when work status differs', executionState => {
  expect(canDismissRun({ ...run, executionState })).toBe(true);
  expect(canDismissRun({ ...run, executionState, workStatus: executionState })).toBe(false);
  show(true, { ...run, executionState, workStatus: executionState });
  expect(screen.queryByRole('button')).toBeNull();
});
it('labels the owner action and prevents duplicate submissions while pending', async () => {
  const dismiss = show(false);
  let resolve!: (value: Awaited<ReturnType<typeof dismiss>>) => void;
  dismiss.mockImplementation(() => new Promise(done => { resolve = done; }));
  const button = screen.getByRole('button', { name: 'Dismiss 12345678' });
  expect(button).toHaveAttribute('title', run.id);
  fireEvent.click(button);
  expect(screen.getByRole('button', { name: 'Dismissing… 12345678' })).toBeDisabled();
  fireEvent.click(button);
  expect(dismiss).toHaveBeenCalledExactlyOnceWith(run.id);
  await act(async () => resolve({ status: 'saved', value: { ...run, workStatus: 'failed' } }));
  expect(button).toBeEnabled();
});
it.each(['conflict', 'not_found', 'invalid', 'throw'] as const)('shows a retryable %s error without hiding the action', async status => {
  const dismiss = show();
  if (status === 'throw') dismiss.mockRejectedValue(new Error('network'));
  else if (status === 'invalid') dismiss.mockResolvedValue({ status, message: 'Only failed or cancelled runs can be dismissed.' });
  else if (status === 'conflict') dismiss.mockResolvedValue({ status, current: run });
  else dismiss.mockResolvedValue({ status });
  fireEvent.click(screen.getByRole('button', { name: 'Demo: dismiss 12345678' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(status === 'throw' ? 'Unable to dismiss this run. Please try again.' : status === 'invalid' ? 'Only failed or cancelled runs can be dismissed.' : 'This run changed or is no longer available. Please refresh and try again.');
  expect(screen.getByRole('button', { name: 'Demo: dismiss 12345678' })).toBeEnabled();
});
