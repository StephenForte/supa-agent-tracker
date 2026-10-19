import { useCallback, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import type { Account } from '../../domain/types';
import { LiveAccountControls } from './LiveAccountControls';
import { DisabledPasswordField } from '../auth/DisabledPasswordField';

export function AccountSettings() {
  const tracker = useTrackerData();
  const [attempt, setAttempt] = useState(0);
  const account = useSourceQuery(tracker, useCallback(() => { void attempt; return tracker.getAccount(); }, [tracker, attempt]));
  if (account.status === 'loading') return <p>Loading account…</p>;
  if (account.status === 'error') return <ErrorState message={account.error.message} onRetry={() => setAttempt(value => value + 1)} />;
  return <div className="flex flex-col gap-4">
    {account.data.demo && <p className="lede">Account settings are simulated. The identity below comes from the demo account.</p>}
    <section className="slot" aria-labelledby="identity-heading">
      <h2 id="identity-heading">{account.data.demo ? 'Demo identity' : 'Account identity'}</h2>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className="text-sm text-slate-600">Name</dt><dd>{account.data.name}</dd></div>
        <div><dt className="text-sm text-slate-600">Email</dt><dd className="break-all">{account.data.email}</dd></div>
        <div><dt className="text-sm text-slate-600">Email status</dt><dd>{account.data.emailVerified ? 'Verified' : 'Not verified'}</dd></div>
      </dl>
    </section>
    <PublicHandleForm account={account.data} />
    <EmailAlerts account={account.data} />
    {account.data.demo ? <><section className="slot" aria-labelledby="password-heading">
      <h2 id="password-heading">Password</h2>
      <p id="password-help">Password changes are disabled in this demo. Nothing typed into a password field is kept.</p>
      <DisabledPasswordField label="Current password" />
      <DisabledPasswordField label="New password" />
      <DisabledPasswordField label="Confirm new password" />
      <div className="mt-4"><Button disabled aria-describedby="password-help">Change password</Button></div>
    </section>
    <section className="slot" aria-labelledby="sessions-heading">
      <h2 id="sessions-heading">Sessions</h2>
      <p id="sessions-help">Session management is disabled in this demo. There is no live session to revoke.</p>
      <Button disabled aria-describedby="sessions-help">Revoke other sessions</Button>
    </section></> : <LiveAccountControls />}
  </div>;
}

function PublicHandleForm({ account }: { account: Account }) {
  const tracker = useTrackerData();
  const [handle, setHandle] = useState(account.publicHandle ?? '');
  const [saved, setSaved] = useState(account.publicHandle ?? null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const url = saved ? `${window.location.origin}/public/${saved}/agents` : '';
  async function save(next: string | null) {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const result = await tracker.updateAccount({ publicHandle: next });
      if (result.status === 'saved') {
        const value = result.value.publicHandle ?? null;
        setSaved(value);
        setHandle(value ?? '');
        setMessage(value ? 'Public handle saved.' : 'Public handle cleared.');
      } else setMessage(result.message);
    } catch {
      setMessage('The handle could not be saved. Try again.');
    } finally {
      setPending(false);
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void save(handle.trim() ? handle : null); }
  return <section className="slot" aria-labelledby="public-handle-heading">
    <h2 id="public-handle-heading">Public page handle</h2>
    <p className="text-sm text-slate-600">Letters, numbers, and hyphens, 3–32 characters. Visitors see project names, agent names, and run status only.</p>
    <form onSubmit={event => void submit(event)} className="grid max-w-xl gap-3">
      <label className="text-sm font-medium" htmlFor="public-handle">Public page handle
        <input id="public-handle" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" value={handle} onChange={event => setHandle(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={pending}>Save handle</Button>
        <Button type="button" disabled={pending || !saved} onClick={() => void save(null)}>Clear handle</Button>
      </div>
    </form>
    {saved && <p className="break-all text-sm">Public URL <span>{url}</span> <Button type="button" onClick={() => { void navigator.clipboard.writeText(url).then(() => setMessage('Copied the public URL.'), () => setMessage('The URL could not be copied.')); }}>Copy</Button></p>}
    {message && <p role="status">{message}</p>}
  </section>;
}

function EmailAlerts({ account }: { account: Account }) {
  const tracker = useTrackerData();
  const [alerts, setAlerts] = useState(account.alerts ?? { blocked: false, stale: false, review: false });
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function toggle(kind: 'blocked' | 'stale' | 'review') {
    if (pending) return;
    const previous = alerts;
    const next = { ...alerts, [kind]: !alerts[kind] };
    setPending(true);
    setAlerts(next);
    setMessage('');
    try {
      const result = await tracker.updateAccount({ alerts: next });
      if (result.status === 'saved') setAlerts(result.value.alerts ?? next);
      else { setAlerts(previous); setMessage(result.message); }
    } catch {
      setAlerts(previous);
      setMessage('Email alerts could not be saved. Try again.');
    } finally {
      setPending(false);
    }
  }
  return <section className="slot" aria-labelledby="email-alerts-heading">
    <h2 id="email-alerts-heading">Email alerts</h2>
    <p className="text-sm text-slate-600">A digest is sent at most every 5 minutes. Turning an alert on does not email items that already need you.</p>
    <div className="grid gap-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alerts.blocked} disabled={pending} onChange={() => void toggle('blocked')} />Blocked</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alerts.stale} disabled={pending} onChange={() => void toggle('stale')} />Stale</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alerts.review} disabled={pending} onChange={() => void toggle('review')} />Waiting for review</label>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
