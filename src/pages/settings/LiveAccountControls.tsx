import { useState, type FormEvent } from 'react';
import { useTrackerData } from '../../data/hooks';
import { Button } from '../../components/ui/Button';
export function LiveAccountControls() {
  const { auth } = useTrackerData(); const [message, setMessage] = useState(''); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth || pending) return;
    const form = event.currentTarget; const data = new FormData(form);
    if (data.get('new') !== data.get('confirm')) { setMessage('Passwords do not match.'); return; }
    setPending(true); setMessage('');
    try { await auth.submit('change-password', { currentPassword: String(data.get('current')), newPassword: String(data.get('new')) }); form.reset(); setMessage('Password changed. Other sessions have been revoked.'); }
    catch { setMessage('Unable to change your password. Check your current password and try again.'); }
    finally { setPending(false); }
  }
  return <section className="slot"><h2>Password</h2><form onSubmit={event => void submit(event)} className="grid max-w-md gap-3">
    <label>Current password<input type="password" name="current" required autoComplete="current-password" /></label>
    <label>New password<input type="password" name="new" required minLength={8} autoComplete="new-password" /></label>
    <label>Confirm new password<input type="password" name="confirm" required autoComplete="new-password" /></label>
    <Button type="submit" disabled={pending}>Change password</Button>
  </form><h2>Sessions</h2><Button disabled={pending} onClick={() => {
    if (!auth || pending) return; setPending(true); setMessage('');
    void auth.submit('revoke-other-sessions').then(() => setMessage('Other sessions revoked.'), () => setMessage('Unable to revoke sessions. Please try again.')).finally(() => setPending(false));
  }}>Revoke other sessions</Button>{message && <p role="status">{message}</p>}</section>;
}
