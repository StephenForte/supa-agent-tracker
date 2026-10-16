import { useCallback, useMemo, useRef, useEffect, useState, type FormEvent } from 'react';
import { createInvitesClient } from '../../data/http/invites';
import { useTrackerData, useSourceQuery } from '../../data/hooks';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatTimestamp } from '../../domain/format';
import { InviteReveal } from './InviteReveal';

export function InvitesPanel() {
  const tracker = useTrackerData();
  const client = useMemo(() => createInvitesClient(), []);
  const [attempt, setAttempt] = useState(0);
  const [email, setEmail] = useState(''); const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const query = useSourceQuery(tracker, useCallback(() => { void attempt; return client.list(); }, [client, attempt]));
  async function create(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    setPending(true); setMessage(''); setLink(null);
    try {
      const result = await client.create(email);
      if (!mounted.current) return;
      setLink(result.link); setEmail(''); setAttempt(n => n + 1);
      setMessage(result.link ? result.emailSent ? 'Invitation email sent.' : 'Email could not be delivered. Copy and share the link below.' : 'This invitation was already created. Create another invite to reveal a new link.');
    } catch { if (mounted.current) setMessage('Unable to create this invite. Please try again.'); }
    finally { if (mounted.current) setPending(false); }
  }
  async function revoke(id: string) {
    if (pending) return; setPending(true); setMessage('');
    try { await client.revoke(id); if (mounted.current) { setAttempt(n => n + 1); setMessage('Invite revoked.'); } }
    catch { if (mounted.current) setMessage('Unable to revoke this invite. Refresh and try again.'); }
    finally { if (mounted.current) setPending(false); }
  }
  return <div className="grid gap-4">
    <p>Invite someone by email. Each link can be used once and expires after seven days.</p>
    <form onSubmit={event => void create(event)} className="grid max-w-md gap-3">
      <label>Email<input className="mt-1 block w-full rounded border border-slate-400 bg-white px-3 py-2" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
      <Button type="submit" variant="primary" disabled={pending || link !== null}>{pending ? 'Please wait…' : 'Create invite'}</Button>
    </form>
    {message && <p role="status">{message}</p>}
    {link && <InviteReveal link={link} onDismiss={() => setLink(null)} />}
    {query.status === 'loading' ? <p>Loading invites…</p> : query.status === 'error' ? <ErrorState message={query.error.message} onRetry={() => setAttempt(n => n + 1)} /> : <>
      {!query.data.length && <p>No invites yet.</p>}
      {query.data.map(invite => <article key={invite.id} className="slot" aria-label={`Invite for ${invite.email}`}>
        <h2 className="break-all">{invite.email}</h2><dl><dt>Status</dt><dd>{invite.status}</dd><dt>Expires</dt><dd>{formatTimestamp(invite.expiresAt)}</dd></dl>
        {invite.status === 'pending' && <Button disabled={pending} onClick={() => void revoke(invite.id)}>Revoke {invite.email}</Button>}
      </article>)}
    </>}
  </div>;
}
