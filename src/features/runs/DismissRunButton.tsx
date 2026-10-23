import { useState } from 'react';
import { useDemoAccount } from '../../app/useDemoAccount';
import { useTrackerData } from '../../data/hooks';
import { shortId } from '../../domain/format';
import type { Run } from '../../domain/types';

export function canDismissRun(run: Run): boolean {
  return (run.executionState === 'failed' || run.executionState === 'cancelled') && run.workStatus !== run.executionState;
}

export function DismissRunButton({ run }: { run: Run }) {
  const source = useTrackerData();
  const demo = useDemoAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!canDismissRun(run)) return null;
  async function dismiss() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await source.dismissRun(run.id);
      if (result.status !== 'saved') setError(result.status === 'invalid' ? result.message : 'This run changed or is no longer available. Please refresh and try again.');
    } catch {
      setError('Unable to dismiss this run. Please try again.');
    } finally {
      setPending(false);
    }
  }
  const label = pending ? 'Dismissing…' : demo ? 'Demo: dismiss' : 'Dismiss';
  return <span className="mt-3 block">
    <button type="button" className="text-left text-xs underline" title={run.id} aria-label={`${label} ${shortId(run.id)}`} disabled={pending} onClick={() => { void dismiss(); }}>{label}</button>
    {error && <p role="alert">{error}</p>}
  </span>;
}
