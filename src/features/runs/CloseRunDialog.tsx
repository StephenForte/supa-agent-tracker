import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { useTrackerData } from '../../data/hooks';
import type { Run } from '../../domain/types';
export function CloseRunDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const source = useTrackerData();
  const [outcome, setOutcome] = useState<'failed' | 'cancelled'>('cancelled');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || pending) return;
    setPending(true); setError('');
    try {
      const result = await source.closeRun(run.id, outcome, reason.trim());
      if (result.status === 'saved') onClose();
      else setError(result.status === 'invalid' ? result.message : 'This run changed or is no longer available. Please refresh and try again.');
    } catch { setError('Unable to close this run. Please try again.'); }
    finally { setPending(false); }
  }
  return <Dialog open title={`Demo: manually close ${run.id}`} onClose={onClose}>
    <p>Simulated data only. Closing ends this execution and records your reason in its timeline. Next steps remain open.</p>
    <form onSubmit={event => { void submit(event); }} className="grid gap-4">
      <label>Outcome<select className="block w-full rounded border p-2" value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}><option value="cancelled">Cancelled</option><option value="failed">Failed</option></select></label>
      <label>Reason (required)<textarea className="block w-full rounded border p-2" required value={reason} onChange={event => setReason(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" variant="danger" disabled={pending || !reason.trim()}>{pending ? 'Closing…' : 'Confirm demo close'}</Button>
    </form>
  </Dialog>;
}
