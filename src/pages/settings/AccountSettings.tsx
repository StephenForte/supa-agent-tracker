import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
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
