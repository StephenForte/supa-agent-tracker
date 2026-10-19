import { useState } from 'react';
import { useDemoAccount } from '../../app/useDemoAccount';
import { useTrackerData } from '../../data/hooks';
import { shortId } from '../../domain/format';
import type { Run } from '../../domain/types';

export function canMarkDone(run: Run): boolean {
  return run.executionState === 'finished' && run.workStatus !== 'completed';
}

export function MarkDoneButton({ run }: { run: Run }) {
  const source = useTrackerData();
  const demo = useDemoAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!canMarkDone(run)) return null;
  async function mark() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await source.markRunDone(run.id);
      if (result.status !== 'saved') setError(result.status === 'invalid' ? result.message : 'This run changed or is no longer available. Please refresh and try again.');
    } catch {
      setError('Unable to mark this run done. Please try again.');
    } finally {
      setPending(false);
    }
  }
  const label = pending ? 'Marking done…' : demo ? 'Demo: mark done' : 'Mark done';
  return <span className="mt-3 block">
    <button type="button" className="text-left text-xs underline" title={run.id} aria-label={`${label} ${shortId(run.id)}`} disabled={pending} onClick={() => { void mark(); }}>{label}</button>
    {error && <p role="alert">{error}</p>}
  </span>;
}
